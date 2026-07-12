import { getEnv } from "../../config/env";
import {
  resolveDlsiteSurface,
  type SearchQuery,
  type SearchSortKey,
  type SearchTarget,
} from "../../domain/search/types";
import { FetchSearchPageError } from "./errors";

const DLSITE_HOST = "www.dlsite.com";

const SORT_PARAM: Record<SearchSortKey, string> = {
  popularity: "trend",
  new: "release_d",
  price_asc: "price",
  price_desc: "price_d",
  rating: "rate_d",
};

type FetchLike = typeof fetch;

type FetchSearchOptions = {
  fetchImpl?: FetchLike;
  userAgent?: string;
};

export type DlsiteSearchAjaxResult = {
  searchResultHtml: string;
  totalCount: number | null;
  firstIndice: number | null;
  lastIndice: number | null;
};

/**
 * DLsite の軽量検索AJAXエンドポイント（/fsr/ajax/=/...）のURLを組み立てる。
 * 通常の検索結果ページ（/fsr/=/...）と取得できる情報・HTML構造は同一だが、
 * ページ枠のUIが無い分レスポンスが軽量なためこちらを採用している。
 *
 * keywordが空文字列の場合（/random のブラウズ）はkeywordセグメント自体を省略する。
 * 実機確認済み: keyword省略・genre[0]単体のいずれもAJAXエンドポイントでそのまま
 * 全件/ジャンル別ブラウズとして機能する（page_info.countも通常通り取得できる）。
 */
export function buildSearchAjaxUrl(query: SearchQuery, rawPage: number): string {
  const surface = resolveDlsiteSurface(query.target);
  const segments = ["language", "jp"];

  if (query.keyword) {
    segments.push("keyword", encodeURIComponent(query.keyword));
  }

  if (query.genreId) {
    segments.push("genre%5B0%5D", encodeURIComponent(query.genreId));
  }

  if (query.sort) {
    segments.push("order%5B0%5D", SORT_PARAM[query.sort]);
  }

  if (query.priceMin !== undefined) {
    segments.push("price_low", String(query.priceMin));
  }

  if (query.priceMax !== undefined) {
    segments.push("price_high", String(query.priceMax));
  }

  segments.push("page", String(rawPage));

  return `https://${DLSITE_HOST}/${surface}/fsr/ajax/=/${segments.join("/")}/`;
}

export function buildCircleProfileUrl(target: SearchTarget, makerId: string): string {
  const surface = resolveDlsiteSurface(target);
  return `https://${DLSITE_HOST}/${surface}/circle/profile/=/maker_id/${encodeURIComponent(makerId)}.html`;
}

export async function fetchSearchAjaxPage(
  query: SearchQuery,
  rawPage: number,
  options: FetchSearchOptions = {},
): Promise<DlsiteSearchAjaxResult> {
  const targetUrl = buildSearchAjaxUrl(query, rawPage);
  const raw = await fetchText(targetUrl, options, query.keyword);

  let parsed: unknown;

  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new FetchSearchPageError({
      code: "unexpected_page",
      message: `DLSite search response was not valid JSON for keyword "${query.keyword}"`,
      cause: error,
    });
  }

  if (typeof parsed !== "object" || parsed === null || !("search_result" in parsed)) {
    throw new FetchSearchPageError({
      code: "unexpected_page",
      message: `DLSite search response is missing search_result for keyword "${query.keyword}"`,
    });
  }

  const body = parsed as { search_result: unknown; page_info?: unknown };
  const searchResultHtml = typeof body.search_result === "string" ? body.search_result : "";
  const pageInfo =
    typeof body.page_info === "object" && body.page_info !== null
      ? (body.page_info as { count?: unknown; first_indice?: unknown; last_indice?: unknown })
      : null;

  return {
    searchResultHtml,
    totalCount: typeof pageInfo?.count === "number" ? pageInfo.count : null,
    firstIndice: typeof pageInfo?.first_indice === "number" ? pageInfo.first_indice : null,
    lastIndice: typeof pageInfo?.last_indice === "number" ? pageInfo.last_indice : null,
  };
}

export async function fetchCircleProfilePage(
  target: SearchTarget,
  makerId: string,
  options: FetchSearchOptions = {},
): Promise<string> {
  const targetUrl = buildCircleProfileUrl(target, makerId);
  return fetchText(targetUrl, options, makerId);
}

async function fetchText(
  targetUrl: string,
  options: FetchSearchOptions,
  context: string,
): Promise<string> {
  const fetchImpl = options.fetchImpl ?? fetch;
  let response: Response;

  try {
    response = await fetchImpl(targetUrl, {
      headers: {
        "user-agent": options.userAgent ?? getEnv().DLSITE_USER_AGENT,
      },
    });
  } catch (error) {
    throw new FetchSearchPageError({
      code: "network_error",
      message: `Failed to fetch DLSite search page for "${context}"`,
      cause: error,
    });
  }

  if (!response.ok) {
    throw new FetchSearchPageError({
      code: "http_error",
      message: `Unexpected status ${response.status} for "${context}"`,
      status: response.status,
    });
  }

  return response.text();
}
