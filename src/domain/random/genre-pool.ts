import { fetchFanzaDoujinGenreList } from "../../integrations/dmm/genre-list";
import { fetchGenreList as fetchDlsiteGenreList } from "../../integrations/dlsite/genre-list";
import { resolveDlsiteSurface } from "../../integrations/dlsite/search-work";
import type { SearchTarget } from "../search/types";

export type GenreEntry = { id: string; name: string };

/**
 * target別にジャンル取得元を振り分ける既定実装。v1でジャンル一覧ページが
 * 実在確認済みなのはDLsite同人・FANZA同人のみ（他は空配列を返し、
 * genre-poolがそのまま空リストとして扱う＝ジャンルfacet候補から自動除外される）。
 */
export async function defaultFetchGenreList(target: SearchTarget): Promise<GenreEntry[]> {
  if (target === "fanza_doujin") {
    return fetchFanzaDoujinGenreList();
  }

  if (target === "dlsite_maniax" || target === "dlsite_books" || target === "dlsite_pro") {
    return fetchDlsiteGenreList(resolveDlsiteSurface(target));
  }

  return [];
}

export type GenrePool = {
  list(target: SearchTarget): Promise<GenreEntry[]>;
};

type CacheEntry = {
  expiresAt: number;
  value: GenreEntry[];
};

export type CreateGenrePoolDeps = {
  fetchGenreList: (target: SearchTarget) => Promise<GenreEntry[]>;
  now?: () => number;
  log?: Partial<Pick<Console, "error">>;
};

/**
 * ジャンルマスターリストのTTLキャッシュ（store別）。session-cache.tsと同じ
 * now注入パターンを踏襲する。実測確認済み: DLsite(`/{surface}/genre/list`)・
 * FANZA同人(`/dc/doujin/-/genre/`)にはジャンル/タグID一覧ページが実在する。
 * 他surfaceに一覧ページが無い場合はfetchGenreListがエラーを投げる想定で、
 * その場合は空リストにフォールバックし、呼び出し側（/random）はジャンルfacetを
 * 候補から自動的に除外できるようにする。
 */
export function createGenrePool(ttlMs: number, deps: CreateGenrePoolDeps): GenrePool {
  const now = deps.now ?? Date.now;
  const cache = new Map<SearchTarget, CacheEntry>();

  return {
    async list(target) {
      const cached = cache.get(target);

      if (cached && cached.expiresAt > now()) {
        return cached.value;
      }

      try {
        const value = await deps.fetchGenreList(target);
        cache.set(target, { expiresAt: now() + ttlMs, value });
        return value;
      } catch (error) {
        deps.log?.error?.(`Failed to fetch genre list for ${target}`, error);
        // 失効済みでも古いキャッシュがあればそれを使い、無ければ空リストにフォールバックする。
        return cached?.value ?? [];
      }
    },
  };
}
