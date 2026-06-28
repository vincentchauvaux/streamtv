export type ChannelDTO = {
  id: string;
  name: string;
  normalizedName?: string;
  url: string;
  logo?: string | null;
  group?: string | null;
  tvgId?: string | null;
  language?: string | null;
  country?: string | null;
  status: string;
  streamType?: string;
  resolution?: string | null;
  radio?: boolean;
  playlist?: { id: string; name: string };
  isFavorite?: boolean;
  favoriteCategory?: string | null;
};

/** Alias UI — même shape que ChannelDTO */
export type ChannelItem = ChannelDTO;
