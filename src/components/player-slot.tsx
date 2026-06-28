"use client";

import { useEffect, useRef } from "react";
import { Play } from "lucide-react";
import { useAppPlayer } from "@/providers/player-provider";
import { cn } from "@/lib/utils";

/**
 * Emplacement in-page du lecteur persistant.
 *
 * Rend un conteneur (cible de portail) que le `PersistentPlayer` remplit via
 * `ReactDOM.createPortal` lorsqu'une chaîne joue : l'élément <video>/instance
 * hls.js n'est jamais démonté, il est simplement re-parenté dans cet emplacement
 * (la lecture continue sans coupure lors de la navigation).
 *
 * - `emptyState` : affiche « Sélectionnez une chaîne pour commencer » tant
 *   qu'aucune chaîne n'est sélectionnée (utilisé sur l'accueil).
 * - Sans `emptyState`, le slot reste invisible/replié tant que rien ne joue
 *   (utilisé en tête des pages Chaînes / Favoris).
 */
export function PlayerSlot({
  emptyState = false,
  className,
}: {
  emptyState?: boolean;
  className?: string;
}) {
  const { current, registerSlot, unregisterSlot } = useAppPlayer();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    registerSlot(el);
    return () => unregisterSlot(el);
  }, [registerSlot, unregisterSlot]);

  // Replié (display:none) quand rien ne joue et pas d'empty state : évite un
  // espace vide dans le flux. La cible de portail reste montée et redevient
  // visible dès qu'une chaîne joue.
  const collapsed = !current && !emptyState;

  return (
    <div className={cn("w-full", collapsed && "hidden", className)}>
      <div ref={ref} className="w-full">
        {!current && emptyState && (
          <div className="animate-fade-in flex aspect-video w-full flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-border bg-surface/50">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10">
              <Play className="h-7 w-7 text-primary" />
            </div>
            <p className="text-muted">Sélectionnez une chaîne pour commencer</p>
            <p className="text-xs text-muted/70">
              La lecture continue d&apos;une section à l&apos;autre, ici même.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
