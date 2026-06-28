"use client";

import { Maximize, Pause, Play } from "lucide-react";
import type { ChannelItem } from "@/types/channel";
import { usePlayerContext } from "./player-context";
import { VolumeControl } from "./volume";
import { SubtitleControl } from "./subtitles";

type Props = {
  channel: ChannelItem;
};

export function PlayerControls({ channel }: Props) {
  const { state, actions } = usePlayerContext();

  return (
    <div className="flex items-center justify-between gap-4 border-t border-border bg-surface px-4 py-3">
      <div className="min-w-0">
        <p className="truncate font-semibold">{channel.name}</p>
        <p className="truncate text-xs text-muted">
          {[channel.group, channel.playlist?.name].filter(Boolean).join(" · ")}
        </p>
      </div>
      <div className="flex items-center gap-1">
        <button
          onClick={actions.togglePlay}
          className="tv-focus focus-ring rounded-lg p-2.5 transition-colors hover:bg-surface-hover"
          aria-label={state.playing ? "Pause" : "Lecture"}
        >
          {state.playing ? (
            <Pause className="h-5 w-5" />
          ) : (
            <Play className="h-5 w-5 fill-current" />
          )}
        </button>
        <VolumeControl />
        <SubtitleControl />
        <button
          onClick={actions.goFullscreen}
          className="tv-focus focus-ring rounded-lg p-2.5 transition-colors hover:bg-surface-hover"
          aria-label="Plein écran"
        >
          <Maximize className="h-5 w-5" />
        </button>
      </div>
    </div>
  );
}
