import { load } from "cheerio";
import type { RawSearchPage, SearchResultItem } from "../../domain/search/types";

/**
 * FANZA同人の検索結果リスト（通常検索結果ページ、またはブランド別一覧ページ）を
 * 共通のセレクタでパースする。個々のアイテムでタイトル/cidが取得できない場合は
 * そのアイテムだけをスキップし、全体の失敗にはしない（部分成功を許容する）。
 */
export function parseFanzaDoujinSearchItems(html: string): SearchResultItem[] {
  const $ = load(html);
  const items: SearchResultItem[] = [];

  for (const node of $("li.productList__item").toArray()) {
    const el = $(node);
    const titleAnchor = el.find(".tileListTtl__txt a").first();
    const title = normalizeText(titleAnchor.text());
    const url = normalizeText(titleAnchor.attr("href"));

    const purchaseButton = el.find(".tileListPurchaseStatus__btn--addToBasket").first();
    const cid = purchaseButton.attr("data-cid");

    if (!title || !url || !cid) {
      continue;
    }

    const makerAnchor = el.find(".tileListTtl__txt--author a").first();
    const makerName = normalizeText(makerAnchor.text());
    const makerId = extractMakerId(makerAnchor.attr("href"));

    const priceValue = parsePriceValue(purchaseButton.attr("data-price"));
    const thumbnailUrl = normalizeText(el.find(".tileListImg img").first().attr("src"));

    items.push({
      store: "fanza_doujin",
      id: cid,
      title,
      url,
      thumbnailUrl,
      price: priceValue !== null ? priceValue.toLocaleString("ja-JP") : null,
      priceValue,
      makerName,
      makerId,
    });
  }

  return items;
}

export function parseFanzaDoujinSearchResult(html: string): RawSearchPage {
  const items = parseFanzaDoujinSearchItems(html);
  const pageInfo = extractPageInfo(html);

  const hasNext = pageInfo !== null ? pageInfo.lastIndice < pageInfo.totalCount : items.length > 0;

  return {
    items,
    hasNext,
    totalCount: pageInfo?.totalCount ?? null,
  };
}

function extractPageInfo(
  html: string,
): { firstIndice: number; lastIndice: number; totalCount: number } | null {
  const $ = load(html);
  const text = normalizeText($(".pageNation__txt").first().text());

  if (!text) {
    return null;
  }

  const match = text.match(/(\d+)\s*[～-]\s*(\d+)タイトル\/全([\d,]+)タイトル/);

  if (!match) {
    return null;
  }

  return {
    firstIndice: Number(match[1]),
    lastIndice: Number(match[2]),
    totalCount: Number(match[3].replace(/,/g, "")),
  };
}

function extractMakerId(href: string | undefined): string | null {
  return href?.match(/article=maker\/id=(\d+)/i)?.[1] ?? null;
}

function parsePriceValue(priceText: string | undefined): number | null {
  if (!priceText) {
    return null;
  }

  const value = Number(priceText);
  return Number.isFinite(value) ? value : null;
}

function normalizeText(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length > 0 ? normalized : null;
}
