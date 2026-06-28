import type {
  HlsConfig,
  Loader,
  LoaderCallbacks,
  LoaderConfiguration,
  LoaderContext,
  LoaderStats,
  LoaderResponse,
  PlaylistLoaderContext,
} from "hls.js";
import { logger } from "@/lib/logger";

const PROXY_PATH = "/api/stream/proxy";
const PROXY_REGISTER_PATH = "/api/stream/proxy/register";
const PROXY_TOKEN_PATH_RE = /^\/api\/stream\/proxy\/[A-Za-z0-9_-]+$/;

const urlToTokenCache = new Map<string, string>();
const tokenToUrlCache = new Map<string, string>();
const pendingRegistrations = new Map<string, Promise<string>>();

function extractProxyToken(url: string): string | null {
  const normalized = normalizeProxyTokenPath(url);
  const match = normalized.match(/^\/api\/stream\/proxy\/([A-Za-z0-9_-]+)$/);
  return match?.[1] ?? null;
}

function cacheProxyToken(originalUrl: string, token: string): void {
  urlToTokenCache.set(originalUrl, token);
  tokenToUrlCache.set(token, originalUrl);
}

function invalidateProxyTokenByPath(proxyPath: string): string | null {
  const token = extractProxyToken(proxyPath);
  if (!token) return null;
  const originalUrl = tokenToUrlCache.get(token);
  if (originalUrl) {
    urlToTokenCache.delete(originalUrl);
  }
  tokenToUrlCache.delete(token);
  return originalUrl ?? null;
}

/** Invalide le cache client pour un chemin proxy ou une URL upstream */
export function invalidateProxyRequestCache(url: string): void {
  if (isStreamProxyUrl(url)) {
    invalidateProxyTokenByPath(url);
    return;
  }
  invalidateProxyUrlCache(url);
}

/** Invalide le cache client pour une URL upstream — force un nouveau register */
export function invalidateProxyUrlCache(originalUrl: string): void {
  const token = urlToTokenCache.get(originalUrl);
  urlToTokenCache.delete(originalUrl);
  if (token) tokenToUrlCache.delete(token);
}

function getAppOrigin(): string {
  return typeof window !== "undefined" ? window.location.origin : "http://localhost";
}

function extractQueryFallbackUrl(url: string): string | null {
  try {
    const parsed = new URL(url, getAppOrigin());
    if (parsed.pathname === PROXY_PATH && parsed.searchParams.has("url")) {
      return parsed.searchParams.get("url");
    }
  } catch {
    /* URL relative ou invalide */
  }
  return null;
}

function normalizeProxyTokenPath(url: string): string {
  try {
    const parsed = new URL(url, getAppOrigin());
    const match = parsed.pathname.match(/^\/api\/stream\/proxy\/([A-Za-z0-9_-]+)$/);
    if (match) return `${PROXY_PATH}/${match[1]}`;
  } catch {
    if (PROXY_TOKEN_PATH_RE.test(url)) return url;
  }
  return url;
}

export function isStreamProxyUrl(url: string): boolean {
  if (!url) return false;

  if (PROXY_TOKEN_PATH_RE.test(url)) return true;

  try {
    const parsed = new URL(url, getAppOrigin());
    if (parsed.pathname === PROXY_REGISTER_PATH) return false;
    if (/^\/api\/stream\/proxy\/[A-Za-z0-9_-]+$/.test(parsed.pathname)) return true;
  } catch {
    /* URL relative ou invalide */
  }

  return false;
}

export async function registerProxyUrl(originalUrl: string): Promise<string> {
  if (!originalUrl) return originalUrl;

  const cached = urlToTokenCache.get(originalUrl);
  if (cached) return cached;

  const pending = pendingRegistrations.get(originalUrl);
  if (pending) return pending;

  const registration = (async () => {
    const response = await fetch(PROXY_REGISTER_PATH, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: originalUrl }),
    });

    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as { error?: string } | null;
      throw new Error(payload?.error ?? `Échec enregistrement proxy (${response.status})`);
    }

    const data = (await response.json()) as { token: string };
    cacheProxyToken(originalUrl, data.token);
    return data.token;
  })();

  pendingRegistrations.set(originalUrl, registration);

  try {
    return await registration;
  } finally {
    pendingRegistrations.delete(originalUrl);
  }
}

export async function buildStreamProxyUrl(originalUrl: string): Promise<string> {
  if (!originalUrl) return originalUrl;

  const queryFallback = extractQueryFallbackUrl(originalUrl);
  if (queryFallback) return buildStreamProxyUrl(queryFallback);

  if (isStreamProxyUrl(originalUrl)) return normalizeProxyTokenPath(originalUrl);

  const token = await registerProxyUrl(originalUrl);
  return `${PROXY_PATH}/${token}`;
}

/** Enregistre un nouveau token proxy (ignore le cache) — utile après 403/404 upstream */
export async function buildStreamProxyUrlFresh(originalUrl: string): Promise<string> {
  if (!originalUrl) return originalUrl;
  invalidateProxyUrlCache(originalUrl);
  return buildStreamProxyUrl(originalUrl);
}

const EMPTY_LOADER_STATS: LoaderStats = {
  aborted: false,
  loaded: 0,
  retry: 0,
  total: 0,
  chunkCount: 0,
  bwEstimate: 0,
  loading: { start: 0, first: 0, end: 0 },
  parsing: { start: 0, end: 0 },
  buffering: { start: 0, first: 0, end: 0 },
};

/** Playlist VTT vide — évite requêtes réseau tant que CC est off */
const EMPTY_SUBTITLE_PLAYLIST = [
  "#EXTM3U",
  "#EXT-X-VERSION:3",
  "#EXT-X-TARGETDURATION:6",
  "#EXT-X-MEDIA-SEQUENCE:0",
  "#EXT-X-PLAYLIST-TYPE:VOD",
  "#EXT-X-ENDLIST",
].join("\n");

function isSubtitlePlaylistContext(context: LoaderContext): boolean {
  return (context as PlaylistLoaderContext).type === "subtitleTrack";
}

function isLevelPlaylistContext(context: LoaderContext): boolean {
  return (context as PlaylistLoaderContext).type === "level";
}

function isManifestPlaylistContext(context: LoaderContext): boolean {
  return (context as PlaylistLoaderContext).type === "manifest";
}

function isPlaylistAuthRetryContext(context: LoaderContext): boolean {
  const type = (context as PlaylistLoaderContext).type;
  return (
    type === "manifest" ||
    type === "level" ||
    type === "audioTrack" ||
    type === "subtitleTrack"
  );
}

function shouldRetryProxyAuth(
  status: number | undefined,
  context: LoaderContext,
  proxyUrl: string
): boolean {
  if (!status || !isStreamProxyUrl(normalizeProxyTokenPath(proxyUrl))) return false;
  if (status === 401 || status === 403) return true;
  if (status === 404) return isPlaylistAuthRetryContext(context);
  return false;
}

/** Hint serveur + cache-bust navigateur sur playlists niveau (media sequence mismatch Pluto) */
function withLevelProxyParams(url: string): string {
  const parsed = new URL(url, getAppOrigin());
  parsed.searchParams.set("contextType", "level");
  parsed.searchParams.set("_", String(Date.now()));
  const path = `${parsed.pathname}${parsed.search}`;
  return path.startsWith("/") ? path : `/${path}`;
}

async function resolveProxyLoadUrl(_context: LoaderContext, requestUrl: string): Promise<string> {
  if (isStreamProxyUrl(requestUrl)) {
    return normalizeProxyTokenPath(requestUrl);
  }
  return buildStreamProxyUrl(requestUrl);
}

function loaderDurationMs(stats: LoaderStats): number | null {
  const { start, end } = stats.loading;
  if (!start || !end) return null;
  return end - start;
}

function logProxyLoaderMeta(
  context: LoaderContext,
  extra: Record<string, unknown>
): Record<string, unknown> {
  return {
    url: normalizeProxyTokenPath(context.url),
    contextType: (context as PlaylistLoaderContext).type ?? null,
    ...extra,
  };
}

export type ProxyLoaderOptions = {
  /** Si false, les playlists subtitle ne sont pas fetchées (lazy CC) */
  isSubtitlesEnabled?: () => boolean;
};

export function createProxyLoader(
  BaseLoader: new (config: HlsConfig) => Loader<LoaderContext>,
  options?: ProxyLoaderOptions
): new (config: HlsConfig) => Loader<LoaderContext> {
  return class ProxyLoader implements Loader<LoaderContext> {
    private hlsConfig: HlsConfig;
    private activeLoader: Loader<LoaderContext> | null = null;
    public stats: LoaderStats = { ...EMPTY_LOADER_STATS };
    public context: LoaderContext | null = null;

    constructor(config: HlsConfig) {
      this.hlsConfig = config;
    }

    destroy(): void {
      this.activeLoader?.destroy();
      this.activeLoader = null;
      this.context = null;
    }

    abort(): void {
      this.activeLoader?.abort();
    }

    load(
      context: LoaderContext,
      config: LoaderConfiguration,
      callbacks: LoaderCallbacks<LoaderContext>
    ): void {
      if (
        options?.isSubtitlesEnabled &&
        isSubtitlePlaylistContext(context) &&
        !options.isSubtitlesEnabled()
      ) {
        const response: LoaderResponse = { url: context.url, data: EMPTY_SUBTITLE_PLAYLIST };
        callbacks.onSuccess(response, { ...EMPTY_LOADER_STATS }, context, null);
        return;
      }

      this.activeLoader?.destroy();
      this.activeLoader = null;

      const requestUrl = context.url;
      let retriedAuth = false;

      const runLoad = (targetUrl: string) => {
        const innerLoader = new BaseLoader(this.hlsConfig);
        this.activeLoader = innerLoader;

        let loadUrl = targetUrl;
        if (isLevelPlaylistContext(context)) {
          loadUrl = withLevelProxyParams(targetUrl);
        } else if (isManifestPlaylistContext(context)) {
          const parsed = new URL(targetUrl, getAppOrigin());
          parsed.searchParams.set("contextType", "manifest");
          loadUrl = `${parsed.pathname}${parsed.search}`;
        }
        context.url = loadUrl;
        this.context = context;

        innerLoader.load(context, config, {
          onSuccess: (response, stats, ctx, networkDetails) => {
            this.stats = stats;
            this.context = ctx;
            this.activeLoader = null;
            logger.info(
              "Proxy loader: succès",
              logProxyLoaderMeta(ctx, {
                httpCode: response.code ?? 200,
                durationMs: loaderDurationMs(stats),
                bytes: stats.loaded,
              })
            );
            callbacks.onSuccess(response, stats, ctx, networkDetails);
          },
          onError: (response, ctx, networkDetails, stats) => {
            this.stats = stats;
            const status = response?.code;
            logger.warn(
              "Proxy loader: erreur",
              logProxyLoaderMeta(ctx, {
                httpCode: status ?? null,
                durationMs: loaderDurationMs(stats),
                error: response?.text ?? null,
                bytes: stats.loaded,
              })
            );
            if (!retriedAuth && shouldRetryProxyAuth(status, ctx, ctx.url)) {
              retriedAuth = true;
              const originalUrl = invalidateProxyTokenByPath(ctx.url);
              if (originalUrl) {
                logger.warn(
                  "Proxy loader: retry auth token",
                  logProxyLoaderMeta(ctx, {
                    httpCode: status ?? null,
                    originalUrl,
                    contextType: (ctx as PlaylistLoaderContext).type ?? null,
                  })
                );
                innerLoader.destroy();
                this.activeLoader = null;
                buildStreamProxyUrlFresh(originalUrl)
                  .then((freshUrl) => runLoad(freshUrl))
                  .catch((err) => {
                    logger.error(
                      "Proxy loader: échec refresh token",
                      logProxyLoaderMeta(ctx, {
                        httpCode: status ?? null,
                        error: err instanceof Error ? err.message : String(err),
                      })
                    );
                    callbacks.onError(
                      {
                        code: status ?? 0,
                        text: err instanceof Error ? err.message : String(err),
                      },
                      ctx,
                      networkDetails,
                      stats
                    );
                  });
                return;
              }
            }
            innerLoader.destroy();
            this.activeLoader = null;
            callbacks.onError(response, ctx, networkDetails, stats);
          },
          onTimeout: (stats, ctx, networkDetails) => {
            this.stats = stats;
            innerLoader.destroy();
            this.activeLoader = null;
            callbacks.onTimeout(stats, ctx, networkDetails);
          },
          onAbort: callbacks.onAbort
            ? (stats, ctx, networkDetails) => {
                this.stats = stats;
                innerLoader.destroy();
                this.activeLoader = null;
                callbacks.onAbort!(stats, ctx, networkDetails);
              }
            : undefined,
          onProgress: callbacks.onProgress
            ? (stats, ctx, data, networkDetails) => {
                this.stats = stats;
                callbacks.onProgress!(stats, ctx, data, networkDetails);
              }
            : undefined,
        });
      };

      resolveProxyLoadUrl(context, requestUrl)
        .then((proxyUrl) => runLoad(proxyUrl))
        .catch((err) => {
          logger.error(
            "Proxy loader: échec résolution URL proxy",
            logProxyLoaderMeta(context, {
              requestUrl,
              error: err instanceof Error ? err.message : String(err),
            })
          );
          callbacks.onError(
            { code: 0, text: err instanceof Error ? err.message : String(err) },
            context,
            null,
            { ...EMPTY_LOADER_STATS, aborted: true }
          );
        });
    }
  };
}
