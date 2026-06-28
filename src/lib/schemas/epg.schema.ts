import { z } from "zod";

export const EpgQuerySchema = z.object({
  channelId: z.string().optional(),
});
