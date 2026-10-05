use parking_lot::Mutex;
use std::collections::HashMap;
use std::time::{Duration, Instant};

pub struct RateLimiter {
    inner: Mutex<HashMap<String, Slot>>,
}

struct Slot {
    count: u32,
    reset_at: Instant,
}

impl RateLimiter {
    pub fn new() -> Self {
        Self {
            inner: Mutex::new(HashMap::new()),
        }
    }

    pub fn check(&self, key: &str, max: u32, window: Duration) -> Result<(), Duration> {
        let now = Instant::now();
        let mut map = self.inner.lock();
        map.retain(|_, s| s.reset_at > now);
        match map.get_mut(key) {
            Some(slot) if now < slot.reset_at => {
                if slot.count >= max {
                    return Err(slot.reset_at.saturating_duration_since(now));
                }
                slot.count += 1;
                Ok(())
            }
            _ => {
                map.insert(
                    key.to_string(),
                    Slot {
                        count: 1,
                        reset_at: now + window,
                    },
                );
                Ok(())
            }
        }
    }
}
