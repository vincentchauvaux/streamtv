use jsonwebtoken::{decode, encode, DecodingKey, EncodingKey, Header, Validation};
use serde::{Deserialize, Serialize};
use std::time::{SystemTime, UNIX_EPOCH};

use crate::db::User;

pub const COOKIE_NAME: &str = "streamtv_session";
const TTL_SECS: u64 = 60 * 60 * 24 * 30;

#[derive(Debug, Serialize, Deserialize)]
struct Claims {
    sub: String,
    email: String,
    name: Option<String>,
    iat: u64,
    exp: u64,
}

#[allow(dead_code)] // réservé création de compte hors inscription publique
pub fn hash_password(password: &str) -> Result<String, String> {
    bcrypt::hash(password, 12).map_err(|e| e.to_string())
}

pub fn verify_password(password: &str, hash: &str) -> bool {
    bcrypt::verify(password, hash).unwrap_or(false)
}

pub fn issue_token(user: &User, secret: &str) -> Result<String, String> {
    let now = now_secs();
    let claims = Claims {
        sub: user.id.clone(),
        email: user.email.clone(),
        name: user.name.clone(),
        iat: now,
        exp: now + TTL_SECS,
    };
    encode(
        &Header::new(jsonwebtoken::Algorithm::HS256),
        &claims,
        &EncodingKey::from_secret(secret.as_bytes()),
    )
    .map_err(|e| e.to_string())
}

pub fn user_id_from_token(token: &str, secret: &str) -> Option<String> {
    let mut validation = Validation::new(jsonwebtoken::Algorithm::HS256);
    validation.set_required_spec_claims(&["sub", "exp"]);
    let data = decode::<Claims>(
        token,
        &DecodingKey::from_secret(secret.as_bytes()),
        &validation,
    )
    .ok()?;
    Some(data.claims.sub)
}

pub fn session_cookie(token: &str, secure: bool) -> String {
    // SameSite=Strict : le cookie ne part pas en navigation cross-site (CSRF / fuite).
    let mut c = format!(
        "{COOKIE_NAME}={token}; HttpOnly; Path=/; SameSite=Strict; Max-Age={TTL_SECS}"
    );
    if secure {
        c.push_str("; Secure");
    }
    c
}

pub fn clear_cookie(secure: bool) -> String {
    let mut c = format!("{COOKIE_NAME}=; HttpOnly; Path=/; SameSite=Strict; Max-Age=0");
    if secure {
        c.push_str("; Secure");
    }
    c
}

/// Hash bcrypt factice (cost 12) pour égaliser le temps de réponse si l'email est inconnu.
pub const DUMMY_PASSWORD_HASH: &str =
    "$2b$12$DC8dIZLIjCxa3Em1igl11errkYLyNgtrc7U61j39HMmlnehZ9BuWG";

pub fn token_from_cookie_header(header: Option<&str>) -> Option<String> {
    let header = header?;
    for part in header.split(';') {
        let part = part.trim();
        if let Some(v) = part.strip_prefix(&format!("{COOKIE_NAME}=")) {
            if !v.is_empty() {
                return Some(v.to_string());
            }
        }
    }
    None
}

fn now_secs() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_secs()
}

pub fn valid_email(email: &str) -> bool {
    let email = email.trim();
    if email.len() < 5 || email.len() > 254 {
        return false;
    }
    let Some((u, d)) = email.split_once('@') else {
        return false;
    };
    !u.is_empty() && d.contains('.') && !d.starts_with('.') && !d.ends_with('.')
}
