use regex::Regex;
use std::sync::OnceLock;

static QUALITY: OnceLock<Regex> = OnceLock::new();
static RESOLUTION: OnceLock<Regex> = OnceLock::new();
static NUMERIC: OnceLock<Regex> = OnceLock::new();

pub fn normalize_channel_name(name: &str) -> String {
    let mut s = strip_accents(&name.to_lowercase());
    s = QUALITY
        .get_or_init(|| {
            Regex::new(r"(?i)\s*[-–—|]?\s*(?:hd|fhd|uhd|4k|8k|sd|ld|hq|lq|full\s*hd|ultra\s*hd|hevc(?:\s*hd)?)\s*$")
                .unwrap()
        })
        .replace(&s, "")
        .into_owned();
    s = RESOLUTION
        .get_or_init(|| {
            Regex::new(r"(?i)\s*[-–—|]?\s*\(?\s*(?:2160|1080|720|576|480|360|240)\s*p?\s*\)?\s*$")
                .unwrap()
        })
        .replace(&s, "")
        .into_owned();
    s = NUMERIC
        .get_or_init(|| Regex::new(r"^\d+[\.\)\-:\s]+").unwrap())
        .replace(&s, "")
        .into_owned();
    s.split_whitespace().collect::<Vec<_>>().join(" ")
}

pub fn normalize_group(v: Option<&str>) -> Option<String> {
    v.map(str::trim)
        .filter(|s| !s.is_empty())
        .map(|s| s.to_string())
}

pub fn stream_type_from_url(url: &str) -> &'static str {
    let u = url.to_ascii_lowercase();
    if u.contains("youtube.com") || u.contains("youtu.be") {
        "YOUTUBE_LIVE"
    } else if u.contains(".m3u8") {
        "HLS"
    } else if u.contains(".mpd") {
        "DASH"
    } else if u.contains(".mp4") {
        "MP4"
    } else if u.contains(".ts") {
        "TS"
    } else {
        "UNKNOWN"
    }
}

fn strip_accents(s: &str) -> String {
    s.chars()
        .map(|c| match c {
            'à' | 'á' | 'â' | 'ä' | 'ã' => 'a',
            'ç' => 'c',
            'è' | 'é' | 'ê' | 'ë' => 'e',
            'ì' | 'í' | 'î' | 'ï' => 'i',
            'ñ' => 'n',
            'ò' | 'ó' | 'ô' | 'ö' | 'õ' => 'o',
            'ù' | 'ú' | 'û' | 'ü' => 'u',
            'ÿ' => 'y',
            other => other,
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn strips_quality_and_numbers() {
        assert_eq!(normalize_channel_name("TF1 HD"), "tf1");
        assert_eq!(normalize_channel_name("France 2 FHD"), "france 2");
        assert_eq!(normalize_channel_name("001. M6 1080p"), "m6");
    }
}
