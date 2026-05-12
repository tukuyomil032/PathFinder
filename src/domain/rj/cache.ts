import type { WorkPreview, WorkReference } from "./types";

type CacheEntry = {
  expiresAt: number;
  value: WorkPreview;
};

export type RjCache = {
  get(reference: WorkReference | string): WorkPreview | null;
  set(reference: WorkReference | string, work: WorkPreview): void;
  clear(): void;
};

export function createRjCache(ttlMs: number, now: () => number = Date.now): RjCache {
  const store = new Map<string, CacheEntry>();

  return {
    get(reference) {
      const key = toCacheKey(reference);
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
    set(reference, work) {
      store.set(toCacheKey(reference), {
        expiresAt: now() + ttlMs,
        value: work,
      });
    },
    clear() {
      store.clear();
    },
  };
}

function toCacheKey(reference: WorkReference | string): string {
  if (typeof reference === "string") {
    return `dlsite:${reference.toUpperCase()}`;
  }

  const normalizedId =
    reference.store === "dlsite" ? reference.id.toUpperCase() : reference.id.toLowerCase();
  return `${reference.store}:${normalizedId}`;
}
