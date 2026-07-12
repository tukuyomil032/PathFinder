import { load } from "cheerio";
import type { CheerioAPI } from "cheerio";
import type { RawSearchPage, SearchResultItem } from "../../domain/search/types";
import { buildWorkUrl } from "./fetch-work-page";

/**
 * 検索結果リスト（AJAX検索結果の search_result フラグメント、または
 * サークルプロフィールページの一覧セクション）を共通のセレクタでパースする。
 * 個々のアイテムでタイトル/URLが取得できない場合はそのアイテムだけをスキップし、
 * 全体の失敗にはしない（部分成功を許容する）。
 */
export function parseSearchResultItems(html: string): SearchResultItem[] {
  const $ = load(html);
  const items: SearchResultItem[] = [];

  for (const node of $("li[data-list_item_product_id]").toArray()) {
    const el = $(node);
    const id = el.attr("data-list_item_product_id");

    if (!id) {
      continue;
    }

    const titleAnchor = el.find(".work_name a").first();
    const title = normalizeText(titleAnchor.attr("title")) ?? normalizeText(titleAnchor.text());
    const urlPath = normalizeText(titleAnchor.attr("href"));

    if (!title || !urlPath) {
      continue;
    }

    const makerAnchor = el.find(".maker_name a").first();
    const makerName = normalizeText(makerAnchor.text());
    const makerId = extractMakerId(makerAnchor.attr("href"));

    const priceText = normalizeText(el.find(".work_price_base").first().text());
    const priceValue = parsePriceValue(priceText);

    items.push({
      store: "dlsite",
      id,
      title,
      url: urlPath.startsWith("http") ? urlPath : buildWorkUrl(id),
      thumbnailUrl: extractThumbnailUrl(el),
      price: priceText,
      priceValue,
      makerName,
      makerId,
    });
  }

  return items;
}

export function parseSearchAjaxResult(params: {
  searchResultHtml: string;
  totalCount: number | null;
  firstIndice: number | null;
  lastIndice: number | null;
}): RawSearchPage {
  const items = parseSearchResultItems(params.searchResultHtml);
  const hasNext =
    params.totalCount !== null && params.lastIndice !== null
      ? params.lastIndice < params.totalCount
      : items.length > 0;

  return {
    items,
    hasNext,
    totalCount: params.totalCount,
  };
}

function extractThumbnailUrl(el: ReturnType<CheerioAPI>): string | null {
  const raw = el.find("thumb-with-ng-filter-block").first().attr(":thumb-candidates");

  if (!raw) {
    return null;
  }

  const match = raw.match(/'([^']+)'/);

  if (!match) {
    return null;
  }

  const candidate = match[1];
  return candidate.startsWith("//") ? `https:${candidate}` : candidate;
}

function extractMakerId(href: string | undefined): string | null {
  return href?.match(/maker_id\/([A-Za-z0-9]+)\.html/i)?.[1] ?? null;
}

function parsePriceValue(priceText: string | null): number | null {
  if (!priceText) {
    return null;
  }

  const value = Number(priceText.replace(/,/g, ""));
  return Number.isFinite(value) ? value : null;
}

function normalizeText(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length > 0 ? normalized : null;
}
