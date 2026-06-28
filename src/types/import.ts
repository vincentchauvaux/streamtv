export type ImportSummary = {
  id?: string;
  playlistId?: string;
  type?: "IMPORT" | "RESCAN";
  channelCount: number;
  radioCount: number;
  groupCount: number;
  logoCount: number;
  programCount: number;
  offlineCount: number;
  missingLogoCount: number;
  errorCount: number;
  durationMs: number;
  errors?: string | null;
  createdAt?: string;
};

export type ImportResult = {
  playlistId: string;
  summary: ImportSummary;
};
