import { load } from "cheerio";
import type { CheerioAPI } from "cheerio";
import type { DLSiteWork } from "../../domain/rj/types";
import { ParseWorkError } from "./errors";

type WorkJsonLd = {
  "@type"?: string;
  name?: string;
  url?: string;
  image?: string | string[];
  brand?: { name?: string };
};

export function parseWork(html: string, rjCode: string): DLSiteWork {
  const $ = load(html);
  const jsonLd = readProductJsonLd($);

  const title =
    jsonLd?.name ?? readMetaContent($, "meta[property='og:title']") ?? readText($, "#work_name");
  const url =
    jsonLd?.url ??
    readMetaContent($, "link[rel='canonical']") ??
    readMetaContent($, "meta[property='og:url']");
  const makerName =
    jsonLd?.brand?.name ??
    readText($, ".maker_name a") ??
    readDefinitionValue($, ["サークル名", "ブランド名", "メーカー"]);
  const ageCategory = readText($, ".age_category") ?? readDefinitionValue($, ["年齢指定", "年齢"]);

  const missingFields = [
    ["title", title],
    ["url", url],
    ["makerName", makerName],
    ["ageCategory", ageCategory],
  ].flatMap(([name, value]) => (value ? [] : [name]));

  if (missingFields.length > 0) {
    throw new ParseWorkError(
      `Required DLSite fields are missing: ${missingFields.join(", ")}`,
      rjCode,
    );
  }

  if (!title || !url || !makerName || !ageCategory) {
    throw new ParseWorkError("Unexpected parser state", rjCode);
  }

  const work: DLSiteWork = {
    id: rjCode.toUpperCase(),
    title,
    url,
    makerName,
    price: readText($, "[data-testid='work-price']") ?? readDefinitionValue($, ["価格"]),
    salePrice:
      readText($, "[data-testid='work-sale-price']") ??
      readDefinitionValue($, ["セール価格", "キャンペーン価格"]),
    ageCategory,
    releaseDate: readDefinitionValue($, ["販売日", "発売日"]),
    rating: readText($, ".rating_average") ?? readDefinitionValue($, ["評価", "レビュー"]),
    thumbnailUrl: normalizeImageUrl(
      Array.isArray(jsonLd?.image) ? jsonLd?.image[0] : jsonLd?.image,
      readMetaContent($, "meta[property='og:image']"),
      readAttribute($, ".work_visual img", "src"),
    ),
    tags: readTags($),
    isAdult: isAdultCategory(ageCategory),
    author: readDefinitionValue($, ["作者"]),
    scenario: readDefinitionValue($, ["シナリオ"]),
    illustration: readDefinitionValue($, ["イラスト"]),
    voiceActors: readListValue($, ["声優"]),
    fileFormat: readDefinitionValue($, ["ファイル形式"]),
    fileSize: readDefinitionValue($, ["ファイル容量", "容量"]),
  };

  return work;
}

function readProductJsonLd($: CheerioAPI): WorkJsonLd | null {
  const nodes = $("script[type='application/ld+json']").toArray();

  for (const node of nodes) {
    const raw = $(node).text().trim();

    if (!raw) {
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

function readDefinitionValue($: CheerioAPI, labels: string[]): string | null {
  for (const label of labels) {
    const dtMatch = $("dt")
      .toArray()
      .find((node) => normalizeText($(node).text()) === label);

    if (dtMatch) {
      const value = normalizeText($(dtMatch).next("dd").text());

      if (value) {
        return value;
      }
    }

    const thMatch = $("th")
      .toArray()
      .find((node) => normalizeText($(node).text()) === label);

    if (thMatch) {
      const value = normalizeText($(thMatch).next("td").text());

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
  const tags = $(".work_tags a, [data-testid='work-tag']")
    .toArray()
    .map((node) => normalizeText($(node).text()))
    .filter((value): value is string => value !== null);

  if (tags.length > 0) {
    return tags;
  }

  return readListValue($, ["ジャンル", "タグ"]);
}

function isAdultCategory(ageCategory: string): boolean {
  return /18|adult|r-?18/i.test(ageCategory);
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
