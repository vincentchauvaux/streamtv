use std::net::{IpAddr, Ipv4Addr, Ipv6Addr};
use url::Url;

const MAX_URL_LENGTH: usize = 4096;
pub const MAX_REDIRECTS: usize = 5;

const BLOCKED_HOSTS: &[&str] = &[
    "localhost",
    "0.0.0.0",
    "::1",
    "metadata.google.internal",
    "metadata.google.internal.",
    "metadata",
    "instance-data",
];

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct OutboundError(pub String);

pub fn validate_outbound_url(raw: &str) -> Result<Url, OutboundError> {
    if raw.is_empty() || raw.len() > MAX_URL_LENGTH {
        return Err(OutboundError("URL trop longue ou vide".into()));
    }
    let parsed = Url::parse(raw).map_err(|_| OutboundError("URL invalide".into()))?;
    if parsed.scheme() != "http" && parsed.scheme() != "https" {
        return Err(OutboundError("Protocole non autorisé".into()));
    }
    if !parsed.username().is_empty() || parsed.password().is_some() {
        return Err(OutboundError("Identifiants dans l'URL interdits".into()));
    }
    let host = parsed.host_str().unwrap_or("").to_ascii_lowercase();
    let host = host.trim_matches(|c| c == '[' || c == ']');
    if BLOCKED_HOSTS.contains(&host) {
        return Err(OutboundError("Hôte interdit".into()));
    }
    if host.ends_with(".localhost") || host.ends_with(".local") {
        return Err(OutboundError("Hôte local interdit".into()));
    }
    if is_blocked_ip(host) {
        return Err(OutboundError("Adresse privée ou locale interdite".into()));
    }
    Ok(parsed)
}

pub fn is_blocked_ip(host: &str) -> bool {
    let host = host.trim_matches(|c| c == '[' || c == ']').to_ascii_lowercase();
    if let Ok(ip) = host.parse::<IpAddr>() {
        return ip_blocked(ip);
    }
    false
}

pub fn ip_blocked(ip: IpAddr) -> bool {
    match ip {
        IpAddr::V4(v4) => ipv4_blocked(v4),
        IpAddr::V6(v6) => ipv6_blocked(v6),
    }
}

fn ipv4_blocked(ip: Ipv4Addr) -> bool {
    let o = ip.octets();
    ip.is_loopback()
        || ip.is_private()
        || ip.is_link_local()
        || ip.is_broadcast()
        || ip.is_unspecified()
        || o[0] == 0
        || (o[0] == 100 && (64..128).contains(&o[1]))
        || (o[0] == 198 && (o[1] == 18 || o[1] == 19))
}

fn ipv6_blocked(ip: Ipv6Addr) -> bool {
    if let Some(v4) = ip.to_ipv4_mapped() {
        return ipv4_blocked(v4);
    }
    ip.is_loopback()
        || ip.is_unspecified()
        || ip.is_unique_local()
        || (ip.segments()[0] & 0xffc0) == 0xfe80
}

pub async fn assert_resolved_public(url: &Url) -> Result<(), OutboundError> {
    let host = url
        .host_str()
        .ok_or_else(|| OutboundError("Hôte interdit".into()))?;
    if is_blocked_ip(host) {
        return Err(OutboundError("Adresse privée ou locale interdite".into()));
    }
    let port = url.port_or_known_default().unwrap_or(80);
    let lookup = format!("{host}:{port}");
    let addrs = tokio::net::lookup_host(&lookup)
        .await
        .map_err(|_| OutboundError("Hôte introuvable".into()))?;
    for addr in addrs {
        if ip_blocked(addr.ip()) {
            return Err(OutboundError("Adresse privée ou locale interdite".into()));
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_localhost() {
        assert!(validate_outbound_url("http://localhost/x").is_err());
        assert!(validate_outbound_url("http://127.0.0.1/.env").is_err());
        assert!(validate_outbound_url("http://169.254.169.254/").is_err());
        assert!(validate_outbound_url("http://10.0.0.1/").is_err());
        assert!(validate_outbound_url("http://192.168.1.1/").is_err());
        assert!(validate_outbound_url("http://[::1]/").is_err());
    }

    #[test]
    fn rejects_userinfo_and_file() {
        assert!(validate_outbound_url("https://user:pass@example.com/").is_err());
        assert!(validate_outbound_url("file:///etc/passwd").is_err());
        assert!(validate_outbound_url("ftp://example.com/").is_err());
    }

    #[test]
    fn accepts_https() {
        assert!(validate_outbound_url("https://iptv-org.github.io/iptv/countries/fr.m3u").is_ok());
    }
}
