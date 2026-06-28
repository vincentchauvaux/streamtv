import type { Channel, Stream, Playlist } from "@prisma/client";
import type { ChannelDTO } from "@/types/channel";
import type { SearchQuery } from "@/types/search";
import { channelRepository } from "@/lib/repositories/channel.repository";
import { cache, cacheKeys } from "@/lib/cache";

type ChannelWithRelations = Channel & {
  streams: Stream[];
  playlist?: Pick<Playlist, "id" | "name">;
};

export function toChannelDTO(
  channel: ChannelWithRelations,
  isFavorite = false
): ChannelDTO {
  const primary = channel.streams[0];
  return {
    id: channel.id,
    name: channel.name,
    normalizedName: channel.normalizedName || undefined,
    url: primary?.url ?? "",
    logo: channel.logo,
    group: channel.group,
    tvgId: channel.tvgId,
    language: channel.language,
    country: channel.country,
    status: channel.status,
    streamType: primary?.streamType,
    resolution: channel.resolution,
    radio: channel.radio,
    playlist: channel.playlist,
    isFavorite,
  };
}

function searchQueryToParams(userId: string, query: SearchQuery) {
  return {
    userId,
    q: query.q ?? query.name,
    group: query.group,
    country: query.country,
    language: query.language,
    resolution: query.resolution,
    playlistId: query.playlist ?? query.playlist,
    category: query.category,
    status: query.online === true ? ("ONLINE" as const) : query.online === false ? ("OFFLINE" as const) : query.status,
    limit: query.limit,
  };
}

export const channelService = {
  async search(query: SearchQuery & { userId: string }, favoriteIds?: Set<string>) {
    const params = searchQueryToParams(query.userId, query);
    let channels = await channelRepository.search(params);

    if (query.favorite === true && favoriteIds) {
      channels = channels.filter((c) => favoriteIds.has(c.id));
    } else if (query.favorite === false && favoriteIds) {
      channels = channels.filter((c) => !favoriteIds.has(c.id));
    }

    return channels.map((c) =>
      toChannelDTO(c, favoriteIds?.has(c.id) ?? false)
    );
  },

  async getGroups(userId: string) {
    const cacheKey = cacheKeys.channelGroups(userId);
    const cached = cache.get<string[]>(cacheKey);
    if (cached) return cached;

    const rows = await channelRepository.findGroups(userId);
    const groups = rows.map((r) => r.group).filter(Boolean) as string[];
    cache.set(cacheKey, groups, 5 * 60 * 1000);
    return groups;
  },

  findDuplicatesByNormalizedName(userId: string) {
    return channelRepository.findDuplicateGroupsByNormalizedName(userId);
  },
};
