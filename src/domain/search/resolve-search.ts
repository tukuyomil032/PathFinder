import {
  parseFanzaDoujinSearchItems,
  parseFanzaDoujinSearchResult,
} from "../../integrations/dmm/parse-search-results";
import {
  fetchFanzaDoujinMakerListPage,
  fetchFanzaDoujinSearchPage,
} from "../../integrations/dmm/search-work";
import { fetchCircleProfilePage, fetchSearchAjaxPage } from "../../integrations/dlsite/search-work";
import {
  parseSearchAjaxResult,
  parseSearchResultItems,
} from "../../integrations/dlsite/parse-search-results";
import type { RawSearchPage, SearchQuery, SearchResultItem, SearchTarget } from "./types";
import { resolveStoreForTarget } from "./types";

export type SearchFetcher = (query: SearchQuery, rawPage: number) => Promise<RawSearchPage>;

// /search・/random で実際にfetcherが実装済みのtarget一覧。/random のstore自動抽選は
// ここに含まれるtargetからのみ選ぶ（未実装targetを自動抽選すると必ず失敗するため）。
export const IMPLEMENTED_SEARCH_TARGETS: SearchTarget[] = [
  "dlsite_maniax",
  "dlsite_books",
  "dlsite_pro",
  "fanza_doujin",
];

export function resolveSearchFetcher(target: SearchTarget): SearchFetcher {
  const store = resolveStoreForTarget(target);

  if (store === "dlsite") {
    return fetchDlsiteSearchPage;
  }

  if (store === "fanza_doujin") {
    return fetchFanzaDoujinPage;
  }

  throw new TypeError(`No search fetcher implemented yet for target ${target}`);
}

async function fetchDlsiteSearchPage(query: SearchQuery, rawPage: number): Promise<RawSearchPage> {
  const deps = {
    fetchMakerCatalog: (makerId: string) => fetchCircleProfilePage(query.target, makerId),
    parseItems: parseSearchResultItems,
  };

  if (query.makerId) {
    return fetchMakerCatalogPage(query.makerId, deps);
  }

  const raw = await fetchSearchAjaxPage(query, rawPage);
  const page = parseSearchAjaxResult(raw);

  if (!query.circle) {
    return page;
  }

  return resolveCircleFiltered(page, query, deps);
}

async function fetchFanzaDoujinPage(query: SearchQuery, rawPage: number): Promise<RawSearchPage> {
  const deps = {
    fetchMakerCatalog: fetchFanzaDoujinMakerListPage,
    parseItems: parseFanzaDoujinSearchItems,
  };

  if (query.makerId) {
    return fetchMakerCatalogPage(query.makerId, deps);
  }

  const html = await fetchFanzaDoujinSearchPage(query, rawPage);
  const page = parseFanzaDoujinSearchResult(html);

  if (!query.circle) {
    return page;
  }

  return resolveCircleFiltered(page, query, deps);
}

/**
 * makerId が既知の場合（/random のサークルfacet等）に、名前解決を経由せず
 * そのサークル/ブランドの全作品一覧を直接取得する。件数は通常数十件程度で
 * ページングの必要がないため、常に hasNext: false の1ページとして返す。
 */
async function fetchMakerCatalogPage(
  makerId: string,
  deps: {
    fetchMakerCatalog: (makerId: string) => Promise<string>;
    parseItems: (html: string) => SearchResultItem[];
  },
): Promise<RawSearchPage> {
  const catalogHtml = await deps.fetchMakerCatalog(makerId);
  const items = deps.parseItems(catalogHtml);

  return { items, hasNext: false, totalCount: items.length };
}

/**
 * circle 指定時の2段階解決（store非依存）:
 *   1. 通常のキーワード検索結果から makerName が circle と部分一致するアイテムを探す
 *   2. 一致した最初のアイテムの makerId を使い、そのサークル/ブランドの全作品一覧
 *      （DLsite: circle/profile/=/maker_id/{id}.html、FANZA同人: list/=/article=maker/id=...）を取得
 *   3. サークル内の全作品を keyword で再フィルタして返す
 * 同名の別サークルが存在する場合に取り違えるリスクは残るが、単純な部分一致のみより
 * そのサークルの作品を漏れなく拾える（詳細は docs 参照）。
 */
async function resolveCircleFiltered(
  page: RawSearchPage,
  query: SearchQuery,
  deps: {
    fetchMakerCatalog: (makerId: string) => Promise<string>;
    parseItems: (html: string) => SearchResultItem[];
  },
): Promise<RawSearchPage> {
  const circleNeedle = query.circle?.toLowerCase() ?? "";
  const matched = page.items.find((item) => item.makerName?.toLowerCase().includes(circleNeedle));

  if (!matched?.makerId) {
    // サークルがまだ見つかっていない: このページではアイテムを返さず、
    // hasNext は元のページの値をそのまま伝播して ensureBuffer のループが
    // 次の rawPage も探索を続けられるようにする（さもないと1ページ目
    // （約30件）だけで見つからなければ常に0件扱いになってしまう）。
    return { items: [], hasNext: page.hasNext, totalCount: null };
  }

  const catalog = await fetchMakerCatalogPage(matched.makerId, deps);
  const keywordNeedle = query.keyword.toLowerCase();
  const filtered = catalog.items.filter((item) => item.title.toLowerCase().includes(keywordNeedle));

  return { items: filtered, hasNext: false, totalCount: filtered.length };
}
