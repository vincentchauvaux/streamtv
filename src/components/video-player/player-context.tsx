"use client";

import { createContext, useContext } from "react";
import type { MediaPlaylist } from "hls.js";

export type PlayerState = {
  playing: boolean;
  muted: boolean;
  loading: boolean;
  error: string | null;
  showControls: boolean;
};

export type SubtitleState = {
  tracks: MediaPlaylist[];
  activeTrackId: number;
};

export type PlayerActions = {
  setPlaying: (v: boolean) => void;
  setMuted: (v: boolean) => void;
  setLoading: (v: boolean) => void;
  setError: (v: string | null) => void;
  setShowControls: (v: boolean) => void;
  togglePlay: () => void;
  toggleMute: () => void;
  goFullscreen: () => void;
  setSubtitleTrack: (trackId: number) => void;
};

type PlayerContextValue = {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  state: PlayerState;
  subtitleState: SubtitleState;
  actions: PlayerActions;
};

export const PlayerContext = createContext<PlayerContextValue | null>(null);

export function usePlayerContext() {
  const ctx = useContext(PlayerContext);
  if (!ctx) throw new Error("usePlayerContext doit être utilisé dans VideoPlayer");
  return ctx;
}
