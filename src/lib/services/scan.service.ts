import type { ScanLogType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { fetchM3U } from "@/lib/parsers/m3u.parser";
import { buildNormalizedChannel } from "@/lib/normalize";
import { detectStreamType, inferQuality } from "@/lib/stream-utils";
import { playlistRepository } from "@/lib/repositories/playlist.repository";
import { epgService } from "@/lib/services/epg.service";
import { logger } from "@/lib/logger";
import { cache, cacheKeys } from "@/lib/cache";
import type { ImportSummary } from "@/types/import";

async function checkStreamOnline(url: string): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(url, {
      method: "HEAD",
      headers: { "User-Agent": "StreamTV/1.0" },
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (res.ok) return true;
    const getRes = await fetch(url, {
      method: "GET",
      headers: { "User-Agent": "StreamTV/1.0" },
      signal: AbortSignal.timeout(5000),
    });
    return getRes.ok;
  } catch (error) {
    logger.warn("Vérification flux échouée", { url, error: String(error) });
    return false;
  }
}

async function fetchLogoMeta(logoUrl: string): Promise<{
  etag: string | null;
  width: number | null;
  height: number | null;
}> {
  try {
    const res = await fetch(logoUrl, {
      method: "HEAD",
      headers: { "User-Agent": "StreamTV/1.0" },
      signal: AbortSignal.timeout(5000),
    });
    return {
      etag: res.headers.get("etag"),
      width: null,
      height: null,
    };
  } catch {
    return { etag: null, width: null, height: null };
  }
}

type ExistingChannel = {
  name: string;
  tvgId: string | null;
  logo: string | null;
  logoEtag: string | null;
  logoWidth: number | null;
  logoHeight: number | null;
  logoLastUpdate: Date | null;
};

function channelKey(name: string, tvgId?: string | null) {
  return tvgId ? `tvg:${tvgId}` : `name:${name}`;
}

export const scanService = {
  async scanPlaylist(
    playlistId: string,
    type: ScanLogType = "RESCAN",
    options?: { skipOnlineCheck?: boolean }
  ): Promise<ImportSummary> {
    const startMs = Date.now();
    const playlist = await prisma.playlist.findUnique({ where: { id: playlistId } });
    if (!playlist?.url) throw new Error("Playlist sans URL");

    logger.info("Scan playlist démarré", { playlistId, type });
    await playlistRepository.updateScanStatus(playlistId, "PENDING");

    const errors: string[] = [];
    let offlineCount = 0;
    let programCount = 0;

    try {
      const existingChannels = await prisma.channel.findMany({
        where: { playlistId },
        select: {
          name: true,
          tvgId: true,
          logo: true,
          logoEtag: true,
          logoWidth: true,
          logoHeight: true,
          logoLastUpdate: true,
        },
      });
      const existingByKey = new Map<string, ExistingChannel>();
      for (const ch of existingChannels) {
        existingByKey.set(channelKey(ch.name, ch.tvgId), ch);
      }

      const m3uChannels = await fetchM3U(playlist.url);
      logger.info("M3U parsé", { playlistId, count: m3uChannels.length });

      const groups = new Set<string>();
      let radioCount = 0;
      let logoCount = 0;
      let missingLogoCount = 0;

      await prisma.$transaction(
        async (tx) => {
          await tx.channel.deleteMany({ where: { playlistId } });

          for (const ch of m3uChannels) {
          const normalized = buildNormalizedChannel({
            name: ch.name,
            group: ch.group,
            language: ch.language,
            country: ch.country,
          });
          if (normalized.group) groups.add(normalized.group);
          if (ch.radio) radioCount++;

          const streamType = detectStreamType(ch.url, ch.radio);
          const quality = inferQuality(ch.url, ch.resolution);
          let online = true;
          let status: "ONLINE" | "OFFLINE" | "UNKNOWN" = "UNKNOWN";

          if (!options?.skipOnlineCheck) {
            online = await checkStreamOnline(ch.url);
            status = online ? "ONLINE" : "OFFLINE";
            if (!online) offlineCount++;
          }

          const key = channelKey(ch.name, ch.tvgId);
          const prev = existingByKey.get(key);
          let logo = ch.logo ?? null;
          let logoEtag: string | null = null;
          let logoWidth: number | null = null;
          let logoHeight: number | null = null;
          let logoLastUpdate: Date | null = null;
          let logoSource: "PLAYLIST" | "NONE" = ch.logo ? "PLAYLIST" : "NONE";

          if (logo) {
            if (prev?.logo === logo && prev.logoEtag) {
              logoEtag = prev.logoEtag;
              logoWidth = prev.logoWidth;
              logoHeight = prev.logoHeight;
              logoLastUpdate = prev.logoLastUpdate;
              logoCount++;
            } else if (!options?.skipOnlineCheck) {
              const meta = await fetchLogoMeta(logo);
              logoEtag = meta.etag;
              logoWidth = meta.width;
              logoHeight = meta.height;
              logoLastUpdate = new Date();
              logoCount++;
            } else {
              logoCount++;
            }
          } else {
            missingLogoCount++;
          }

          await tx.channel.create({
            data: {
              name: ch.name,
              normalizedName: normalized.normalizedName,
              logo,
              logoSource,
              logoEtag,
              logoWidth,
              logoHeight,
              logoLastUpdate,
              group: normalized.group,
              tvgId: ch.tvgId ?? null,
              tvgName: ch.tvgName ?? null,
              language: normalized.language,
              country: normalized.country,
              catchup: ch.catchup ?? null,
              radio: ch.radio ?? false,
              resolution: ch.resolution ?? null,
              status,
              playlistId,
              streams: {
                create: {
                  url: ch.url,
                  quality,
                  streamType,
                  online,
                },
              },
            },
          });
        }
        },
        { timeout: 120000 }
      );

      const summary: ImportSummary = {
        channelCount: m3uChannels.length,
        radioCount,
        groupCount: groups.size,
        logoCount,
        programCount: 0,
        offlineCount,
        missingLogoCount,
        errorCount: errors.length,
        durationMs: Date.now() - startMs,
      };

      const scanLog = await prisma.scanLog.create({
        data: {
          playlistId,
          type,
          channelCount: summary.channelCount,
          radioCount: summary.radioCount,
          groupCount: summary.groupCount,
          logoCount: summary.logoCount,
          programCount: 0,
          missingLogoCount: summary.missingLogoCount,
          durationMs: summary.durationMs,
          errorCount: errors.length,
          offlineCount,
          errors: errors.length > 0 ? errors.join("\n") : null,
        },
      });

      await playlistRepository.updateScanStatus(playlistId, "OK", m3uChannels.length);
      cache.delete(cacheKeys.stats(playlist.userId));

      if (playlist.epgUrl) {
        const epgStart = Date.now();
        try {
          programCount = await epgService.syncPlaylistEpg(playlistId, playlist.epgUrl);
          summary.programCount = programCount;
          await prisma.scanLog.update({
            where: { id: scanLog.id },
            data: { programCount },
          });
          logger.info("EPG synchronisé", {
            playlistId,
            programCount,
            durationMs: Date.now() - epgStart,
          });
        } catch (error) {
          logger.error("Erreur sync EPG", {
            playlistId,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }

      logger.info("Scan terminé", { playlistId, ...summary });
      return { ...summary, id: scanLog.id, playlistId, type, createdAt: scanLog.createdAt.toISOString() };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Erreur de scan";
      errors.push(message);
      logger.error("Scan échoué", { playlistId, message });

      await prisma.scanLog.create({
        data: {
          playlistId,
          type,
          channelCount: 0,
          errorCount: 1,
          offlineCount: 0,
          durationMs: Date.now() - startMs,
          errors: message,
        },
      });

      await playlistRepository.updateScanStatus(playlistId, "ERROR", 0);
      throw error;
    }
  },

  async rescanStalePlaylists() {
    const olderThan = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const stale = await playlistRepository.findStaleForRescan(olderThan);
    const results: Array<{ playlistId: string; ok: boolean }> = [];

    for (const pl of stale) {
      try {
        await this.scanPlaylist(pl.id, "RESCAN", { skipOnlineCheck: true });
        results.push({ playlistId: pl.id, ok: true });
      } catch {
        results.push({ playlistId: pl.id, ok: false });
      }
    }

    return results;
  },
};
