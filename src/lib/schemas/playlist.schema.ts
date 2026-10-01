import { z } from "zod";
import { validateOutboundUrl } from "@/lib/outbound-url";

function outboundUrl(message: string) {
  return z
    .string()
    .url(message)
    .refine((value) => validateOutboundUrl(value).ok, {
      message: "URL non autorisée (hôte privé ou protocole invalide)",
    });
}

export const ImportPlaylistSchema = z.object({
  name: z.string().min(1, "Nom requis").max(120),
  url: outboundUrl("URL M3U invalide"),
  epgUrl: outboundUrl("URL EPG invalide").optional(),
});

export const PlaylistIdQuerySchema = z.object({
  id: z.string().min(1, "id requis"),
});
