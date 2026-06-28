import type { StreamType } from "@prisma/client";

export function detectStreamType(url: string, radio = false): StreamType {
  const lower = url.toLowerCase();
  if (radio) return "RADIO";
  if (lower.includes("youtube.com") || lower.includes("youtu.be")) return "YOUTUBE_LIVE";
  if (lower.includes(".m3u8") || lower.includes("m3u8")) return "HLS";
  if (lower.includes(".mpd")) return "DASH";
  if (lower.includes(".mp4")) return "MP4";
  if (lower.includes(".ts") || lower.endsWith("/ts")) return "TS";
  return "UNKNOWN";
}

export function inferQuality(url: string, resolution?: string | null): string | null {
  if (resolution) return resolution;
  const match = url.match(/(\d{3,4})p/i);
  return match ? `${match[1]}p` : null;
}

export const CATEGORY_KEYWORDS: Record<string, string[]> = {
  news: ["news", "actualité", "actualites", "info", "journal"],
  sports: ["sport", "sports", "football", "soccer"],
  movies: ["film", "films", "movie", "cinema", "cinéma"],
  kids: ["kids", "enfant", "enfants", "jeunesse", "junior", "cartoon"],
};

export function matchesCategory(
  category: string,
  group?: string | null,
  name?: string | null
): boolean {
  const keywords = CATEGORY_KEYWORDS[category] ?? [];
  const haystack = `${group ?? ""} ${name ?? ""}`.toLowerCase();
  return keywords.some((kw) => haystack.includes(kw));
}

export function inferFavoriteCategory(
  group?: string | null,
  name?: string | null
): "NEWS" | "SPORTS" | "MOVIES" | "KIDS" | null {
  if (matchesCategory("news", group, name)) return "NEWS";
  if (matchesCategory("sports", group, name)) return "SPORTS";
  if (matchesCategory("movies", group, name)) return "MOVIES";
  if (matchesCategory("kids", group, name)) return "KIDS";
  return null;
}
