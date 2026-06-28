"use client";

import { useEffect, useState } from "react";
import {
  Activity,
  AlertTriangle,
  Clock,
  Loader2,
  Radio,
  Tv,
  WifiOff,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/ui/page-header";

type Health = {
  channelCount: number;
  offlineCount: number;
  lastScanAt: string | null;
  lastImportDurationMs: number | null;
  recentErrors: Array<{
    id: string;
    playlistName: string;
    errors: string | null;
    createdAt: string;
  }>;
  playlists: Array<{
    id: string;
    name: string;
    scanStatus: string;
    channelCount: number;
    lastScanAt: string | null;
  }>;
};

const STATUS_VARIANT: Record<string, "default" | "live" | "danger"> = {
  OK: "live",
  ERROR: "danger",
  PENDING: "default",
};

export default function AdminPage() {
  const [health, setHealth] = useState<Health | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/admin")
      .then((r) => r.json())
      .then((data) => {
        setHealth(data.health ?? null);
        setLoading(false);
      });
    const interval = setInterval(() => {
      fetch("/api/admin")
        .then((r) => r.json())
        .then((data) => setHealth(data.health ?? null));
    }, 10000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="mx-auto max-w-4xl space-y-8 p-6 lg:p-8">
        <PageHeader
          title="Monitoring"
          description="État du système et santé des playlists"
          icon={<Activity className="h-7 w-7 text-primary" />}
        />

        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : health ? (
          <>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-xl border border-border bg-surface p-4">
                <div className="flex items-center gap-2 text-sm text-muted">
                  <Tv className="h-4 w-4" />
                  Chaînes
                </div>
                <p className="mt-1 text-2xl font-bold">{health.channelCount}</p>
              </div>
              <div className="rounded-xl border border-border bg-surface p-4">
                <div className="flex items-center gap-2 text-sm text-muted">
                  <WifiOff className="h-4 w-4 text-danger" />
                  Hors ligne
                </div>
                <p className="mt-1 text-2xl font-bold text-danger">{health.offlineCount}</p>
              </div>
              <div className="rounded-xl border border-border bg-surface p-4">
                <div className="flex items-center gap-2 text-sm text-muted">
                  <Clock className="h-4 w-4" />
                  Dernier scan
                </div>
                <p className="mt-1 text-sm font-medium">
                  {health.lastScanAt
                    ? new Date(health.lastScanAt).toLocaleString("fr-FR")
                    : "—"}
                </p>
              </div>
              <div className="rounded-xl border border-border bg-surface p-4">
                <div className="flex items-center gap-2 text-sm text-muted">
                  <Radio className="h-4 w-4" />
                  Durée import
                </div>
                <p className="mt-1 text-sm font-medium">
                  {health.lastImportDurationMs != null
                    ? `${(health.lastImportDurationMs / 1000).toFixed(1)} s`
                    : "—"}
                </p>
              </div>
            </div>

            <section className="space-y-3">
              <h2 className="font-semibold">Playlists</h2>
              {health.playlists.map((pl) => (
                <div
                  key={pl.id}
                  className="flex items-center justify-between rounded-xl border border-border bg-surface p-4"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-medium">{pl.name}</p>
                      <Badge variant={STATUS_VARIANT[pl.scanStatus] ?? "default"}>
                        {pl.scanStatus}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted">
                      {pl.channelCount} chaînes
                      {pl.lastScanAt &&
                        ` · ${new Date(pl.lastScanAt).toLocaleString("fr-FR")}`}
                    </p>
                  </div>
                </div>
              ))}
            </section>

            {health.recentErrors.length > 0 && (
              <section className="space-y-3">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-danger" />
                  <h2 className="font-semibold">Erreurs récentes</h2>
                </div>
                {health.recentErrors.map((err) => (
                  <div
                    key={err.id}
                    className="rounded-xl border border-danger/30 bg-danger/5 p-4 text-sm"
                  >
                    <p className="font-medium">{err.playlistName}</p>
                    <p className="text-muted">
                      {new Date(err.createdAt).toLocaleString("fr-FR")}
                    </p>
                    {err.errors && (
                      <p className="mt-2 whitespace-pre-wrap text-danger">{err.errors}</p>
                    )}
                  </div>
                ))}
              </section>
            )}
          </>
        ) : (
          <p className="text-muted">Impossible de charger les données de monitoring.</p>
        )}
    </div>
  );
}
