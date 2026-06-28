"use client";

import { createContext, useContext, useState, type ReactNode } from "react";

export type AppSettings = {
  autoplay: boolean;
  defaultVolume: number;
  epgDaysAhead: number;
  syncIntervalHours: number;
  compactGuide: boolean;
  theme: "dark" | "light" | "system";
  subtitlesEnabled: boolean;
};

const defaultSettings: AppSettings = {
  autoplay: true,
  defaultVolume: 80,
  epgDaysAhead: 1,
  syncIntervalHours: 24,
  compactGuide: false,
  theme: "dark",
  subtitlesEnabled: false,
};

type SettingsContextValue = {
  settings: AppSettings;
  updateSetting: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => void;
};

const SettingsContext = createContext<SettingsContextValue>({
  settings: defaultSettings,
  updateSetting: () => {},
});

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<AppSettings>(defaultSettings);

  const updateSetting = <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
  };

  return (
    <SettingsContext.Provider value={{ settings, updateSetting }}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  return useContext(SettingsContext);
}
