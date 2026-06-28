import type { ChannelStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  normalizeChannelName,
  normalizeCountry,
  normalizeGroup,
  normalizeLanguage,
} from "@/lib/normalize";
import { CATEGORY_KEYWORDS } from "@/lib/stream-utils";

export type ChannelSearchParams = {
  userId: string;
  q?: string;
  group?: string;
  country?: string;
  language?: string;
  resolution?: string;
  category?: string;
  playlistId?: string;
  status?: ChannelStatus;
  limit?: number;
};

function categoryFilter(category: string) {
  const keywords = CATEGORY_KEYWORDS[category];
  if (!keywords) return null;

  return {
    OR: keywords.flatMap((kw) => [
      { group: { contains: kw } },
      { name: { contains: kw } },
    ]),
  };
}

export const channelRepository = {
  search(params: ChannelSearchParams) {
    const {
      userId,
      q,
      group,
      country,
      language,
      resolution,
      category,
      playlistId,
      status,
      limit = 500,
    } = params;

    const catFilter = category ? categoryFilter(category) : null;

    return prisma.channel.findMany({
      where: {
        playlist: { userId },
        ...(playlistId ? { playlistId } : {}),
        ...(group ? { group: normalizeGroup(group) } : {}),
        ...(country ? { country: normalizeCountry(country) } : {}),
        ...(language ? { language: normalizeLanguage(language) } : {}),
        ...(resolution ? { resolution: { contains: resolution } } : {}),
        ...(status ? { status } : {}),
        ...(q
          ? {
              OR: [
                { name: { contains: q } },
                { normalizedName: { contains: normalizeChannelName(q) } },
                { group: { contains: q } },
                { tvgName: { contains: q } },
                { country: { contains: q } },
                { language: { contains: q } },
              ],
            }
          : {}),
        ...(catFilter ? catFilter : {}),
      },
      include: {
        streams: { orderBy: { createdAt: "asc" } },
        playlist: { select: { id: true, name: true } },
      },
      orderBy: [{ group: "asc" }, { name: "asc" }],
      take: limit,
    });
  },

  findGroups(userId: string) {
    return prisma.channel.findMany({
      where: { playlist: { userId }, group: { not: null } },
      select: { group: true },
      distinct: ["group"],
      orderBy: { group: "asc" },
    });
  },

  deleteByPlaylist(playlistId: string) {
    return prisma.channel.deleteMany({ where: { playlistId } });
  },

  findByPlaylistWithTvgId(playlistId: string) {
    return prisma.channel.findMany({
      where: { playlistId },
      select: { id: true, tvgId: true },
    });
  },

  async findDuplicateGroupsByNormalizedName(userId: string) {
    const channels = await prisma.channel.findMany({
      where: {
        playlist: { userId },
        normalizedName: { not: "" },
      },
      select: {
        id: true,
        name: true,
        normalizedName: true,
        playlistId: true,
        playlist: { select: { id: true, name: true } },
      },
    });

    const byName = new Map<
      string,
      Array<{
        id: string;
        name: string;
        playlistId: string;
        playlistName: string;
      }>
    >();

    for (const ch of channels) {
      const list = byName.get(ch.normalizedName) ?? [];
      list.push({
        id: ch.id,
        name: ch.name,
        playlistId: ch.playlistId,
        playlistName: ch.playlist.name,
      });
      byName.set(ch.normalizedName, list);
    }

    return [...byName.entries()]
      .filter(([, items]) => items.length > 1)
      .map(([normalizedName, channels]) => ({ normalizedName, channels }));
  },
};
