import type { ChannelStatus } from "@prisma/client";

export type SearchQuery = {
  name?: string;
  group?: string;
  country?: string;
  language?: string;
  resolution?: string;
  online?: boolean;
  favorite?: boolean;
  playlist?: string;
  category?: string;
  /** Alias texte libre */
  q?: string;
  status?: ChannelStatus;
  limit?: number;
};
