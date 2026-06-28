"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import Link from "next/link";
import { Search, Tv } from "lucide-react";
import { ChannelCard, type ChannelItem } from "@/components/channel-card";
import { Button } from "@/components/ui/button";
import { DemoPlaylistsImport } from "@/components/demo-playlists-import";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { ChannelCardSkeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { useAppPlayer } from "@/providers/player-provider";
import { PlayerSlot } from "@/components/player-slot";

const CATEGORIES = [
  { key: "", label: "Toutes" },
  { key: "news", label: "Actualités" },
  { key: "sports", label: "Sport" },
  { key: "movies", label: "Films" },
  { key: "kids", label: "Jeunesse" },
];

export default function ChannelsPage() {
  const [channels, setChannels] = useState<ChannelItem[]>([]);
  const [groups, setGroups] = useState<string[]>([]);
  const [playlists, setPlaylists] = useState<{ id: string; name: string }[]>([]);
  const [query, setQuery] = useState("");
  const [group, setGroup] = useState<string | null>(null);
  const [category, setCategory] = useState("");
  const [playlistId, setPlaylistId] = useState("");
  const { current, playChannel } = useAppPlayer();
  const [focusedIndex, setFocusedIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch("/api/channels/groups")
      .then((r) => r.json())
      .then((data) => setGroups(data.groups ?? []));
    fetch("/api/playlists")
      .then((r) => r.json())
      .then((data) =>
        setPlaylists(
          (data.playlists ?? []).map((p: { id: string; name: string }) => ({
            id: p.id,
            name: p.name,
          }))
        )
      );
  }, []);

  const loadChannels = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (query) params.set("q", query);
    if (group) params.set("group", group);
    if (category) params.set("category", category);
    if (playlistId) params.set("playlistId", playlistId);
    const res = await fetch(`/api/channels?${params}`);
    const data = await res.json();
    setChannels(data.channels ?? []);
    setFocusedIndex(0);
    setLoading(false);
  }, [query, group, category, playlistId]);

  useEffect(() => {
    const timer = setTimeout(loadChannels, 300);
    return () => clearTimeout(timer);
  }, [loadChannels]);

  const virtualizer = useVirtualizer({
    count: channels.length,
    getScrollElement: () => listRef.current,
    estimateSize: () => 80,
    overscan: 5,
  });

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (channels.length === 0) return;
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA") return;

      if (e.key === "ArrowDown") {
        e.preventDefault();
        setFocusedIndex((i) => Math.min(i + 1, channels.length - 1));
        virtualizer.scrollToIndex(focusedIndex + 1, { align: "auto" });
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setFocusedIndex((i) => Math.max(i - 1, 0));
        virtualizer.scrollToIndex(Math.max(focusedIndex - 1, 0), { align: "auto" });
      }
      if (e.key === "Enter" && channels[focusedIndex]) {
        e.preventDefault();
        playChannel(channels[focusedIndex]);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [channels, focusedIndex, virtualizer, playChannel]);

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

    setChannels((prev) =>
      prev.map((c) =>
        c.id === channel.id ? { ...c, isFavorite: !c.isFavorite } : c
      )
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6 lg:p-8">
        <PageHeader title="Chaînes" description="Parcourez et lisez vos chaînes IPTV" />

        <PlayerSlot />

        <div className="grid gap-3 sm:grid-cols-2">
          <Input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Rechercher nom, groupe, pays..."
            icon={<Search className="h-4 w-4" />}
          />
          {playlists.length > 1 && (
            <select
              value={playlistId}
              onChange={(e) => setPlaylistId(e.target.value)}
              className="rounded-xl border border-border bg-surface px-4 py-2.5 text-sm tv-focus focus-ring"
            >
              <option value="">Toutes les playlists</option>
              {playlists.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          )}
        </div>

        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
          {CATEGORIES.map((c) => (
            <FilterChip
              key={c.key}
              active={category === c.key}
              onClick={() => setCategory(c.key)}
            >
              {c.label}
            </FilterChip>
          ))}
        </div>

        {groups.length > 0 && (
          <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
            <FilterChip active={!group} onClick={() => setGroup(null)}>
              Tous groupes
            </FilterChip>
            {groups.map((g) => (
              <FilterChip key={g} active={group === g} onClick={() => setGroup(g)}>
                {g}
              </FilterChip>
            ))}
          </div>
        )}

        {loading ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 9 }).map((_, i) => (
              <ChannelCardSkeleton key={i} />
            ))}
          </div>
        ) : channels.length === 0 ? (
          playlists.length === 0 && !query && !group && !category ? (
            <EmptyState
              icon={<Tv className="h-6 w-6" />}
              title="Aucune chaîne"
              description="Importez des playlists gratuites et légales, ou ajoutez votre propre liste M3U dans les paramètres."
              action={
                <div className="space-y-4">
                  <DemoPlaylistsImport compact />
                  <Link href="/app/settings">
                    <Button variant="secondary">Paramètres — playlists</Button>
                  </Link>
                </div>
              }
            />
          ) : (
            <EmptyState
              icon={<Search className="h-6 w-6" />}
              title="Aucune chaîne trouvée"
              description={
                query || group || category
                  ? "Essayez un autre terme ou catégorie."
                  : "Importez une playlist M3U dans les paramètres pour commencer."
              }
            />
          )
        ) : (
          <div
            ref={listRef}
            className="h-[600px] overflow-y-auto rounded-xl"
            style={{ contain: "strict" }}
          >
            <div
              style={{
                height: `${virtualizer.getTotalSize()}px`,
                width: "100%",
                position: "relative",
              }}
            >
              {virtualizer.getVirtualItems().map((virtualRow) => {
                const channel = channels[virtualRow.index];
                return (
                  <div
                    key={channel.id}
                    style={{
                      position: "absolute",
                      top: 0,
                      left: 0,
                      width: "100%",
                      height: `${virtualRow.size}px`,
                      transform: `translateY(${virtualRow.start}px)`,
                    }}
                    className="pb-3"
                  >
                    <ChannelCard
                      channel={channel}
                      onPlay={(ch) => playChannel(ch)}
                      onToggleFavorite={toggleFavorite}
                      active={current?.id === channel.id}
                      tabIndex={virtualRow.index === focusedIndex ? 0 : -1}
                      onFocus={() => setFocusedIndex(virtualRow.index)}
                    />
                  </div>
                );
              })}
            </div>
          </div>
        )}
    </div>
  );
}

function FilterChip({
  children,
  active,
  onClick,
}: {
  children: React.ReactNode;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "tv-focus focus-ring shrink-0 rounded-full px-4 py-2 text-sm font-medium transition-all",
        active
          ? "bg-primary text-white shadow-md shadow-primary/25"
          : "bg-surface text-muted hover:bg-surface-hover hover:text-foreground"
      )}
    >
      {children}
    </button>
  );
}
