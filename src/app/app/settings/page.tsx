"use client";

import { useEffect, useRef, useState } from "react";
import {
  Loader2,
  Monitor,
  Palette,
  Plus,
  RefreshCw,
  Settings,
  Keyboard,
  Trash2,
  Tv,
  Play,
  ImageIcon,
  AlertTriangle,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/ui/page-header";
import { cn } from "@/lib/utils";
import type { ImportSummary } from "@/types/import";
import type { PlaylistSummary } from "@/types/playlist";
import { usePlaylists } from "@/providers/playlist-provider";
import { useSettings } from "@/providers/settings-provider";
import { DemoPlaylistsImport } from "@/components/demo-playlists-import";

const SECTIONS = [
  { id: "playlists", label: "Playlists", icon: Tv },
  { id: "sync", label: "Synchronisation", icon: RefreshCw },
  { id: "playback", label: "Lecture", icon: Play },
  { id: "epg", label: "Guide TV", icon: Monitor },
  { id: "app", label: "Application", icon: Settings },
  { id: "appearance", label: "Apparence", icon: Palette },
  { id: "shortcuts", label: "Raccourcis clavier", icon: Keyboard },
] as const;

type SectionId = (typeof SECTIONS)[number]["id"];

const STATUS_LABELS: Record<string, { label: string; variant: "default" | "live" | "danger" }> = {
  OK: { label: "OK", variant: "live" },
  ERROR: { label: "Erreur", variant: "danger" },
  PENDING: { label: "En cours", variant: "default" },
};

type ScanLogExtended = ImportSummary & { createdAt: string };

function ImportSummaryModal({
  summary,
  playlistName,
  onClose,
}: {
  summary: ScanLogExtended;
  playlistName: string;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-md animate-fade-in rounded-2xl border border-border bg-surface p-6 shadow-xl">
        <div className="mb-4 flex items-start justify-between">
          <div>
            <h3 className="font-semibold">Import terminé</h3>
            <p className="text-sm text-muted">{playlistName}</p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1 text-muted hover:bg-surface-hover"
            aria-label="Fermer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-3 text-sm">
          <div className="rounded-lg bg-background p-3">
            <p className="text-muted">Chaînes</p>
            <p className="text-lg font-bold">{summary.channelCount}</p>
          </div>
          <div className="rounded-lg bg-background p-3">
            <p className="text-muted">Radios</p>
            <p className="text-lg font-bold">{summary.radioCount ?? 0}</p>
          </div>
          <div className="rounded-lg bg-background p-3">
            <p className="text-muted">Groupes</p>
            <p className="text-lg font-bold">{summary.groupCount ?? 0}</p>
          </div>
          <div className="rounded-lg bg-background p-3">
            <p className="text-muted">Logos</p>
            <p className="text-lg font-bold">{summary.logoCount ?? 0}</p>
          </div>
          <div className="rounded-lg bg-background p-3">
            <p className="text-muted">Programmes EPG</p>
            <p className="text-lg font-bold">{summary.programCount ?? 0}</p>
          </div>
          <div className="rounded-lg bg-background p-3">
            <p className="text-muted">Durée scan</p>
            <p className="text-lg font-bold">
              {summary.durationMs ? `${(summary.durationMs / 1000).toFixed(1)} s` : "—"}
            </p>
          </div>
        </div>

        {(summary.offlineCount > 0 || (summary.missingLogoCount ?? 0) > 0) && (
          <div className="mt-4 space-y-2 rounded-lg bg-accent/10 p-3 text-sm">
            {summary.offlineCount > 0 && (
              <p className="flex items-center gap-2 text-accent">
                <AlertTriangle className="h-4 w-4" />
                {summary.offlineCount} chaîne(s) hors ligne
              </p>
            )}
            {(summary.missingLogoCount ?? 0) > 0 && (
              <p className="flex items-center gap-2 text-accent">
                <ImageIcon className="h-4 w-4" />
                {summary.missingLogoCount} logo(s) manquant(s)
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function PlaceholderSection({ title, description }: { title: string; description: string }) {
  return (
    <div className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted">
      <p className="font-medium text-foreground">{title}</p>
      <p className="mt-1">{description}</p>
    </div>
  );
}

export default function SettingsPage() {
  const { playlists, refresh: refreshPlaylists } = usePlaylists();
  const { settings, updateSetting } = useSettings();
  const [section, setSection] = useState<SectionId>("playlists");
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [epgUrl, setEpgUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [scanningId, setScanningId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [importSummary, setImportSummary] = useState<{
    summary: ScanLogExtended;
    playlistName: string;
  } | null>(null);
  const prevStatusesRef = useRef<Record<string, string>>({});

  useEffect(() => {
    const interval = setInterval(refreshPlaylists, 5000);
    return () => clearInterval(interval);
  }, [refreshPlaylists]);

  useEffect(() => {
    for (const pl of playlists as (PlaylistSummary & { scanLogs?: ScanLogExtended[] })[]) {
      const prev = prevStatusesRef.current[pl.id];
      const log = pl.scanLogs?.[0];
      if (prev === "PENDING" && pl.scanStatus === "OK" && log) {
        setImportSummary({
          summary: log,
          playlistName: pl.name,
        });
      }
    }
    prevStatusesRef.current = Object.fromEntries(
      playlists.map((p) => [p.id, p.scanStatus])
    );
  }, [playlists]);

  async function handleImport(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    setSuccess("");

    const res = await fetch("/api/playlists/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, url, epgUrl: epgUrl || undefined }),
    });

    const data = await res.json();
    setLoading(false);

    if (!res.ok) {
      setError(data.error ?? "Erreur lors de l'import");
      return;
    }

    setSuccess("Import lancé en arrière-plan. Le scan peut prendre quelques minutes.");
    setName("");
    setUrl("");
    setEpgUrl("");
    refreshPlaylists();
  }

  async function deletePlaylist(id: string) {
    if (!confirm("Supprimer cette playlist et toutes ses chaînes ?")) return;
    setDeletingId(id);
    await fetch(`/api/playlists?id=${id}`, { method: "DELETE" });
    setDeletingId(null);
    refreshPlaylists();
  }

  async function rescanPlaylist(id: string) {
    setScanningId(id);
    await fetch(`/api/playlists/scan?id=${id}`, { method: "POST" });
    setScanningId(null);
    setSuccess("Rescan lancé en arrière-plan.");
    refreshPlaylists();
  }

  return (
    <>
      {importSummary && (
        <ImportSummaryModal
          summary={importSummary.summary}
          playlistName={importSummary.playlistName}
          onClose={() => setImportSummary(null)}
        />
      )}

      <div className="mx-auto flex max-w-5xl flex-col gap-6 p-6 lg:flex-row lg:p-8">
        <nav className="flex shrink-0 gap-1 overflow-x-auto lg:w-52 lg:flex-col">
          {SECTIONS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setSection(id)}
              className={cn(
                "tv-focus focus-ring flex items-center gap-2 whitespace-nowrap rounded-xl px-3 py-2.5 text-sm transition-colors lg:w-full lg:px-4",
                section === id
                  ? "bg-primary/15 text-primary"
                  : "text-muted hover:bg-surface-hover hover:text-foreground"
              )}
            >
              <Icon className="h-4 w-4" />
              {label}
            </button>
          ))}
        </nav>

        <div className="min-w-0 flex-1 space-y-6">
          <PageHeader
            title="Paramètres"
            description={SECTIONS.find((s) => s.id === section)?.label ?? ""}
            icon={<Settings className="h-7 w-7 text-primary" />}
          />

          {section === "playlists" && (
            <>
              {playlists.length === 0 && (
                <DemoPlaylistsImport onImported={refreshPlaylists} />
              )}

              <form
                onSubmit={handleImport}
                className="animate-fade-in space-y-4 rounded-2xl border border-border bg-surface p-6"
              >
                <div className="flex items-center gap-2">
                  <Plus className="h-5 w-5 text-primary" />
                  <h2 className="font-semibold">Importer une playlist M3U</h2>
                </div>

                <div>
                  <label className="mb-1.5 block text-sm text-muted">Nom</label>
                  <Input required value={name} onChange={(e) => setName(e.target.value)} placeholder="Ma playlist" />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm text-muted">URL M3U / M3U8</label>
                  <Input required type="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://exemple.com/playlist.m3u" />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm text-muted">URL EPG (XMLTV) — optionnel</label>
                  <Input type="url" value={epgUrl} onChange={(e) => setEpgUrl(e.target.value)} placeholder="https://exemple.com/epg.xml" />
                </div>

                {error && <p className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>}
                {success && <p className="rounded-lg bg-accent/10 px-3 py-2 text-sm text-accent">{success}</p>}

                <Button type="submit" disabled={loading} className="w-full">
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                  {loading ? "Import en cours..." : "Importer la playlist"}
                </Button>
              </form>

              <div className="space-y-3">
                <h2 className="font-semibold">Mes playlists</h2>
                {playlists.length === 0 ? (
                  <p className="text-sm text-muted">Aucune playlist importée — utilisez l&apos;import ci-dessus.</p>
                ) : (
                  playlists.map((pl) => {
                    const status = STATUS_LABELS[pl.scanStatus] ?? STATUS_LABELS.PENDING;
                    const lastLog = (pl as PlaylistSummary & { scanLogs?: ScanLogExtended[] }).scanLogs?.[0];
                    return (
                      <div key={pl.id} className="rounded-xl border border-border bg-surface p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-center gap-3">
                            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                              <Tv className="h-5 w-5 text-primary" />
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <p className="font-medium">{pl.name}</p>
                                <Badge variant={status.variant}>{status.label}</Badge>
                              </div>
                              <p className="text-sm text-muted">
                                {pl.channelCount || pl._count?.channels || 0} chaîne(s)
                                {pl.epgUrl && " · EPG activé"}
                              </p>
                              {pl.lastScanAt && (
                                <p className="text-xs text-muted">
                                  Dernier scan : {new Date(pl.lastScanAt).toLocaleString("fr-FR")}
                                </p>
                              )}
                              {lastLog && (
                                <p className="text-xs text-muted">
                                  {lastLog.offlineCount > 0 && `${lastLog.offlineCount} hors ligne · `}
                                  {lastLog.durationMs && `${(lastLog.durationMs / 1000).toFixed(1)} s · `}
                                  {(lastLog.missingLogoCount ?? 0) > 0 && `${lastLog.missingLogoCount} logos manquants`}
                                </p>
                              )}
                            </div>
                          </div>
                          <div className="flex gap-1">
                            <button
                              onClick={() => rescanPlaylist(pl.id)}
                              disabled={scanningId === pl.id || pl.scanStatus === "PENDING"}
                              className={cn(
                                "tv-focus focus-ring rounded-lg p-2 text-muted hover:bg-primary/10 hover:text-primary",
                                pl.scanStatus === "PENDING" && "animate-pulse"
                              )}
                            >
                              {scanningId === pl.id || pl.scanStatus === "PENDING" ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <RefreshCw className="h-4 w-4" />
                              )}
                            </button>
                            <button
                              onClick={() => deletePlaylist(pl.id)}
                              disabled={deletingId === pl.id}
                              className="tv-focus focus-ring rounded-lg p-2 text-muted hover:bg-danger/10 hover:text-danger"
                            >
                              {deletingId === pl.id ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <Trash2 className="h-4 w-4" />
                              )}
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </>
          )}

          {section === "sync" && (
            <div className="space-y-4">
              <div className="rounded-xl border border-border bg-surface p-4">
                <label className="mb-2 block text-sm font-medium">Intervalle de rescan automatique</label>
                <select
                  value={settings.syncIntervalHours}
                  onChange={(e) => updateSetting("syncIntervalHours", Number(e.target.value))}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                >
                  <option value={12}>12 heures</option>
                  <option value={24}>24 heures</option>
                  <option value={48}>48 heures</option>
                </select>
                <p className="mt-2 text-xs text-muted">
                  Le cron serveur rescanne les playlists selon cet intervalle (placeholder UI).
                </p>
              </div>
              <PlaceholderSection
                title="Synchronisation EPG"
                description="Rafraîchissement automatique du guide TV — configurable prochainement."
              />
            </div>
          )}

          {section === "playback" && (
            <div className="space-y-4">
              <label className="flex items-center justify-between rounded-xl border border-border bg-surface p-4">
                <span className="text-sm font-medium">Lecture automatique</span>
                <input
                  type="checkbox"
                  checked={settings.autoplay}
                  onChange={(e) => updateSetting("autoplay", e.target.checked)}
                  className="h-4 w-4 accent-primary"
                />
              </label>
              <div className="rounded-xl border border-border bg-surface p-4">
                <label className="mb-2 block text-sm font-medium">Volume par défaut ({settings.defaultVolume}%)</label>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={settings.defaultVolume}
                  onChange={(e) => updateSetting("defaultVolume", Number(e.target.value))}
                  className="w-full accent-primary"
                />
              </div>
            </div>
          )}

          {section === "epg" && (
            <div className="space-y-4">
              <div className="rounded-xl border border-border bg-surface p-4">
                <label className="mb-2 block text-sm font-medium">Jours affichés dans le guide</label>
                <select
                  value={settings.epgDaysAhead}
                  onChange={(e) => updateSetting("epgDaysAhead", Number(e.target.value))}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                >
                  <option value={1}>1 jour</option>
                  <option value={3}>3 jours</option>
                  <option value={7}>7 jours</option>
                </select>
              </div>
              <label className="flex items-center justify-between rounded-xl border border-border bg-surface p-4">
                <span className="text-sm font-medium">Guide compact</span>
                <input
                  type="checkbox"
                  checked={settings.compactGuide}
                  onChange={(e) => updateSetting("compactGuide", e.target.checked)}
                  className="h-4 w-4 accent-primary"
                />
              </label>
            </div>
          )}

          {section === "app" && (
            <PlaceholderSection
              title="Application"
              description="Langue, notifications et compte — à venir dans une prochaine version."
            />
          )}

          {section === "appearance" && (
            <div className="rounded-xl border border-border bg-surface p-4">
              <label className="mb-2 block text-sm font-medium">Thème</label>
              <select
                value={settings.theme}
                onChange={(e) => updateSetting("theme", e.target.value as "dark" | "light" | "system")}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
              >
                <option value="dark">Sombre</option>
                <option value="light">Clair</option>
                <option value="system">Système</option>
              </select>
            </div>
          )}

          {section === "shortcuts" && (
            <div className="rounded-xl border border-border bg-surface p-4 text-sm">
              <h3 className="mb-3 font-semibold">Raccourcis lecteur</h3>
              <ul className="space-y-2 text-muted">
                <li><kbd className="rounded bg-background px-1.5 py-0.5">Espace</kbd> ou <kbd className="rounded bg-background px-1.5 py-0.5">K</kbd> — Lecture / Pause</li>
                <li><kbd className="rounded bg-background px-1.5 py-0.5">M</kbd> — Couper / activer le son</li>
                <li><kbd className="rounded bg-background px-1.5 py-0.5">F</kbd> — Plein écran</li>
              </ul>
              <h3 className="mb-3 mt-4 font-semibold">Navigation</h3>
              <ul className="space-y-2 text-muted">
                <li><kbd className="rounded bg-background px-1.5 py-0.5">←</kbd> <kbd className="rounded bg-background px-1.5 py-0.5">→</kbd> — Changer de section</li>
                <li><kbd className="rounded bg-background px-1.5 py-0.5">Esc</kbd> — Retour à l&apos;accueil</li>
              </ul>
            </div>
          )}

          <p className="text-xs leading-relaxed text-muted">
            StreamTV ne fournit aucun contenu. Vous devez disposer de vos propres
            playlists et flux auxquels vous avez légalement accès.
          </p>
        </div>
      </div>
    </>
  );
}
