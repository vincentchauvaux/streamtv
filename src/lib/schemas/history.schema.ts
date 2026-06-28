import { z } from "zod";

export const WatchHistorySchema = z.object({
  channelId: z.string().min(1, "channelId requis"),
  positionSec: z.number().optional(),
  durationSec: z.number().optional(),
  sessionDurationSec: z.number().optional(),
});
