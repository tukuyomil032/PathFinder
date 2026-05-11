import type { DLSiteWork } from "./types";

type CacheEntry = {
  expiresAt: number;
  value: DLSiteWork;
};

export type RjCache = {
  get(rjCode: string): DLSiteWork | null;
  set(rjCode: string, work: DLSiteWork): void;
  clear(): void;
};

export function createRjCache(ttlMs: number, now: () => number = Date.now): RjCache {
  const store = new Map<string, CacheEntry>();

  return {
    get(rjCode) {
      const key = rjCode.toUpperCase();
      const entry = store.get(key);

      if (!entry) {
        return null;
      }

      if (entry.expiresAt <= now()) {
        store.delete(key);
        return null;
      }

      return entry.value;
    },
    set(rjCode, work) {
      store.set(rjCode.toUpperCase(), {
        expiresAt: now() + ttlMs,
        value: work,
      });
    },
    clear() {
      store.clear();
    },
  };
}
