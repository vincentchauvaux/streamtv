"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { ChannelItem } from "@/types/channel";

type RecommendationContextValue = {
  recommendations: ChannelItem[];
  loading: boolean;
  refresh: () => Promise<void>;
  updateFavorite: (channelId: string, isFavorite: boolean) => void;
};

const RecommendationContext = createContext<RecommendationContextValue>({
  recommendations: [],
  loading: true,
  refresh: async () => {},
  updateFavorite: () => {},
});

export function RecommendationProvider({ children }: { children: ReactNode }) {
  const [recommendations, setRecommendations] = useState<ChannelItem[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = async () => {
    const res = await fetch("/api/recommendations");
    const data = await res.json();
    setRecommendations(data.channels ?? []);
    setLoading(false);
  };

  const updateFavorite = (channelId: string, isFavorite: boolean) => {
    setRecommendations((prev) =>
      prev.map((c) => (c.id === channelId ? { ...c, isFavorite } : c))
    );
  };

  useEffect(() => {
    void refresh();
  }, []);

  return (
    <RecommendationContext.Provider
      value={{ recommendations, loading, refresh, updateFavorite }}
    >
      {children}
    </RecommendationContext.Provider>
  );
}

export function useRecommendations() {
  return useContext(RecommendationContext);
}
