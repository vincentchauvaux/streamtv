"use client";

import { useCallback, useEffect, useRef } from "react";
import Hls, { type ErrorData, type HlsConfig, type MediaPlaylist } from "hls.js";
import type { ChannelItem } from "@/types/channel";
import { logger } from "@/lib/logger";
import {
  buildStreamProxyUrl,
  buildStreamProxyUrlFresh,
  createProxyLoader,
  invalidateProxyUrlCache,
} from "@/lib/stream-proxy-client";
import { streamUrlValidationMessage } from "@/lib/stream-url";
import { isHlsStream, resolveStreamType } from "./shortcuts";

const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 1500;
const LEVEL_MISMATCH_RECOVERY_MS = 600;
const STALL_LIVE_EDGE_MS = 600;
const STALL_LEVEL_RELOAD_MS = 1800;
const STALL_RECOVERY_MIN_INTERVAL_MS = 8000;
const STALL_MIN_BUFFER_AHEAD_S = 1;
const STALL_STARTUP_MIN_TIME_S = 10;
const STALL_STARTUP_GUARD_TIME_S = 3;
const RESET_GUARD_MIN_DROP_S = 5;
const RESET_GUARD_MAX_TIME_S = 2;
const MANIFEST_RECOVERY_DELAY_MS = 800;
const MAX_MANIFEST_RECOVERIES = 2;
/** Niveau initial Pluto — `ignorePlaylistParsingErrors` évite la penalty box ABR */
const PLUTO_START_LEVEL = 0;

/** Préférence impossible à matcher — empêche l'auto-sélection DEFAULT des pistes subtitle */
const SUBTITLE_DISABLED_PREFERENCE = { lang: "streamtv-off" } as const;

const HLS_CONFIG: Partial<HlsConfig> = {
  enableWorker: true,
  enableWebVTT: false,
  enableIMSC1: false,
  subtitlePreference: SUBTITLE_DISABLED_PREFERENCE,
  startLevel: PLUTO_START_LEVEL,
  capLevelToPlayerSize: false,
  testBandwidth: false,
  /** Évite LEVEL_PARSING_ERROR → sendAlternateToPenaltyBox sur mismatch séquence Pluto */
  ignorePlaylistParsingErrors: true,
  maxBufferHole: 0.5,
  maxFragLookUpTolerance: 3,
  maxBufferLength: 60,
  maxMaxBufferLength: 90,
  backBufferLength: 30,
  lowLatencyMode: false,
  startFragPrefetch: false,
  highBufferWatchdogPeriod: 2,
  manifestLoadingMaxRetry: 25,
  levelLoadingMaxRetry: 25,
  fragLoadingMaxRetry: 15,
  fragLoadingRetryDelay: 250,
  manifestLoadingRetryDelay: 300,
  levelLoadingRetryDelay: 300,
  abrEwmaDefaultEstimate: 800_000,
  abrBandWidthUpFactor: 0.5,
  maxStarvationDelay: 6,
  maxLoadingDelay: 6,
};

const RETRIABLE_FATAL_DETAILS = new Set<string>([
  Hls.ErrorDetails.FRAG_LOAD_ERROR,
  Hls.ErrorDetails.FRAG_LOAD_TIMEOUT,
]);

const RESPONSE_PREVIEW_LEN = 500;

const VERBOSE_HLS_ERROR_DETAILS = new Set<string>([
  Hls.ErrorDetails.MANIFEST_LOAD_ERROR,
  Hls.ErrorDetails.MANIFEST_PARSING_ERROR,
  Hls.ErrorDetails.LEVEL_LOAD_ERROR,
  Hls.ErrorDetails.LEVEL_PARSING_ERROR,
  Hls.ErrorDetails.FRAG_LOAD_ERROR,
  Hls.ErrorDetails.BUFFER_STALLED_ERROR,
  Hls.ErrorDetails.SUBTITLE_LOAD_ERROR,
]);

function extractResponsePreview(data: ErrorData, maxLen = RESPONSE_PREVIEW_LEN): string | undefined {
  const responseData = data.response?.data;
  if (responseData == null) return undefined;
  if (typeof responseData === "string") return responseData.slice(0, maxLen);
  if (responseData instanceof ArrayBuffer) {
    try {
      return new TextDecoder().decode(responseData).slice(0, maxLen);
    } catch {
      return `[ArrayBuffer ${responseData.byteLength} bytes]`;
    }
  }
  return String(responseData).slice(0, maxLen);
}

function buildHlsErrorLogMeta(data: ErrorData, channelId: string): Record<string, unknown> {
  return {
    channelId,
    url: data.url ?? data.response?.url ?? data.context?.url ?? null,
    details: data.details,
    fatal: data.fatal,
    type: data.type,
    contextType: data.context?.type ?? null,
    httpCode: data.response?.code ?? null,
    responseText: data.response?.text ?? null,
    responsePreview: extractResponsePreview(data) ?? null,
    level: data.level ?? null,
    parent: data.parent ?? null,
    reason: data.reason ?? null,
    buffer: data.buffer ?? null,
  };
}

function logHlsErrorDetails(data: ErrorData, channelId: string): void {
  const meta = buildHlsErrorLogMeta(data, channelId);
  const isVerbose = VERBOSE_HLS_ERROR_DETAILS.has(data.details);

  if (isSubtitleRelatedError(data)) {
    logger.warn("Lecteur: erreur hls (sous-titres)", meta);
    return;
  }

  if (data.details === Hls.ErrorDetails.BUFFER_STALLED_ERROR) {
    logger.warn("Lecteur: erreur hls (buffer stalled)", meta);
    return;
  }

  if (isVerbose) {
    if (data.fatal) {
      logger.error("Lecteur: erreur hls", meta);
    } else {
      logger.warn("Lecteur: erreur hls", meta);
    }
    return;
  }

  if (data.fatal) {
    logger.error("Lecteur: erreur hls", meta);
  } else {
    logger.info("Lecteur: erreur hls non-fatale", meta);
  }
}

function isSubtitleRelatedError(data: ErrorData): boolean {
  const details = data.details;
  if (
    details === Hls.ErrorDetails.SUBTITLE_LOAD_ERROR ||
    details === Hls.ErrorDetails.SUBTITLE_TRACK_LOAD_TIMEOUT
  ) {
    return true;
  }
  if (data.context?.type === "subtitleTrack") return true;
  if (data.parent === "subtitle" || data.frag?.type === "subtitle") return true;
  return false;
}

function disableSubtitles(hls: Hls): void {
  hls.config.enableWebVTT = false;
  hls.config.subtitlePreference = SUBTITLE_DISABLED_PREFERENCE;
  hls.subtitleTrack = -1;
  hls.subtitleDisplay = false;
}

function recoverFromSubtitleError(hls: Hls): void {
  disableSubtitles(hls);
}

function isRetriableVideoError(data: ErrorData): boolean {
  if (isSubtitleRelatedError(data)) return false;
  if (!data.fatal) return false;
  return RETRIABLE_FATAL_DETAILS.has(data.details);
}

function forceLevelReload(hls: Hls): void {
  if (hls.levels && hls.levels.length > 0 && hls.currentLevel >= 0) {
    hls.loadLevel = hls.currentLevel;
  }
}

function bufferedAheadSeconds(video: HTMLVideoElement): number {
  const currentTime = video.currentTime;
  for (let i = 0; i < video.buffered.length; i++) {
    const start = video.buffered.start(i);
    const end = video.buffered.end(i);
    if (currentTime >= start && currentTime < end) {
      return end - currentTime;
    }
  }
  return 0;
}

/** Repositionne la tête de lecture sur une plage bufferisée disponible */
function nudgeToBufferedRange(video: HTMLVideoElement): boolean {
  const currentTime = video.currentTime;
  for (let i = 0; i < video.buffered.length; i++) {
    const start = video.buffered.start(i);
    const end = video.buffered.end(i);
    if (currentTime >= start && currentTime < end - 0.15) {
      const target = Math.min(end - 0.25, currentTime + 0.35);
      if (target > currentTime + 0.05) {
        video.currentTime = target;
        return true;
      }
    }
    if (start > currentTime && start - currentTime < 4) {
      video.currentTime = start + 0.05;
      return true;
    }
  }
  return false;
}

/**
 * Récupération live sans recoverMediaError (detach/reattach remet currentTime à 0 sur live).
 * Priorité : nudge buffer → startLoad(-1) live edge.
 */
function recoverLiveBufferStall(hls: Hls, video: HTMLVideoElement): void {
  if (nudgeToBufferedRange(video)) return;
  hls.startLoad(-1);
}

function isAbortError(err: unknown): boolean {
  if (err instanceof DOMException && err.name === "AbortError") return true;
  if (err instanceof Error && err.name === "AbortError") return true;
  return false;
}

async function safePlay(
  video: HTMLVideoElement,
  loadId: number,
  getCurrentLoadId: () => number
): Promise<void> {
  if (loadId !== getCurrentLoadId()) return;
  try {
    await video.play();
  } catch (err) {
    if (isAbortError(err)) return;
    logger.warn("Lecteur: échec play()", { loadId, error: String(err) });
  }
}

function formatStreamError(httpCode?: number, channel?: ChannelItem | null): string {
  if (channel?.status === "OFFLINE") return "Chaîne hors ligne";
  if (httpCode === 414) return "URL de flux trop longue — réessayez ou changez de chaîne";
  if (httpCode === 403) return "Accès refusé au flux (403)";
  if (httpCode === 404) return "Flux introuvable (404)";
  return "Flux inaccessible (CORS ou hors ligne)";
}

function teardownVideo(video: HTMLVideoElement, hlsRef: React.RefObject<Hls | null>) {
  if (hlsRef.current) {
    hlsRef.current.destroy();
    hlsRef.current = null;
  }
  video.pause();
  video.removeAttribute("src");
  video.load();
}

export function useHlsPlayer(
  channel: ChannelItem | null,
  resumePosition: number,
  onReady: () => void,
  onError: (msg: string) => void,
  options?: {
    onSubtitleTracksUpdated?: (tracks: MediaPlaylist[]) => void;
    onSubtitleTrackChanged?: (trackId: number) => void;
  }
) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const loadIdRef = useRef(0);
  const subtitlesUserEnabledRef = useRef(false);
  const onSubtitleTracksUpdatedRef = useRef(options?.onSubtitleTracksUpdated);
  const onSubtitleTrackChangedRef = useRef(options?.onSubtitleTrackChanged);

  onSubtitleTracksUpdatedRef.current = options?.onSubtitleTracksUpdated;
  onSubtitleTrackChangedRef.current = options?.onSubtitleTrackChanged;

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !channel) return;

    const loadId = ++loadIdRef.current;
    subtitlesUserEnabledRef.current = false;
    let retryCount = 0;
    let manifestRecoveryCount = 0;
    let levelMismatchRecoveryTimer: number | null = null;
    let stallLevelReloadTimer: number | null = null;
    let stallLiveEdgeTimer: number | null = null;
    let stallRecoveryActive = false;
    let lastStallRecoveryAt = 0;
    let manifestParsed = false;
    let lastKnownGoodTime = 0;
    let hlsForRecovery: Hls | null = null;
    const sourceUrl = channel.url;
    const cleanups: Array<() => void> = [];

    const isStale = () => loadId !== loadIdRef.current;

    const register = (target: EventTarget, event: string, handler: EventListener) => {
      target.addEventListener(event, handler);
      cleanups.push(() => target.removeEventListener(event, handler));
    };

    const fail = (msg: string, meta?: Record<string, unknown>) => {
      if (isStale()) return;
      logger.error("Lecteur: erreur flux", {
        channelId: channel.id,
        channelName: channel.name,
        ...meta,
      });
      onError(msg);
    };

    const handleReady = async () => {
      if (isStale()) return;
      if (resumePosition > 0) {
        try {
          video.currentTime = resumePosition;
        } catch {
          /* position non seekable sur flux live */
        }
      }
      await safePlay(video, loadId, () => loadIdRef.current);
      if (isStale()) return;
      onReady();
    };

    const scheduleRetry = (retryFn: () => void, reason: string) => {
      if (isStale()) return;
      if (retryCount >= MAX_RETRIES) {
        fail(formatStreamError(undefined, channel), { reason, retries: retryCount });
        return;
      }
      retryCount += 1;
      logger.warn("Lecteur: retry flux", {
        channelId: channel.id,
        attempt: retryCount,
        reason,
      });
      const timer = window.setTimeout(() => {
        if (isStale()) return;
        retryFn();
      }, RETRY_DELAY_MS);
      cleanups.push(() => window.clearTimeout(timer));
    };

    const clearStallLevelReloadTimer = () => {
      if (stallLevelReloadTimer !== null) {
        window.clearTimeout(stallLevelReloadTimer);
        stallLevelReloadTimer = null;
      }
    };

    const clearStallLiveEdgeTimer = () => {
      if (stallLiveEdgeTimer !== null) {
        window.clearTimeout(stallLiveEdgeTimer);
        stallLiveEdgeTimer = null;
      }
    };

    const clearStallRecovery = () => {
      clearStallLevelReloadTimer();
      clearStallLiveEdgeTimer();
      stallRecoveryActive = false;
    };

    const trackPlaybackTime = () => {
      if (video.currentTime > 0 && !video.paused) {
        if (video.currentTime >= lastKnownGoodTime - 1) {
          lastKnownGoodTime = video.currentTime;
        }
      }
    };

    const detectTimeReset = (): boolean => {
      if (lastKnownGoodTime > RESET_GUARD_MIN_DROP_S && video.currentTime < RESET_GUARD_MAX_TIME_S) {
        logger.warn("Lecteur: reset détecté — récupération live edge", {
          channelId: channel.id,
          lastKnownGoodTime,
          currentTime: video.currentTime,
          readyState: video.readyState,
        });
        lastKnownGoodTime = video.currentTime;
        if (hlsForRecovery) {
          recoverLiveBufferStall(hlsForRecovery, video);
          void safePlay(video, loadId, () => loadIdRef.current);
        }
        return true;
      }
      return false;
    };

    const isStartupGuard = (hls: Hls): boolean =>
      video.currentTime < STALL_STARTUP_GUARD_TIME_S ||
      hls.currentLevel === -1 ||
      !manifestParsed;

    const clearLevelMismatchRecoveryTimer = () => {
      if (levelMismatchRecoveryTimer !== null) {
        window.clearTimeout(levelMismatchRecoveryTimer);
        levelMismatchRecoveryTimer = null;
      }
    };

    const handleBufferStalled = (hls: Hls) => {
      if (video.currentTime < STALL_STARTUP_MIN_TIME_S) {
        logger.warn("Lecteur: buffer stalled ignoré (démarrage)", {
          channelId: channel.id,
          currentTime: video.currentTime,
        });
        return;
      }

      if (isStartupGuard(hls)) {
        logger.warn("Lecteur: buffer stalled ignoré (startup guard)", {
          channelId: channel.id,
          currentTime: video.currentTime,
          currentLevel: hls.currentLevel,
          manifestParsed,
        });
        return;
      }

      const ahead = bufferedAheadSeconds(video);
      if (
        ahead >= STALL_MIN_BUFFER_AHEAD_S &&
        video.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA
      ) {
        logger.warn("Lecteur: buffer stalled ignoré (buffer disponible)", {
          channelId: channel.id,
          currentTime: video.currentTime,
          bufferedAhead: ahead,
          readyState: video.readyState,
        });
        return;
      }

      const now = Date.now();
      if (now - lastStallRecoveryAt < STALL_RECOVERY_MIN_INTERVAL_MS) {
        return;
      }

      if (stallRecoveryActive) return;
      stallRecoveryActive = true;
      lastStallRecoveryAt = now;

      logger.warn("Lecteur: buffer stalled — récupération douce", {
        channelId: channel.id,
        currentTime: video.currentTime,
        readyState: video.readyState,
        currentLevel: hls.currentLevel,
      });

      if (nudgeToBufferedRange(video)) {
        stallRecoveryActive = false;
        return;
      }

      clearStallLiveEdgeTimer();
      stallLiveEdgeTimer = window.setTimeout(() => {
        stallLiveEdgeTimer = null;
        if (isStale()) return;
        if (video.paused && !video.ended) return;
        if (!video.paused && video.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA) {
          stallRecoveryActive = false;
          return;
        }

        logger.warn("Lecteur: buffer stalled — live edge (startLoad -1)", {
          channelId: channel.id,
          currentTime: video.currentTime,
          readyState: video.readyState,
          currentLevel: hls.currentLevel,
        });
        recoverLiveBufferStall(hls, video);
        void safePlay(video, loadId, () => loadIdRef.current);
      }, STALL_LIVE_EDGE_MS);

      clearStallLevelReloadTimer();
      stallLevelReloadTimer = window.setTimeout(() => {
        stallLevelReloadTimer = null;
        if (isStale()) return;
        if (video.paused && !video.ended) return;
        if (!video.paused && video.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA) {
          stallRecoveryActive = false;
          return;
        }

        logger.warn("Lecteur: buffer stalled — reload niveau", {
          channelId: channel.id,
          currentTime: video.currentTime,
          readyState: video.readyState,
          currentLevel: hls.currentLevel,
        });
        if (hls.levels?.length) {
          forceLevelReload(hls);
        }
        stallRecoveryActive = false;
      }, STALL_LEVEL_RELOAD_MS);
    };

    const logVideoDiagnostic = (event: string, extra?: Record<string, unknown>) => {
      logger.info("Lecteur: événement vidéo", {
        channelId: channel.id,
        event,
        currentTime: video.currentTime,
        readyState: video.readyState,
        paused: video.paused,
        ended: video.ended,
        networkState: video.networkState,
        ...extra,
      });
    };

    teardownVideo(video, hlsRef);

    const urlError = streamUrlValidationMessage(channel.url);
    if (urlError) {
      fail(urlError);
      return () => {
        cleanups.forEach((fn) => fn());
      };
    }

    if (channel.status === "OFFLINE") {
      fail("Chaîne hors ligne");
      return () => {
        cleanups.forEach((fn) => fn());
      };
    }

    const streamType = resolveStreamType(channel);
    const isHls = isHlsStream(channel);

    if (streamType === "YOUTUBE_LIVE") {
      fail("YouTube Live : ouvrez le flux dans un navigateur externe");
      return () => {
        cleanups.forEach((fn) => fn());
      };
    }

    const startPlayback = (url: string) => {
      if (isStale()) return;

      register(video, "waiting", () => {
        logVideoDiagnostic("waiting");
        detectTimeReset();
      });
      register(video, "stalled", () => {
        logVideoDiagnostic("stalled");
        detectTimeReset();
      });
      register(video, "ended", () => {
        logVideoDiagnostic("ended");
      });
      register(video, "timeupdate", trackPlaybackTime);
      register(video, "playing", () => {
        clearStallRecovery();
      });
      register(document, "visibilitychange", () => {
        logger.info("Lecteur: visibilité document", {
          channelId: channel.id,
          hidden: document.hidden,
          paused: video.paused,
        });
      });

      const recoverFromManifestLoadError = (httpCode?: number) => {
        if (isStale()) return;
        if (manifestRecoveryCount >= MAX_MANIFEST_RECOVERIES) {
          fail(formatStreamError(httpCode, channel), {
            details: Hls.ErrorDetails.MANIFEST_LOAD_ERROR,
            manifestRecoveryCount,
            httpCode,
          });
          return;
        }
        manifestRecoveryCount += 1;
        logger.warn("Lecteur: manifestLoadError — récupération complète", {
          channelId: channel.id,
          attempt: manifestRecoveryCount,
          httpCode: httpCode ?? null,
        });
        invalidateProxyUrlCache(sourceUrl);
        const timer = window.setTimeout(() => {
          if (isStale()) return;
          if (hlsRef.current) {
            hlsRef.current.destroy();
            hlsRef.current = null;
          }
          void buildStreamProxyUrlFresh(sourceUrl)
            .then((freshUrl) => {
              if (isStale()) return;
              setupHls(freshUrl);
            })
            .catch((err) => {
              fail(formatStreamError(undefined, channel), {
                details: Hls.ErrorDetails.MANIFEST_LOAD_ERROR,
                error: String(err),
              });
            });
        }, MANIFEST_RECOVERY_DELAY_MS);
        cleanups.push(() => window.clearTimeout(timer));
      };

      const setupHls = (hlsUrl: string) => {
        if (isStale()) return;

        const baseLoader = Hls.DefaultConfig.loader;
        const hls = new Hls({
          ...HLS_CONFIG,
          loader: createProxyLoader(baseLoader, {
            isSubtitlesEnabled: () => subtitlesUserEnabledRef.current,
          }),
        });
        disableSubtitles(hls);
        hlsRef.current = hls;
        hlsForRecovery = hls;
        hls.loadSource(hlsUrl);
        hls.attachMedia(video);

        const forceSubtitlesOff = () => {
          if (isStale()) return;
          if (!subtitlesUserEnabledRef.current) {
            disableSubtitles(hls);
          }
        };

        const onMediaAttached = () => {
          forceSubtitlesOff();
        };
        hls.on(Hls.Events.MEDIA_ATTACHED, onMediaAttached);
        cleanups.push(() => hls.off(Hls.Events.MEDIA_ATTACHED, onMediaAttached));

        const onManifestParsed = () => {
          manifestParsed = true;
          manifestRecoveryCount = 0;
          forceSubtitlesOff();
          void handleReady();
        };
        hls.on(Hls.Events.MANIFEST_PARSED, onManifestParsed);
        cleanups.push(() => hls.off(Hls.Events.MANIFEST_PARSED, onManifestParsed));

        const onSubtitleTracksUpdated = () => {
          if (isStale()) return;
          const tracks = hls.subtitleTracks;
          onSubtitleTracksUpdatedRef.current?.(tracks);
          forceSubtitlesOff();
        };
        hls.on(Hls.Events.SUBTITLE_TRACKS_UPDATED, onSubtitleTracksUpdated);
        cleanups.push(() =>
          hls.off(Hls.Events.SUBTITLE_TRACKS_UPDATED, onSubtitleTracksUpdated)
        );

        const onSubtitleTrackSwitch = (_: string, data: { id: number }) => {
          if (isStale()) return;
          onSubtitleTrackChangedRef.current?.(data.id);
        };
        hls.on(Hls.Events.SUBTITLE_TRACK_SWITCH, onSubtitleTrackSwitch);
        cleanups.push(() =>
          hls.off(Hls.Events.SUBTITLE_TRACK_SWITCH, onSubtitleTrackSwitch)
        );

        const onLevelLoaded = (_: string, data: { details?: { live?: boolean } }) => {
          logger.info("Lecteur: playlist niveau chargée", {
            channelId: channel.id,
            live: data.details?.live ?? null,
          });
        };
        hls.on(Hls.Events.LEVEL_LOADED, onLevelLoaded);
        cleanups.push(() => hls.off(Hls.Events.LEVEL_LOADED, onLevelLoaded));

        const onHlsError = (_: string, data: ErrorData) => {
          if (isStale()) return;

          const httpCode = data.response?.code;

          if (data.details === Hls.ErrorDetails.LEVEL_PARSING_ERROR) {
            data.fatal = false;

            if (data.reason?.includes("media sequence mismatch")) {
              logger.warn(
                "Mismatch Pluto ignoré (normal)",
                buildHlsErrorLogMeta(data, channel.id)
              );
              return;
            }

            logger.warn(
              "Lecteur: levelParsingError (mismatch Pluto)",
              buildHlsErrorLogMeta(data, channel.id)
            );
            clearLevelMismatchRecoveryTimer();
            levelMismatchRecoveryTimer = window.setTimeout(() => {
              levelMismatchRecoveryTimer = null;
              if (isStale()) return;
              forceLevelReload(hls);
            }, LEVEL_MISMATCH_RECOVERY_MS);
            return;
          }

          logHlsErrorDetails(data, channel.id);

          if (isSubtitleRelatedError(data)) {
            recoverFromSubtitleError(hls);
            onSubtitleTrackChangedRef.current?.(-1);
            return;
          }

          if (!data.fatal) {
            if (data.details === Hls.ErrorDetails.BUFFER_STALLED_ERROR) {
              handleBufferStalled(hls);
              return;
            }
            if (httpCode === 403 || httpCode === 404 || httpCode === 401) {
              scheduleRetry(() => hls.startLoad(), `upstream-${httpCode}`);
            }
            return;
          }

          if (
            data.details === Hls.ErrorDetails.MANIFEST_LOAD_ERROR ||
            data.details === Hls.ErrorDetails.MANIFEST_LOAD_TIMEOUT
          ) {
            recoverFromManifestLoadError(httpCode);
            return;
          }

          if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
            if (httpCode === 414) {
              fail(formatStreamError(httpCode, channel), { details: data.details, httpCode });
              return;
            }
            if (httpCode === 403 || httpCode === 401) {
              logger.warn("Lecteur: auth upstream expirée — rechargement source", {
                channelId: channel.id,
                httpCode,
                details: data.details,
              });
              invalidateProxyUrlCache(sourceUrl);
              scheduleRetry(() => {
                void buildStreamProxyUrlFresh(sourceUrl).then((freshUrl) => {
                  if (isStale()) return;
                  hls.loadSource(freshUrl);
                  hls.startLoad();
                });
              }, `upstream-auth-${httpCode}`);
              return;
            }
            if (isRetriableVideoError(data)) {
              scheduleRetry(() => hls.startLoad(), data.details);
            }
            return;
          }

          if (data.type === Hls.ErrorTypes.MEDIA_ERROR && isRetriableVideoError(data)) {
            scheduleRetry(() => {
              recoverLiveBufferStall(hls, video);
              void safePlay(video, loadId, () => loadIdRef.current);
            }, data.details);
            return;
          }

          if (isRetriableVideoError(data)) {
            scheduleRetry(() => hls.startLoad(), data.details);
            return;
          }

          fail(formatStreamError(httpCode, channel), { details: data.details, httpCode });
        };
        hls.on(Hls.Events.ERROR, onHlsError);
        cleanups.push(() => hls.off(Hls.Events.ERROR, onHlsError));
      };

      if (isHls && Hls.isSupported()) {
        setupHls(url);
      } else if (video.canPlayType("application/vnd.apple.mpegurl") && isHls) {
        const onLoadedMetadata = () => {
          void handleReady();
        };
        const onNativeError = () => {
          scheduleRetry(() => {
            video.src = url;
            video.load();
          }, "native-hls");
        };
        register(video, "loadedmetadata", onLoadedMetadata);
        register(video, "error", onNativeError);
        video.src = url;
      } else {
        const onCanPlay = () => {
          void handleReady();
        };
        const onNativeError = () => {
          scheduleRetry(() => {
            video.src = url;
            video.load();
          }, streamType === "TS" ? "ts" : "native");
        };
        register(video, "canplay", onCanPlay);
        register(video, "error", onNativeError);
        video.src = url;
        video.load();
      }
    };

    buildStreamProxyUrl(channel.url)
      .then((url) => startPlayback(url))
      .catch((err) => {
        fail(formatStreamError(undefined, channel), { error: String(err) });
      });

    return () => {
      clearStallRecovery();
      clearLevelMismatchRecoveryTimer();
      hlsForRecovery = null;
      cleanups.forEach((fn) => fn());
      teardownVideo(video, hlsRef);
    };
  }, [
    channel?.id,
    channel?.url,
    channel?.status,
    channel?.streamType,
    resumePosition,
    onReady,
    onError,
  ]);

  return { videoRef, hlsRef, subtitlesUserEnabledRef };
}

export function useSubtitleActions(
  hlsRef: React.RefObject<Hls | null>,
  subtitlesUserEnabledRef: React.RefObject<boolean>,
  onTrackChanged?: (trackId: number) => void
) {
  const setSubtitleTrack = useCallback(
    (trackId: number) => {
      const hls = hlsRef.current;
      if (!hls) return;

      subtitlesUserEnabledRef.current = trackId >= 0;

      if (trackId >= 0) {
        hls.config.enableWebVTT = true;
        const track = hls.subtitleTracks[trackId];
        if (track) {
          hls.config.subtitlePreference = {
            lang: track.lang,
            name: track.name,
            groupId: track.groupId,
          };
        }
      } else {
        hls.config.enableWebVTT = false;
        hls.config.subtitlePreference = SUBTITLE_DISABLED_PREFERENCE;
      }

      hls.subtitleTrack = trackId;
      hls.subtitleDisplay = trackId >= 0;
      onTrackChanged?.(trackId);
    },
    [hlsRef, subtitlesUserEnabledRef, onTrackChanged]
  );

  return { setSubtitleTrack };
}

export function useProgressTracking(
  channel: ChannelItem | null,
  onProgress?: (positionSec: number, sessionDurationSec: number) => void
) {
  const sessionStartRef = useRef<number>(0);
  const lastProgressRef = useRef<number>(0);

  useEffect(() => {
    if (!channel) return;
    sessionStartRef.current = Date.now();
    lastProgressRef.current = 0;
  }, [channel?.id]);

  useEffect(() => {
    if (!channel || !onProgress) return;
    const interval = setInterval(() => {
      const video = document.querySelector("video");
      if (video && !video.paused) {
        const sessionDuration = (Date.now() - sessionStartRef.current) / 1000;
        onProgress(video.currentTime, sessionDuration - lastProgressRef.current);
        lastProgressRef.current = sessionDuration;
      }
    }, 10000);
    return () => clearInterval(interval);
  }, [channel?.id, onProgress]);
}

export function usePlayerKeyboard(
  channel: ChannelItem | null,
  videoRef: React.RefObject<HTMLVideoElement | null>,
  togglePlay: () => void,
  setMuted: (v: boolean) => void
) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!channel) return;
      const video = videoRef.current;
      if (!video) return;
      if (e.key === " " || e.key === "k") {
        e.preventDefault();
        togglePlay();
      }
      if (e.key === "m") {
        video.muted = !video.muted;
        setMuted(video.muted);
      }
      if (e.key === "f") video.requestFullscreen?.();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [channel?.id, videoRef, togglePlay, setMuted]);
}

export function usePlayerActions(videoRef: React.RefObject<HTMLVideoElement | null>) {
  const togglePlay = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      video.play().catch((err) => {
        if (!isAbortError(err)) {
          logger.warn("Lecteur: échec play() manuel", { error: String(err) });
        }
      });
    } else {
      video.pause();
    }
  }, [videoRef]);

  const toggleMute = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = !video.muted;
    return video.muted;
  }, [videoRef]);

  const goFullscreen = useCallback(() => {
    videoRef.current?.requestFullscreen?.();
  }, [videoRef]);

  return { togglePlay, toggleMute, goFullscreen };
}
