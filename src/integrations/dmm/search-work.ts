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
  if (query.keyword) {
    return buildFanzaDoujinKeywordSearchUrl(query, rawPage);
  }

  return buildFanzaDoujinBrowseUrl(query, rawPage);
}

/**
 * word（keyword）指定時の検索結果ページURLを組み立てる（`/search`が使う既存経路、変更なし）。
 * DMM側はセグメント順序を正規化しており（word→sort の順で送ると sort→word の順に
 * 301 リダイレクトされる）、さらに page=1 は常に省略された正規URLへ301される
 * （page=2 以降は301なしで直接200が返る）。canonical な順序・形式に合わせて
 * 不要なリダイレクトを起こさないようにする。
 */
function buildFanzaDoujinKeywordSearchUrl(query: SearchQuery, rawPage: number): string {
  const segments: string[] = [];
  const sortParam = query.sort ? FANZA_DOUJIN_SORT_PARAM[query.sort] : undefined;

  if (sortParam) {
    segments.push(`sort=${sortParam}`);
  }

  segments.push(`word=${encodeURIComponent(query.keyword)}`);

  if (rawPage > 1) {
    segments.push(`page=${rawPage}`);
  }

  return `https://${DMM_HOST}/dc/doujin/-/list/narrow/=/${segments.join("/")}/`;
}

/**
 * word無し（/random のブラウズ・ジャンルfacet）の一覧URLを組み立てる。
 * 実機確認済み: `narrow`を外した`/dc/doujin/-/list/=/...`パスが全件ブラウズとして機能する
 * （全347,066件を確認）。`article=keyword/id={genreId}`でジャンル単体絞り込みも可能。
 * ただしセグメントが完全に空の場合（sortもgenreIdも無し）は301で不明な正規URLへ飛ばされる
 * ことを確認済みのため、sortが未指定の場合は`date`（新着順）をデフォルトで付与し、
 * 常に最低1セグメントが残るようにする。
 */
function buildFanzaDoujinBrowseUrl(query: SearchQuery, rawPage: number): string {
  const segments: string[] = [];

  if (query.genreId) {
    segments.push(`article=keyword/id=${encodeURIComponent(query.genreId)}`);
  }

  const sortParam = (query.sort && FANZA_DOUJIN_SORT_PARAM[query.sort]) || "date";
  segments.push(`sort=${sortParam}`);

  if (rawPage > 1) {
    segments.push(`page=${rawPage}`);
  }

  return `https://${DMM_HOST}/dc/doujin/-/list/=/${segments.join("/")}/`;
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
