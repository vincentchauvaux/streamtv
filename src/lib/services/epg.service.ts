import { prisma } from "@/lib/prisma";
import { cache, cacheKeys } from "@/lib/cache";
import { fetchXmltv } from "@/lib/parsers/xmltv.parser";
import { channelRepository } from "@/lib/repositories/channel.repository";
import { epgRepository } from "@/lib/repositories/epg.repository";
import { logger } from "@/lib/logger";

export const epgService = {
  async syncPlaylistEpg(playlistId: string, epgUrl: string) {
    logger.info("Sync EPG démarré", { playlistId, epgUrl });
    const programs = await fetchXmltv(epgUrl);
    const channels = await channelRepository.findByPlaylistWithTvgId(playlistId);
    const byTvgId = new Map(
      channels.filter((c) => c.tvgId).map((c) => [c.tvgId!, c.id])
    );

    const channelIds = channels.map((c) => c.id);
    await epgRepository.deleteByChannelIds(channelIds);

    const toCreate = programs
      .map((p) => {
        const channelId = byTvgId.get(p.channelRef);
        if (!channelId) return null;
        return {
          channelId,
          title: p.title,
          description: p.description ?? null,
          start: p.start,
          end: p.end,
          category: p.category ?? null,
        };
      })
      .filter(Boolean) as Array<{
      channelId: string;
      title: string;
      description: string | null;
      start: Date;
      end: Date;
      category: string | null;
    }>;

    await epgRepository.createMany(toCreate);
    logger.info("Sync EPG terminé", { playlistId, count: toCreate.length });
    return toCreate.length;
  },

  async getPrograms(userId: string, channelId?: string) {
    const cacheKey = cacheKeys.epgPrograms(userId, channelId);
    const cached = cache.get<Awaited<ReturnType<typeof epgRepository.findUpcoming>>>(cacheKey);
    if (cached) return cached;

    const programs = await epgRepository.findUpcoming(userId, channelId);
    cache.set(cacheKey, programs, 2 * 60 * 1000);
    return programs;
  },

  async refreshAllForUser(userId: string) {
    const playlists = await prisma.playlist.findMany({
      where: { userId, epgUrl: { not: null } },
    });

    const results: Array<{ playlistId: string; count: number }> = [];
    for (const pl of playlists) {
      if (!pl.epgUrl) continue;
      try {
        const count = await this.syncPlaylistEpg(pl.id, pl.epgUrl);
        cache.delete(cacheKeys.epgPrograms(userId));
        results.push({ playlistId: pl.id, count });
      } catch (error) {
        logger.error("Refresh EPG échoué", {
          playlistId: pl.id,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
    return results;
  },
};
