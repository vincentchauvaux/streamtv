use chrono::{FixedOffset, NaiveDateTime, TimeZone};
use quick_xml::events::Event;
use quick_xml::Reader;

#[derive(Clone, Debug)]
pub struct EpgProgram {
    pub channel_ref: String,
    pub title: String,
    pub description: Option<String>,
    pub start_ms: i64,
    pub end_ms: i64,
    pub category: Option<String>,
}

pub fn parse_xmltv(xml: &str) -> Vec<EpgProgram> {
    let mut reader = Reader::from_str(xml);
    reader.config_mut().trim_text(true);
    let mut buf = Vec::new();
    let mut out = Vec::new();

    let mut in_programme = false;
    let mut channel_ref = String::new();
    let mut start_ms = 0i64;
    let mut end_ms = 0i64;
    let mut title = String::new();
    let mut description = None::<String>;
    let mut category = None::<String>;
    let mut capture: Option<&'static str> = None;
    let mut text_buf = String::new();

    loop {
        match reader.read_event_into(&mut buf) {
            Ok(Event::Start(e)) => {
                let name = String::from_utf8_lossy(e.name().as_ref()).into_owned();
                match name.as_str() {
                    "programme" => {
                        in_programme = true;
                        channel_ref.clear();
                        title.clear();
                        description = None;
                        category = None;
                        start_ms = 0;
                        end_ms = 0;
                        for attr in e.attributes().flatten() {
                            let key = String::from_utf8_lossy(attr.key.as_ref());
                            let val = attr
                                .unescape_value()
                                .map(|v| v.into_owned())
                                .unwrap_or_default();
                            match key.as_ref() {
                                "channel" => channel_ref = val,
                                "start" => start_ms = parse_xmltv_date(&val).unwrap_or(0),
                                "stop" => end_ms = parse_xmltv_date(&val).unwrap_or(0),
                                _ => {}
                            }
                        }
                    }
                    "title" if in_programme => {
                        capture = Some("title");
                        text_buf.clear();
                    }
                    "desc" if in_programme => {
                        capture = Some("desc");
                        text_buf.clear();
                    }
                    "category" if in_programme => {
                        capture = Some("category");
                        text_buf.clear();
                    }
                    _ => {}
                }
            }
            Ok(Event::Text(t)) if capture.is_some() => {
                if let Ok(s) = t.unescape() {
                    text_buf.push_str(&s);
                }
            }
            Ok(Event::End(e)) => {
                let name = String::from_utf8_lossy(e.name().as_ref()).into_owned();
                match name.as_str() {
                    "title" if capture == Some("title") => {
                        title = text_buf.clone();
                        capture = None;
                    }
                    "desc" if capture == Some("desc") => {
                        if !text_buf.is_empty() {
                            description = Some(text_buf.clone());
                        }
                        capture = None;
                    }
                    "category" if capture == Some("category") => {
                        if !text_buf.is_empty() {
                            category = Some(text_buf.clone());
                        }
                        capture = None;
                    }
                    "programme" if in_programme => {
                        in_programme = false;
                        if !channel_ref.is_empty() && start_ms > 0 && end_ms > 0 {
                            out.push(EpgProgram {
                                channel_ref: channel_ref.clone(),
                                title: if title.is_empty() {
                                    "Sans titre".into()
                                } else {
                                    title.clone()
                                },
                                description: description.clone(),
                                start_ms,
                                end_ms,
                                category: category.clone(),
                            });
                        }
                    }
                    _ => {}
                }
            }
            Ok(Event::Eof) => break,
            Err(_) => break,
            _ => {}
        }
        buf.clear();
    }
    out
}

fn parse_xmltv_date(value: &str) -> Option<i64> {
    let value = value.trim();
    let re = regex::Regex::new(
        r"^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})(?:\s*([+-]\d{4}))?$",
    )
    .ok()?;
    let caps = re.captures(value)?;
    let y: i32 = caps[1].parse().ok()?;
    let mo: u32 = caps[2].parse().ok()?;
    let d: u32 = caps[3].parse().ok()?;
    let h: u32 = caps[4].parse().ok()?;
    let mi: u32 = caps[5].parse().ok()?;
    let s: u32 = caps[6].parse().ok()?;
    let naive = NaiveDateTime::new(
        chrono::NaiveDate::from_ymd_opt(y, mo, d)?,
        chrono::NaiveTime::from_hms_opt(h, mi, s)?,
    );
    if let Some(tz) = caps.get(7) {
        let tzs = tz.as_str();
        let sign = if tzs.starts_with('-') { -1 } else { 1 };
        let hh: i32 = tzs[1..3].parse().ok()?;
        let mm: i32 = tzs[3..5].parse().ok()?;
        let offset = FixedOffset::east_opt(sign * (hh * 3600 + mm * 60))?;
        Some(offset.from_local_datetime(&naive).single()?.timestamp_millis())
    } else {
        Some(naive.and_utc().timestamp_millis())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_programme() {
        let xml = r#"<?xml version="1.0"?>
<tv>
  <programme start="20261005120000 +0200" stop="20261005130000 +0200" channel="tf1.fr">
    <title>Journal</title>
    <desc>Infos</desc>
    <category>News</category>
  </programme>
</tv>"#;
        let programs = parse_xmltv(xml);
        assert_eq!(programs.len(), 1);
        assert_eq!(programs[0].channel_ref, "tf1.fr");
        assert_eq!(programs[0].title, "Journal");
        assert!(programs[0].end_ms > programs[0].start_ms);
    }
}
