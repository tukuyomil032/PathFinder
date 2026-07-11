import { fetchCircleProfilePage, fetchSearchAjaxPage } from "../../integrations/dlsite/search-work";
import {
  parseSearchAjaxResult,
  parseSearchResultItems,
} from "../../integrations/dlsite/parse-search-results";
import type { RawSearchPage, SearchQuery, SearchTarget } from "./types";
import { resolveStoreForTarget } from "./types";

export type SearchFetcher = (query: SearchQuery, rawPage: number) => Promise<RawSearchPage>;

export function resolveSearchFetcher(target: SearchTarget): SearchFetcher {
  const store = resolveStoreForTarget(target);

  if (store === "dlsite") {
    return fetchDlsiteSearchPage;
  }

  throw new TypeError(`No search fetcher implemented yet for target ${target}`);
}

async function fetchDlsiteSearchPage(query: SearchQuery, rawPage: number): Promise<RawSearchPage> {
  const raw = await fetchSearchAjaxPage(query, rawPage);
  const page = parseSearchAjaxResult(raw);

  if (!query.circle) {
    return page;
  }

  return applyCircleFilter(page, query);
}

/**
 * circle 指定時の2段階解決:
 *   1. 通常のキーワード検索結果から makerName が circle と部分一致するアイテムを探す
 *   2. 一致した最初のアイテムの makerId を使い、サークルプロフィールページ
 *      （circle/profile/=/maker_id/{id}.html、そのサークルの全作品をSSRで返す）を取得
 *   3. サークル内の全作品を keyword で再フィルタして返す
 * 同名の別サークルが存在する場合に取り違えるリスクは残るが、単純な部分一致のみより
 * そのサークルの作品を漏れなく拾える（詳細は docs 参照）。
 */
async function applyCircleFilter(page: RawSearchPage, query: SearchQuery): Promise<RawSearchPage> {
  const circleNeedle = query.circle?.toLowerCase() ?? "";
  const matched = page.items.find((item) => item.makerName?.toLowerCase().includes(circleNeedle));

  if (!matched?.makerId) {
    const filtered = page.items.filter((item) =>
      item.makerName?.toLowerCase().includes(circleNeedle),
    );
    return { items: filtered, hasNext: false, totalCount: filtered.length };
  }

  const circleHtml = await fetchCircleProfilePage(query.target, matched.makerId);
  const circleItems = parseSearchResultItems(circleHtml);
  const keywordNeedle = query.keyword.toLowerCase();
  const filtered = circleItems.filter((item) => item.title.toLowerCase().includes(keywordNeedle));

  return { items: filtered, hasNext: false, totalCount: filtered.length };
}
