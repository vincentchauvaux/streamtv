import { z } from "zod";

export const FavoriteSchema = z.object({
  channelId: z.string().min(1, "channelId requis"),
  category: z.enum(["NEWS", "SPORTS", "MOVIES", "KIDS"]).optional(),
});

export const FavoriteDeleteQuerySchema = z.object({
  channelId: z.string().min(1, "channelId requis"),
});
