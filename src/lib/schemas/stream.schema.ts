import { z } from "zod";

const MAX_STREAM_URL_LENGTH = 4096;

export const StreamProxyRegisterSchema = z.object({
  url: z
    .string()
    .min(1, "URL requise")
    .max(MAX_STREAM_URL_LENGTH, "URL trop longue")
    .url("URL de flux invalide")
    .refine(
      (url) => {
        try {
          const parsed = new URL(url);
          return parsed.protocol === "http:" || parsed.protocol === "https:";
        } catch {
          return false;
        }
      },
      { message: "Protocole non autorisé (http/https uniquement)" }
    ),
});

export const StreamUrlSchema = StreamProxyRegisterSchema.shape.url;
