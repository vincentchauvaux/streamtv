import type { SessionUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { matchesCategory } from "@/lib/stream-utils";
import { toChannelDTO } from "@/lib/services/channel.service";

export const recommendationService = {
  async getRecommendations(user: SessionUser, limit = 12) {
    const history = await prisma.watchHistory.findMany({
      where: { userId: user.id },
      include: {
        channel: {
          include: {
            streams: true,
            playlist: { select: { id: true, name: true } },
          },
        },
      },
      orderBy: { lastWatched: "desc" },
      take: 30,
    });

    const categoryScores = new Map<string, number>();
    const watchedGroups = new Map<string, number>();

    for (const entry of history) {
      const group = entry.channel.group ?? "Autres";
      watchedGroups.set(group, (watchedGroups.get(group) ?? 0) + entry.viewCount);

      for (const cat of ["news", "sports", "movies", "kids"]) {
        if (matchesCategory(cat, entry.channel.group, entry.channel.name)) {
          categoryScores.set(
            cat,
            (categoryScores.get(cat) ?? 0) + entry.watchedSec + entry.viewCount * 60
          );
        }
      }
    }

    const topCategory = [...categoryScores.entries()]
      .sort((a, b) => b[1] - a[1])[0]?.[0];

    const topGroups = [...watchedGroups.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([g]) => g);

    const favoriteIds = new Set(
      (
        await prisma.favorite.findMany({
          where: { userId: user.id },
          select: { channelId: true },
        })
      ).map((f) => f.channelId)
    );

    const watchedIds = new Set(history.map((h) => h.channelId));

    const playlists = await prisma.playlist.findMany({
      where: { userId: user.id },
      select: { id: true },
    });

    if (playlists.length === 0) return [];

    const candidates = await prisma.channel.findMany({
      where: {
        playlistId: { in: playlists.map((p) => p.id) },
        id: { notIn: [...watchedIds] },
      },
      include: {
        streams: true,
        playlist: { select: { id: true, name: true } },
      },
      take: limit * 3,
    });

    const watchedNormalizedNames = new Set(
      history.map((h) => h.channel.normalizedName).filter(Boolean)
    );
    const seenNormalized = new Set<string>();

    return candidates
      .map((c) => ({
        channel: c,
        score:
          (favoriteIds.has(c.id) ? 2 : 0) +
          (topGroups.includes(c.group ?? "") ? 3 : 0) +
          (topCategory && matchesCategory(topCategory, c.group, c.name) ? 5 : 0) +
          (c.normalizedName && watchedNormalizedNames.has(c.normalizedName) ? 4 : 0),
      }))
      .sort((a, b) => b.score - a.score)
      .filter(({ channel }) => {
        if (!channel.normalizedName) return true;
        if (seenNormalized.has(channel.normalizedName)) return false;
        seenNormalized.add(channel.normalizedName);
        return true;
      })
      .slice(0, limit)
      .map(({ channel }) => toChannelDTO(channel, favoriteIds.has(channel.id)));
  },
};
