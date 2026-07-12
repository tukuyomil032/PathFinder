import type { SearchQuery, SearchSortKey } from "../../domain/search/types";
import { fetchDmmHtmlWithAgeCheck, type FetchDmmHtmlOptions } from "./http-client";

const DMM_HOST = "www.dmm.co.jp";

// price_desc は FANZA同人検索でネイティブ対応が確認できていないため、
// sort パラメータを付与せずデフォルトソートにフォールバックする。
const FANZA_DOUJIN_SORT_PARAM: Partial<Record<SearchSortKey, string>> = {
  popularity: "sales",
  new: "date",
  price_asc: "price_asc",
  rating: "review_rank",
};

export function buildFanzaDoujinSearchUrl(query: SearchQuery, rawPage: number): string {
  const segments = [`word=${encodeURIComponent(query.keyword)}`];
  const sortParam = query.sort ? FANZA_DOUJIN_SORT_PARAM[query.sort] : undefined;

  if (sortParam) {
    segments.push(`sort=${sortParam}`);
  }

  segments.push(`page=${rawPage}`);

  return `https://${DMM_HOST}/dc/doujin/-/list/narrow/=/${segments.join("/")}/`;
}

export function buildFanzaDoujinMakerListUrl(makerId: string): string {
  return `https://${DMM_HOST}/dc/doujin/-/list/=/article=maker/id=${encodeURIComponent(makerId)}/`;
}

export async function fetchFanzaDoujinSearchPage(
  query: SearchQuery,
  rawPage: number,
  options: FetchDmmHtmlOptions = {},
): Promise<string> {
  const targetUrl = buildFanzaDoujinSearchUrl(query, rawPage);
  const result = await fetchDmmHtmlWithAgeCheck(targetUrl, options);
  return result.html;
}

export async function fetchFanzaDoujinMakerListPage(
  makerId: string,
  options: FetchDmmHtmlOptions = {},
): Promise<string> {
  const targetUrl = buildFanzaDoujinMakerListUrl(makerId);
  const result = await fetchDmmHtmlWithAgeCheck(targetUrl, options);
  return result.html;
}
