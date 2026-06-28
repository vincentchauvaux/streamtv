"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { ChannelItem } from "@/types/channel";

const CHANNEL_SWITCH_DEBOUNCE_MS = 200;

type PlayerContextValue = {
  current: ChannelItem | null;
  resumePosition: number;
  /** Conteneur in-page actif où le lecteur persistant doit s'afficher (portail). */
  slot: HTMLElement | null;
  /** Enregistre l'emplacement in-page du lecteur (appelé par <PlayerSlot/>). */
  registerSlot: (el: HTMLElement | null) => void;
  /** Libère l'emplacement (ne nettoie que s'il correspond toujours). */
  unregisterSlot: (el: HTMLElement | null) => void;
  playChannel: (channel: ChannelItem, position?: number) => void;
  clear: () => void;
};

const AppPlayerContext = createContext<PlayerContextValue>({
  current: null,
  resumePosition: 0,
  slot: null,
  registerSlot: () => {},
  unregisterSlot: () => {},
  playChannel: () => {},
  clear: () => {},
});

export function PlayerProvider({ children }: { children: ReactNode }) {
  const [current, setCurrent] = useState<ChannelItem | null>(null);
  const [resumePosition, setResumePosition] = useState(0);
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingRef = useRef<{ channel: ChannelItem; position: number } | null>(null);

  const registerSlot = useCallback((el: HTMLElement | null) => {
    setSlot(el);
  }, []);

  const unregisterSlot = useCallback((el: HTMLElement | null) => {
    setSlot((prev) => (prev === el ? null : prev));
  }, []);

  const playChannel = useCallback((channel: ChannelItem, position = 0) => {
    pendingRef.current = { channel, position };
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      const pending = pendingRef.current;
      if (pending) {
        setCurrent(pending.channel);
        setResumePosition(pending.position);
      }
      debounceRef.current = null;
    }, CHANNEL_SWITCH_DEBOUNCE_MS);
  }, []);

  const clear = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = null;
    pendingRef.current = null;
    setCurrent(null);
    setResumePosition(0);
  }, []);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  return (
    <AppPlayerContext.Provider
      value={{
        current,
        resumePosition,
        slot,
        registerSlot,
        unregisterSlot,
        playChannel,
        clear,
      }}
    >
      {children}
    </AppPlayerContext.Provider>
  );
}

export function useAppPlayer() {
  return useContext(AppPlayerContext);
}
