type RateLimitEntry = { count: number; resetAt: number };

const store = new Map<string, RateLimitEntry>();

export type RateLimitResult = {
  ok: boolean;
  remaining: number;
  resetAt: number;
};

/** Rate limit in-memory (process local). Suffisant pour un VPS mono-instance. */
export function checkRateLimit(
  key: string,
  max: number,
  windowMs: number
): RateLimitResult {
  const now = Date.now();
  const entry = store.get(key);

  if (!entry || entry.resetAt <= now) {
    const resetAt = now + windowMs;
    store.set(key, { count: 1, resetAt });
    return { ok: true, remaining: max - 1, resetAt };
  }

  if (entry.count >= max) {
    return { ok: false, remaining: 0, resetAt: entry.resetAt };
  }

  entry.count += 1;
  return { ok: true, remaining: max - entry.count, resetAt: entry.resetAt };
}

/**
 * IP client. Si TRUST_PROXY=1 (derrière Nginx), on privilégie X-Real-IP
 * (posé par le reverse proxy) plutôt que le premier hop X-Forwarded-For
 * (falsifiable par le client).
 */
export function clientIp(request: Request): string {
  const trustProxy =
    process.env.TRUST_PROXY === "1" || process.env.TRUST_PROXY === "true";

  if (trustProxy) {
    const realIp = request.headers.get("x-real-ip");
    if (realIp) return realIp.trim();
  }

  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }

  const realIp = request.headers.get("x-real-ip");
  if (realIp) return realIp.trim();
  return "unknown";
}

export function rateLimitResponse(limited: RateLimitResult) {
  return {
    status: 429 as const,
    body: { error: "Trop de tentatives. Réessayez plus tard." },
    headers: {
      "Retry-After": String(
        Math.max(1, Math.ceil((limited.resetAt - Date.now()) / 1000))
      ),
    },
  };
}
