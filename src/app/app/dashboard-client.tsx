"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Clock, Heart, Sparkles, Tv, Calendar, List } from "lucide-react";
import { ChannelCard } from "@/components/channel-card";
import { PlayerSlot } from "@/components/player-slot";
import { Button } from "@/components/ui/button";
import { ChannelCardSkeleton } from "@/components/ui/skeleton";
import type { ChannelItem } from "@/types/channel";
import { DemoPlaylistsImport } from "@/components/demo-playlists-import";
import { usePlaylists } from "@/providers/playlist-provider";
import { useRecommendations } from "@/providers/recommendation-provider";
import { useAppPlayer } from "@/providers/player-provider";

type HistoryEntry = {
  channelId: string;
  positionSec: number;
  channel: ChannelItem;
};

type Stats = {
  channelCount: number;
  playlistCount: number;
  favoriteCount: number;
  programsToday: number;
  offlineCount: number;
};

function StatCard({
  label,
  value,
  icon: Icon,
  accent,
}: {
  label: string;
  value: number;
  icon: React.ComponentType<{ className?: string }>;
  accent?: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted">{label}</p>
        <Icon className={`h-4 w-4 ${accent ?? "text-primary"}`} />
      </div>
      <p className="mt-1 text-2xl font-bold">{value.toLocaleString("fr-FR")}</p>
    </div>
  );
}

export function DashboardClient({ userName }: { userName: string }) {
  const { current, playChannel } = useAppPlayer();
  const { playlists, loading: playlistsLoading, refresh: refreshPlaylists } = usePlaylists();
  const { recommendations, loading: recLoading, updateFavorite } = useRecommendations();
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [historyLoading, setHistoryLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch("/api/watch-history").then((r) => r.json()),
      fetch("/api/stats").then((r) => r.json()),
    ]).then(([hist, st]) => {
      setHistory(hist.history ?? []);
      setStats(st.stats ?? null);
      setHistoryLoading(false);
    });
  }, []);

  async function toggleFavorite(channel: ChannelItem) {
    const method = channel.isFavorite ? "DELETE" : "POST";
    const url =
      method === "DELETE"
        ? `/api/favorites?channelId=${channel.id}`
        : "/api/favorites";

    await fetch(url, {
      method,
      headers: method === "POST" ? { "Content-Type": "application/json" } : undefined,
      body: method === "POST" ? JSON.stringify({ channelId: channel.id }) : undefined,
    });

    updateFavorite(channel.id, !channel.isFavorite);
  }

  const loading = playlistsLoading || recLoading || historyLoading;
  const displayName = userName.includes("@") ? userName.split("@")[0] : userName;

  return (
    <div className="mx-auto max-w-6xl space-y-8 p-6 lg:p-8">
      <header className="animate-fade-in">
        <p className="text-sm text-muted">Bonjour,</p>
        <h1 className="text-2xl font-bold tracking-tight lg:text-3xl">
          {displayName}
        </h1>
      </header>

      {stats && (
        <section className="animate-fade-in grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Chaînes" value={stats.channelCount} icon={Tv} />
          <StatCard label="Playlists" value={stats.playlistCount} icon={List} accent="text-accent" />
          <StatCard label="Favoris" value={stats.favoriteCount} icon={Heart} accent="text-danger" />
          <StatCard label="Programmes aujourd'hui" value={stats.programsToday} icon={Calendar} />
        </section>
      )}

      <PlayerSlot emptyState className="animate-fade-in" />

      {!loading && playlists.length === 0 && (
        <div className="animate-fade-in stagger-1 rounded-2xl border border-dashed border-primary/30 bg-primary/5 p-8">
          <div className="mb-6 text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/15">
              <Tv className="h-7 w-7 text-primary" />
            </div>
            <h2 className="font-semibold">Commencez ici</h2>
            <p className="mx-auto mt-2 max-w-md text-sm text-muted">
              Aucune chaîne pour le moment. Importez des playlists gratuites et légales en un clic,
              ou ajoutez votre propre liste M3U.
            </p>
          </div>
          <DemoPlaylistsImport compact onImported={refreshPlaylists} />
          <div className="mt-4 text-center">
            <Link href="/app/settings">
              <Button variant="secondary" size="sm">Ajouter une playlist manuelle</Button>
            </Link>
          </div>
        </div>
      )}

      {loading ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <ChannelCardSkeleton key={i} />
          ))}
        </div>
      ) : (
        <>
          {history.length > 0 && (
            <section className="animate-fade-in stagger-2">
              <div className="mb-4 flex items-center gap-2">
                <Clock className="h-5 w-5 text-accent" />
                <h2 className="text-lg font-semibold">Reprendre</h2>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {history.slice(0, 6).map((entry) => (
                  <ChannelCard
                    key={entry.channelId}
                    channel={entry.channel}
                    onPlay={(ch) => playChannel(ch, entry.positionSec)}
                    active={current?.id === entry.channelId}
                    compact
                  />
                ))}
              </div>
            </section>
          )}

          {recommendations.length > 0 && (
            <section className="animate-fade-in stagger-3">
              <div className="mb-4 flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-primary" />
                <h2 className="text-lg font-semibold">Recommandé pour vous</h2>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {recommendations.map((channel) => (
                  <ChannelCard
                    key={channel.id}
                    channel={channel}
                    onPlay={playChannel}
                    onToggleFavorite={toggleFavorite}
                    active={current?.id === channel.id}
                  />
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
