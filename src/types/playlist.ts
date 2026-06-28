import type { ImportSummary } from "./import";

export type PlaylistSummary = {
  id: string;
  name: string;
  url: string | null;
  epgUrl: string | null;
  channelCount: number;
  scanStatus: string;
  lastScanAt: string | null;
  _count?: { channels: number };
  scanLogs?: ImportSummary[];
};

export type ScanStatus = "OK" | "ERROR" | "PENDING";
