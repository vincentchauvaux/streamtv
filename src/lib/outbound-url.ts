/**
 * Validation d'URLs sortantes (anti-SSRF) — partagée proxy flux, M3U, EPG, logos.
 */

const MAX_URL_LENGTH = 4096;
const MAX_REDIRECTS = 5;
const DEFAULT_TIMEOUT_MS = 30_000;

const BLOCKED_HOSTNAMES = new Set([
  "localhost",
  "0.0.0.0",
  "::1",
  "metadata.google.internal",
  "metadata.google.internal.",
  "metadata",
  "instance-data",
]);

export type OutboundUrlValidation =
  | { ok: true; url: URL }
  | { ok: false; reason: string };

function isBlockedIpv4(hostname: string): boolean {
  const ipv4 = hostname.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!ipv4) return false;
  const octets = ipv4.slice(1, 5).map(Number);
  if (octets.some((o) => o > 255)) return true;
  const [a, b] = octets;
  if (a === 127 || a === 0) return true;
  if (a === 10) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 169 && b === 254) return true; // link-local / cloud metadata
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
  if (a === 198 && (b === 18 || b === 19)) return true; // benchmarking
  return false;
}

function isBlockedIpv6(hostname: string): boolean {
  const lower = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (lower === "::1") return true;
  if (lower.startsWith("fe80:")) return true; // link-local
  if (lower.startsWith("fc") || lower.startsWith("fd")) return true; // ULA
  // IPv4-mapped IPv6 ::ffff:x.x.x.x
  const mapped = lower.match(/^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/);
  if (mapped && isBlockedIpv4(mapped[1])) return true;
  return false;
}

export function isBlockedIp(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  return isBlockedIpv4(host) || isBlockedIpv6(host);
}

export function validateOutboundUrl(rawUrl: string): OutboundUrlValidation {
  if (!rawUrl || rawUrl.length > MAX_URL_LENGTH) {
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

/** Alias historique utilisé par le proxy de flux */
export const validateStreamUrl = validateOutboundUrl;
export type StreamUrlValidation = OutboundUrlValidation;

export type SafeFetchOptions = {
  method?: string;
  headers?: HeadersInit;
  timeoutMs?: number;
  signal?: AbortSignal;
};

/**
 * Fetch sortant anti-SSRF : valide l'URL initiale et chaque Location de redirect.
 */
export async function safeOutboundFetch(
  rawUrl: string,
  options: SafeFetchOptions = {}
): Promise<Response> {
  const initial = validateOutboundUrl(rawUrl);
  if (!initial.ok) {
    throw new Error(`URL refusée: ${initial.reason}`);
  }

  let currentHref = initial.url.href;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const method = options.method ?? "GET";

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const validation = validateOutboundUrl(currentHref);
    if (!validation.ok) {
      throw new Error(`URL refusée (redirect): ${validation.reason}`);
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const onAbort = () => controller.abort();
    options.signal?.addEventListener("abort", onAbort);

    let res: Response;
    try {
      res = await fetch(validation.url.href, {
        method,
        redirect: "manual",
        signal: controller.signal,
        headers: options.headers,
      });
    } finally {
      clearTimeout(timer);
      options.signal?.removeEventListener("abort", onAbort);
    }

    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get("location");
      if (!location) {
        throw new Error("Redirect sans Location");
      }
      currentHref = new URL(location, validation.url).href;
      continue;
    }

    return res;
  }

  throw new Error("Trop de redirections");
}

export const outboundUrlLimits = {
  maxUrlLength: MAX_URL_LENGTH,
  maxRedirects: MAX_REDIRECTS,
};
