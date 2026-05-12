import { load } from "cheerio";
import type { CheerioAPI } from "cheerio";
import { ParseFanzaWorkError } from "./errors";
import { detectFanzaSurface, type FanzaSurface, normalizeCid } from "./fetch-work-page";

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
};

export type FanzaWork = {
  cid: string;
  title: string | null;
  url: string | null;
  circleName: string | null;
  price: string | null;
  salePrice: string | null;
  ageCategory: string | null;
  releaseDate: string | null;
  rating: string | null;
  thumbnailUrl: string | null;
  tags: string[];
  isAdult: boolean | null;
  author: string | null;
  scenario: string | null;
  illustration: string | null;
  voiceActors: string[];
  fileFormat: string | null;
  fileSize: string | null;
};

export type ParseFanzaWorkResult = {
  status: "full" | "partial";
  surface: FanzaSurface;
  work: FanzaWork;
  missingFields: string[];
};

export function parseFanzaWork(html: string, cid: string): ParseFanzaWorkResult {
  const normalizedCid = normalizeCid(cid);
  const $ = load(html);
  const jsonLd = readProductJsonLd($);
  const title = normalizeTitle(
    jsonLd?.name ??
      readMetaContent($, "meta[property='og:title']") ??
      readText($, ".productTitle__txt") ??
      readText($, "h1") ??
      readText($, "title"),
  );
  const url =
    jsonLd?.offers?.url ??
    jsonLd?.url ??
    readMetaContent($, "link[rel='canonical']") ??
    readMetaContent($, "meta[property='og:url']");

  if (!title || !url) {
    throw new ParseFanzaWorkError("Required FANZA fields are missing: title, url", normalizedCid);
  }

  const surface = detectFanzaSurface(url);
  const thumbnailUrl = normalizeImageUrl(
    firstImage(jsonLd?.image),
    readMetaContent($, "meta[property='og:image']"),
    readAttribute($, ".previewList__item img, .main-image img, .product-image img", "src"),
  );
  const circleName =
    jsonLd?.brand?.name ??
    readText($, ".makerName__txt, #maker, .maker_name a, .circleName") ??
    readDefinitionValue($, ["サークル名", "ブランド", "メーカー"]);
  const baseWork = emptyWork(normalizedCid, title, url, thumbnailUrl, circleName);

  if (surface !== "dc/doujin") {
    return {
      status: "partial",
      surface,
      work: baseWork,
      missingFields: ["detail_fields_unavailable"],
    };
  }

  const tags = readTags($);
  const ageCategory =
    readDefinitionValue($, ["年齢指定", "年齢"]) ??
    tags.find((tag) => /成人向け|18禁/i.test(tag)) ??
    "成人向け";
  const price =
    formatPrice(jsonLd?.offers?.price) ?? readDisplayedPrice($) ?? readDefinitionValue($, ["価格"]);
  const work: FanzaWork = {
    ...baseWork,
    price,
    salePrice:
      readText($, ".tx-hangaku, .sale-price, .campaign-price") ??
      readDefinitionValue($, ["セール価格", "キャンペーン価格"]),
    ageCategory,
    releaseDate: normalizeDate(readDefinitionValue($, ["配信開始日", "販売日", "発売日"])),
    rating:
      normalizeRating(jsonLd?.aggregateRating?.ratingValue) ??
      readText($, ".dcd-review__average, .rating") ??
      readDefinitionValue($, ["評価"]),
    tags,
    isAdult: true,
    author: readDefinitionValue($, ["作者"]),
    scenario: readDefinitionValue($, ["シナリオ"]),
    illustration: readDefinitionValue($, ["イラスト"]),
    voiceActors: readListValue($, ["声優"]),
    fileFormat: readDefinitionValue($, ["ファイル形式"]),
    fileSize: readDefinitionValue($, ["ファイル容量", "容量"]),
  };

  const missingFields = (
    [
      ["circleName", work.circleName],
      ["ageCategory", work.ageCategory],
      ["price", work.price],
    ] as const
  )
    .filter(([, value]) => !value)
    .map(([key]) => key);

  return {
    status: missingFields.length === 0 ? "full" : "partial",
    surface,
    work,
    missingFields,
  };
}

function emptyWork(
  cid: string,
  title: string,
  url: string,
  thumbnailUrl: string | null,
  circleName: string | null,
): FanzaWork {
  return {
    cid,
    title,
    url,
    circleName,
    price: null,
    salePrice: null,
    ageCategory: null,
    releaseDate: null,
    rating: null,
    thumbnailUrl,
    tags: [],
    isAdult: null,
    author: null,
    scenario: null,
    illustration: null,
    voiceActors: [],
    fileFormat: null,
    fileSize: null,
  };
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
  const tags = $(".genreTagList .genreTag__txt, .tags a, .tag-list a, [data-testid='work-tag']")
    .toArray()
    .map((node) => normalizeText($(node).text()))
    .filter((value): value is string => value !== null);

  if (tags.length > 0) {
    return tags;
  }

  return readListValue($, ["ジャンル", "タグ"]);
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
