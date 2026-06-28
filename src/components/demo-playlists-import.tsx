"use client";

import { useState } from "react";
import Link from "next/link";
import { ExternalLink, Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DEMO_PLAYLISTS, DEMO_SOURCES } from "@/lib/demo-playlists";

type Props = {
  onImported?: () => void;
  compact?: boolean;
};

export function DemoPlaylistsImport({ onImported, compact = false }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function handleImport() {
    setLoading(true);
    setError("");
    setSuccess("");

    const res = await fetch("/api/playlists/import-demo", { method: "POST" });
    const data = await res.json();
    setLoading(false);

    if (!res.ok) {
      setError(data.error ?? "Erreur lors de l'import");
      return;
    }

    const count = data.imported?.length ?? 0;
    const skipped = data.skipped ?? 0;
    if (count === 0 && skipped > 0) {
      setSuccess("Toutes les playlists de démo sont déjà importées.");
    } else {
      setSuccess(
        `${count} playlist(s) importée(s) en arrière-plan. Le scan peut prendre quelques minutes.`
      );
    }
    onImported?.();
  }

  return (
    <div
      className={
        compact
          ? "space-y-4"
          : "space-y-4 rounded-2xl border border-primary/20 bg-primary/5 p-6"
      }
    >
      {!compact && (
        <div className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-primary" />
          <h2 className="font-semibold">Importer des chaînes gratuites</h2>
        </div>
      )}

      <p className="text-sm text-muted">
        {compact
          ? "Remplissez votre app avec des playlists M3U publiques et légales (iptv-org, Free-TV)."
          : "Importe automatiquement plusieurs playlists open source. Les flux sont fournis par des projets tiers — vérifiez leur disponibilité et leur légalité dans votre pays."}
      </p>

      {!compact && (
        <ul className="space-y-2 text-sm">
          {DEMO_PLAYLISTS.map((pl) => (
            <li
              key={pl.url}
              className="rounded-lg border border-border/60 bg-background/50 px-3 py-2"
            >
              <p className="font-medium">{pl.name}</p>
              <p className="text-xs text-muted">{pl.description}</p>
              {pl.epgUrl && (
                <p className="text-xs text-muted">EPG : guide TV France inclus</p>
              )}
            </li>
          ))}
        </ul>
      )}

      {error && (
        <p className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>
      )}
      {success && (
        <p className="rounded-lg bg-accent/10 px-3 py-2 text-sm text-accent">{success}</p>
      )}

      <div className="flex flex-wrap gap-3">
        <Button onClick={handleImport} disabled={loading} size={compact ? "lg" : "md"}>
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Sparkles className="h-4 w-4" />
          )}
          {loading ? "Import en cours..." : "Importer des chaînes gratuites"}
        </Button>
        {!compact && (
          <Link href="/app/settings">
            <Button variant="secondary">Ajouter une playlist manuelle</Button>
          </Link>
        )}
      </div>

      <div className="text-xs text-muted">
        <p className="mb-1 font-medium text-foreground">Sources documentées :</p>
        <ul className="space-y-1">
          {DEMO_SOURCES.map((src) => (
            <li key={src.url}>
              <a
                href={src.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-primary hover:underline"
              >
                {src.name}
                <ExternalLink className="h-3 w-3" />
              </a>
              {" — "}
              {src.description}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
