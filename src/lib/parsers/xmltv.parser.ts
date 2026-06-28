import { XMLParser } from "fast-xml-parser";

export type EpgProgram = {
  channelRef: string;
  title: string;
  description?: string;
  start: Date;
  end: Date;
  category?: string;
};

function parseXmltvDate(value: string): Date {
  const match = value.match(
    /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})(?:\s*([+-]\d{4}))?$/
  );
  if (!match) return new Date(value);

  const [, y, mo, d, h, mi, s, tz] = match;
  const iso = `${y}-${mo}-${d}T${h}:${mi}:${s}${tz ? tz.replace(/(\d{2})(\d{2})/, "$1:$2") : "Z"}`;
  return new Date(iso);
}

function asArray<T>(value: T | T[] | undefined): T[] {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

export function parseXmltv(xml: string): EpgProgram[] {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
  });
  const data = parser.parse(xml);
  const programmes = asArray(data?.tv?.programme);

  return programmes.map((p: Record<string, unknown>) => {
    const titleNode = p.title as { "#text"?: string } | string | undefined;
    const descNode = p.desc as { "#text"?: string } | string | undefined;
    const catNode = p.category as { "#text"?: string } | string | undefined;

    const title =
      typeof titleNode === "string"
        ? titleNode
        : titleNode?.["#text"] ?? "Sans titre";

    const description =
      typeof descNode === "string" ? descNode : descNode?.["#text"];

    const category =
      typeof catNode === "string" ? catNode : catNode?.["#text"];

    return {
      channelRef: String(p["@_channel"] ?? ""),
      title,
      description,
      start: parseXmltvDate(String(p["@_start"] ?? "")),
      end: parseXmltvDate(String(p["@_stop"] ?? "")),
      category,
    };
  });
}

export async function fetchXmltv(url: string): Promise<EpgProgram[]> {
  const res = await fetch(url, {
    headers: { "User-Agent": "StreamTV/1.0" },
    next: { revalidate: 1800 },
  });
  if (!res.ok) throw new Error(`Impossible de télécharger l'EPG (${res.status})`);
  const xml = await res.text();
  return parseXmltv(xml);
}
