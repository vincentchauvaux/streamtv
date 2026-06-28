"use client";

import Image from "next/image";
import { Heart, Play, WifiOff } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ChannelItem } from "@/types/channel";

export type { ChannelItem };

type Props = {
  channel: ChannelItem;
  onPlay: (channel: ChannelItem) => void;
  onToggleFavorite?: (channel: ChannelItem) => void;
  compact?: boolean;
  active?: boolean;
  tabIndex?: number;
  onFocus?: () => void;
};

export function ChannelCard({
  channel,
  onPlay,
  onToggleFavorite,
  compact,
  active,
  tabIndex = 0,
  onFocus,
}: Props) {
  const offline = channel.status === "OFFLINE";

  return (
    <article
      className={cn(
        "channel-card group relative overflow-hidden rounded-2xl border bg-surface transition-all duration-200",
        offline && "opacity-50",
        active
          ? "border-primary/60 bg-primary/5 ring-1 ring-primary/30"
          : "border-border hover:border-primary/40 hover:bg-surface-hover",
        compact ? "p-3" : "p-4"
      )}
    >
      <div className="flex items-center gap-3">
        <div className="relative flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-background ring-1 ring-border-subtle">
          {channel.logo ? (
            <Image
              src={channel.logo}
              alt=""
              fill
              className="object-contain p-1.5"
              unoptimized
            />
          ) : (
            <span className="text-lg font-bold text-primary">
              {channel.name.charAt(0).toUpperCase()}
            </span>
          )}
          {offline && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/40">
              <WifiOff className="h-4 w-4 text-white" />
            </div>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <h3 className="truncate font-medium">{channel.name}</h3>
          <div className="flex flex-wrap items-center gap-x-2 text-xs text-muted">
            {channel.group && <span className="truncate">{channel.group}</span>}
            {channel.playlist && (
              <span className="truncate text-primary/70">{channel.playlist.name}</span>
            )}
            {offline && <span className="text-danger">Hors ligne</span>}
          </div>
        </div>

        <div className="flex items-center gap-1">
          {onToggleFavorite && (
            <button
              onClick={() => onToggleFavorite(channel)}
              className="tv-focus focus-ring rounded-lg p-2 text-muted transition-colors hover:text-danger"
              aria-label={channel.isFavorite ? "Retirer des favoris" : "Ajouter aux favoris"}
            >
              <Heart
                className={cn(
                  "h-4 w-4 transition-colors",
                  channel.isFavorite && "fill-danger text-danger"
                )}
              />
            </button>
          )}
          <button
            onClick={() => onPlay(channel)}
            onFocus={onFocus}
            tabIndex={tabIndex}
            className="tv-focus focus-ring rounded-xl bg-primary p-2.5 text-white transition-all hover:bg-primary-hover hover:shadow-lg hover:shadow-primary/25 disabled:opacity-50"
            aria-label={`Lire ${channel.name}`}
            disabled={offline}
          >
            <Play className="h-4 w-4 fill-current" />
          </button>
        </div>
      </div>
    </article>
  );
}
