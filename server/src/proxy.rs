use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use base64::Engine;
use parking_lot::Mutex;
use regex::Regex;
use rand::RngCore;
use reqwest::redirect::Policy;
use reqwest::{Client, StatusCode};
use std::collections::HashMap;
use std::sync::OnceLock;
use std::time::{Duration, Instant};
use url::Url;

use crate::outbound::{assert_resolved_public, validate_outbound_url, MAX_REDIRECTS};

const MANIFEST_TTL: Duration = Duration::from_secs(2 * 60 * 60);
const SEGMENT_TTL: Duration = Duration::from_secs(4 * 60 * 60);
const UPSTREAM_TIMEOUT: Duration = Duration::from_secs(30);
const PROXY_URL_FALLBACK_MAX: usize = 1500;
pub const RATE_MAX: u32 = 600;
pub const RATE_WINDOW: Duration = Duration::from_secs(60);

const UA: &str =
    "Mozilla/5.0 (compatible; StreamTV/1.0; +https://streamtv.local) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36";

#[derive(Clone)]
struct TokenEntry {
    url: String,
    user_id: String,
    ttl: Duration,
    expires: Instant,
}

pub struct ProxyTokens {
    inner: Mutex<HashMap<String, TokenEntry>>,
}

impl ProxyTokens {
    pub fn new() -> Self {
        Self {
            inner: Mutex::new(HashMap::new()),
        }
    }

    pub fn register(&self, user_id: &str, raw_url: &str) -> Result<String, String> {
        let url = validate_outbound_url(raw_url).map_err(|e| e.0)?;
        let token = random_token();
        let ttl = infer_ttl(url.as_str());
        let mut map = self.inner.lock();
        map.retain(|_, e| e.expires > Instant::now());
        map.insert(
            token.clone(),
            TokenEntry {
                url: url.to_string(),
                user_id: user_id.to_string(),
                ttl,
                expires: Instant::now() + ttl,
            },
        );
        Ok(token)
    }

    pub fn resolve(&self, token: &str, user_id: &str) -> Option<String> {
        let mut map = self.inner.lock();
        let now = Instant::now();
        map.retain(|_, e| e.expires > now);
        let entry = map.get_mut(token)?;
        if entry.user_id != user_id {
            return None;
        }
        entry.expires = now + entry.ttl;
        Some(entry.url.clone())
    }

    pub fn invalidate(&self, token: &str) {
        self.inner.lock().remove(token);
    }
}

pub fn should_use_query_fallback(url: &str) -> bool {
    url.len() <= PROXY_URL_FALLBACK_MAX
}

pub fn token_path(token: &str) -> String {
    format!("/api/stream/proxy/{token}")
}

fn infer_ttl(url: &str) -> Duration {
    Url::parse(url)
        .ok()
        .map(|u| u.path().to_ascii_lowercase())
        .filter(|p| p.contains(".m3u8"))
        .map(|_| MANIFEST_TTL)
        .unwrap_or(SEGMENT_TTL)
}

fn random_token() -> String {
    let mut bytes = [0u8; 16];
    rand::thread_rng().fill_bytes(&mut bytes);
    URL_SAFE_NO_PAD.encode(bytes)
}

fn uri_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| Regex::new(r#"URI=(?:"([^"]*)"|'([^']*)'|([^",\s]+))"#).unwrap())
}

fn proxy_path_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| Regex::new(r"^/api/stream/proxy/[A-Za-z0-9_-]+$").unwrap())
}

fn already_proxied(path_or_url: &str) -> bool {
    let trimmed = path_or_url.trim();
    if proxy_path_re().is_match(trimmed) {
        return true;
    }
    Url::parse(trimmed)
        .ok()
        .map(|u| proxy_path_re().is_match(u.path()))
        .unwrap_or(false)
}

fn to_relative_proxy(path_or_url: &str) -> String {
    if proxy_path_re().is_match(path_or_url) {
        return path_or_url.to_string();
    }
    if let Ok(parsed) = Url::parse(path_or_url) {
        if proxy_path_re().is_match(parsed.path()) {
            return parsed.path().to_string();
        }
    }
    path_or_url.to_string()
}

fn resolve_absolute(relative: &str, base: &str) -> String {
    Url::parse(base)
        .ok()
        .and_then(|b| b.join(relative).ok())
        .map(|u| u.to_string())
        .unwrap_or_else(|| relative.to_string())
}

fn to_proxy_url(original: &str, user_id: &str, tokens: &ProxyTokens) -> String {
    if already_proxied(original) {
        return to_relative_proxy(original);
    }
    match tokens.register(user_id, original) {
        Ok(token) => token_path(&token),
        Err(_) => original.to_string(),
    }
}

pub fn rewrite_m3u8(content: &str, manifest_url: &str, user_id: &str, tokens: &ProxyTokens) -> String {
    content
        .split_inclusive('\n')
        .map(|raw| {
            let had_nl = raw.ends_with('\n');
            let line = raw.trim_end_matches(['\n', '\r']);
            let rewritten = if line.starts_with('#') {
                uri_re()
                    .replace_all(line, |caps: &regex::Captures| {
                        let uri = caps
                            .get(1)
                            .or_else(|| caps.get(2))
                            .or_else(|| caps.get(3))
                            .map(|m| m.as_str().trim())
                            .unwrap_or("");
                        if uri.is_empty() {
                            return caps[0].to_string();
                        }
                        let absolute = resolve_absolute(uri, manifest_url);
                        format!(r#"URI="{}""#, to_proxy_url(&absolute, user_id, tokens))
                    })
                    .into_owned()
            } else if line.trim().is_empty() {
                line.to_string()
            } else {
                let absolute = resolve_absolute(line.trim(), manifest_url);
                to_proxy_url(&absolute, user_id, tokens)
            };
            if had_nl {
                format!("{rewritten}\n")
            } else {
                rewritten
            }
        })
        .collect()
}

pub fn is_m3u8(content_type: &str, target: &Url, preview: &str) -> bool {
    let ct = content_type.to_ascii_lowercase();
    if ct.contains("mpegurl") || ct.contains("m3u8") {
        return true;
    }
    if target.path().to_ascii_lowercase().contains(".m3u8") {
        return true;
    }
    preview.trim_start().starts_with("#EXTM3U")
}

fn is_level_playlist(content: &str) -> bool {
    content.contains("#EXTINF") && !content.contains("#EXT-X-STREAM-INF")
}

fn is_live_playlist(content: &str) -> bool {
    if content.contains("#EXT-X-PLAYLIST-TYPE:EVENT") {
        return true;
    }
    content.contains("#EXTINF") && !content.contains("#EXT-X-ENDLIST")
}

pub struct Proxied {
    pub status: u16,
    pub headers: Vec<(String, String)>,
    pub body: Vec<u8>,
}

pub async fn fetch_upstream(
    user_id: &str,
    target_href: &str,
    context_type: Option<&str>,
    tokens: &ProxyTokens,
    http: &Client,
) -> Proxied {
    let url = match validate_outbound_url(target_href) {
        Ok(u) => u,
        Err(e) => return json_error(400, &e.0),
    };

    let upstream = match safe_get(http, url.clone()).await {
        Ok(r) => r,
        Err(msg) if msg.starts_with("URL refusée") => return json_error(400, &msg),
        Err(_) => {
            return json_error(502, "Flux inaccessible (timeout ou hors ligne)");
        }
    };

    let status = upstream.status();
    if !status.is_success() {
        if status == StatusCode::URI_TOO_LONG {
            return json_error(502, "Flux inaccessible (URL upstream rejetée par le serveur)");
        }
        return Proxied {
            status: status.as_u16(),
            headers: vec![],
            body: vec![],
        };
    }

    let content_type = upstream
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .unwrap_or("application/octet-stream")
        .to_string();
    let final_url = upstream.url().clone();
    let body = match upstream.bytes().await {
        Ok(b) => b.to_vec(),
        Err(_) => return json_error(502, "Flux inaccessible (timeout ou hors ligne)"),
    };
    let preview = String::from_utf8_lossy(&body[..body.len().min(512)]);

    if is_m3u8(&content_type, &url, &preview) {
        let text = String::from_utf8_lossy(&body);
        let rewritten = rewrite_m3u8(&text, final_url.as_str(), user_id, tokens);
        let headers = m3u8_headers(&text, &url, &content_type, context_type);
        return Proxied {
            status: 200,
            headers,
            body: rewritten.into_bytes(),
        };
    }

    Proxied {
        status: 200,
        headers: vec![
            ("Content-Type".into(), content_type),
            (
                "Cache-Control".into(),
                "no-cache, no-store, must-revalidate".into(),
            ),
            ("Pragma".into(), "no-cache".into()),
            ("Expires".into(), "0".into()),
            ("X-Stream-Proxy".into(), "1".into()),
        ],
        body,
    }
}

fn m3u8_headers(
    content: &str,
    target: &Url,
    content_type: &str,
    context_type: Option<&str>,
) -> Vec<(String, String)> {
    let ct = if content_type.contains("mpegurl") || content_type.contains("m3u8") {
        content_type.to_string()
    } else {
        "application/vnd.apple.mpegurl".into()
    };
    let level = context_type == Some("level")
        || target.path().to_ascii_lowercase().contains("level")
        || is_level_playlist(content);
    let no_cache = if level {
        "no-cache, no-store, must-revalidate, max-age=0"
    } else if is_live_playlist(content) || is_level_playlist(content) || target.path().to_ascii_lowercase().contains("level")
    {
        "no-cache, no-store, must-revalidate"
    } else {
        "no-cache, no-store"
    };
    let mut headers = vec![
        ("Content-Type".into(), ct),
        ("Cache-Control".into(), no_cache.into()),
        ("Pragma".into(), "no-cache".into()),
        ("Expires".into(), "0".into()),
        ("X-Stream-Proxy".into(), "1".into()),
    ];
    if level {
        headers.push(("Surrogate-Control".into(), "no-store".into()));
    }
    headers
}

fn json_error(status: u16, msg: &str) -> Proxied {
    Proxied {
        status,
        headers: vec![("Content-Type".into(), "application/json".into())],
        body: serde_json::json!({ "error": msg }).to_string().into_bytes(),
    }
}

pub fn http_client() -> Client {
    Client::builder()
        .redirect(Policy::none())
        .timeout(UPSTREAM_TIMEOUT)
        .user_agent(UA)
        .build()
        .expect("reqwest")
}

async fn safe_get(http: &Client, initial: Url) -> Result<reqwest::Response, String> {
    let mut current = initial;
    for _ in 0..=MAX_REDIRECTS {
        validate_outbound_url(current.as_str()).map_err(|e| format!("URL refusée: {}", e.0))?;
        assert_resolved_public(&current)
            .await
            .map_err(|e| format!("URL refusée: {}", e.0))?;
        let res = http
            .get(current.clone())
            .header("Accept", "*/*")
            .header(
                "Referer",
                format!(
                    "{}://{}/",
                    current.scheme(),
                    current.host_str().unwrap_or("")
                ),
            )
            .send()
            .await
            .map_err(|_| "fetch".to_string())?;
        if res.status().is_redirection() {
            let loc = res
                .headers()
                .get(reqwest::header::LOCATION)
                .and_then(|v| v.to_str().ok())
                .ok_or_else(|| "Redirect sans Location".to_string())?;
            current = current
                .join(loc)
                .map_err(|_| "URL refusée: URL invalide".to_string())?;
            continue;
        }
        return Ok(res);
    }
    Err("Trop de redirections".into())
}

pub async fn fetch_text(http: &Client, raw: &str) -> Result<String, String> {
    let parsed = validate_outbound_url(raw).map_err(|e| format!("URL playlist refusée: {}", e.0))?;
    let res = safe_get(http, parsed)
        .await
        .map_err(|e| {
            if e.starts_with("URL refusée") {
                format!("URL playlist refusée: {}", e.trim_start_matches("URL refusée: "))
            } else {
                "Playlist inaccessible".into()
            }
        })?;
    if !res.status().is_success() {
        return Err(format!("Playlist inaccessible ({})", res.status().as_u16()));
    }
    res.text()
        .await
        .map_err(|_| "Playlist illisible".to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rewrite_relative_segment() {
        let tokens = ProxyTokens::new();
        let src = "#EXTM3U\n#EXTINF:4,\nseg.ts\n";
        let out = rewrite_m3u8(src, "https://cdn.example/live/master.m3u8", "u1", &tokens);
        assert!(out.contains("/api/stream/proxy/"));
        assert!(!out.contains("seg.ts"));
    }

    #[test]
    fn rewrite_key_uri() {
        let tokens = ProxyTokens::new();
        let src = r#"#EXTM3U
#EXT-X-KEY:METHOD=AES-128,URI="key.key"
"#;
        let out = rewrite_m3u8(src, "https://cdn.example/live/index.m3u8", "u1", &tokens);
        assert!(out.contains(r#"URI="/api/stream/proxy/"#) || out.contains("URI=\"/api/stream/proxy/"));
    }
}
