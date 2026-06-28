export type M3UChannel = {
  name: string;
  url: string;
  logo?: string;
  group?: string;
  tvgId?: string;
  tvgName?: string;
  language?: string;
  country?: string;
  catchup?: string;
  radio?: boolean;
  resolution?: string;
};

function parseExtInf(line: string) {
  const attrs: Record<string, string> = {};
  const attrRegex = /([\w-]+)="([^"]*)"/g;
  let match: RegExpExecArray | null;
  while ((match = attrRegex.exec(line)) !== null) {
    attrs[match[1]] = match[2];
  }

  const nameMatch = line.match(/,(.+)$/);
  const name = nameMatch?.[1]?.trim() ?? "Chaîne sans nom";

  const radio =
    attrs.radio === "1" ||
    attrs.radio === "true" ||
    (attrs["group-title"]?.toLowerCase().includes("radio") ?? false);

  return {
    name,
    logo: attrs["tvg-logo"] ?? attrs.logo,
    group: attrs["group-title"] ?? attrs.group,
    tvgId: attrs["tvg-id"] ?? attrs.tvgId,
    tvgName: attrs["tvg-name"] ?? attrs.tvgName,
    language: attrs["tvg-language"] ?? attrs.language,
    country: attrs["tvg-country"] ?? attrs.country,
    catchup: attrs.catchup ?? attrs["x-catchup"],
    radio,
    resolution: attrs["tvg-resolution"] ?? attrs.resolution,
  };
}

export function parseM3U(content: string): M3UChannel[] {
  const lines = content
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  const channels: M3UChannel[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.startsWith("#EXTINF")) continue;

    const meta = parseExtInf(line);
    let url = "";
    for (let j = i + 1; j < lines.length; j++) {
      if (lines[j].startsWith("#")) continue;
      url = lines[j];
      i = j;
      break;
    }

    if (url) {
      channels.push({ ...meta, url });
    }
  }

  return channels;
}

export async function fetchM3U(url: string): Promise<M3UChannel[]> {
  const res = await fetch(url, {
    headers: { "User-Agent": "StreamTV/1.0" },
    next: { revalidate: 3600 },
  });
  if (!res.ok) throw new Error(`Impossible de télécharger la playlist (${res.status})`);
  const text = await res.text();
  return parseM3U(text);
}
