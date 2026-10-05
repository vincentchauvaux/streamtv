use std::env;
use std::fs;
use std::net::SocketAddr;
use std::path::{Path, PathBuf};

#[derive(Clone)]
pub struct Config {
    pub listen: SocketAddr,
    pub db_path: PathBuf,
    pub jwt_secret: String,
    pub cron_secret: Option<String>,
    pub production: bool,
    pub trust_proxy: bool,
    pub cookie_secure: bool,
}

impl Config {
    pub fn load() -> Result<Self, String> {
        load_dotenv(&[
            Path::new(".env"),
            Path::new("../.env"),
            Path::new("server/.env"),
        ]);

        let production = env::var("NODE_ENV").ok().as_deref() == Some("production")
            || env::var("STREAMTV_ENV").ok().as_deref() == Some("production");

        let jwt_secret = match env::var("JWT_SECRET") {
            Ok(s) if !s.is_empty() => s,
            _ if production => {
                return Err("JWT_SECRET manquant en production".into());
            }
            _ => "streamtv-dev-secret".into(),
        };

        let listen: SocketAddr = env::var("STREAMTV_LISTEN")
            .unwrap_or_else(|_| "127.0.0.1:3001".into())
            .parse()
            .map_err(|_| "STREAMTV_LISTEN invalide")?;

        let db_path = resolve_db_path(env::var("DATABASE_URL").ok().as_deref())?;
        let trust_proxy = env::var("TRUST_PROXY").ok().as_deref() == Some("1");
        let cookie_secure = production;
        let cron_secret = env::var("CRON_SECRET")
            .ok()
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty());

        Ok(Self {
            listen,
            db_path,
            jwt_secret,
            cron_secret,
            production,
            trust_proxy,
            cookie_secure,
        })
    }
}

fn resolve_db_path(raw: Option<&str>) -> Result<PathBuf, String> {
    let value = raw.unwrap_or("file:../prisma/dev.db");
    let path = value.strip_prefix("file:").unwrap_or(value);
    let path = PathBuf::from(path);
    if path.is_absolute() {
        return Ok(path);
    }
    let cwd = env::current_dir().map_err(|e| e.to_string())?;
    let candidates = [
        cwd.join(path.clone()),
        cwd.join("prisma").join("dev.db"),
        cwd.join("prod.db"),
        cwd.parent().unwrap_or(&cwd).join("prisma/dev.db"),
        cwd.parent().unwrap_or(&cwd).join("prod.db"),
    ];
    for c in &candidates {
        if c.exists() {
            return Ok(c.clone());
        }
    }
    Ok(cwd.join(path))
}

fn load_dotenv(paths: &[&Path]) {
    for path in paths {
        let Ok(text) = fs::read_to_string(path) else {
            continue;
        };
        for line in text.lines() {
            let line = line.trim();
            if line.is_empty() || line.starts_with('#') {
                continue;
            }
            let Some((key, value)) = line.split_once('=') else {
                continue;
            };
            let key = key.trim();
            if env::var_os(key).is_some() {
                continue;
            }
            let value = value
                .trim()
                .trim_matches('"')
                .trim_matches('\'')
                .to_string();
            unsafe {
                env::set_var(key, value);
            }
        }
        break;
    }
}
