import type { WorkStore } from "../rj/types";

export type CircleEntry = { makerId: string; makerName: string };

export type CirclePool = {
  record(store: WorkStore, makerId: string | null, makerName: string | null): void;
  pickRandom(store: WorkStore, random?: () => number): CircleEntry | null;
};

const DEFAULT_MAX_ENTRIES_PER_STORE = 200;

/**
 * /random・/search・/dlsite・/fanzaの実行結果から実在確認済みのサークル/ブランドを
 * store別に蓄積するインメモリプール（専用の一覧ページが存在しないため採用）。
 * プールに入る値は必ず過去に実在が確認できた値のため、存在しないサークルを
 * ランダム生成して検索に失敗するリスクが構造的に起きない。
 *
 * WorkStore単位（"dlsite"は同人/Books/proを区別しない）でしか収集元のデータが
 * 得られない（SearchResultItem.store・WorkPreview.storeともにDLsite surfaceを
 * 区別しないため）ため、この粒度をそのまま採用する。あるDLsiteサークルが
 * 特定surfaceに作品を持たない場合はそのサークルでの抽選が0件になり得るが、
 * 呼び出し側（/random）が別の候補で再試行することで吸収する設計とする。
 *
 * プロセス再起動でリセットされる（既存のインメモリキャッシュ群と同じ制約として許容）。
 */
export function createCirclePool(maxEntriesPerStore = DEFAULT_MAX_ENTRIES_PER_STORE): CirclePool {
  const entriesByStore = new Map<WorkStore, CircleEntry[]>();
  const seenIdsByStore = new Map<WorkStore, Set<string>>();

  return {
    record(store, makerId, makerName) {
      if (!makerId || !makerName) {
        return;
      }

      const seenIds = seenIdsByStore.get(store) ?? new Set<string>();
      seenIdsByStore.set(store, seenIds);

      if (seenIds.has(makerId)) {
        return;
      }

      const entries = entriesByStore.get(store) ?? [];
      entriesByStore.set(store, entries);

      entries.push({ makerId, makerName });
      seenIds.add(makerId);

      // FIFOで最も古いエントリを破棄し、無制限な肥大化を防ぐ。
      if (entries.length > maxEntriesPerStore) {
        const removed = entries.shift();

        if (removed) {
          seenIds.delete(removed.makerId);
        }
      }
    },
    pickRandom(store, random = Math.random) {
      const entries = entriesByStore.get(store);

      if (!entries || entries.length === 0) {
        return null;
      }

      return entries[Math.floor(random() * entries.length)];
    },
  };
}
