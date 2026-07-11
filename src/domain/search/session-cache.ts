import type { SearchQuery, SearchResultItem } from "./types";

export type SearchSession = {
  token: string;
  query: SearchQuery;
  items: SearchResultItem[];
  nextRawPage: number;
  exhausted: boolean;
  displayOffset: number;
  channelId: string;
  messageId: string | null;
};

export type SearchSessionCache = {
  get(token: string): SearchSession | null;
  set(token: string, session: SearchSession): void;
  delete(token: string): void;
};

type CacheEntry = {
  expiresAt: number;
  value: SearchSession;
};

export function createSearchSessionCache(
  ttlMs: number,
  now: () => number = Date.now,
): SearchSessionCache {
  const store = new Map<string, CacheEntry>();

  return {
    get(token) {
      const entry = store.get(token);

      if (!entry) {
        return null;
      }

      if (entry.expiresAt <= now()) {
        store.delete(token);
        return null;
      }

      return entry.value;
    },
    set(token, session) {
      store.set(token, {
        expiresAt: now() + ttlMs,
        value: session,
      });
    },
    delete(token) {
      store.delete(token);
    },
  };
}
