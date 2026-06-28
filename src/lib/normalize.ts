export type NormalizedChannelFields = {
  normalizedName: string;
  group: string | null;
  language: string | null;
  country: string | null;
};

export type ChannelNormalizeInput = {
  name: string;
  group?: string | null;
  language?: string | null;
  country?: string | null;
};

const QUALITY_SUFFIX =
  /\s*[-–—|]?\s*(?:hd|fhd|uhd|4k|8k|sd|ld|hq|lq|full\s*hd|ultra\s*hd|hevc(?:\s*hd)?)\s*$/i;

const RESOLUTION_SUFFIX =
  /\s*[-–—|]?\s*\(?\s*(?:2160|1080|720|576|480|360|240)\s*p?\s*\)?\s*$/i;

const NUMERIC_PREFIX = /^\d+[\.\)\-:\s]+/;

const LANGUAGE_ALIASES: Record<string, string> = {
  fr: "fr",
  fra: "fr",
  fre: "fr",
  french: "fr",
  francais: "fr",
  français: "fr",
  en: "en",
  eng: "en",
  english: "en",
  anglais: "en",
  de: "de",
  deu: "de",
  ger: "de",
  german: "de",
  allemand: "de",
  es: "es",
  spa: "es",
  spanish: "es",
  espagnol: "es",
  it: "it",
  ita: "it",
  italian: "it",
  italien: "it",
  pt: "pt",
  por: "pt",
  portuguese: "pt",
  portugais: "pt",
  ar: "ar",
  ara: "ar",
  arabic: "ar",
  arabe: "ar",
  nl: "nl",
  dut: "nl",
  nld: "nl",
  dutch: "nl",
  neerlandais: "nl",
  ru: "ru",
  rus: "ru",
  russian: "ru",
  russe: "ru",
  tr: "tr",
  tur: "tr",
  turkish: "tr",
  turc: "tr",
  pl: "pl",
  pol: "pl",
  polish: "pl",
  polonais: "pl",
};

const COUNTRY_ALIASES: Record<string, string> = {
  fr: "FR",
  fra: "FR",
  france: "FR",
  french: "FR",
  us: "US",
  usa: "US",
  "united states": "US",
  "etats-unis": "US",
  "états-unis": "US",
  uk: "GB",
  gb: "GB",
  gbr: "GB",
  "united kingdom": "GB",
  "royaume-uni": "GB",
  england: "GB",
  angleterre: "GB",
  de: "DE",
  deu: "DE",
  ger: "DE",
  germany: "DE",
  allemagne: "DE",
  es: "ES",
  esp: "ES",
  spain: "ES",
  espagne: "ES",
  it: "IT",
  ita: "IT",
  italy: "IT",
  italie: "IT",
  be: "BE",
  bel: "BE",
  belgium: "BE",
  belgique: "BE",
  ch: "CH",
  che: "CH",
  switzerland: "CH",
  suisse: "CH",
  ca: "CA",
  can: "CA",
  canada: "CA",
  pt: "PT",
  prt: "PT",
  portugal: "PT",
  nl: "NL",
  nld: "NL",
  netherlands: "NL",
  "pays-bas": "NL",
  ma: "MA",
  mar: "MA",
  morocco: "MA",
  maroc: "MA",
  dz: "DZ",
  dza: "DZ",
  algeria: "DZ",
  algerie: "DZ",
  algérie: "DZ",
  tn: "TN",
  tun: "TN",
  tunisia: "TN",
  tunisie: "TN",
};

function stripAccents(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function collapseWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function stripQualitySuffixes(value: string): string {
  let result = value;
  let prev = "";
  while (result !== prev) {
    prev = result;
    result = result
      .replace(QUALITY_SUFFIX, "")
      .replace(RESOLUTION_SUFFIX, "")
      .trim();
  }
  return result;
}

function normalizeBaseLabel(value: string): string {
  let result = stripAccents(value.toLowerCase().trim());
  result = result.replace(NUMERIC_PREFIX, "");
  result = stripQualitySuffixes(result);
  result = result.replace(/[^\w\s+&]/g, " ");
  return collapseWhitespace(result);
}

export function normalizeChannelName(name: string): string {
  return normalizeBaseLabel(name);
}

export function normalizeGroup(group: string): string {
  return normalizeBaseLabel(group);
}

function aliasLookup(
  value: string,
  aliases: Record<string, string>,
  isoPattern: RegExp,
  uppercase = false
): string {
  const trimmed = value.trim();
  if (!trimmed) return trimmed;

  const key = stripAccents(trimmed.toLowerCase());
  const mapped = aliases[key];
  if (mapped) return mapped;

  if (isoPattern.test(trimmed)) {
    return uppercase ? trimmed.toUpperCase() : trimmed.toLowerCase();
  }

  return trimmed;
}

export function normalizeLanguage(lang: string): string {
  return aliasLookup(lang, LANGUAGE_ALIASES, /^[a-z]{2,3}$/i);
}

export function normalizeCountry(country: string): string {
  return aliasLookup(country, COUNTRY_ALIASES, /^[a-z]{2,3}$/i, true);
}

export function buildNormalizedChannel(
  input: ChannelNormalizeInput
): NormalizedChannelFields {
  return {
    normalizedName: normalizeChannelName(input.name),
    group: input.group ? normalizeGroup(input.group) : null,
    language: input.language ? normalizeLanguage(input.language) : null,
    country: input.country ? normalizeCountry(input.country) : null,
  };
}
