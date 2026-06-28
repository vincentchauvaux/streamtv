import { prisma } from "@/lib/prisma";
import { inferFavoriteCategory } from "@/lib/stream-utils";
import { toChannelDTO } from "@/lib/services/channel.service";

export const historyService = {
  async getHistory(userId: string, limit = 20) {
    const history = await prisma.watchHistory.findMany({
      where: { userId },
      include: {
        channel: { include: { streams: true, playlist: { select: { id: true, name: true } } } },
      },
      orderBy: { lastWatched: "desc" },
      take: limit,
    });

    return history.map((h) => ({
      ...h,
      channel: toChannelDTO(h.channel),
    }));
  },

  async recordWatch(
    userId: string,
    data: {
      channelId: string;
      positionSec?: number;
      durationSec?: number;
      sessionDurationSec?: number;
    }
  ) {
    const existing = await prisma.watchHistory.findUnique({
      where: { userId_channelId: { userId, channelId: data.channelId } },
    });

    const watchedSec =
      (existing?.watchedSec ?? 0) + (data.sessionDurationSec ?? 0);

    return prisma.watchHistory.upsert({
      where: { userId_channelId: { userId, channelId: data.channelId } },
      create: {
        userId,
        channelId: data.channelId,
        positionSec: data.positionSec ?? 0,
        durationSec: data.durationSec ?? null,
        watchedSec: data.sessionDurationSec ?? 0,
        sessionDurationSec: data.sessionDurationSec ?? null,
        viewCount: 1,
      },
      update: {
        positionSec: data.positionSec ?? 0,
        durationSec: data.durationSec ?? null,
        watchedSec,
        sessionDurationSec: data.sessionDurationSec ?? null,
        viewCount: { increment: 1 },
        lastWatched: new Date(),
      },
    });
  },
};

export const favoriteService = {
  async list(userId: string) {
    const favorites = await prisma.favorite.findMany({
      where: { userId },
      include: {
        channel: {
          include: {
            streams: true,
            playlist: { select: { id: true, name: true } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return favorites.map((f) => ({
      ...toChannelDTO(f.channel, true),
      favoriteCategory: f.category,
    }));
  },

  async add(userId: string, channelId: string, category?: string) {
    const channel = await prisma.channel.findUnique({
      where: { id: channelId },
      select: { group: true, name: true },
    });

    const inferred =
      category?.toUpperCase() as "NEWS" | "SPORTS" | "MOVIES" | "KIDS" | undefined;

    const cat =
      inferred && ["NEWS", "SPORTS", "MOVIES", "KIDS"].includes(inferred)
        ? inferred
        : inferFavoriteCategory(channel?.group, channel?.name);

    await prisma.favorite.upsert({
      where: { userId_channelId: { userId, channelId } },
      create: { userId, channelId, category: cat },
      update: { category: cat ?? undefined },
    });
  },

  async remove(userId: string, channelId: string) {
    await prisma.favorite.deleteMany({ where: { userId, channelId } });
  },

  async listGrouped(userId: string) {
    const favorites = await this.list(userId);
    const groups: Record<string, typeof favorites> = {
      NEWS: [],
      SPORTS: [],
      MOVIES: [],
      KIDS: [],
      OTHER: [],
    };

    for (const fav of favorites) {
      const key = fav.favoriteCategory ?? "OTHER";
      if (groups[key]) groups[key].push(fav);
      else groups.OTHER.push(fav);
    }

    return groups;
  },
};
