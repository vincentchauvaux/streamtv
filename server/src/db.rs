use parking_lot::Mutex;
use rusqlite::{params, Connection, OptionalExtension};
use serde::Serialize;
use std::path::Path;
use std::time::{SystemTime, UNIX_EPOCH};

pub struct Db {
    conn: Mutex<Connection>,
}

#[derive(Clone, Serialize)]
pub struct User {
    pub id: String,
    pub email: String,
    pub name: Option<String>,
}

#[derive(Clone, Serialize)]
pub struct ChannelDto {
    pub id: String,
    pub name: String,
    #[serde(rename = "normalizedName", skip_serializing_if = "Option::is_none")]
    pub normalized_name: Option<String>,
    pub url: String,
    pub logo: Option<String>,
    pub group: Option<String>,
    #[serde(rename = "tvgId")]
    pub tvg_id: Option<String>,
    pub language: Option<String>,
    pub country: Option<String>,
    pub status: String,
    #[serde(rename = "streamType")]
    pub stream_type: Option<String>,
    pub resolution: Option<String>,
    pub radio: bool,
    pub playlist: Option<PlaylistRef>,
    #[serde(rename = "isFavorite")]
    pub is_favorite: bool,
    #[serde(rename = "favoriteCategory", skip_serializing_if = "Option::is_none")]
    pub favorite_category: Option<String>,
}

#[derive(Clone, Serialize)]
pub struct PlaylistRef {
    pub id: String,
    pub name: String,
}

#[derive(Clone, Serialize)]
pub struct PlaylistDto {
    pub id: String,
    pub name: String,
    pub url: Option<String>,
    #[serde(rename = "epgUrl")]
    pub epg_url: Option<String>,
    #[serde(rename = "channelCount")]
    pub channel_count: i64,
    #[serde(rename = "scanStatus")]
    pub scan_status: String,
    #[serde(rename = "lastScanAt")]
    pub last_scan_at: Option<String>,
}

#[derive(Clone, Serialize)]
pub struct Stats {
    #[serde(rename = "channelCount")]
    pub channel_count: i64,
    #[serde(rename = "playlistCount")]
    pub playlist_count: i64,
    #[serde(rename = "favoriteCount")]
    pub favorite_count: i64,
    #[serde(rename = "programsToday")]
    pub programs_today: i64,
    #[serde(rename = "offlineCount")]
    pub offline_count: i64,
}

pub struct NewChannel {
    pub name: String,
    pub normalized_name: String,
    pub logo: Option<String>,
    pub group: Option<String>,
    pub tvg_id: Option<String>,
    pub tvg_name: Option<String>,
    pub language: Option<String>,
    pub country: Option<String>,
    pub catchup: Option<String>,
    pub radio: bool,
    pub resolution: Option<String>,
    pub url: String,
    pub stream_type: String,
}

impl Db {
    pub fn open(path: &Path) -> Result<Self, String> {
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
        let conn = Connection::open(path).map_err(|e| format!("SQLite: {e}"))?;
        conn.execute_batch(
            "PRAGMA foreign_keys = ON;
             PRAGMA journal_mode = WAL;
             PRAGMA busy_timeout = 5000;",
        )
        .map_err(|e| e.to_string())?;
        Ok(Self {
            conn: Mutex::new(conn),
        })
    }

    pub fn user_by_email(&self, email: &str) -> Result<Option<(User, String)>, String> {
        let conn = self.conn.lock();
        conn.query_row(
            r#"SELECT id, email, name, passwordHash FROM "User" WHERE email = ?1"#,
            params![email],
            |r| {
                Ok((
                    User {
                        id: r.get(0)?,
                        email: r.get(1)?,
                        name: r.get(2)?,
                    },
                    r.get::<_, String>(3)?,
                ))
            },
        )
        .optional()
        .map_err(|e| e.to_string())
    }

    pub fn user_by_id(&self, id: &str) -> Result<Option<User>, String> {
        let conn = self.conn.lock();
        conn.query_row(
            r#"SELECT id, email, name FROM "User" WHERE id = ?1"#,
            params![id],
            |r| {
                Ok(User {
                    id: r.get(0)?,
                    email: r.get(1)?,
                    name: r.get(2)?,
                })
            },
        )
        .optional()
        .map_err(|e| e.to_string())
    }

    #[allow(dead_code)] // réservé création de compte hors inscription publique
    pub fn insert_user(
        &self,
        id: &str,
        email: &str,
        name: Option<&str>,
        password_hash: &str,
    ) -> Result<User, String> {
        let now = now_ms();
        let conn = self.conn.lock();
        conn.execute(
            r#"INSERT INTO "User" (id, email, name, passwordHash, createdAt, updatedAt)
               VALUES (?1, ?2, ?3, ?4, ?5, ?5)"#,
            params![id, email, name, password_hash, now],
        )
        .map_err(|e| {
            if e.to_string().contains("UNIQUE") {
                "Cet email est déjà utilisé".into()
            } else {
                e.to_string()
            }
        })?;
        Ok(User {
            id: id.to_string(),
            email: email.to_string(),
            name: name.map(str::to_string),
        })
    }

    pub fn search_channels(
        &self,
        user_id: &str,
        q: Option<&str>,
        group: Option<&str>,
        playlist_id: Option<&str>,
        favorite_only: bool,
        limit: i64,
        favorite_ids: &std::collections::HashSet<String>,
    ) -> Result<Vec<ChannelDto>, String> {
        let conn = self.conn.lock();
        let mut sql = String::from(
            r#"SELECT c.id, c.name, c.normalizedName, c.logo, c."group", c.tvgId,
                      c.language, c.country, c.status, c.resolution, c.radio,
                      p.id, p.name,
                      (SELECT s.url FROM Stream s WHERE s.channelId = c.id ORDER BY s.createdAt ASC LIMIT 1),
                      (SELECT s.streamType FROM Stream s WHERE s.channelId = c.id ORDER BY s.createdAt ASC LIMIT 1)
               FROM Channel c
               JOIN Playlist p ON p.id = c.playlistId
               WHERE p.userId = ?1"#,
        );
        let mut vals: Vec<rusqlite::types::Value> = vec![user_id.to_string().into()];
        let mut i = 2;
        if let Some(pid) = playlist_id {
            sql.push_str(&format!(" AND c.playlistId = ?{i}"));
            vals.push(pid.to_string().into());
            i += 1;
        }
        if let Some(g) = group {
            sql.push_str(&format!(" AND c.\"group\" = ?{i}"));
            vals.push(g.to_string().into());
            i += 1;
        }
        if let Some(q) = q.filter(|s| !s.is_empty()) {
            let like = format!("%{q}%");
            sql.push_str(&format!(
                " AND (c.name LIKE ?{i} OR c.normalizedName LIKE ?{i} OR IFNULL(c.\"group\",'') LIKE ?{i} OR IFNULL(c.tvgName,'') LIKE ?{i})"
            ));
            vals.push(like.into());
            i += 1;
        }
        sql.push_str(" ORDER BY c.\"group\" ASC, c.name ASC");
        sql.push_str(&format!(" LIMIT ?{i}"));
        vals.push(limit.into());

        let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map(rusqlite::params_from_iter(vals), |r| {
                Ok(ChannelDto {
                    id: r.get(0)?,
                    name: r.get(1)?,
                    normalized_name: r.get(2)?,
                    logo: r.get(3)?,
                    group: r.get(4)?,
                    tvg_id: r.get(5)?,
                    language: r.get(6)?,
                    country: r.get(7)?,
                    status: r.get(8)?,
                    resolution: r.get(9)?,
                    radio: r.get::<_, i64>(10)? != 0,
                    playlist: Some(PlaylistRef {
                        id: r.get(11)?,
                        name: r.get(12)?,
                    }),
                    url: r.get::<_, Option<String>>(13)?.unwrap_or_default(),
                    stream_type: r.get(14)?,
                    is_favorite: false,
                    favorite_category: None,
                })
            })
            .map_err(|e| e.to_string())?;

        let mut out = Vec::new();
        for row in rows {
            let mut ch = row.map_err(|e| e.to_string())?;
            ch.is_favorite = favorite_ids.contains(&ch.id);
            if favorite_only && !ch.is_favorite {
                continue;
            }
            out.push(ch);
        }
        Ok(out)
    }

    pub fn favorite_ids(&self, user_id: &str) -> Result<std::collections::HashSet<String>, String> {
        let conn = self.conn.lock();
        let mut stmt = conn
            .prepare(r#"SELECT channelId FROM Favorite WHERE userId = ?1"#)
            .map_err(|e| e.to_string())?;
        let ids = stmt
            .query_map(params![user_id], |r| r.get::<_, String>(0))
            .map_err(|e| e.to_string())?;
        let mut set = std::collections::HashSet::new();
        for id in ids {
            set.insert(id.map_err(|e| e.to_string())?);
        }
        Ok(set)
    }

    pub fn groups(&self, user_id: &str) -> Result<Vec<String>, String> {
        let conn = self.conn.lock();
        let mut stmt = conn
            .prepare(
                r#"SELECT DISTINCT c."group" FROM Channel c
                   JOIN Playlist p ON p.id = c.playlistId
                   WHERE p.userId = ?1 AND c."group" IS NOT NULL AND c."group" != ''
                   ORDER BY c."group""#,
            )
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map(params![user_id], |r| r.get::<_, String>(0))
            .map_err(|e| e.to_string())?;
        let mut out = Vec::new();
        for r in rows {
            out.push(r.map_err(|e| e.to_string())?);
        }
        Ok(out)
    }

    pub fn list_favorites(&self, user_id: &str) -> Result<Vec<ChannelDto>, String> {
        let conn = self.conn.lock();
        let mut stmt = conn
            .prepare(
                r#"SELECT c.id, c.name, c.normalizedName, c.logo, c."group", c.tvgId,
                          c.language, c.country, c.status, c.resolution, c.radio,
                          p.id, p.name,
                          (SELECT s.url FROM Stream s WHERE s.channelId = c.id ORDER BY s.createdAt ASC LIMIT 1),
                          (SELECT s.streamType FROM Stream s WHERE s.channelId = c.id ORDER BY s.createdAt ASC LIMIT 1),
                          f.category
                   FROM Favorite f
                   JOIN Channel c ON c.id = f.channelId
                   JOIN Playlist p ON p.id = c.playlistId
                   WHERE f.userId = ?1
                   ORDER BY f.createdAt DESC"#,
            )
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map(params![user_id], |r| {
                Ok(ChannelDto {
                    id: r.get(0)?,
                    name: r.get(1)?,
                    normalized_name: r.get(2)?,
                    logo: r.get(3)?,
                    group: r.get(4)?,
                    tvg_id: r.get(5)?,
                    language: r.get(6)?,
                    country: r.get(7)?,
                    status: r.get(8)?,
                    resolution: r.get(9)?,
                    radio: r.get::<_, i64>(10)? != 0,
                    playlist: Some(PlaylistRef {
                        id: r.get(11)?,
                        name: r.get(12)?,
                    }),
                    url: r.get::<_, Option<String>>(13)?.unwrap_or_default(),
                    stream_type: r.get(14)?,
                    is_favorite: true,
                    favorite_category: r.get(15)?,
                })
            })
            .map_err(|e| e.to_string())?;
        let mut out = Vec::new();
        for r in rows {
            out.push(r.map_err(|e| e.to_string())?);
        }
        Ok(out)
    }

    pub fn add_favorite(
        &self,
        id: &str,
        user_id: &str,
        channel_id: &str,
        category: Option<&str>,
    ) -> Result<(), String> {
        let now = now_ms();
        let conn = self.conn.lock();
        let owns: i64 = conn
            .query_row(
                r#"SELECT COUNT(*) FROM Channel c
                   JOIN Playlist p ON p.id = c.playlistId
                   WHERE c.id = ?1 AND p.userId = ?2"#,
                params![channel_id, user_id],
                |r| r.get(0),
            )
            .map_err(|e| e.to_string())?;
        if owns == 0 {
            return Err("Chaîne introuvable".into());
        }
        conn.execute(
            r#"INSERT INTO Favorite (id, userId, channelId, category, createdAt)
               VALUES (?1, ?2, ?3, ?4, ?5)
               ON CONFLICT(userId, channelId) DO UPDATE SET category = excluded.category"#,
            params![id, user_id, channel_id, category, now],
        )
        .map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn remove_favorite(&self, user_id: &str, channel_id: &str) -> Result<(), String> {
        let conn = self.conn.lock();
        conn.execute(
            r#"DELETE FROM Favorite WHERE userId = ?1 AND channelId = ?2"#,
            params![user_id, channel_id],
        )
        .map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn stats(&self, user_id: &str) -> Result<Stats, String> {
        let conn = self.conn.lock();
        let channel_count: i64 = conn
            .query_row(
                r#"SELECT COUNT(*) FROM Channel c JOIN Playlist p ON p.id = c.playlistId WHERE p.userId = ?1"#,
                params![user_id],
                |r| r.get(0),
            )
            .map_err(|e| e.to_string())?;
        let playlist_count: i64 = conn
            .query_row(
                r#"SELECT COUNT(*) FROM Playlist WHERE userId = ?1"#,
                params![user_id],
                |r| r.get(0),
            )
            .map_err(|e| e.to_string())?;
        let favorite_count: i64 = conn
            .query_row(
                r#"SELECT COUNT(*) FROM Favorite WHERE userId = ?1"#,
                params![user_id],
                |r| r.get(0),
            )
            .map_err(|e| e.to_string())?;
        let offline_count: i64 = conn
            .query_row(
                r#"SELECT COUNT(*) FROM Channel c JOIN Playlist p ON p.id = c.playlistId
                   WHERE p.userId = ?1 AND c.status = 'OFFLINE'"#,
                params![user_id],
                |r| r.get(0),
            )
            .map_err(|e| e.to_string())?;
        let start = day_start_ms();
        let end = start + 86_400_000 - 1;
        let programs_today: i64 = conn
            .query_row(
                r#"SELECT COUNT(*) FROM Program pr
                   JOIN Channel c ON c.id = pr.channelId
                   JOIN Playlist p ON p.id = c.playlistId
                   WHERE p.userId = ?1 AND pr.start <= ?2 AND pr.end >= ?3"#,
                params![user_id, end, start],
                |r| r.get(0),
            )
            .unwrap_or(0);
        Ok(Stats {
            channel_count,
            playlist_count,
            favorite_count,
            programs_today,
            offline_count,
        })
    }

    pub fn list_playlists(&self, user_id: &str) -> Result<Vec<PlaylistDto>, String> {
        let conn = self.conn.lock();
        let mut stmt = conn
            .prepare(
                r#"SELECT id, name, url, epgUrl, channelCount, scanStatus, lastScanAt
                   FROM Playlist WHERE userId = ?1 ORDER BY updatedAt DESC"#,
            )
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map(params![user_id], |r| {
                Ok(PlaylistDto {
                    id: r.get(0)?,
                    name: r.get(1)?,
                    url: r.get(2)?,
                    epg_url: r.get(3)?,
                    channel_count: r.get(4)?,
                    scan_status: r.get(5)?,
                    last_scan_at: millis_opt(r.get(6)?),
                })
            })
            .map_err(|e| e.to_string())?;
        let mut out = Vec::new();
        for r in rows {
            out.push(r.map_err(|e| e.to_string())?);
        }
        Ok(out)
    }

    pub fn delete_playlist(&self, user_id: &str, id: &str) -> Result<bool, String> {
        let conn = self.conn.lock();
        let n = conn
            .execute(
                r#"DELETE FROM Playlist WHERE id = ?1 AND userId = ?2"#,
                params![id, user_id],
            )
            .map_err(|e| e.to_string())?;
        Ok(n > 0)
    }

    pub fn import_playlist(
        &self,
        playlist_id: &str,
        user_id: &str,
        name: &str,
        url: Option<&str>,
        epg_url: Option<&str>,
        channels: &[NewChannel],
        log_id: &str,
    ) -> Result<PlaylistDto, String> {
        let now = now_ms();
        let conn = self.conn.lock();
        let tx = conn.unchecked_transaction().map_err(|e| e.to_string())?;
        tx.execute(
            r#"INSERT INTO Playlist (id, name, url, epgUrl, userId, lastScanAt, channelCount, scanStatus, createdAt, updatedAt)
               VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 'OK', ?6, ?6)"#,
            params![
                playlist_id,
                name,
                url,
                epg_url,
                user_id,
                now,
                channels.len() as i64
            ],
        )
        .map_err(|e| e.to_string())?;

        let mut radios = 0i64;
        let mut groups = std::collections::HashSet::new();
        for ch in channels {
            let cid = new_id();
            let sid = new_id();
            if ch.radio {
                radios += 1;
            }
            if let Some(g) = &ch.group {
                groups.insert(g.clone());
            }
            tx.execute(
                r#"INSERT INTO Channel (id, name, normalizedName, logo, logoSource, "group", tvgId, tvgName,
                                        language, country, catchup, radio, resolution, status, playlistId, createdAt)
                   VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, 'UNKNOWN', ?14, ?15)"#,
                params![
                    cid,
                    ch.name,
                    ch.normalized_name,
                    ch.logo,
                    if ch.logo.is_some() { "PLAYLIST" } else { "NONE" },
                    ch.group,
                    ch.tvg_id,
                    ch.tvg_name,
                    ch.language,
                    ch.country,
                    ch.catchup,
                    if ch.radio { 1 } else { 0 },
                    ch.resolution,
                    playlist_id,
                    now
                ],
            )
            .map_err(|e| e.to_string())?;
            tx.execute(
                r#"INSERT INTO Stream (id, url, streamType, online, channelId, createdAt)
                   VALUES (?1, ?2, ?3, 1, ?4, ?5)"#,
                params![sid, ch.url, ch.stream_type, cid, now],
            )
            .map_err(|e| e.to_string())?;
        }

        tx.execute(
            r#"INSERT INTO ScanLog (id, playlistId, type, channelCount, radioCount, groupCount, durationMs, errorCount, createdAt)
               VALUES (?1, ?2, 'IMPORT', ?3, ?4, ?5, 0, 0, ?6)"#,
            params![
                log_id,
                playlist_id,
                channels.len() as i64,
                radios,
                groups.len() as i64,
                now
            ],
        )
        .map_err(|e| e.to_string())?;
        tx.commit().map_err(|e| e.to_string())?;

        Ok(PlaylistDto {
            id: playlist_id.to_string(),
            name: name.to_string(),
            url: url.map(str::to_string),
            epg_url: epg_url.map(str::to_string),
            channel_count: channels.len() as i64,
            scan_status: "OK".into(),
            last_scan_at: Some(now.to_string()),
        })
    }

    pub fn record_watch(&self, id: &str, user_id: &str, channel_id: &str) -> Result<(), String> {
        let now = now_ms();
        let conn = self.conn.lock();
        conn.execute(
            r#"INSERT INTO WatchHistory (id, userId, channelId, positionSec, watchedSec, viewCount, lastWatched)
               VALUES (?1, ?2, ?3, 0, 0, 1, ?4)
               ON CONFLICT(userId, channelId) DO UPDATE SET
                 viewCount = viewCount + 1,
                 lastWatched = excluded.lastWatched"#,
            params![id, user_id, channel_id, now],
        )
        .map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn watch_history(&self, user_id: &str, limit: i64) -> Result<Vec<ChannelDto>, String> {
        let conn = self.conn.lock();
        let mut stmt = conn
            .prepare(
                r#"SELECT c.id, c.name, c.normalizedName, c.logo, c."group", c.tvgId,
                          c.language, c.country, c.status, c.resolution, c.radio,
                          p.id, p.name,
                          (SELECT s.url FROM Stream s WHERE s.channelId = c.id ORDER BY s.createdAt ASC LIMIT 1),
                          (SELECT s.streamType FROM Stream s WHERE s.channelId = c.id ORDER BY s.createdAt ASC LIMIT 1)
                   FROM WatchHistory w
                   JOIN Channel c ON c.id = w.channelId
                   JOIN Playlist p ON p.id = c.playlistId
                   WHERE w.userId = ?1
                   ORDER BY w.lastWatched DESC
                   LIMIT ?2"#,
            )
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map(params![user_id, limit], |r| {
                Ok(ChannelDto {
                    id: r.get(0)?,
                    name: r.get(1)?,
                    normalized_name: r.get(2)?,
                    logo: r.get(3)?,
                    group: r.get(4)?,
                    tvg_id: r.get(5)?,
                    language: r.get(6)?,
                    country: r.get(7)?,
                    status: r.get(8)?,
                    resolution: r.get(9)?,
                    radio: r.get::<_, i64>(10)? != 0,
                    playlist: Some(PlaylistRef {
                        id: r.get(11)?,
                        name: r.get(12)?,
                    }),
                    url: r.get::<_, Option<String>>(13)?.unwrap_or_default(),
                    stream_type: r.get(14)?,
                    is_favorite: false,
                    favorite_category: None,
                })
            })
            .map_err(|e| e.to_string())?;
        let mut out = Vec::new();
        for r in rows {
            out.push(r.map_err(|e| e.to_string())?);
        }
        Ok(out)
    }

    pub fn playlist_for_user(
        &self,
        user_id: &str,
        playlist_id: &str,
    ) -> Result<Option<PlaylistDto>, String> {
        let conn = self.conn.lock();
        conn.query_row(
            r#"SELECT id, name, url, epgUrl, channelCount, scanStatus, lastScanAt
               FROM Playlist WHERE id = ?1 AND userId = ?2"#,
            params![playlist_id, user_id],
            |r| {
                Ok(PlaylistDto {
                    id: r.get(0)?,
                    name: r.get(1)?,
                    url: r.get(2)?,
                    epg_url: r.get(3)?,
                    channel_count: r.get(4)?,
                    scan_status: r.get(5)?,
                    last_scan_at: millis_opt(r.get(6)?),
                })
            },
        )
        .optional()
        .map_err(|e| e.to_string())
    }

    pub fn set_scan_status(
        &self,
        playlist_id: &str,
        status: &str,
        channel_count: Option<i64>,
    ) -> Result<(), String> {
        let now = now_ms();
        let conn = self.conn.lock();
        match channel_count {
            Some(n) => {
                conn.execute(
                    r#"UPDATE Playlist SET scanStatus = ?1, channelCount = ?2, lastScanAt = ?3, updatedAt = ?3
                       WHERE id = ?4"#,
                    params![status, n, now, playlist_id],
                )
            }
            None => conn.execute(
                r#"UPDATE Playlist SET scanStatus = ?1, updatedAt = ?2 WHERE id = ?3"#,
                params![status, now, playlist_id],
            ),
        }
        .map_err(|e| e.to_string())?;
        Ok(())
    }

    /// Remplace les chaînes d'une playlist (rescan). Favoris / historique liés aux vieux ids disparaissent.
    pub fn replace_playlist_channels(
        &self,
        playlist_id: &str,
        channels: &[NewChannel],
        log_type: &str,
        log_id: &str,
        duration_ms: i64,
    ) -> Result<PlaylistDto, String> {
        let now = now_ms();
        let conn = self.conn.lock();
        let (name, url, epg_url): (String, Option<String>, Option<String>) = conn
            .query_row(
                r#"SELECT name, url, epgUrl FROM Playlist WHERE id = ?1"#,
                params![playlist_id],
                |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
            )
            .map_err(|_| "Playlist introuvable".to_string())?;

        let tx = conn.unchecked_transaction().map_err(|e| e.to_string())?;
        // Programs / Streams / Favorites / WatchHistory cascaded via Channel delete in Prisma FKs
        tx.execute(
            r#"DELETE FROM Program WHERE channelId IN (SELECT id FROM Channel WHERE playlistId = ?1)"#,
            params![playlist_id],
        )
        .map_err(|e| e.to_string())?;
        tx.execute(
            r#"DELETE FROM Stream WHERE channelId IN (SELECT id FROM Channel WHERE playlistId = ?1)"#,
            params![playlist_id],
        )
        .map_err(|e| e.to_string())?;
        tx.execute(
            r#"DELETE FROM Favorite WHERE channelId IN (SELECT id FROM Channel WHERE playlistId = ?1)"#,
            params![playlist_id],
        )
        .map_err(|e| e.to_string())?;
        tx.execute(
            r#"DELETE FROM WatchHistory WHERE channelId IN (SELECT id FROM Channel WHERE playlistId = ?1)"#,
            params![playlist_id],
        )
        .map_err(|e| e.to_string())?;
        tx.execute(
            r#"DELETE FROM Channel WHERE playlistId = ?1"#,
            params![playlist_id],
        )
        .map_err(|e| e.to_string())?;

        let mut radios = 0i64;
        let mut groups = std::collections::HashSet::new();
        let mut logos = 0i64;
        for ch in channels {
            let cid = new_id();
            let sid = new_id();
            if ch.radio {
                radios += 1;
            }
            if ch.logo.is_some() {
                logos += 1;
            }
            if let Some(g) = &ch.group {
                groups.insert(g.clone());
            }
            tx.execute(
                r#"INSERT INTO Channel (id, name, normalizedName, logo, logoSource, "group", tvgId, tvgName,
                                        language, country, catchup, radio, resolution, status, playlistId, createdAt)
                   VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, 'UNKNOWN', ?14, ?15)"#,
                params![
                    cid,
                    ch.name,
                    ch.normalized_name,
                    ch.logo,
                    if ch.logo.is_some() { "PLAYLIST" } else { "NONE" },
                    ch.group,
                    ch.tvg_id,
                    ch.tvg_name,
                    ch.language,
                    ch.country,
                    ch.catchup,
                    if ch.radio { 1 } else { 0 },
                    ch.resolution,
                    playlist_id,
                    now
                ],
            )
            .map_err(|e| e.to_string())?;
            tx.execute(
                r#"INSERT INTO Stream (id, url, streamType, online, channelId, createdAt)
                   VALUES (?1, ?2, ?3, 1, ?4, ?5)"#,
                params![sid, ch.url, ch.stream_type, cid, now],
            )
            .map_err(|e| e.to_string())?;
        }

        tx.execute(
            r#"UPDATE Playlist SET channelCount = ?1, scanStatus = 'OK', lastScanAt = ?2, updatedAt = ?2
               WHERE id = ?3"#,
            params![channels.len() as i64, now, playlist_id],
        )
        .map_err(|e| e.to_string())?;

        tx.execute(
            r#"INSERT INTO ScanLog (id, playlistId, type, channelCount, radioCount, groupCount, logoCount,
                                    durationMs, errorCount, createdAt)
               VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, 0, ?9)"#,
            params![
                log_id,
                playlist_id,
                log_type,
                channels.len() as i64,
                radios,
                groups.len() as i64,
                logos,
                duration_ms,
                now
            ],
        )
        .map_err(|e| e.to_string())?;
        tx.commit().map_err(|e| e.to_string())?;

        Ok(PlaylistDto {
            id: playlist_id.to_string(),
            name,
            url,
            epg_url,
            channel_count: channels.len() as i64,
            scan_status: "OK".into(),
            last_scan_at: Some(now.to_string()),
        })
    }

    pub fn record_scan_error(
        &self,
        playlist_id: &str,
        log_type: &str,
        message: &str,
        duration_ms: i64,
    ) -> Result<(), String> {
        let now = now_ms();
        let conn = self.conn.lock();
        conn.execute(
            r#"INSERT INTO ScanLog (id, playlistId, type, channelCount, errorCount, durationMs, errors, createdAt)
               VALUES (?1, ?2, ?3, 0, 1, ?4, ?5, ?6)"#,
            params![new_id(), playlist_id, log_type, duration_ms, message, now],
        )
        .map_err(|e| e.to_string())?;
        conn.execute(
            r#"UPDATE Playlist SET scanStatus = 'ERROR', updatedAt = ?1 WHERE id = ?2"#,
            params![now, playlist_id],
        )
        .map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn stale_playlists(&self, older_than_ms: i64) -> Result<Vec<PlaylistDto>, String> {
        let conn = self.conn.lock();
        let mut stmt = conn
            .prepare(
                r#"SELECT id, name, url, epgUrl, channelCount, scanStatus, lastScanAt
                   FROM Playlist
                   WHERE url IS NOT NULL AND url != ''
                     AND (lastScanAt IS NULL OR lastScanAt < ?1)
                   ORDER BY (lastScanAt IS NULL) DESC, lastScanAt ASC"#,
            )
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map(params![older_than_ms], |r| {
                Ok(PlaylistDto {
                    id: r.get(0)?,
                    name: r.get(1)?,
                    url: r.get(2)?,
                    epg_url: r.get(3)?,
                    channel_count: r.get(4)?,
                    scan_status: r.get(5)?,
                    last_scan_at: millis_opt(r.get(6)?),
                })
            })
            .map_err(|e| e.to_string())?;
        let mut out = Vec::new();
        for r in rows {
            out.push(r.map_err(|e| e.to_string())?);
        }
        Ok(out)
    }

    pub fn playlists_with_epg(&self, user_id: Option<&str>) -> Result<Vec<PlaylistDto>, String> {
        let conn = self.conn.lock();
        let sql = if user_id.is_some() {
            r#"SELECT id, name, url, epgUrl, channelCount, scanStatus, lastScanAt
               FROM Playlist WHERE userId = ?1 AND epgUrl IS NOT NULL AND epgUrl != ''"#
        } else {
            r#"SELECT id, name, url, epgUrl, channelCount, scanStatus, lastScanAt
               FROM Playlist WHERE epgUrl IS NOT NULL AND epgUrl != ''"#
        };
        let mut stmt = conn.prepare(sql).map_err(|e| e.to_string())?;
        let map_row = |r: &rusqlite::Row| {
            Ok(PlaylistDto {
                id: r.get(0)?,
                name: r.get(1)?,
                url: r.get(2)?,
                epg_url: r.get(3)?,
                channel_count: r.get(4)?,
                scan_status: r.get(5)?,
                last_scan_at: millis_opt(r.get(6)?),
            })
        };
        let rows = if let Some(uid) = user_id {
            stmt.query_map(params![uid], map_row)
        } else {
            stmt.query_map([], map_row)
        }
        .map_err(|e| e.to_string())?;
        let mut out = Vec::new();
        for r in rows {
            out.push(r.map_err(|e| e.to_string())?);
        }
        Ok(out)
    }

    pub fn channel_tvg_map(&self, playlist_id: &str) -> Result<Vec<(String, String)>, String> {
        let conn = self.conn.lock();
        let mut stmt = conn
            .prepare(
                r#"SELECT id, tvgId FROM Channel
                   WHERE playlistId = ?1 AND tvgId IS NOT NULL AND tvgId != ''"#,
            )
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map(params![playlist_id], |r| {
                Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?))
            })
            .map_err(|e| e.to_string())?;
        let mut out = Vec::new();
        for r in rows {
            out.push(r.map_err(|e| e.to_string())?);
        }
        Ok(out)
    }

    pub fn replace_programs(
        &self,
        playlist_id: &str,
        programs: &[(String, String, Option<String>, i64, i64, Option<String>)],
    ) -> Result<i64, String> {
        // (channelId, title, description, start, end, category)
        let conn = self.conn.lock();
        let tx = conn.unchecked_transaction().map_err(|e| e.to_string())?;
        tx.execute(
            r#"DELETE FROM Program WHERE channelId IN (SELECT id FROM Channel WHERE playlistId = ?1)"#,
            params![playlist_id],
        )
        .map_err(|e| e.to_string())?;
        let mut count = 0i64;
        for (channel_id, title, desc, start, end, category) in programs {
            tx.execute(
                r#"INSERT INTO Program (id, channelId, title, description, start, end, category)
                   VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)"#,
                params![new_id(), channel_id, title, desc, start, end, category],
            )
            .map_err(|e| e.to_string())?;
            count += 1;
        }
        tx.commit().map_err(|e| e.to_string())?;
        Ok(count)
    }

    pub fn update_scan_log_programs(&self, log_id: &str, program_count: i64) -> Result<(), String> {
        let conn = self.conn.lock();
        conn.execute(
            r#"UPDATE ScanLog SET programCount = ?1 WHERE id = ?2"#,
            params![program_count, log_id],
        )
        .map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn upcoming_programs(
        &self,
        user_id: &str,
        channel_id: Option<&str>,
        limit: i64,
    ) -> Result<Vec<ProgramDto>, String> {
        let now = now_ms();
        let conn = self.conn.lock();
        let mut sql = String::from(
            r#"SELECT pr.id, pr.channelId, c.name, pr.title, pr.description, pr.start, pr.end, pr.category
               FROM Program pr
               JOIN Channel c ON c.id = pr.channelId
               JOIN Playlist p ON p.id = c.playlistId
               WHERE p.userId = ?1 AND pr.end >= ?2"#,
        );
        let mut vals: Vec<rusqlite::types::Value> = vec![user_id.to_string().into(), now.into()];
        let mut i = 3;
        if let Some(cid) = channel_id {
            sql.push_str(&format!(" AND pr.channelId = ?{i}"));
            vals.push(cid.to_string().into());
            i += 1;
        }
        sql.push_str(&format!(" ORDER BY pr.start ASC LIMIT ?{i}"));
        vals.push(limit.into());

        let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map(rusqlite::params_from_iter(vals), |r| {
                Ok(ProgramDto {
                    id: r.get(0)?,
                    channel_id: r.get(1)?,
                    channel_name: r.get(2)?,
                    title: r.get(3)?,
                    description: r.get(4)?,
                    start: millis_opt(Some(r.get(5)?)).unwrap_or_default(),
                    end: millis_opt(Some(r.get(6)?)).unwrap_or_default(),
                    category: r.get(7)?,
                })
            })
            .map_err(|e| e.to_string())?;
        let mut out = Vec::new();
        for r in rows {
            out.push(r.map_err(|e| e.to_string())?);
        }
        Ok(out)
    }

    pub fn recommendations(&self, user_id: &str, limit: i64) -> Result<Vec<ChannelDto>, String> {
        let favorite_ids = self.favorite_ids(user_id)?;
        let history = self.watch_history_enriched(user_id, 30)?;

        let mut category_scores: std::collections::HashMap<String, f64> =
            std::collections::HashMap::new();
        let mut watched_groups: std::collections::HashMap<String, i64> =
            std::collections::HashMap::new();
        let mut watched_ids = std::collections::HashSet::new();
        let mut watched_normalized = std::collections::HashSet::new();

        for (ch, view_count, watched_sec) in &history {
            watched_ids.insert(ch.id.clone());
            if let Some(n) = &ch.normalized_name {
                if !n.is_empty() {
                    watched_normalized.insert(n.clone());
                }
            }
            let group = ch.group.clone().unwrap_or_else(|| "Autres".into());
            *watched_groups.entry(group).or_default() += view_count;
            for cat in ["news", "sports", "movies", "kids"] {
                if matches_category(cat, ch.group.as_deref(), Some(&ch.name)) {
                    *category_scores.entry(cat.to_string()).or_default() +=
                        watched_sec + (*view_count as f64) * 60.0;
                }
            }
        }

        let top_category = category_scores
            .into_iter()
            .max_by(|a, b| a.1.partial_cmp(&b.1).unwrap_or(std::cmp::Ordering::Equal))
            .map(|(k, _)| k);
        let mut top_groups: Vec<_> = watched_groups.into_iter().collect();
        top_groups.sort_by(|a, b| b.1.cmp(&a.1));
        let top_groups: Vec<String> = top_groups.into_iter().take(3).map(|(g, _)| g).collect();

        let candidates = self.search_channels(
            user_id,
            None,
            None,
            None,
            false,
            limit * 3,
            &favorite_ids,
        )?;

        let mut scored: Vec<(ChannelDto, i32)> = candidates
            .into_iter()
            .filter(|c| !watched_ids.contains(&c.id))
            .map(|c| {
                let mut score = 0i32;
                if favorite_ids.contains(&c.id) {
                    score += 2;
                }
                if top_groups
                    .iter()
                    .any(|g| c.group.as_deref() == Some(g.as_str()))
                {
                    score += 3;
                }
                if let Some(cat) = &top_category {
                    if matches_category(cat, c.group.as_deref(), Some(&c.name)) {
                        score += 5;
                    }
                }
                if let Some(n) = &c.normalized_name {
                    if watched_normalized.contains(n) {
                        score += 4;
                    }
                }
                (c, score)
            })
            .collect();
        scored.sort_by(|a, b| b.1.cmp(&a.1));

        let mut seen_norm = std::collections::HashSet::new();
        let mut out = Vec::new();
        for (ch, _) in scored {
            if let Some(n) = &ch.normalized_name {
                if !n.is_empty() && !seen_norm.insert(n.clone()) {
                    continue;
                }
            }
            out.push(ch);
            if out.len() as i64 >= limit {
                break;
            }
        }
        Ok(out)
    }

    fn watch_history_enriched(
        &self,
        user_id: &str,
        limit: i64,
    ) -> Result<Vec<(ChannelDto, i64, f64)>, String> {
        let conn = self.conn.lock();
        let mut stmt = conn
            .prepare(
                r#"SELECT c.id, c.name, c.normalizedName, c.logo, c."group", c.tvgId,
                          c.language, c.country, c.status, c.resolution, c.radio,
                          p.id, p.name,
                          (SELECT s.url FROM Stream s WHERE s.channelId = c.id ORDER BY s.createdAt ASC LIMIT 1),
                          (SELECT s.streamType FROM Stream s WHERE s.channelId = c.id ORDER BY s.createdAt ASC LIMIT 1),
                          w.viewCount, w.watchedSec
                   FROM WatchHistory w
                   JOIN Channel c ON c.id = w.channelId
                   JOIN Playlist p ON p.id = c.playlistId
                   WHERE w.userId = ?1
                   ORDER BY w.lastWatched DESC
                   LIMIT ?2"#,
            )
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map(params![user_id, limit], |r| {
                Ok((
                    ChannelDto {
                        id: r.get(0)?,
                        name: r.get(1)?,
                        normalized_name: r.get(2)?,
                        logo: r.get(3)?,
                        group: r.get(4)?,
                        tvg_id: r.get(5)?,
                        language: r.get(6)?,
                        country: r.get(7)?,
                        status: r.get(8)?,
                        resolution: r.get(9)?,
                        radio: r.get::<_, i64>(10)? != 0,
                        playlist: Some(PlaylistRef {
                            id: r.get(11)?,
                            name: r.get(12)?,
                        }),
                        url: r.get::<_, Option<String>>(13)?.unwrap_or_default(),
                        stream_type: r.get(14)?,
                        is_favorite: false,
                        favorite_category: None,
                    },
                    r.get::<_, i64>(15)?,
                    r.get::<_, f64>(16).unwrap_or(0.0),
                ))
            })
            .map_err(|e| e.to_string())?;
        let mut out = Vec::new();
        for r in rows {
            out.push(r.map_err(|e| e.to_string())?);
        }
        Ok(out)
    }

    pub fn admin_health(&self, user_id: &str) -> Result<AdminHealth, String> {
        let playlists = self.list_playlists(user_id)?;
        let stats = self.stats(user_id)?;
        let conn = self.conn.lock();
        let mut stmt = conn
            .prepare(
                r#"SELECT sl.id, pl.name, sl.errors, sl.createdAt, sl.durationMs, sl.errorCount
                   FROM ScanLog sl
                   JOIN Playlist pl ON pl.id = sl.playlistId
                   WHERE pl.userId = ?1
                   ORDER BY sl.createdAt DESC
                   LIMIT 40"#,
            )
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map(params![user_id], |r| {
                Ok((
                    r.get::<_, String>(0)?,
                    r.get::<_, String>(1)?,
                    r.get::<_, Option<String>>(2)?,
                    r.get::<_, i64>(3)?,
                    r.get::<_, Option<i64>>(4)?,
                    r.get::<_, i64>(5)?,
                ))
            })
            .map_err(|e| e.to_string())?;
        let mut all_logs = Vec::new();
        for r in rows {
            all_logs.push(r.map_err(|e| e.to_string())?);
        }
        let last_import_duration_ms = all_logs.first().and_then(|l| l.4);
        let recent_errors: Vec<ScanErrorDto> = all_logs
            .iter()
            .filter(|l| l.5 > 0 || l.2.as_ref().map(|e| !e.is_empty()).unwrap_or(false))
            .take(5)
            .map(|l| ScanErrorDto {
                id: l.0.clone(),
                playlist_name: l.1.clone(),
                errors: l.2.clone(),
                created_at: l.3.to_string(),
            })
            .collect();
        let last_scan_at = playlists
            .iter()
            .filter_map(|p| p.last_scan_at.as_ref())
            .max()
            .cloned();

        Ok(AdminHealth {
            channel_count: stats.channel_count,
            offline_count: stats.offline_count,
            last_scan_at,
            last_import_duration_ms,
            last_epg_duration_ms: None,
            recent_errors,
            playlists,
        })
    }
}

#[derive(Clone, Serialize)]
pub struct ProgramDto {
    pub id: String,
    #[serde(rename = "channelId")]
    pub channel_id: String,
    #[serde(rename = "channelName")]
    pub channel_name: String,
    pub title: String,
    pub description: Option<String>,
    pub start: String,
    pub end: String,
    pub category: Option<String>,
}

#[derive(Clone, Serialize)]
pub struct ScanErrorDto {
    pub id: String,
    #[serde(rename = "playlistName")]
    pub playlist_name: String,
    pub errors: Option<String>,
    #[serde(rename = "createdAt")]
    pub created_at: String,
}

#[derive(Clone, Serialize)]
pub struct AdminHealth {
    #[serde(rename = "channelCount")]
    pub channel_count: i64,
    #[serde(rename = "offlineCount")]
    pub offline_count: i64,
    #[serde(rename = "lastScanAt")]
    pub last_scan_at: Option<String>,
    #[serde(rename = "lastImportDurationMs")]
    pub last_import_duration_ms: Option<i64>,
    #[serde(rename = "lastEpgDurationMs")]
    pub last_epg_duration_ms: Option<i64>,
    #[serde(rename = "recentErrors")]
    pub recent_errors: Vec<ScanErrorDto>,
    pub playlists: Vec<PlaylistDto>,
}

fn matches_category(category: &str, group: Option<&str>, name: Option<&str>) -> bool {
    let keywords: &[&str] = match category {
        "news" => &["news", "actualité", "actualites", "info", "journal"],
        "sports" => &["sport", "sports", "football", "soccer"],
        "movies" => &["film", "films", "movie", "cinema", "cinéma"],
        "kids" => &["kids", "enfant", "enfants", "jeunesse", "junior", "cartoon"],
        _ => return false,
    };
    let haystack = format!("{} {}", group.unwrap_or(""), name.unwrap_or("")).to_lowercase();
    keywords.iter().any(|kw| haystack.contains(kw))
}

pub fn new_id() -> String {
    const ALPH: &[u8] = b"0123456789abcdefghijklmnopqrstuvwxyz";
    let mut s = String::from("c");
    for _ in 0..24 {
        s.push(ALPH[rand::random::<u8>() as usize % ALPH.len()] as char);
    }
    s
}

fn now_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_millis() as i64
}

fn day_start_ms() -> i64 {
    let now = now_ms();
    now - (now % 86_400_000)
}

fn millis_opt(v: Option<i64>) -> Option<String> {
    v.map(|n| n.to_string())
}
