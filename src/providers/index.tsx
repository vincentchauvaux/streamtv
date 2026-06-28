"use client";

import type { ReactNode } from "react";
import { AuthProvider } from "./auth-provider";
import { PlayerProvider } from "./player-provider";
import { PlaylistProvider } from "./playlist-provider";
import { RecommendationProvider } from "./recommendation-provider";
import { SettingsProvider } from "./settings-provider";
import { ThemeProvider } from "./theme-provider";

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <AuthProvider>
      <SettingsProvider>
        <ThemeProvider>
          <PlaylistProvider>
            <PlayerProvider>
              <RecommendationProvider>{children}</RecommendationProvider>
            </PlayerProvider>
          </PlaylistProvider>
        </ThemeProvider>
      </SettingsProvider>
    </AuthProvider>
  );
}

export * from "./auth-provider";
export * from "./player-provider";
export * from "./playlist-provider";
export * from "./recommendation-provider";
export * from "./settings-provider";
export * from "./theme-provider";
