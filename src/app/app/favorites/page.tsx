"use client";

import { useEffect, useState } from "react";
import { Heart } from "lucide-react";
import { ChannelCard, type ChannelItem } from "@/components/channel-card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { ChannelCardSkeleton } from "@/components/ui/skeleton";
import { useAppPlayer } from "@/providers/player-provider";
import { PlayerSlot } from "@/components/player-slot";

const CATEGORY_LABELS: Record<string, string> = {
  NEWS: "Actualités",
  SPORTS: "Sport",
  MOVIES: "Films",
  KIDS: "Jeunesse",
  OTHER: "Autres favoris",
};

export default function FavoritesPage() {
  const { current, playChannel, clear } = useAppPlayer();
  const [groups, setGroups] = useState<Record<string, ChannelItem[]>>({});
  const [loading, setLoading] = useState(true);
  const totalCount = Object.values(groups).reduce((n, arr) => n + arr.length, 0);

  useEffect(() => {
    fetch("/api/favorites?grouped=true")
      .then((r) => r.json())
      .then((data) => {
        setGroups(data.groups ?? {});
        setLoading(false);
      });
  }, []);

  async function removeFavorite(channel: ChannelItem) {
    await fetch(`/api/favorites?channelId=${channel.id}`, { method: "DELETE" });
    setGroups((prev) => {
      const next = { ...prev };
      for (const key of Object.keys(next)) {
        next[key] = next[key].filter((c) => c.id !== channel.id);
      }
      return next;
    });
    if (current?.id === channel.id) clear();
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6 lg:p-8">
        <PageHeader
          title="Favoris"
          description={`${totalCount} chaîne${totalCount !== 1 ? "s" : ""} sauvegardée${totalCount !== 1 ? "s" : ""}`}
          icon={<Heart className="h-7 w-7 fill-danger text-danger" />}
        />

        <PlayerSlot />

        {loading ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <ChannelCardSkeleton key={i} />
            ))}
          </div>
        ) : totalCount === 0 ? (
          <EmptyState
            icon={<Heart className="h-6 w-6" />}
            title="Aucun favori"
            description="Cliquez sur le cœur d'une chaîne pour l'ajouter à vos favoris synchronisés."
          />
        ) : (
          <div className="space-y-8">
            {Object.entries(groups)
              .filter(([, items]) => items.length > 0)
              .map(([category, items]) => (
                <section key={category}>
                  <h2 className="mb-4 text-lg font-semibold">
                    {CATEGORY_LABELS[category] ?? category}
                  </h2>
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {items.map((channel) => (
                      <ChannelCard
                        key={channel.id}
                        channel={{ ...channel, isFavorite: true }}
                        onPlay={(ch) => playChannel(ch)}
                        onToggleFavorite={removeFavorite}
                        active={current?.id === channel.id}
                      />
                    ))}
                  </div>
                </section>
              ))}
          </div>
        )}
    </div>
  );
}
