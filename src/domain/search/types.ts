import type { DLSiteSurface, WorkStore } from "../rj/types";

// dmm_tv_av（FANZA AV）は検索結果ページがNext.js SPAでfetch+cheerioでは
// 取得できないことを実測確認済みのため対象外（docs参照）。
export type SearchTarget =
  | "dlsite_maniax"
  | "dlsite_books"
  | "dlsite_pro"
  | "fanza_doujin"
  | "fanza_pcgame"
  | "fanza_books";

export type SearchSortKey = "popularity" | "new" | "price_asc" | "price_desc" | "rating";

export type SearchQuery = {
  target: SearchTarget;
  keyword: string;
  // /random のジャンルfacet用。DLsiteはgenre[0]、FANZA同人はarticle=keyword/idに対応する。
  genreId?: string;
  // /random のサークルfacet用。既知のIDで直接絞り込み、circle（名前）の2段階解決をスキップする。
  makerId?: string;
  priceMin?: number;
  priceMax?: number;
  circle?: string;
  sort?: SearchSortKey;
};

export type SearchResultItem = {
  store: WorkStore;
  id: string;
  title: string;
  url: string;
  thumbnailUrl: string | null;
  price: string | null;
  priceValue: number | null;
  makerName: string | null;
  makerId: string | null;
};

export type RawSearchPage = {
  items: SearchResultItem[];
  hasNext: boolean;
  totalCount: number | null;
};

export function resolveStoreForTarget(target: SearchTarget): WorkStore {
  switch (target) {
    case "dlsite_maniax":
    case "dlsite_books":
    case "dlsite_pro":
      return "dlsite";
    case "fanza_doujin":
      return "fanza_doujin";
    case "fanza_pcgame":
      return "fanza_pcgame";
    case "fanza_books":
      return "fanza_books";
  }
}

export function resolveDlsiteSurface(target: SearchTarget): DLSiteSurface {
  switch (target) {
    case "dlsite_maniax":
      return "maniax";
    case "dlsite_books":
      return "books";
    case "dlsite_pro":
      return "pro";
    default:
      throw new TypeError(`resolveDlsiteSurface only supports DLsite targets, got ${target}`);
  }
}

// store単位の粗いNSFWゲート判定。dlsite_maniax（同人）は全年齢作品も多く含むため
// ゲート対象外とし、それ以外は成人向け前提として非NSFWチャンネルでは検索自体を拒否する。
// 個別アイテム単位の年齢区分は検索結果一覧のDOMからは判定できないため、この粗さは
// 既知の制限として設計上受け入れている（docs参照）。
export function isAdultOnlyTarget(target: SearchTarget): boolean {
  return target !== "dlsite_maniax";
}
