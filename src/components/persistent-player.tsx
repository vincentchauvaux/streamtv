"use client";

import { useCallback, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { VideoPlayer } from "@/components/video-player";
import { useAppPlayer } from "@/providers/player-provider";
import { cn } from "@/lib/utils";

/**
 * Lecteur global persistant : monté une seule fois dans le shell de l'app
 * (jamais démonté lors d'une navigation) afin que l'instance hls.js et
 * l'élément <video> survivent au changement de page.
 *
 * Rendu via `createPortal` dans une cible **stable** : soit l'emplacement
 * in-page exposé par la route active (`<PlayerSlot/>`), soit l'hôte du
 * mini-lecteur docké (fallback). Comme le portail garde la même position dans
 * l'arbre React et ne fait que changer son conteneur DOM, le <video> n'est
 * jamais re-monté — il est re-parenté → la lecture continue sans coupure.
 */
export function PersistentPlayer() {
  const { current, resumePosition, slot, clear } = useAppPlayer();
  const [dockEl, setDockEl] = useState<HTMLDivElement | null>(null);

  const saveProgress = useCallback(
    (positionSec: number, sessionDurationSec: number) => {
      if (!current) return;
      fetch("/api/watch-history", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          channelId: current.id,
          positionSec,
          sessionDurationSec,
        }),
      });
    },
    [current]
  );

  // Cible de portail : emplacement in-page si présent, sinon mini-lecteur docké.
  const target = slot ?? dockEl;
  const docked = !slot;

  return (
    <>
      {/* Hôte du mini-lecteur docké (fallback) — toujours monté pour servir de
          cible de portail stable sur les routes sans emplacement in-page.
          Masqué tant qu'un slot in-page est actif ou qu'aucune chaîne ne joue. */}
      <div
        ref={setDockEl}
        className={cn(
          "fixed bottom-24 right-3 z-[45] w-[min(92vw,400px)] lg:bottom-6 lg:right-6",
          (!docked || !current) && "hidden"
        )}
      />

      {current &&
        target &&
        createPortal(
          <div className="relative animate-fade-in">
            <button
              onClick={clear}
              className="tv-focus focus-ring absolute right-2 top-2 z-20 flex h-8 w-8 items-center justify-center rounded-lg bg-black/60 text-white backdrop-blur-sm transition-colors hover:bg-danger"
              aria-label="Fermer le lecteur"
            >
              <X className="h-4 w-4" />
            </button>
            <VideoPlayer
              channel={current}
              resumePosition={resumePosition}
              onProgress={saveProgress}
            />
          </div>,
          target
        )}
    </>
  );
}
