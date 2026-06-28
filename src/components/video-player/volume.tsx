"use client";

import { Volume2, VolumeX } from "lucide-react";
import { usePlayerContext } from "./player-context";

export function VolumeControl() {
  const { state, actions } = usePlayerContext();

  return (
    <button
      onClick={actions.toggleMute}
      className="tv-focus focus-ring rounded-lg p-2.5 transition-colors hover:bg-surface-hover"
      aria-label={state.muted ? "Activer le son" : "Couper le son"}
    >
      {state.muted ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
    </button>
  );
}
