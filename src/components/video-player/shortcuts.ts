import type { ChannelItem } from "@/types/channel";

export function resolveStreamType(channel: ChannelItem): string {
  if (channel.streamType) return channel.streamType;
  const url = channel.url.toLowerCase();
  if (url.includes(".m3u8") || url.includes("m3u8")) return "HLS";
  if (url.includes(".mpd")) return "DASH";
  if (url.includes(".mp4")) return "MP4";
  if (url.includes(".ts") && !url.includes(".m3u8")) return "TS";
  if (url.includes("youtube.com") || url.includes("youtu.be")) return "YOUTUBE_LIVE";
  return "UNKNOWN";
}

export function isHlsStream(channel: ChannelItem): boolean {
  const streamType = resolveStreamType(channel);
  const url = channel.url.toLowerCase();
  return streamType === "HLS" || url.includes(".m3u8") || url.includes("m3u8");
}
