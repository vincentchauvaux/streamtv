import { z } from "zod";

export const ImportPlaylistSchema = z.object({
  name: z.string().min(1, "Nom requis"),
  url: z.string().url("URL M3U invalide"),
  epgUrl: z.string().url("URL EPG invalide").optional(),
});

export const PlaylistIdQuerySchema = z.object({
  id: z.string().min(1, "id requis"),
});
