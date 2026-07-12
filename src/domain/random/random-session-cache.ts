import type { WorkPreview } from "../rj/types";
import type { SearchResultItem } from "../search/types";

export type RandomResolvedWork = { item: SearchResultItem; work: WorkPreview };

export type RandomSession = {
  token: string;
  results: RandomResolvedWork[];
  currentIndex: number;
  channelId: string;
  messageId: string | null;
};

export type RandomSessionCache = {
  get(token: string): RandomSession | null;
  set(token: string, session: RandomSession): void;
  delete(token: string): void;
};

type CacheEntry = {
  expiresAt: number;
  value: RandomSession;
};

/**
 * /randomのページングセッション用TTLキャッシュ。domain/search/session-cache.tsと
 * 同型のnow注入パターンを踏襲する。/searchのセッションキャッシュとは別インスタンスで、
 * 複製規模が小さい（TTL Mapのみ）ため共通化はしない。
 */
export function createRandomSessionCache(
  ttlMs: number,
  now: () => number = Date.now,
): RandomSessionCache {
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
