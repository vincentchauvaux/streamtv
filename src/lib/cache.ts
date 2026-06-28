type CacheEntry<T> = {
  value: T;
  expiresAt: number;
};

export interface CacheStore {
  get<T>(key: string): T | undefined;
  set<T>(key: string, value: T, ttlMs?: number): void;
  delete(key: string): void;
  clear(): void;
}

const DEFAULT_TTL_MS = 5 * 60 * 1000;

class MemoryCache implements CacheStore {
  private store = new Map<string, CacheEntry<unknown>>();

  get<T>(key: string): T | undefined {
    const entry = this.store.get(key);
    if (!entry) return undefined;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return undefined;
    }
    return entry.value as T;
  }

  set<T>(key: string, value: T, ttlMs = DEFAULT_TTL_MS): void {
    this.store.set(key, { value, expiresAt: Date.now() + ttlMs });
  }

  delete(key: string): void {
    this.store.delete(key);
  }

  clear(): void {
    this.store.clear();
  }
}

/** Cache en mémoire — API identique pour migration Redis future */
export const cache: CacheStore = new MemoryCache();

export const cacheKeys = {
  channelGroups: (userId: string) => `groups:${userId}`,
  epgPrograms: (userId: string, channelId?: string) =>
    `epg:${userId}:${channelId ?? "all"}`,
  stats: (userId: string) => `stats:${userId}`,
};
