/**
 * Playlists M3U publiques et légales — sources open source curatées.
 * StreamTV ne fournit aucun flux ; ces URLs pointent vers des listes tierces.
 */
export type DemoPlaylist = {
  name: string;
  url: string;
  epgUrl?: string;
  description: string;
  source: string;
  sourceUrl: string;
};

export const DEMO_PLAYLISTS: DemoPlaylist[] = [
  {
    name: "iptv-org — France",
    url: "https://iptv-org.github.io/iptv/countries/fr.m3u",
    epgUrl: "https://iptv-epg.org/files/epg-fr.xml",
    description: "Chaînes françaises (~250 entrées)",
    source: "iptv-org",
    sourceUrl: "https://github.com/iptv-org/iptv",
  },
  {
    name: "Free-TV — Curatée",
    url: "https://raw.githubusercontent.com/Free-TV/IPTV/master/playlist.m3u8",
    description: "Liste légère de flux gratuits vérifiés",
    source: "Free-TV/IPTV",
    sourceUrl: "https://github.com/Free-TV/IPTV",
  },
  {
    name: "iptv-org — Actualités",
    url: "https://iptv-org.github.io/iptv/categories/news.m3u",
    description: "Chaînes d'actualités internationales",
    source: "iptv-org",
    sourceUrl: "https://github.com/iptv-org/iptv",
  },
  {
    name: "iptv-org — Sport",
    url: "https://iptv-org.github.io/iptv/categories/sports.m3u",
    description: "Chaînes sportives gratuites",
    source: "iptv-org",
    sourceUrl: "https://github.com/iptv-org/iptv",
  },
];

export const DEMO_SOURCES = [
  {
    name: "iptv-org",
    description: "Index mondial de flux IPTV légaux",
    url: "https://github.com/iptv-org/iptv",
  },
  {
    name: "Free-TV/IPTV",
    description: "Playlist curatée de chaînes gratuites",
    url: "https://github.com/Free-TV/IPTV",
  },
  {
    name: "iptv-epg",
    description: "Guides XMLTV associés",
    url: "https://iptv-epg.org",
  },
] as const;
