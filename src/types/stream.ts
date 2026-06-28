export type StreamType =
  | "HLS"
  | "DASH"
  | "MP4"
  | "TS"
  | "RADIO"
  | "YOUTUBE_LIVE"
  | "UNKNOWN";

export type StreamDTO = {
  id: string;
  url: string;
  quality?: string | null;
  codec?: string | null;
  streamType: StreamType;
  online: boolean;
};
