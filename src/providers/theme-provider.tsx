"use client";

import { createContext, useContext, useEffect, type ReactNode } from "react";
import { useSettings } from "./settings-provider";

type ThemeContextValue = {
  theme: "dark" | "light" | "system";
};

const ThemeContext = createContext<ThemeContextValue>({ theme: "dark" });

export function ThemeProvider({ children }: { children: ReactNode }) {
  const { settings } = useSettings();

  useEffect(() => {
    const root = document.documentElement;
    const theme = settings.theme === "system"
      ? (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light")
      : settings.theme;
    root.classList.toggle("dark", theme === "dark");
    root.dataset.theme = theme;
  }, [settings.theme]);

  return (
    <ThemeContext.Provider value={{ theme: settings.theme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
