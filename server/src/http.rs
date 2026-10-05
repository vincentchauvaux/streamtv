use axum::body::Body;
use axum::extract::{ConnectInfo, Path, Query, State};
use axum::http::{header, HeaderMap, Method, Request, StatusCode};
use axum::middleware::{self, Next};
use axum::response::{Html, IntoResponse, Redirect, Response};
use axum::routing::{get, post};
use axum::{Json, Router};
use serde::Deserialize;
use serde_json::{json, Value};
use std::collections::HashMap;
use std::net::SocketAddr;
use std::sync::Arc;
use std::time::Duration;

use crate::auth::{
    clear_cookie, hash_password, issue_token, session_cookie, token_from_cookie_header,
    user_id_from_token, valid_email, verify_password,
};
use crate::config::Config;
use crate::db::{new_id, ChannelDto, Db, NewChannel, User};
use crate::m3u::parse_m3u;
use crate::normalize::{normalize_channel_name, normalize_group, stream_type_from_url};
use crate::outbound::validate_outbound_url;
use crate::proxy::{
    fetch_upstream, http_client, should_use_query_fallback, token_path, ProxyTokens, RATE_MAX,
    RATE_WINDOW,
};
use crate::rate::RateLimiter;
use crate::xmltv::parse_xmltv;

const INDEX_HTML: &str = include_str!("../ui/index.html");
const APP_HTML: &str = include_str!("../ui/app.html");
const APP_CSS: &str = include_str!("../ui/app.css");
const APP_JS: &str = include_str!("../ui/app.js");
const LANDING_JS: &str = include_str!("../ui/landing.js");

const DEMO_PLAYLISTS: &[(&str, &str, Option<&str>)] = &[
    (
        "iptv-org — France",
        "https://iptv-org.github.io/iptv/countries/fr.m3u",
        Some("https://iptv-epg.org/files/epg-fr.xml"),
    ),
    (
        "Free-TV — Curatée",
        "https://raw.githubusercontent.com/Free-TV/IPTV/master/playlist.m3u8",
        None,
    ),
    (
        "iptv-org — Actualités",
        "https://iptv-org.github.io/iptv/categories/news.m3u",
        None,
    ),
    (
        "iptv-org — Sport",
        "https://iptv-org.github.io/iptv/categories/sports.m3u",
        None,
    ),
];

pub struct App {
    pub db: Db,
    pub cfg: Config,
    pub tokens: ProxyTokens,
    pub rate: RateLimiter,
    pub http: reqwest::Client,
}

pub fn router(app: Arc<App>) -> Router {
    Router::new()
        .route("/", get(landing))
        .route("/app", get(app_page))
        .route("/app/", get(app_page))
        .route("/app/{*rest}", get(app_page))
        .route("/ui/app.css", get(|| async { css(APP_CSS) }))
        .route("/ui/app.js", get(|| async { js(APP_JS) }))
        .route("/ui/landing.js", get(|| async { js(LANDING_JS) }))
        .route("/mentions-legales", get(legal_mentions))
        .route("/cgu", get(legal_cgu))
        .route("/confidentialite", get(legal_privacy))
        .route("/cookies", get(legal_cookies))
        .route("/healthz", get(|| async { "ok" }))
        .route("/api/auth/login", post(login))
        .route("/api/auth/register", post(register).get(me))
        .route("/api/auth/logout", post(logout))
        .route("/api/auth/me", get(me))
        .route("/api/channels", get(channels))
        .route("/api/channels/groups", get(channel_groups))
        .route("/api/favorites", get(favorites).post(add_favorite).delete(del_favorite))
        .route("/api/stats", get(stats))
        .route("/api/playlists", get(playlists).delete(delete_playlist))
        .route("/api/playlists/import", post(import_playlist))
        .route("/api/playlists/import-demo", post(import_demo))
        .route("/api/playlists/scan", post(scan_playlist))
        .route("/api/epg", get(epg_get).post(epg_refresh))
        .route("/api/recommendations", get(recommendations))
        .route("/api/admin", get(admin_health))
        .route("/api/cron/scan", get(cron_scan).post(cron_scan))
        .route("/api/watch-history", get(history).post(record_history))
        .route("/api/stream/proxy/register", post(proxy_register))
        .route("/api/stream/proxy/{token}", get(proxy_token))
        .route("/api/stream/proxy", get(proxy_query))
        .layer(middleware::from_fn_with_state(app.clone(), csrf_and_headers))
        .with_state(app)
}

fn css(body: &'static str) -> impl IntoResponse {
    (
        [(header::CONTENT_TYPE, "text/css; charset=utf-8")],
        body,
    )
}

fn js(body: &'static str) -> impl IntoResponse {
    (
        [(header::CONTENT_TYPE, "application/javascript; charset=utf-8")],
        body,
    )
}

async fn landing(State(app): State<Arc<App>>, headers: HeaderMap) -> Response {
    if session_user(&app, &headers).await.is_some() {
        return Redirect::to("/app").into_response();
    }
    Html(INDEX_HTML).into_response()
}

async fn app_page(State(app): State<Arc<App>>, headers: HeaderMap) -> Response {
    if session_user(&app, &headers).await.is_none() {
        return Redirect::to("/").into_response();
    }
    Html(APP_HTML).into_response()
}

#[derive(Deserialize)]
struct LoginBody {
    email: String,
    password: String,
}

#[derive(Deserialize)]
struct RegisterBody {
    email: String,
    password: String,
    name: Option<String>,
    #[serde(rename = "acceptTerms")]
    accept_terms: Option<bool>,
}

async fn login(
    State(app): State<Arc<App>>,
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    headers: HeaderMap,
    Json(body): Json<LoginBody>,
) -> Response {
    let ip = client_ip(&app, &headers, addr);
    if app
        .rate
        .check(&format!("auth:login:{ip}"), 10, Duration::from_secs(15 * 60))
        .is_err()
    {
        return err(StatusCode::TOO_MANY_REQUESTS, "Trop de tentatives. Réessayez dans quelques minutes.");
    }
    if body.password.is_empty() || body.password.len() > 128 || !valid_email(&body.email) {
        return err(StatusCode::BAD_REQUEST, "Email ou mot de passe incorrect");
    }
    let found = match app.db.user_by_email(body.email.trim()) {
        Ok(v) => v,
        Err(e) => return err(StatusCode::INTERNAL_SERVER_ERROR, &e),
    };
    let Some((user, hash)) = found else {
        return err(StatusCode::UNAUTHORIZED, "Email ou mot de passe incorrect");
    };
    let password = body.password.clone();
    let ok = tokio::task::spawn_blocking(move || verify_password(&password, &hash))
        .await
        .unwrap_or(false);
    if !ok {
        return err(StatusCode::UNAUTHORIZED, "Email ou mot de passe incorrect");
    }
    set_session(&app, user)
}

async fn register(
    State(app): State<Arc<App>>,
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    headers: HeaderMap,
    Json(body): Json<RegisterBody>,
) -> Response {
    let ip = client_ip(&app, &headers, addr);
    if app
        .rate
        .check(&format!("auth:register:{ip}"), 5, Duration::from_secs(15 * 60))
        .is_err()
    {
        return err(StatusCode::TOO_MANY_REQUESTS, "Trop de tentatives. Réessayez dans quelques minutes.");
    }
    if body.accept_terms != Some(true) {
        return err(StatusCode::BAD_REQUEST, "Vous devez accepter les CGU");
    }
    if !valid_email(&body.email) {
        return err(StatusCode::BAD_REQUEST, "Email invalide");
    }
    if body.password.len() < 8 || body.password.len() > 128 {
        return err(StatusCode::BAD_REQUEST, "Minimum 8 caractères");
    }
    let name = body
        .name
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty() && s.len() <= 80);
    let email = body.email.trim().to_string();
    if app.db.user_by_email(&email).ok().flatten().is_some() {
        return err(StatusCode::CONFLICT, "Cet email est déjà utilisé");
    }
    let password = body.password.clone();
    let hash = match tokio::task::spawn_blocking(move || hash_password(&password)).await {
        Ok(Ok(h)) => h,
        _ => return err(StatusCode::INTERNAL_SERVER_ERROR, "Erreur serveur"),
    };
    let user = match app.db.insert_user(&new_id(), &email, name, &hash) {
        Ok(u) => u,
        Err(e) if e.contains("déjà") => return err(StatusCode::CONFLICT, &e),
        Err(e) => return err(StatusCode::INTERNAL_SERVER_ERROR, &e),
    };
    set_session(&app, user)
}

async fn logout(State(app): State<Arc<App>>) -> Response {
    let mut res = Json(json!({ "ok": true })).into_response();
    res.headers_mut().insert(
        header::SET_COOKIE,
        clear_cookie(app.cfg.cookie_secure).parse().unwrap(),
    );
    res
}

async fn me(State(app): State<Arc<App>>, headers: HeaderMap) -> Response {
    match session_user(&app, &headers).await {
        Some(u) => Json(json!({ "user": u })).into_response(),
        None => Json(json!({ "user": null })).into_response(),
    }
}

#[derive(Deserialize)]
struct ChannelQuery {
    q: Option<String>,
    group: Option<String>,
    playlist: Option<String>,
    #[serde(rename = "playlistId")]
    playlist_id: Option<String>,
    favorite: Option<String>,
    limit: Option<i64>,
}

async fn channels(
    State(app): State<Arc<App>>,
    headers: HeaderMap,
    Query(q): Query<ChannelQuery>,
) -> Response {
    let Some(user) = session_user(&app, &headers).await else {
        return err(StatusCode::UNAUTHORIZED, "Non authentifié");
    };
    let favs = app.db.favorite_ids(&user.id).unwrap_or_default();
    let favorite_only = matches!(q.favorite.as_deref(), Some("true") | Some("1"));
    let limit = q.limit.unwrap_or(500).clamp(1, 2000);
    match app.db.search_channels(
        &user.id,
        q.q.as_deref(),
        q.group.as_deref(),
        q.playlist.as_deref().or(q.playlist_id.as_deref()),
        favorite_only,
        limit,
        &favs,
    ) {
        Ok(channels) => Json(json!({ "channels": channels })).into_response(),
        Err(e) => err(StatusCode::INTERNAL_SERVER_ERROR, &e),
    }
}

async fn channel_groups(State(app): State<Arc<App>>, headers: HeaderMap) -> Response {
    let Some(user) = session_user(&app, &headers).await else {
        return err(StatusCode::UNAUTHORIZED, "Non authentifié");
    };
    match app.db.groups(&user.id) {
        Ok(groups) => Json(json!({ "groups": groups })).into_response(),
        Err(e) => err(StatusCode::INTERNAL_SERVER_ERROR, &e),
    }
}

async fn favorites(
    State(app): State<Arc<App>>,
    headers: HeaderMap,
    Query(q): Query<HashMap<String, String>>,
) -> Response {
    let Some(user) = session_user(&app, &headers).await else {
        return err(StatusCode::UNAUTHORIZED, "Non authentifié");
    };
    match app.db.list_favorites(&user.id) {
        Ok(list) if q.get("grouped").map(|s| s.as_str()) == Some("true") => {
            Json(json!({ "groups": group_favorites(&list) })).into_response()
        }
        Ok(list) => Json(json!({ "favorites": list })).into_response(),
        Err(e) => err(StatusCode::INTERNAL_SERVER_ERROR, &e),
    }
}

fn group_favorites(list: &[ChannelDto]) -> Value {
    let mut groups = json!({
        "NEWS": [], "SPORTS": [], "MOVIES": [], "KIDS": [], "OTHER": []
    });
    for fav in list {
        let key = fav.favorite_category.as_deref().unwrap_or("OTHER");
        let bucket = if groups.get(key).is_some() { key } else { "OTHER" };
        groups[bucket]
            .as_array_mut()
            .unwrap()
            .push(serde_json::to_value(fav).unwrap());
    }
    groups
}

#[derive(Deserialize)]
struct FavBody {
    #[serde(rename = "channelId")]
    channel_id: String,
    category: Option<String>,
}

async fn add_favorite(
    State(app): State<Arc<App>>,
    headers: HeaderMap,
    Json(body): Json<FavBody>,
) -> Response {
    let Some(user) = session_user(&app, &headers).await else {
        return err(StatusCode::UNAUTHORIZED, "Non authentifié");
    };
    let cat = body.category.as_deref().map(|s| s.to_ascii_uppercase());
    let cat = cat
        .as_deref()
        .filter(|s| ["NEWS", "SPORTS", "MOVIES", "KIDS"].contains(s));
    match app
        .db
        .add_favorite(&new_id(), &user.id, &body.channel_id, cat)
    {
        Ok(()) => Json(json!({ "ok": true })).into_response(),
        Err(e) => err(StatusCode::BAD_REQUEST, &e),
    }
}

#[derive(Deserialize)]
struct ChannelIdQuery {
    #[serde(rename = "channelId")]
    channel_id: Option<String>,
}

async fn del_favorite(
    State(app): State<Arc<App>>,
    headers: HeaderMap,
    Query(q): Query<ChannelIdQuery>,
) -> Response {
    let Some(user) = session_user(&app, &headers).await else {
        return err(StatusCode::UNAUTHORIZED, "Non authentifié");
    };
    let Some(id) = q.channel_id.filter(|s| !s.is_empty()) else {
        return err(StatusCode::BAD_REQUEST, "channelId requis");
    };
    match app.db.remove_favorite(&user.id, &id) {
        Ok(()) => Json(json!({ "ok": true })).into_response(),
        Err(e) => err(StatusCode::INTERNAL_SERVER_ERROR, &e),
    }
}

async fn stats(State(app): State<Arc<App>>, headers: HeaderMap) -> Response {
    let Some(user) = session_user(&app, &headers).await else {
        return err(StatusCode::UNAUTHORIZED, "Non authentifié");
    };
    match app.db.stats(&user.id) {
        Ok(stats) => Json(json!({ "stats": stats })).into_response(),
        Err(e) => err(StatusCode::INTERNAL_SERVER_ERROR, &e),
    }
}

async fn playlists(State(app): State<Arc<App>>, headers: HeaderMap) -> Response {
    let Some(user) = session_user(&app, &headers).await else {
        return err(StatusCode::UNAUTHORIZED, "Non authentifié");
    };
    match app.db.list_playlists(&user.id) {
        Ok(playlists) => Json(json!({ "playlists": playlists })).into_response(),
        Err(e) => err(StatusCode::INTERNAL_SERVER_ERROR, &e),
    }
}

#[derive(Deserialize)]
struct IdQuery {
    id: Option<String>,
}

async fn delete_playlist(
    State(app): State<Arc<App>>,
    headers: HeaderMap,
    Query(q): Query<IdQuery>,
) -> Response {
    let Some(user) = session_user(&app, &headers).await else {
        return err(StatusCode::UNAUTHORIZED, "Non authentifié");
    };
    let Some(id) = q.id.filter(|s| !s.is_empty()) else {
        return err(StatusCode::BAD_REQUEST, "id requis");
    };
    match app.db.delete_playlist(&user.id, &id) {
        Ok(true) => Json(json!({ "ok": true })).into_response(),
        Ok(false) => err(StatusCode::NOT_FOUND, "Playlist introuvable"),
        Err(e) => err(StatusCode::INTERNAL_SERVER_ERROR, &e),
    }
}

#[derive(Deserialize)]
struct ImportBody {
    name: String,
    url: String,
    #[serde(rename = "epgUrl")]
    epg_url: Option<String>,
}

async fn import_playlist(
    State(app): State<Arc<App>>,
    headers: HeaderMap,
    Json(body): Json<ImportBody>,
) -> Response {
    let Some(user) = session_user(&app, &headers).await else {
        return err(StatusCode::UNAUTHORIZED, "Non authentifié");
    };
    if app
        .rate
        .check(
            &format!("playlist:import:{}", user.id),
            20,
            Duration::from_secs(60 * 60),
        )
        .is_err()
    {
        return err(StatusCode::TOO_MANY_REQUESTS, "Trop d'imports. Réessayez plus tard.");
    }
    do_import(&app, &user, &body.name, &body.url, body.epg_url.as_deref()).await
}

async fn import_demo(State(app): State<Arc<App>>, headers: HeaderMap) -> Response {
    let Some(user) = session_user(&app, &headers).await else {
        return err(StatusCode::UNAUTHORIZED, "Non authentifié");
    };
    let mut imported = Vec::new();
    for (name, url, epg) in DEMO_PLAYLISTS {
        match do_import_inner(&app, &user, name, url, *epg).await {
            Ok(p) => imported.push(p),
            Err(resp) => return resp,
        }
    }
    Json(json!({ "playlists": imported, "message": "Playlists démo importées" })).into_response()
}

async fn do_import(
    app: &App,
    user: &User,
    name: &str,
    url: &str,
    epg: Option<&str>,
) -> Response {
    match do_import_inner(app, user, name, url, epg).await {
        Ok(p) => Json(json!({ "playlist": p, "message": "Import terminé" })).into_response(),
        Err(r) => r,
    }
}

async fn do_import_inner(
    app: &App,
    user: &User,
    name: &str,
    url: &str,
    epg: Option<&str>,
) -> Result<crate::db::PlaylistDto, Response> {
    let name = name.trim();
    if name.is_empty() || name.len() > 120 {
        return Err(err(StatusCode::BAD_REQUEST, "Nom de playlist invalide"));
    }
    if validate_outbound_url(url).is_err() {
        return Err(err(StatusCode::BAD_REQUEST, "URL playlist refusée"));
    }
    if let Some(e) = epg {
        if !e.is_empty() && validate_outbound_url(e).is_err() {
            return Err(err(StatusCode::BAD_REQUEST, "URL EPG refusée"));
        }
    }
    let raw = match crate::proxy::fetch_text(&app.http, url).await {
        Ok(t) => t,
        Err(e) => return Err(err(StatusCode::BAD_REQUEST, &e)),
    };
    let parsed = parse_m3u(&raw);
    if parsed.is_empty() {
        return Err(err(StatusCode::BAD_REQUEST, "Aucune chaîne dans la playlist"));
    }
    let channels: Vec<NewChannel> = parsed
        .into_iter()
        .filter(|c| validate_outbound_url(&c.url).is_ok())
        .map(|c| NewChannel {
            normalized_name: normalize_channel_name(&c.name),
            stream_type: stream_type_from_url(&c.url).to_string(),
            group: normalize_group(c.group.as_deref()),
            name: c.name,
            logo: c.logo,
            tvg_id: c.tvg_id,
            tvg_name: c.tvg_name,
            language: c.language,
            country: c.country,
            catchup: c.catchup,
            radio: c.radio,
            resolution: c.resolution,
            url: c.url,
        })
        .collect();
    if channels.is_empty() {
        return Err(err(
            StatusCode::BAD_REQUEST,
            "Aucune URL de flux autorisée dans la playlist",
        ));
    }
    let playlist_id = new_id();
    let log_id = new_id();
    let playlist = app
        .db
        .import_playlist(
            &playlist_id,
            &user.id,
            name,
            Some(url),
            epg.filter(|s| !s.is_empty()),
            &channels,
            &log_id,
        )
        .map_err(|e| err(StatusCode::INTERNAL_SERVER_ERROR, &e))?;
    let program_count = sync_epg_if_any(app, &playlist.id, playlist.epg_url.as_deref()).await;
    if program_count > 0 {
        let _ = app.db.update_scan_log_programs(&log_id, program_count);
    }
    Ok(playlist)
}

async fn scan_playlist(
    State(app): State<Arc<App>>,
    headers: HeaderMap,
    Query(q): Query<HashMap<String, String>>,
) -> Response {
    let Some(user) = session_user(&app, &headers).await else {
        return err(StatusCode::UNAUTHORIZED, "Non authentifié");
    };
    if app
        .rate
        .check(
            &format!("playlist:scan:{}", user.id),
            30,
            Duration::from_secs(60 * 60),
        )
        .is_err()
    {
        return err(StatusCode::TOO_MANY_REQUESTS, "Trop de rescans. Réessayez plus tard.");
    }
    let Some(id) = q.get("id").map(|s| s.as_str()).filter(|s| !s.is_empty()) else {
        return err(StatusCode::BAD_REQUEST, "id requis");
    };
    match rescan_owned(&app, &user.id, id).await {
        Ok(summary) => Json(json!(summary)).into_response(),
        Err(r) => r,
    }
}

async fn rescan_owned(app: &App, user_id: &str, playlist_id: &str) -> Result<Value, Response> {
    let Some(pl) = app
        .db
        .playlist_for_user(user_id, playlist_id)
        .map_err(|e| err(StatusCode::INTERNAL_SERVER_ERROR, &e))?
    else {
        return Err(err(StatusCode::NOT_FOUND, "Playlist introuvable"));
    };
    rescan_playlist(app, &pl, "RESCAN").await
}

async fn rescan_playlist(app: &App, pl: &crate::db::PlaylistDto, log_type: &str) -> Result<Value, Response> {
    let start = std::time::Instant::now();
    let Some(url) = pl.url.as_deref().filter(|u| !u.is_empty()) else {
        return Err(err(StatusCode::BAD_REQUEST, "Playlist sans URL"));
    };
    let _ = app.db.set_scan_status(&pl.id, "PENDING", None);
    let channels = match fetch_channels(app, url).await {
        Ok(c) => c,
        Err(e) => {
            let ms = start.elapsed().as_millis() as i64;
            let _ = app.db.record_scan_error(&pl.id, log_type, &e, ms);
            return Err(err(StatusCode::BAD_REQUEST, &e));
        }
    };
    let log_id = new_id();
    let duration_ms = start.elapsed().as_millis() as i64;
    let playlist = app
        .db
        .replace_playlist_channels(&pl.id, &channels, log_type, &log_id, duration_ms)
        .map_err(|e| {
            let _ = app.db.record_scan_error(&pl.id, log_type, &e, duration_ms);
            err(StatusCode::INTERNAL_SERVER_ERROR, &e)
        })?;
    let program_count = sync_epg_if_any(app, &pl.id, playlist.epg_url.as_deref()).await;
    if program_count > 0 {
        let _ = app.db.update_scan_log_programs(&log_id, program_count);
    }
    Ok(json!({
        "id": log_id,
        "playlistId": playlist.id,
        "type": log_type,
        "channelCount": playlist.channel_count,
        "programCount": program_count,
        "durationMs": duration_ms,
        "playlist": playlist,
    }))
}

async fn fetch_channels(app: &App, url: &str) -> Result<Vec<NewChannel>, String> {
    if validate_outbound_url(url).is_err() {
        return Err("URL playlist refusée".into());
    }
    let raw = crate::proxy::fetch_text(&app.http, url).await?;
    let parsed = parse_m3u(&raw);
    if parsed.is_empty() {
        return Err("Aucune chaîne dans la playlist".into());
    }
    let channels: Vec<NewChannel> = parsed
        .into_iter()
        .filter(|c| validate_outbound_url(&c.url).is_ok())
        .map(|c| NewChannel {
            normalized_name: normalize_channel_name(&c.name),
            stream_type: stream_type_from_url(&c.url).to_string(),
            group: normalize_group(c.group.as_deref()),
            name: c.name,
            logo: c.logo,
            tvg_id: c.tvg_id,
            tvg_name: c.tvg_name,
            language: c.language,
            country: c.country,
            catchup: c.catchup,
            radio: c.radio,
            resolution: c.resolution,
            url: c.url,
        })
        .collect();
    if channels.is_empty() {
        return Err("Aucune URL de flux autorisée dans la playlist".into());
    }
    Ok(channels)
}

async fn sync_epg_if_any(app: &App, playlist_id: &str, epg_url: Option<&str>) -> i64 {
    let Some(epg) = epg_url.filter(|u| !u.is_empty()) else {
        return 0;
    };
    match sync_playlist_epg(app, playlist_id, epg).await {
        Ok(n) => n,
        Err(e) => {
            eprintln!("EPG {playlist_id}: {e}");
            0
        }
    }
}

async fn sync_playlist_epg(app: &App, playlist_id: &str, epg_url: &str) -> Result<i64, String> {
    if validate_outbound_url(epg_url).is_err() {
        return Err("URL EPG refusée".into());
    }
    let xml = crate::proxy::fetch_text(&app.http, epg_url).await?;
    let programs = parse_xmltv(&xml);
    let tvg_map = app.db.channel_tvg_map(playlist_id)?;
    let by_tvg: HashMap<String, String> = tvg_map.into_iter().map(|(id, tvg)| (tvg, id)).collect();
    let rows: Vec<(String, String, Option<String>, i64, i64, Option<String>)> = programs
        .into_iter()
        .filter_map(|p| {
            let channel_id = by_tvg.get(&p.channel_ref)?.clone();
            Some((
                channel_id,
                p.title,
                p.description,
                p.start_ms,
                p.end_ms,
                p.category,
            ))
        })
        .collect();
    app.db.replace_programs(playlist_id, &rows)
}

#[derive(Deserialize)]
struct EpgQuery {
    #[serde(rename = "channelId")]
    channel_id: Option<String>,
}

async fn epg_get(
    State(app): State<Arc<App>>,
    headers: HeaderMap,
    Query(q): Query<EpgQuery>,
) -> Response {
    let Some(user) = session_user(&app, &headers).await else {
        return err(StatusCode::UNAUTHORIZED, "Non authentifié");
    };
    match app
        .db
        .upcoming_programs(&user.id, q.channel_id.as_deref(), 200)
    {
        Ok(programs) => Json(json!({ "programs": programs })).into_response(),
        Err(e) => err(StatusCode::INTERNAL_SERVER_ERROR, &e),
    }
}

async fn epg_refresh(State(app): State<Arc<App>>, headers: HeaderMap) -> Response {
    let Some(user) = session_user(&app, &headers).await else {
        return err(StatusCode::UNAUTHORIZED, "Non authentifié");
    };
    let playlists = match app.db.playlists_with_epg(Some(&user.id)) {
        Ok(p) => p,
        Err(e) => return err(StatusCode::INTERNAL_SERVER_ERROR, &e),
    };
    let mut results = Vec::new();
    for pl in playlists {
        let count = sync_epg_if_any(&app, &pl.id, pl.epg_url.as_deref()).await;
        results.push(json!({ "playlistId": pl.id, "count": count }));
    }
    Json(json!({ "results": results })).into_response()
}

async fn recommendations(State(app): State<Arc<App>>, headers: HeaderMap) -> Response {
    let Some(user) = session_user(&app, &headers).await else {
        return err(StatusCode::UNAUTHORIZED, "Non authentifié");
    };
    match app.db.recommendations(&user.id, 12) {
        Ok(channels) => Json(json!({ "channels": channels })).into_response(),
        Err(e) => err(StatusCode::INTERNAL_SERVER_ERROR, &e),
    }
}

async fn admin_health(State(app): State<Arc<App>>, headers: HeaderMap) -> Response {
    let Some(user) = session_user(&app, &headers).await else {
        return err(StatusCode::UNAUTHORIZED, "Non authentifié");
    };
    match app.db.admin_health(&user.id) {
        Ok(health) => Json(json!({ "health": health })).into_response(),
        Err(e) => err(StatusCode::INTERNAL_SERVER_ERROR, &e),
    }
}

async fn cron_scan(State(app): State<Arc<App>>, headers: HeaderMap) -> Response {
    let Some(secret) = app.cfg.cron_secret.as_deref() else {
        return err(StatusCode::SERVICE_UNAVAILABLE, "CRON_SECRET non configuré");
    };
    let auth = headers
        .get(header::AUTHORIZATION)
        .and_then(|v| v.to_str().ok())
        .unwrap_or("");
    if auth != format!("Bearer {secret}") {
        return err(StatusCode::UNAUTHORIZED, "Non autorisé");
    }
    let older = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_millis() as i64
        - 24 * 60 * 60 * 1000;
    let stale = match app.db.stale_playlists(older) {
        Ok(p) => p,
        Err(e) => return err(StatusCode::INTERNAL_SERVER_ERROR, &e),
    };
    let mut scan_results = Vec::new();
    for pl in &stale {
        match rescan_playlist(&app, pl, "RESCAN").await {
            Ok(_) => scan_results.push(json!({ "playlistId": pl.id, "ok": true })),
            Err(_) => scan_results.push(json!({ "playlistId": pl.id, "ok": false })),
        }
    }
    let with_epg = app.db.playlists_with_epg(None).unwrap_or_default();
    let mut epg_results = Vec::new();
    for pl in with_epg {
        let count = sync_epg_if_any(&app, &pl.id, pl.epg_url.as_deref()).await;
        epg_results.push(json!({ "playlistId": pl.id, "count": count }));
    }
    Json(json!({
        "scan": scan_results,
        "epg": epg_results,
        "timestamp": chrono::Utc::now().to_rfc3339(),
    }))
    .into_response()
}

async fn history(State(app): State<Arc<App>>, headers: HeaderMap) -> Response {
    let Some(user) = session_user(&app, &headers).await else {
        return err(StatusCode::UNAUTHORIZED, "Non authentifié");
    };
    match app.db.watch_history(&user.id, 20) {
        Ok(history) => Json(json!({ "history": history })).into_response(),
        Err(e) => err(StatusCode::INTERNAL_SERVER_ERROR, &e),
    }
}

#[derive(Deserialize)]
struct WatchBody {
    #[serde(rename = "channelId")]
    channel_id: String,
}

async fn record_history(
    State(app): State<Arc<App>>,
    headers: HeaderMap,
    Json(body): Json<WatchBody>,
) -> Response {
    let Some(user) = session_user(&app, &headers).await else {
        return err(StatusCode::UNAUTHORIZED, "Non authentifié");
    };
    match app.db.record_watch(&new_id(), &user.id, &body.channel_id) {
        Ok(()) => Json(json!({ "ok": true })).into_response(),
        Err(e) => err(StatusCode::BAD_REQUEST, &e),
    }
}

#[derive(Deserialize)]
struct ProxyReg {
    url: String,
}

async fn proxy_register(
    State(app): State<Arc<App>>,
    headers: HeaderMap,
    Json(body): Json<ProxyReg>,
) -> Response {
    let Some(user) = session_user(&app, &headers).await else {
        return err(StatusCode::UNAUTHORIZED, "Non authentifié");
    };
    if app
        .rate
        .check(&format!("proxy:{}", user.id), RATE_MAX, RATE_WINDOW)
        .is_err()
    {
        return err(StatusCode::TOO_MANY_REQUESTS, "Limite de requêtes proxy atteinte");
    }
    match app.tokens.register(&user.id, &body.url) {
        Ok(token) => Json(json!({ "token": token, "path": token_path(&token) })).into_response(),
        Err(e) => err(StatusCode::BAD_REQUEST, &e),
    }
}

async fn proxy_token(
    State(app): State<Arc<App>>,
    headers: HeaderMap,
    Path(token): Path<String>,
    Query(q): Query<HashMap<String, String>>,
) -> Response {
    let Some(user) = session_user(&app, &headers).await else {
        return err(StatusCode::UNAUTHORIZED, "Non authentifié");
    };
    if app
        .rate
        .check(&format!("proxy:{}", user.id), RATE_MAX, RATE_WINDOW)
        .is_err()
    {
        return err(StatusCode::TOO_MANY_REQUESTS, "Limite de requêtes proxy atteinte");
    }
    let Some(href) = app.tokens.resolve(&token, &user.id) else {
        return err(StatusCode::NOT_FOUND, "Token proxy invalide ou expiré");
    };
    let ctx = q.get("contextType").map(|s| s.as_str());
    let proxied = fetch_upstream(&user.id, &href, ctx, &app.tokens, &app.http).await;
    if proxied.status == 404 && ctx == Some("manifest") {
        app.tokens.invalidate(&token);
    }
    proxied_response(proxied)
}

async fn proxy_query(
    State(app): State<Arc<App>>,
    headers: HeaderMap,
    Query(q): Query<HashMap<String, String>>,
) -> Response {
    let Some(user) = session_user(&app, &headers).await else {
        return err(StatusCode::UNAUTHORIZED, "Non authentifié");
    };
    if app
        .rate
        .check(&format!("proxy:{}", user.id), RATE_MAX, RATE_WINDOW)
        .is_err()
    {
        return err(StatusCode::TOO_MANY_REQUESTS, "Limite de requêtes proxy atteinte");
    }
    let Some(raw) = q.get("url").cloned() else {
        return err(StatusCode::BAD_REQUEST, "Paramètre url requis");
    };
    if !should_use_query_fallback(&raw) {
        return err(
            StatusCode::URI_TOO_LONG,
            "URL trop longue pour le mode query string — utilisez POST /api/stream/proxy/register",
        );
    }
    let ctx = q.get("contextType").map(|s| s.as_str());
    let proxied = fetch_upstream(&user.id, &raw, ctx, &app.tokens, &app.http).await;
    proxied_response(proxied)
}

fn proxied_response(p: crate::proxy::Proxied) -> Response {
    let mut builder = Response::builder().status(p.status);
    for (k, v) in p.headers {
        if let (Ok(name), Ok(val)) = (
            axum::http::HeaderName::try_from(k),
            axum::http::HeaderValue::try_from(v),
        ) {
            builder = builder.header(name, val);
        }
    }
    builder.body(Body::from(p.body)).unwrap_or_else(|_| {
        (StatusCode::INTERNAL_SERVER_ERROR, "réponse proxy").into_response()
    })
}

async fn session_user(app: &App, headers: &HeaderMap) -> Option<User> {
    let raw = headers
        .get(header::COOKIE)
        .and_then(|v| v.to_str().ok());
    let token = token_from_cookie_header(raw)?;
    let id = user_id_from_token(&token, &app.cfg.jwt_secret)?;
    app.db.user_by_id(&id).ok().flatten()
}

fn set_session(app: &App, user: User) -> Response {
    let Ok(token) = issue_token(&user, &app.cfg.jwt_secret) else {
        return err(StatusCode::INTERNAL_SERVER_ERROR, "Erreur serveur");
    };
    let mut res = Json(json!({
        "id": user.id,
        "email": user.email,
        "name": user.name,
    }))
    .into_response();
    res.headers_mut().insert(
        header::SET_COOKIE,
        session_cookie(&token, app.cfg.cookie_secure)
            .parse()
            .unwrap(),
    );
    res
}

fn client_ip(app: &App, headers: &HeaderMap, addr: SocketAddr) -> String {
    if app.cfg.trust_proxy {
        if let Some(v) = headers.get("x-real-ip").and_then(|v| v.to_str().ok()) {
            return v.trim().to_string();
        }
        if let Some(v) = headers.get("x-forwarded-for").and_then(|v| v.to_str().ok()) {
            if let Some(first) = v.split(',').next() {
                return first.trim().to_string();
            }
        }
    }
    addr.ip().to_string()
}

fn err(status: StatusCode, msg: &str) -> Response {
    let mut res = Json(json!({ "error": msg })).into_response();
    *res.status_mut() = status;
    res
}

async fn csrf_and_headers(
    State(app): State<Arc<App>>,
    req: Request<Body>,
    next: Next,
) -> Response {
    let method = req.method().clone();
    if matches!(method, Method::POST | Method::PUT | Method::PATCH | Method::DELETE)
        && req.uri().path().starts_with("/api/")
        && !req.uri().path().starts_with("/api/cron/")
        && !csrf_ok(&req)
    {
        return err(StatusCode::FORBIDDEN, "Origine refusée");
    }
    let mut res = next.run(req).await;
    let h = res.headers_mut();
    h.insert(header::X_CONTENT_TYPE_OPTIONS, "nosniff".parse().unwrap());
    h.insert(header::X_FRAME_OPTIONS, "DENY".parse().unwrap());
    h.insert("referrer-policy", "strict-origin-when-cross-origin".parse().unwrap());
    h.insert(
        "permissions-policy",
        "camera=(), microphone=(), geolocation=()".parse().unwrap(),
    );
    h.insert("cross-origin-opener-policy", "same-origin".parse().unwrap());
    if app.cfg.production {
        h.insert(
            "strict-transport-security",
            "max-age=31536000; includeSubDomains".parse().unwrap(),
        );
    }
    h.insert(
        header::CONTENT_SECURITY_POLICY,
        "default-src 'self'; script-src 'self' https://cdn.jsdelivr.net; style-src 'self' 'unsafe-inline'; img-src 'self' https: data:; media-src 'self' blob:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'"
            .parse()
            .unwrap(),
    );
    res
}

fn csrf_ok(req: &Request<Body>) -> bool {
    let host = req
        .headers()
        .get(header::HOST)
        .and_then(|v| v.to_str().ok())
        .unwrap_or("");
    let proto = req
        .headers()
        .get("x-forwarded-proto")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("http");
    let expected = format!("{proto}://{host}");
    if let Some(origin) = req.headers().get(header::ORIGIN).and_then(|v| v.to_str().ok()) {
        return origin.eq_ignore_ascii_case(&expected);
    }
    if let Some(referer) = req.headers().get(header::REFERER).and_then(|v| v.to_str().ok()) {
        return referer.starts_with(&expected);
    }
    false
}

fn legal_wrap(title: &str, body: &str) -> Html<String> {
    Html(format!(
        r#"<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>{title} — StreamTV</title><link rel="stylesheet" href="/ui/app.css?v=1"></head><body class="legal"><main><a href="/">← StreamTV</a><h1>{title}</h1>{body}</main></body></html>"#
    ))
}

async fn legal_mentions() -> Html<String> {
    legal_wrap(
        "Mentions légales",
        "<p>StreamTV est un lecteur IPTV personnel. L'éditeur n'héberge et ne fournit aucun flux audiovisuel.</p>",
    )
}

async fn legal_cgu() -> Html<String> {
    legal_wrap(
        "Conditions générales d'utilisation",
        "<p>Vous importez vos propres playlists. Vous êtes responsable de la légalité des flux que vous lisez. StreamTV ne fournit aucun contenu.</p>",
    )
}

async fn legal_privacy() -> Html<String> {
    legal_wrap(
        "Confidentialité",
        "<p>Compte, playlists, favoris et historique sont stockés sur le serveur que vous contrôlez. Pas de publicité, pas de revente de données.</p>",
    )
}

async fn legal_cookies() -> Html<String> {
    legal_wrap(
        "Cookies",
        "<p>Seul un cookie de session technique httpOnly (<code>streamtv_session</code>) est utilisé pour vous garder connecté.</p>",
    )
}

pub fn http_client_shared() -> reqwest::Client {
    http_client()
}
