"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { Calendar, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { formatTime } from "@/lib/utils";
import { cn } from "@/lib/utils";

type Program = {
  id: string;
  title: string;
  description?: string | null;
  start: string;
  end: string;
  channel: { id: string; name: string; logo?: string | null; group?: string | null };
};

export default function GuidePage() {
  const [programs, setPrograms] = useState<Program[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");

  useEffect(() => {
    fetch("/api/epg")
      .then((r) => r.json())
      .then((data) => {
        setPrograms(data.programs ?? []);
        setLoading(false);
      });
  }, []);

  const filtered = useMemo(() => {
    if (!query.trim()) return programs;
    const q = query.toLowerCase();
    return programs.filter(
      (p) =>
        p.title.toLowerCase().includes(q) ||
        p.channel.name.toLowerCase().includes(q)
    );
  }, [programs, query]);

  const grouped = useMemo(
    () =>
      filtered.reduce<Record<string, Program[]>>((acc, p) => {
        const key = p.channel.name;
        (acc[key] ??= []).push(p);
        return acc;
      }, {}),
    [filtered]
  );

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6 lg:p-8">
        <PageHeader
          title="Guide TV"
          description="Programmes en cours et à venir (24 h)"
          icon={<Calendar className="h-7 w-7 text-accent" />}
        />

        <Input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filtrer par chaîne ou programme..."
          icon={<Search className="h-4 w-4" />}
        />

        {loading ? (
          <div className="space-y-6">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="space-y-3">
                <Skeleton className="h-6 w-48" />
                <Skeleton className="h-20 w-full" />
                <Skeleton className="h-20 w-full" />
              </div>
            ))}
          </div>
        ) : programs.length === 0 ? (
          <EmptyState
            icon={<Calendar className="h-6 w-6" />}
            title="Guide TV vide"
            description="Ajoutez une URL EPG (XMLTV) lors de l'import de votre playlist pour afficher les programmes."
          />
        ) : Object.keys(grouped).length === 0 ? (
          <EmptyState
            icon={<Search className="h-6 w-6" />}
            title="Aucun résultat"
            description="Aucun programme ne correspond à votre recherche."
          />
        ) : (
          <div className="space-y-8">
            {Object.entries(grouped).map(([channelName, progs], sectionIdx) => (
              <section
                key={channelName}
                className="animate-fade-in"
                style={{ animationDelay: `${sectionIdx * 0.05}s` }}
              >
                <div className="mb-4 flex items-center gap-3">
                  {progs[0].channel.logo ? (
                    <div className="relative h-9 w-9 overflow-hidden rounded-lg bg-background ring-1 ring-border-subtle">
                      <Image
                        src={progs[0].channel.logo}
                        alt=""
                        fill
                        className="object-contain p-1"
                        unoptimized
                      />
                    </div>
                  ) : (
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/15 text-sm font-bold text-primary">
                      {channelName.charAt(0)}
                    </div>
                  )}
                  <div>
                    <h2 className="font-semibold">{channelName}</h2>
                    {progs[0].channel.group && (
                      <p className="text-xs text-muted">{progs[0].channel.group}</p>
                    )}
                  </div>
                </div>

                <div className="space-y-2">
                  {progs.map((p) => {
                    const now = new Date();
                    const live =
                      new Date(p.start) <= now && new Date(p.end) >= now;
                    const upcoming = new Date(p.start) > now;

                    return (
                      <article
                        key={p.id}
                        className={cn(
                          "rounded-xl border p-4 transition-all",
                          live
                            ? "border-accent/40 bg-accent/5"
                            : "border-border bg-surface hover:bg-surface-hover"
                        )}
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              {live && <Badge variant="live">EN DIRECT</Badge>}
                              {upcoming && !live && (
                                <Badge variant="default">À venir</Badge>
                              )}
                              <h3 className="font-medium">{p.title}</h3>
                            </div>
                            {p.description && (
                              <p className="mt-1.5 line-clamp-2 text-sm text-muted">
                                {p.description}
                              </p>
                            )}
                          </div>
                          <time className="shrink-0 rounded-lg bg-background px-2.5 py-1 text-sm text-muted">
                            {formatTime(p.start)} – {formatTime(p.end)}
                          </time>
                        </div>
                      </article>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        )}
    </div>
  );
}
