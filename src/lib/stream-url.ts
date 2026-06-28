/** Validation légère côté client avant lecture (miroir partiel de validateStreamUrl serveur) */
export function isPlayableStreamUrl(url: string | undefined | null): boolean {
  if (!url || typeof url !== "string") return false;
  const trimmed = url.trim();
  if (!trimmed || trimmed.length > 4096) return false;
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

export function streamUrlValidationMessage(url: string | undefined | null): string | null {
  if (!url || typeof url !== "string" || !url.trim()) {
    return "Aucune URL de flux pour cette chaîne";
  }
  if (url.length > 4096) return "URL de flux trop longue";
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return "Protocole de flux non supporté";
    }
  } catch {
    return "URL de flux invalide";
  }
  return null;
}
