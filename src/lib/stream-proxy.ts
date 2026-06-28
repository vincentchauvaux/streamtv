import { randomBytes } from "crypto";
import { cache } from "@/lib/cache";
import { logger } from "@/lib/logger";

const MAX_STREAM_URL_LENGTH = 4096;
const PROXY_URL_FALLBACK_MAX_LENGTH = 1500;
const PROXY_TOKEN_TTL_MANIFEST_MS = 2 * 60 * 60 * 1000;
const PROXY_TOKEN_TTL_SEGMENT_MS = 4 * 60 * 60 * 1000;
/** @deprecated alias — préférer PROXY_TOKEN_TTL_MANIFEST_MS */
const PROXY_TOKEN_TTL_MS = PROXY_TOKEN_TTL_MANIFEST_MS;
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_REQUESTS = 600;
const UPSTREAM_TIMEOUT_MS = 30_000;

const BLOCKED_HOSTNAMES = new Set([
  "localhost",
  "0.0.0.0",
  "::1",
  "metadata.google.internal",
  "metadata.google.internal.",
]);

/** URI="...", URI='...', URI=unquoted (HLS) */
const URI_ATTR_RE = /URI=(?:"([^"]*)"|'([^']*)'|([^",\s]+))/g;
const PROXY_TOKEN_PATH_RE = /^\/api\/stream\/proxy\/[A-Za-z0-9_-]+$/;
const PROXY_TOKEN_CACHE_PREFIX = "stream-proxy-token:";

type RateLimitEntry = { count: number; resetAt: number };

const rateLimitStore = new Map<string, RateLimitEntry>();

export type StreamUrlValidation =
  | { ok: true; url: URL }
  | { ok: false; reason: string };

export type StreamProxyTokenEntry = {
  url: string;
  userId: string;
};

export function validateStreamUrl(rawUrl: string): StreamUrlValidation {
  if (!rawUrl || rawUrl.length > MAX_STREAM_URL_LENGTH) {
    return { ok: false, reason: "URL trop longue ou vide" };
  }

  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return { ok: false, reason: "URL invalide" };
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return { ok: false, reason: "Protocole non autorisé" };
  }

  if (parsed.username || parsed.password) {
    return { ok: false, reason: "Identifiants dans l'URL interdits" };
  }

  const hostname = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, "");

  if (BLOCKED_HOSTNAMES.has(hostname)) {
    return { ok: false, reason: "Hôte interdit" };
  }

  if (hostname.endsWith(".localhost") || hostname.endsWith(".local")) {
    return { ok: false, reason: "Hôte local interdit" };
  }

  if (isBlockedIp(hostname)) {
    return { ok: false, reason: "Adresse privée ou locale interdite" };
  }

  return { ok: true, url: parsed };
}

function isBlockedIp(hostname: string): boolean {
  const ipv4 = hostname.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4) {
    const octets = ipv4.slice(1, 5).map(Number);
    if (octets.some((o) => o > 255)) return true;
    const [a, b] = octets;
    if (a === 127 || a === 0) return true;
    if (a === 10) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 169 && b === 254) return true;
    return false;
  }

  const lower = hostname.toLowerCase();
  if (lower === "::1" || lower.startsWith("fe80:") || lower.startsWith("fc") || lower.startsWith("fd")) {
    return true;
  }

  return false;
}

export function checkStreamProxyRateLimit(userId: string): boolean {
  const now = Date.now();
  const entry = rateLimitStore.get(userId);

  if (!entry || now > entry.resetAt) {
    rateLimitStore.set(userId, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return true;
  }

  if (entry.count >= RATE_LIMIT_MAX_REQUESTS) return false;
  entry.count += 1;
  return true;
}

export function isM3u8Response(contentType: string | null, targetUrl: URL, bodyPreview?: string): boolean {
  if (contentType?.includes("mpegurl") || contentType?.includes("m3u8")) return true;
  if (targetUrl.pathname.toLowerCase().includes(".m3u8")) return true;
  if (bodyPreview?.trimStart().startsWith("#EXTM3U")) return true;
  return false;
}

function resolveAbsoluteUrl(relativeOrAbsolute: string, baseUrl: string): string {
  try {
    return new URL(relativeOrAbsolute, baseUrl).href;
  } catch {
    return relativeOrAbsolute;
  }
}

function isAlreadyProxiedPath(pathOrUrl: string): boolean {
  const trimmed = pathOrUrl.trim();
  if (PROXY_TOKEN_PATH_RE.test(trimmed)) return true;
  try {
    const parsed = new URL(trimmed);
    return PROXY_TOKEN_PATH_RE.test(parsed.pathname);
  } catch {
    return false;
  }
}

function toRelativeProxyPath(pathOrUrl: string): string {
  if (PROXY_TOKEN_PATH_RE.test(pathOrUrl)) return pathOrUrl;
  try {
    const parsed = new URL(pathOrUrl);
    if (PROXY_TOKEN_PATH_RE.test(parsed.pathname)) return parsed.pathname;
  } catch {
    /* chemin relatif ou URL invalide */
  }
  return pathOrUrl;
}

function resolveManifestBaseUrl(upstream: Response, targetUrl: URL): string {
  return upstream.url || targetUrl.href;
}

function m3u8ContentType(contentType: string): string {
  if (contentType.includes("mpegurl") || contentType.includes("m3u8")) return contentType;
  return "application/vnd.apple.mpegurl";
}

/** Playlist média (niveau) — contient EXTINF, pas de variantes master */
function isLevelPlaylist(content: string): boolean {
  return content.includes("#EXTINF") && !content.includes("#EXT-X-STREAM-INF");
}

/** Playlist live sliding window — pas de ENDLIST, ou type EVENT */
function isLivePlaylist(content: string): boolean {
  if (content.includes("#EXT-X-PLAYLIST-TYPE:EVENT")) return true;
  if (content.includes("#EXTINF") && !content.includes("#EXT-X-ENDLIST")) return true;
  return false;
}

function shouldForceNoCacheM3u8(content: string, targetUrl: URL): boolean {
  if (isLevelPlaylist(content)) return true;
  if (isLivePlaylist(content)) return true;
  if (targetUrl.pathname.toLowerCase().includes("level")) return true;
  return false;
}

function isHlsLevelPlaylist(
  content: string,
  targetUrl: URL,
  contextType?: string | null
): boolean {
  if (contextType === "level") return true;
  if (targetUrl.pathname.toLowerCase().includes("level")) return true;
  return isLevelPlaylist(content);
}

function levelPlaylistNoCacheHeaders(contentType: string): HeadersInit {
  return {
    "Content-Type": m3u8ContentType(contentType),
    "Cache-Control": "no-cache, no-store, must-revalidate, max-age=0",
    Pragma: "no-cache",
    Expires: "0",
    "Surrogate-Control": "no-store",
    "X-Stream-Proxy": "1",
  };
}

function m3u8ResponseHeaders(
  content: string,
  targetUrl: URL,
  contentType: string,
  contextType?: string | null
): HeadersInit {
  if (isHlsLevelPlaylist(content, targetUrl, contextType)) {
    return levelPlaylistNoCacheHeaders(contentType);
  }

  const forceNoCache = shouldForceNoCacheM3u8(content, targetUrl);
  const base: HeadersInit = {
    "Content-Type": m3u8ContentType(contentType),
    Pragma: "no-cache",
    Expires: "0",
    "X-Stream-Proxy": "1",
  };

  return {
    ...base,
    "Cache-Control": forceNoCache
      ? "no-cache, no-store, must-revalidate"
      : "no-cache, no-store",
  };
}

function generateProxyToken(): string {
  return randomBytes(6).toString("base64url");
}

function inferTokenTtl(url: string): number {
  try {
    const pathname = new URL(url).pathname.toLowerCase();
    if (pathname.includes(".m3u8")) return PROXY_TOKEN_TTL_MANIFEST_MS;
  } catch {
    /* URL relative ou invalide — traiter comme segment */
  }
  return PROXY_TOKEN_TTL_SEGMENT_MS;
}

function proxyTokenCacheKey(token: string): string {
  return `${PROXY_TOKEN_CACHE_PREFIX}${token}`;
}

export function registerStreamProxyToken(userId: string, rawUrl: string): string | null {
  const validation = validateStreamUrl(rawUrl);
  if (!validation.ok) return null;

  const token = generateProxyToken();
  cache.set<StreamProxyTokenEntry>(
    proxyTokenCacheKey(token),
    { url: validation.url.href, userId },
    inferTokenTtl(validation.url.href)
  );
  return token;
}

export function resolveStreamProxyToken(token: string, userId: string): string | null {
  const key = proxyTokenCacheKey(token);
  const entry = cache.get<StreamProxyTokenEntry>(key);
  if (!entry || entry.userId !== userId) return null;
  // Sliding expiration — évite 404 token expiré pendant une lecture active
  cache.set(key, entry, inferTokenTtl(entry.url));
  return entry.url;
}

/** Supprime un token proxy serveur — ex. après 404 upstream manifest */
export function invalidateStreamProxyToken(token: string): void {
  cache.delete(proxyTokenCacheKey(token));
}

export function buildProxyTokenPath(token: string): string {
  return `/api/stream/proxy/${token}`;
}

function toProxyTokenUrl(originalUrl: string, userId: string): string {
  if (isAlreadyProxiedPath(originalUrl)) {
    return toRelativeProxyPath(originalUrl);
  }
  const token = registerStreamProxyToken(userId, originalUrl);
  if (!token) return originalUrl;
  return buildProxyTokenPath(token);
}

export function rewriteM3u8Manifest(
  content: string,
  manifestUrl: string,
  userId: string
): string {
  const lines = content.split(/\r?\n/);

  return lines
    .map((line) => {
      if (line.startsWith("#")) {
        return line.replace(URI_ATTR_RE, (_match, dquoted: string, squoted: string, unquoted: string) => {
          const uri = (dquoted || squoted || unquoted || "").trim();
          if (!uri) return _match;
          const absolute = resolveAbsoluteUrl(uri, manifestUrl);
          return `URI="${toProxyTokenUrl(absolute, userId)}"`;
        });
      }

      const trimmed = line.trim();
      if (!trimmed) return line;

      const absolute = resolveAbsoluteUrl(trimmed, manifestUrl);
      return toProxyTokenUrl(absolute, userId);
    })
    .join("\n");
}

export type ProxyStreamFetchOptions = {
  /** Hint client hls.js — ex. "level" pour playlist média */
  contextType?: string | null;
};

export async function proxyStreamFetch(
  userId: string,
  targetHref: string,
  options?: ProxyStreamFetchOptions
): Promise<Response> {
  const validation = validateStreamUrl(targetHref);
  if (!validation.ok) {
    return new Response(JSON.stringify({ error: validation.reason }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const targetUrl = validation.url;

  let upstream: Response;
  try {
    upstream = await fetch(targetUrl.href, {
      method: "GET",
      redirect: "follow",
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
      headers: {
        "User-Agent": STREAM_PROXY_USER_AGENT,
        Accept: "*/*",
        Referer: `${targetUrl.origin}/`,
      },
    });
  } catch {
    return new Response(JSON.stringify({ error: "Flux inaccessible (timeout ou hors ligne)" }), {
      status: 502,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (!upstream.ok) {
    if (upstream.status === 403 || upstream.status === 401) {
      logger.warn("Proxy stream: upstream auth refusée", {
        status: upstream.status,
        url: targetUrl.href.slice(0, 160),
      });
    }
    if (upstream.status === 414) {
      return new Response(
        JSON.stringify({ error: "Flux inaccessible (URL upstream rejetée par le serveur)" }),
        { status: 502, headers: { "Content-Type": "application/json" } }
      );
    }
    return new Response(null, { status: upstream.status });
  }

  const contentType = upstream.headers.get("content-type") ?? "application/octet-stream";
  const bodyBuffer = await upstream.arrayBuffer();
  const bodyPreview = new TextDecoder().decode(bodyBuffer.slice(0, 512));
  const manifestBaseUrl = resolveManifestBaseUrl(upstream, targetUrl);

  if (isM3u8Response(contentType, targetUrl, bodyPreview)) {
    const text = new TextDecoder().decode(bodyBuffer);
    const rewritten = rewriteM3u8Manifest(text, manifestBaseUrl, userId);

    return new Response(rewritten, {
      status: 200,
      headers: m3u8ResponseHeaders(text, targetUrl, contentType, options?.contextType),
    });
  }

  const responseHeaders = new Headers({
    "Content-Type": contentType,
    "Cache-Control": "no-cache, no-store, must-revalidate",
    Pragma: "no-cache",
    Expires: "0",
    "X-Stream-Proxy": "1",
  });

  const contentLength = upstream.headers.get("content-length");
  if (contentLength) responseHeaders.set("Content-Length", contentLength);

  return new Response(bodyBuffer, {
    status: 200,
    headers: responseHeaders,
  });
}

export function shouldUseProxyUrlFallback(rawUrl: string): boolean {
  return rawUrl.length <= PROXY_URL_FALLBACK_MAX_LENGTH;
}

export const streamProxyLimits = {
  maxUrlLength: MAX_STREAM_URL_LENGTH,
  proxyUrlFallbackMaxLength: PROXY_URL_FALLBACK_MAX_LENGTH,
  proxyTokenTtlMs: PROXY_TOKEN_TTL_MS,
  proxyTokenTtlManifestMs: PROXY_TOKEN_TTL_MANIFEST_MS,
  proxyTokenTtlSegmentMs: PROXY_TOKEN_TTL_SEGMENT_MS,
  rateLimitMax: RATE_LIMIT_MAX_REQUESTS,
  rateLimitWindowMs: RATE_LIMIT_WINDOW_MS,
};

export const STREAM_PROXY_USER_AGENT =
  "Mozilla/5.0 (compatible; StreamTV/1.0; +https://streamtv.local) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36";
