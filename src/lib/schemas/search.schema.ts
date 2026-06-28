import { z } from "zod";

export const SearchSchema = z.object({
  q: z.string().optional(),
  name: z.string().optional(),
  group: z.string().optional(),
  country: z.string().optional(),
  language: z.string().optional(),
  resolution: z.string().optional(),
  online: z
    .enum(["true", "false"])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === "true")),
  favorite: z
    .enum(["true", "false"])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === "true")),
  playlist: z.string().optional(),
  playlistId: z.string().optional(),
  category: z.string().optional(),
  status: z.enum(["ONLINE", "OFFLINE", "UNKNOWN"]).optional(),
  limit: z.coerce.number().int().positive().max(1000).optional(),
});
