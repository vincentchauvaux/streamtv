use regex::Regex;
use std::sync::OnceLock;

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct M3uChannel {
    pub name: String,
    pub url: String,
    pub logo: Option<String>,
    pub group: Option<String>,
    pub tvg_id: Option<String>,
    pub tvg_name: Option<String>,
    pub language: Option<String>,
    pub country: Option<String>,
    pub catchup: Option<String>,
    pub radio: bool,
    pub resolution: Option<String>,
}

pub fn parse_m3u(content: &str) -> Vec<M3uChannel> {
    let normalized = content.replace("\r\n", "\n");
    let lines: Vec<&str> = normalized
        .split('\n')
        .map(str::trim)
        .filter(|l| !l.is_empty())
        .collect();

    let mut out = Vec::new();
    let mut i = 0;
    while i < lines.len() {
        let line = lines[i];
        if !line.starts_with("#EXTINF") {
            i += 1;
            continue;
        }
        let meta = parse_extinf(line);
        let mut url = String::new();
        let mut j = i + 1;
        while j < lines.len() {
            if lines[j].starts_with('#') {
                j += 1;
                continue;
            }
            url = lines[j].to_string();
            i = j;
            break;
        }
        if !url.is_empty() {
            out.push(M3uChannel { url, ..meta });
        }
        i += 1;
    }
    out
}

fn parse_extinf(line: &str) -> M3uChannel {
    static ATTR: OnceLock<Regex> = OnceLock::new();
    let re = ATTR.get_or_init(|| Regex::new(r#"([\w-]+)="([^"]*)""#).unwrap());
    let mut attrs = std::collections::HashMap::new();
    for cap in re.captures_iter(line) {
        attrs.insert(cap[1].to_string(), cap[2].to_string());
    }
    let name = line
        .rsplit_once(',')
        .map(|(_, n)| n.trim().to_string())
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| "Chaîne sans nom".into());
    let group = attrs
        .get("group-title")
        .cloned()
        .or_else(|| attrs.get("group").cloned());
    let radio = matches!(
        attrs.get("radio").map(|s| s.as_str()),
        Some("1") | Some("true")
    ) || group
        .as_deref()
        .map(|g| g.to_ascii_lowercase().contains("radio"))
        .unwrap_or(false);

    M3uChannel {
        name,
        url: String::new(),
        logo: attrs
            .get("tvg-logo")
            .cloned()
            .or_else(|| attrs.get("logo").cloned()),
        group,
        tvg_id: attrs
            .get("tvg-id")
            .cloned()
            .or_else(|| attrs.get("tvgId").cloned()),
        tvg_name: attrs
            .get("tvg-name")
            .cloned()
            .or_else(|| attrs.get("tvgName").cloned()),
        language: attrs
            .get("tvg-language")
            .cloned()
            .or_else(|| attrs.get("language").cloned()),
        country: attrs
            .get("tvg-country")
            .cloned()
            .or_else(|| attrs.get("country").cloned()),
        catchup: attrs
            .get("catchup")
            .cloned()
            .or_else(|| attrs.get("x-catchup").cloned()),
        radio,
        resolution: attrs
            .get("tvg-resolution")
            .cloned()
            .or_else(|| attrs.get("resolution").cloned()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_extinf() {
        let src = r#"#EXTM3U
#EXTINF:-1 tvg-id="tf1.fr" tvg-logo="https://logo" group-title="France",TF1 HD
https://example.com/tf1.m3u8
"#;
        let ch = parse_m3u(src);
        assert_eq!(ch.len(), 1);
        assert_eq!(ch[0].name, "TF1 HD");
        assert_eq!(ch[0].group.as_deref(), Some("France"));
        assert_eq!(ch[0].url, "https://example.com/tf1.m3u8");
    }
}
