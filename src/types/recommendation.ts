import type { ChannelDTO } from "./channel";

export type RecommendationResult = {
  channels: ChannelDTO[];
  reason?: string;
};
