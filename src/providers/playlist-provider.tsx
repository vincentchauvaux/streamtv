"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { PlaylistSummary } from "@/types/playlist";

type PlaylistContextValue = {
  playlists: PlaylistSummary[];
  loading: boolean;
  refresh: () => Promise<void>;
};

const PlaylistContext = createContext<PlaylistContextValue>({
  playlists: [],
  loading: true,
  refresh: async () => {},
});

export function PlaylistProvider({ children }: { children: ReactNode }) {
  const [playlists, setPlaylists] = useState<PlaylistSummary[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = async () => {
    const res = await fetch("/api/playlists");
    const data = await res.json();
    setPlaylists(data.playlists ?? []);
    setLoading(false);
  };

  useEffect(() => {
    void refresh();
  }, []);

  return (
    <PlaylistContext.Provider value={{ playlists, loading, refresh }}>
      {children}
    </PlaylistContext.Provider>
  );
}

export function usePlaylists() {
  return useContext(PlaylistContext);
}
