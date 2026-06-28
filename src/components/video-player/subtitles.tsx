"use client";

import { useEffect, useRef, useState } from "react";
import { Captions } from "lucide-react";
import type { MediaPlaylist } from "hls.js";
import { usePlayerContext } from "./player-context";

function formatTrackLabel(track: MediaPlaylist): string {
  const lang = track.lang?.trim();
  if (lang) return lang.toUpperCase().slice(0, 3);
  const name = track.name?.trim();
  if (name) return name;
  return "ST";
}

export function SubtitleControl() {
  const { subtitleState, actions } = usePlayerContext();
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open]);

  if (subtitleState.tracks.length === 0) return null;

  const activeId = subtitleState.activeTrackId;

  return (
    <div className="relative" ref={menuRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`tv-focus focus-ring rounded-lg p-2.5 transition-colors hover:bg-surface-hover ${
          activeId >= 0 ? "text-primary" : ""
        }`}
        aria-label="Sous-titres"
        aria-expanded={open}
        aria-haspopup="menu"
      >
        <Captions className="h-5 w-5" />
      </button>
      {open && (
        <div
          role="menu"
          className="absolute bottom-full right-0 z-20 mb-2 min-w-[9rem] overflow-hidden rounded-lg border border-border bg-surface py-1 shadow-lg"
        >
          <button
            type="button"
            role="menuitemradio"
            aria-checked={activeId === -1}
            onClick={() => {
              actions.setSubtitleTrack(-1);
              setOpen(false);
            }}
            className={`tv-focus block w-full px-3 py-2 text-left text-sm transition-colors hover:bg-surface-hover ${
              activeId === -1 ? "text-primary" : ""
            }`}
          >
            Désactivés
          </button>
          {subtitleState.tracks.map((track, index) => (
            <button
              key={`${track.groupId}-${track.lang ?? track.name ?? index}`}
              type="button"
              role="menuitemradio"
              aria-checked={activeId === index}
              onClick={() => {
                actions.setSubtitleTrack(index);
                setOpen(false);
              }}
              className={`tv-focus block w-full px-3 py-2 text-left text-sm transition-colors hover:bg-surface-hover ${
                activeId === index ? "text-primary" : ""
              }`}
            >
              {formatTrackLabel(track)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
