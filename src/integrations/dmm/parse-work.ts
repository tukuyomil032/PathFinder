import { load } from "cheerio";
import type { CheerioAPI } from "cheerio";
import type { FetchedWorkPage, WorkPreview, WorkReference, WorkStore } from "../../domain/rj/types";
import { normalizeDmmId } from "./fetch-work-page";

type DmmStore = Exclude<WorkStore, "dlsite">;

type WorkJsonLd = {
  "@type"?: string;
  name?: string;
  image?: string | string[];
  brand?: { name?: string };
  description?: string;
  aggregateRating?: {
    ratingValue?: string;
    ratingCount?: string;
  };
  offers?: {
    url?: string;
    price?: string;
    priceCurrency?: string;
  };
  url?: string;
  author?: { name?: string } | Array<{ name?: string }>;
};

type CommonMeta = {
  title: string | null;
  url: string | null;
  thumbnailUrl: string | null;
  jsonLd: WorkJsonLd | null;
};

export class ParseDmmWorkError extends Error {
  readonly store: DmmStore;
  readonly workId: string;

  constructor(message: string, store: DmmStore, workId: string) {
    super(message);
    this.name = "ParseDmmWorkError";
    this.store = store;
    this.workId = workId;
  }
}

export function parseDmmWork(page: FetchedWorkPage, reference: WorkReference): WorkPreview {
  const store = reference.store;

  if (store === "dlsite") {
    throw new TypeError("parseDmmWork only supports DMM family stores");
  }

  if (page.pageKind !== "work") {
    throw new ParseDmmWorkError(
      `Unexpected DMM page kind ${page.pageKind}`,
      store,
      normalizeDmmId(store, reference.id),
    );
  }

  const $ = load(page.html);
  const common = readCommonMeta($, page.resolvedUrl);

  switch (store) {
    case "fanza_doujin":
      return parseFanzaDoujinPage($, common, page, reference);
    case "dmm_tv_av":
      return parseDmmTvPage($, common, page, reference);
    case "fanza_pcgame":
      return parseFanzaPcGamePage($, common, page, reference);
    case "fanza_books":
      return parseFanzaBooksPage($, common, page, reference);
  }
}

function parseFanzaDoujinPage(
  $: CheerioAPI,
  common: CommonMeta,
  page: FetchedWorkPage,
  reference: WorkReference,
): WorkPreview {
  const store = "fanza_doujin";
  const workId = normalizeDmmId(store, reference.id);
  assertRequired(common, store, workId);
  const makerName =
    common.jsonLd?.brand?.name ??
    readText($, ".makerName__txt, #maker, .maker_name a, .circleName") ??
    readDefinitionValue($, ["サークル名", "ブランド", "メーカー"]);
  const makerId = readMakerId($, ".circleInfo .circleName a, .makerName__txt a");
  const tags = readTags($);
  const ageCategory =
    readDefinitionValue($, ["年齢指定", "年齢"]) ??
    tags.find((tag) => /成人向け|18禁/i.test(tag)) ??
    "成人向け";
  const price =
    formatPrice(common.jsonLd?.offers?.price) ??
    readDisplayedPrice($) ??
    readDefinitionValue($, ["価格"]);
  const releaseDate = normalizeDate(readDefinitionValue($, ["配信開始日", "販売日", "発売日"]));
  const rating =
    normalizeRating(common.jsonLd?.aggregateRating?.ratingValue) ??
    readText($, ".dcd-review__average, .rating") ??
    readDefinitionValue($, ["評価"]);
  const missingFields = (
    [
      ["makerName", makerName],
      ["price", price],
      ["ageCategory", ageCategory],
    ] as const
  )
    .filter(([, value]) => !value)
    .map(([key]) => key);

  return {
    store,
    id: workId,
    title: common.title,
    url: common.url,
    makerName,
    makerId,
    ageCategory,
    isAdult: true,
    price,
    salePrice:
      readText($, ".tx-hangaku, .sale-price, .campaign-price") ??
      readDefinitionValue($, ["セール価格", "キャンペーン価格"]),
    releaseDate,
    rating,
    thumbnailUrl: common.thumbnailUrl,
    tags,
    author: readDefinitionValue($, ["作者"]),
    scenario: readDefinitionValue($, ["シナリオ"]),
    illustration: readDefinitionValue($, ["イラスト"]),
    voiceActors: readListValue($, ["声優"]),
    fileFormat: readDefinitionValue($, ["ファイル形式"]),
    fileSize: readDefinitionValue($, ["ファイル容量", "容量"]),
    parseCoverage: missingFields.length === 0 ? "full" : "partial",
    serviceName: "FANZA同人",
    circleOrBrandLabel: makerName ? "サークル" : null,
    rawAttributes: {
      surface: "dc/doujin",
      pageKind: page.pageKind,
      service: store,
      missingFields,
    },
    parserName:
      missingFields.length === 0 ? "fanza_doujin/dc-doujin" : "fanza_doujin/dc-doujin-partial",
  };
}

function parseDmmTvPage(
  $: CheerioAPI,
  common: CommonMeta,
  page: FetchedWorkPage,
  reference: WorkReference,
): WorkPreview {
  const store = "dmm_tv_av";
  const workId = normalizeDmmId(store, reference.id);
  assertRequired(common, store, workId);
  const makerName =
    common.jsonLd?.brand?.name ??
    readDefinitionValue($, ["シリーズ", "メーカー", "レーベル"]) ??
    readText($, ".series a, .maker a, .label a");
  const performers = readListValue($, ["出演者", "女優"]);
  const tags = readTags($);
  const price = formatPrice(common.jsonLd?.offers?.price) ?? readDefinitionValue($, ["価格"]);
  const missingFields = (
    [
      ["makerName", makerName],
      ["price", price],
    ] as const
  )
    .filter(([, value]) => !value)
    .map(([key]) => key);

  return {
    store,
    id: workId,
    title: common.title,
    url: common.url,
    makerName,
    makerId: null,
    ageCategory: readDefinitionValue($, ["年齢指定"]) ?? "成人向け",
    isAdult: true,
    price,
    salePrice: readDefinitionValue($, ["セール価格", "キャンペーン価格"]),
    releaseDate: normalizeDate(readDefinitionValue($, ["配信開始日", "発売日"])),
    rating:
      normalizeRating(common.jsonLd?.aggregateRating?.ratingValue) ??
      readText($, ".rating, .reviewAverage") ??
      readDefinitionValue($, ["評価"]),
    thumbnailUrl: common.thumbnailUrl,
    tags,
    author: performers.length > 0 ? performers.join(", ") : firstAuthor(common.jsonLd),
    scenario: readDefinitionValue($, ["シリーズ"]),
    illustration: null,
    voiceActors: [],
    fileFormat: readDefinitionValue($, ["再生時間"]),
    fileSize: null,
    parseCoverage: missingFields.length === 0 ? "full" : "partial",
    serviceName: "DMM TV",
    circleOrBrandLabel: makerName ? "シリーズ" : null,
    rawAttributes: {
      surface: "detail",
      pageKind: page.pageKind,
      service: store,
      performers,
      missingFields,
    },
    parserName: missingFields.length === 0 ? "dmm_tv_av/detail" : "dmm_tv_av/detail-partial",
  };
}

function parseFanzaPcGamePage(
  $: CheerioAPI,
  common: CommonMeta,
  page: FetchedWorkPage,
  reference: WorkReference,
): WorkPreview {
  const store = "fanza_pcgame";
  const workId = normalizeDmmId(store, reference.id);
  assertRequired(common, store, workId);
  const makerName =
    common.jsonLd?.brand?.name ??
    readDefinitionValue($, ["ブランド", "メーカー"]) ??
    readText($, ".maker a, .brand a");
  const price = formatPrice(common.jsonLd?.offers?.price) ?? readDefinitionValue($, ["価格"]);
  const tags = readTags($);
  const missingFields = (
    [
      ["makerName", makerName],
      ["price", price],
    ] as const
  )
    .filter(([, value]) => !value)
    .map(([key]) => key);

  return {
    store,
    id: workId,
    title: common.title,
    url: common.url,
    makerName,
    makerId: null,
    ageCategory: readDefinitionValue($, ["対象"]) ?? "18歳未満購入禁止",
    isAdult: true,
    price,
    salePrice: readDefinitionValue($, ["セール価格", "キャンペーン価格"]),
    releaseDate: normalizeDate(readDefinitionValue($, ["配信開始日", "発売日"])),
    rating:
      normalizeRating(common.jsonLd?.aggregateRating?.ratingValue) ??
      readDefinitionValue($, ["評価"]),
    thumbnailUrl: common.thumbnailUrl,
    tags,
    author: readDefinitionValue($, ["原画", "スタッフ"]),
    scenario: readDefinitionValue($, ["シナリオ"]),
    illustration: readDefinitionValue($, ["原画"]),
    voiceActors: [],
    fileFormat: readDefinitionValue($, ["対応OS"]),
    fileSize: readDefinitionValue($, ["ファイル容量", "容量"]),
    parseCoverage: missingFields.length === 0 ? "full" : "partial",
    serviceName: "FANZA PCゲーム",
    circleOrBrandLabel: makerName ? "ブランド" : null,
    rawAttributes: {
      surface: "detail",
      pageKind: page.pageKind,
      service: store,
      missingFields,
    },
    parserName: missingFields.length === 0 ? "fanza_pcgame/detail" : "fanza_pcgame/detail-partial",
  };
}

function parseFanzaBooksPage(
  $: CheerioAPI,
  common: CommonMeta,
  page: FetchedWorkPage,
  reference: WorkReference,
): WorkPreview {
  const store = "fanza_books";
  const workId = normalizeDmmId(store, reference.id);
  assertRequired(common, store, workId);
  const author =
    firstAuthor(common.jsonLd) ??
    readDefinitionValue($, ["著者", "作家"]) ??
    readText($, ".author a, .bookAuthor a");
  const label = readDefinitionValue($, ["レーベル", "出版社", "シリーズ"]);
  const price = formatPrice(common.jsonLd?.offers?.price) ?? readDefinitionValue($, ["価格"]);
  const tags = readTags($);
  const missingFields = (
    [
      ["author", author],
      ["price", price],
    ] as const
  )
    .filter(([, value]) => !value)
    .map(([key]) => key);

  return {
    store,
    id: workId,
    title: common.title,
    url: common.url,
    makerName: author ?? label,
    makerId: null,
    ageCategory: readDefinitionValue($, ["年齢指定"]) ?? "成人向け",
    isAdult: true,
    price,
    salePrice: readDefinitionValue($, ["セール価格", "キャンペーン価格"]),
    releaseDate: normalizeDate(readDefinitionValue($, ["配信開始日", "発売日"])),
    rating:
      normalizeRating(common.jsonLd?.aggregateRating?.ratingValue) ??
      readDefinitionValue($, ["評価"]),
    thumbnailUrl: common.thumbnailUrl,
    tags,
    author,
    scenario: label,
    illustration: null,
    voiceActors: [],
    fileFormat: readDefinitionValue($, ["ファイル形式"]),
    fileSize: readDefinitionValue($, ["ファイル容量", "ページ数"]),
    parseCoverage: missingFields.length === 0 ? "full" : "partial",
    serviceName: "FANZA BOOKS",
    circleOrBrandLabel: author ? "著者" : label ? "レーベル" : null,
    rawAttributes: {
      surface: "product",
      pageKind: page.pageKind,
      service: store,
      missingFields,
    },
    parserName: missingFields.length === 0 ? "fanza_books/product" : "fanza_books/product-partial",
  };
}

function readMakerId($: CheerioAPI, selector: string): string | null {
  const href = $(selector).first().attr("href");
  return href?.match(/article=maker\/id=(\d+)/i)?.[1] ?? null;
}

function readCommonMeta($: CheerioAPI, resolvedUrl: string): CommonMeta {
  const jsonLd = readProductJsonLd($);
  const title = normalizeTitle(
    jsonLd?.name ??
      readMetaContent($, "meta[property='og:title']") ??
      readText($, "h1") ??
      readText($, "title"),
  );
  const url =
    jsonLd?.offers?.url ??
    jsonLd?.url ??
    readMetaContent($, "link[rel='canonical']") ??
    readMetaContent($, "meta[property='og:url']") ??
    resolvedUrl;
  const thumbnailUrl = normalizeImageUrl(
    firstImage(jsonLd?.image),
    readMetaContent($, "meta[property='og:image']"),
    readAttribute($, "img", "src"),
  );

  return { title, url, thumbnailUrl, jsonLd };
}

function assertRequired(
  common: CommonMeta,
  store: DmmStore,
  workId: string,
): asserts common is CommonMeta & {
  title: string;
  url: string;
} {
  if (!common.title || !common.url) {
    throw new ParseDmmWorkError("Required DMM fields are missing: title, url", store, workId);
  }
}

function readProductJsonLd($: CheerioAPI): WorkJsonLd | null {
  const nodes = $("script[type='application/ld+json']").toArray();

  for (const node of nodes) {
    const raw = $(node).text().trim();

    if (!raw || raw.startsWith("//")) {
      continue;
    }

    try {
      const parsed = JSON.parse(raw) as WorkJsonLd | WorkJsonLd[];
      const candidates = Array.isArray(parsed) ? parsed : [parsed];
      const product = candidates.find((candidate) => candidate["@type"] === "Product");

      if (product) {
        return product;
      }
    } catch {}
  }

  return null;
}

function readMetaContent($: CheerioAPI, selector: string): string | null {
  return normalizeText($(selector).attr("content") ?? $(selector).attr("href") ?? null);
}

function readAttribute($: CheerioAPI, selector: string, attribute: string): string | null {
  return normalizeText($(selector).first().attr(attribute) ?? null);
}

function readText($: CheerioAPI, selector: string): string | null {
  return normalizeText($(selector).first().text());
}

function readDefinitionValue($: CheerioAPI, labels: string[]): string | null {
  for (const label of labels) {
    const dtMatch = $("dt")
      .toArray()
      .find((node) => normalizeText($(node).text()) === label);

    if (dtMatch) {
      const next = $(dtMatch).next("dd");
      const value =
        normalizeText(next.text()) ??
        normalizeText(
          next
            .find("a")
            .map((_, node) => $(node).text())
            .get()
            .join("、"),
        );

      if (value) {
        return value;
      }
    }

    const thMatch = $("th")
      .toArray()
      .find((node) => normalizeText($(node).text()) === label);

    if (thMatch) {
      const next = $(thMatch).next("td");
      const value =
        normalizeText(next.text()) ??
        normalizeText(
          next
            .find("a")
            .map((_, node) => $(node).text())
            .get()
            .join("、"),
        );

      if (value) {
        return value;
      }
    }
  }

  return null;
}

function readListValue($: CheerioAPI, labels: string[]): string[] {
  const raw = readDefinitionValue($, labels);

  if (!raw) {
    return [];
  }

  return raw
    .split(/[/,、]/)
    .map((value) => normalizeText(value))
    .filter((value): value is string => value !== null);
}

function readTags($: CheerioAPI): string[] {
  const tags = $(
    ".genreTagList .genreTag__txt, .tags a, .tag-list a, .work_tags a, [data-testid='work-tag']",
  )
    .toArray()
    .map((node) => normalizeText($(node).text()))
    .filter((value): value is string => value !== null);

  if (tags.length > 0) {
    return tags;
  }

  return readListValue($, ["ジャンル", "タグ"]);
}

function normalizeText(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length > 0 ? normalized : null;
}

function normalizeTitle(value: string | null): string | null {
  const normalized = normalizeText(value);
  return normalized?.replace(/\s*-\s*FANZA.*$/i, "") ?? null;
}

function normalizeImageUrl(...candidates: Array<string | null | undefined>): string | null {
  for (const candidate of candidates) {
    const normalized = normalizeText(candidate);

    if (normalized) {
      return normalized;
    }
  }

  return null;
}

function firstImage(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return value ?? null;
}

function formatPrice(price: string | undefined): string | null {
  if (!price) {
    return null;
  }

  const number = Number(price);

  if (Number.isNaN(number)) {
    return normalizeText(price);
  }

  return `${number.toLocaleString("ja-JP")}円`;
}

function readDisplayedPrice($: CheerioAPI): string | null {
  const dataPrice = $(".productCard-purchaseStatusList [data-tax-include-price]")
    .first()
    .attr("data-tax-include-price");

  if (dataPrice) {
    return formatPrice(dataPrice);
  }

  return readText($, ".price, .list-price");
}

function normalizeRating(value: string | null | undefined): string | null {
  const normalized = normalizeText(value);
  return normalized ? normalized.replace(/\.0$/, "") : null;
}

function normalizeDate(value: string | null): string | null {
  const normalized = normalizeText(value);

  if (!normalized) {
    return null;
  }

  return normalized.replace(/\s+\d{2}:\d{2}$/, "");
}

function firstAuthor(jsonLd: WorkJsonLd | null): string | null {
  const author = jsonLd?.author;

  if (Array.isArray(author)) {
    return normalizeText(author.map((item) => item.name ?? "").join(", "));
  }

  return normalizeText(author?.name);
}
