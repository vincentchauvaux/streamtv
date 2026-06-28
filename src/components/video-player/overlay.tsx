"use client";

import { Loader2, Pause, Play } from "lucide-react";
import type { ChannelItem } from "@/types/channel";
import { usePlayerContext } from "./player-context";

type Props = {
  channel: ChannelItem;
};

export function PlayerOverlay({ channel }: Props) {
  const { state, actions } = usePlayerContext();

  return (
    <>
      {state.loading && !state.error && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/60">
          <Loader2 className="h-10 w-10 animate-spin text-primary" />
        </div>
      )}

      {state.error && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/80">
          <p className="text-danger">{state.error}</p>
          {channel.streamType === "YOUTUBE_LIVE" ? (
            <a
              href={channel.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-primary underline"
            >
              Ouvrir sur YouTube
            </a>
          ) : (
            <p className="text-sm text-muted">Vérifiez que le flux est accessible</p>
          )}
        </div>
      )}

      {!state.loading && !state.error && state.showControls && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/20 opacity-0 transition-opacity group-hover:opacity-100">
          <button
            onClick={(e) => {
              e.stopPropagation();
              actions.togglePlay();
            }}
            className="tv-focus focus-ring flex h-16 w-16 items-center justify-center rounded-full bg-white/15 backdrop-blur-sm transition-transform hover:scale-105"
          >
            {state.playing ? (
              <Pause className="h-8 w-8 text-white" />
            ) : (
              <Play className="h-8 w-8 fill-white text-white" />
            )}
          </button>
        </div>
      )}

      {state.playing && (
        <div className="absolute left-3 top-3 flex gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-black/60 px-2.5 py-1 text-xs font-medium backdrop-blur-sm">
            <span className="h-1.5 w-1.5 animate-pulse-soft rounded-full bg-accent" />
            EN DIRECT
          </span>
          {channel.streamType && channel.streamType !== "UNKNOWN" && (
            <span className="rounded-full bg-black/60 px-2.5 py-1 text-xs backdrop-blur-sm">
              {channel.streamType}
            </span>
          )}
        </div>
      )}
    </>
  );
}
