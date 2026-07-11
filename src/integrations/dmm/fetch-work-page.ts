import { load } from "cheerio";
import type {
  FetchedWorkPage,
  WorkPageKind,
  WorkReference,
  WorkStore,
} from "../../domain/rj/types";
import { DmmHttpError, fetchDmmHtmlWithAgeCheck, isDmmAgeCheckHtml } from "./http-client";

type FetchLike = typeof fetch;
type DmmStore = Exclude<WorkStore, "dlsite">;
type ProductJsonLd = { "@type"?: string; url?: string };

type FetchDmmWorkPageOptions = {
  fetchImpl?: FetchLike;
  userAgent?: string;
};

type ProbeResult = FetchedWorkPage | null;

export class FetchDmmWorkPageError extends Error {
  readonly code: "network_error" | "http_error" | "unexpected_page";
  readonly store: DmmStore;
  readonly workId: string;
  readonly status?: number;

  constructor(params: {
    code: "network_error" | "http_error" | "unexpected_page";
    message: string;
    store: DmmStore;
    workId: string;
    status?: number;
    cause?: unknown;
  }) {
    super(params.message, { cause: params.cause });
    this.name = "FetchDmmWorkPageError";
    this.code = params.code;
    this.store = params.store;
    this.workId = params.workId;
    this.status = params.status;
  }
}

export async function fetchDmmWorkPage(
  reference: WorkReference,
  options: FetchDmmWorkPageOptions = {},
): Promise<FetchedWorkPage> {
  const store = reference.store;

  if (store === "dlsite") {
    throw new TypeError("fetchDmmWorkPage only supports DMM family stores");
  }

  if (reference.kind === "url") {
    const page = await resolveDmmWorkPage(store, normalizeDmmId(store, reference.id), {
      ...options,
      targetUrl: reference.sourceUrl ?? buildDmmCanonicalUrl(store, reference.id),
    });

    if (page.pageKind !== "work") {
      throw new FetchDmmWorkPageError({
        code: "unexpected_page",
        message: `Unexpected DMM page kind ${page.pageKind} for ${reference.id}`,
        store,
        workId: normalizeDmmId(store, reference.id),
        status: page.status,
      });
    }

    return page;
  }

  const probed = await probeDmmWorkPage(reference, options);

  if (!probed) {
    return buildUnresolvedPage(store, reference.id);
  }

  return probed;
}

export async function probeDmmWorkPage(
  reference: WorkReference,
  options: FetchDmmWorkPageOptions = {},
): Promise<ProbeResult> {
  const store = reference.store;

  if (store === "dlsite") {
    throw new TypeError("probeDmmWorkPage only supports DMM family stores");
  }

  const targetUrl = buildDmmCanonicalUrl(store, reference.id);
  const page = await resolveDmmWorkPage(store, normalizeDmmId(store, reference.id), {
    ...options,
    targetUrl,
  });

  return page.pageKind === "work" ? page : null;
}

export async function resolveDmmWorkPage(
  store: DmmStore,
  workId: string,
  options: FetchDmmWorkPageOptions & { targetUrl: string },
): Promise<FetchedWorkPage> {
  const normalizedId = normalizeDmmId(store, workId);

  try {
    const result = await fetchDmmHtmlWithAgeCheck(options.targetUrl, {
      fetchImpl: options.fetchImpl,
      userAgent: options.userAgent,
    });

    return buildResolvedWorkPage(store, result.fetchedUrl, result.html, result.status);
  } catch (error) {
    if (error instanceof DmmHttpError) {
      throw new FetchDmmWorkPageError({
        code: error.code,
        message: error.message,
        store,
        workId: normalizedId,
        status: error.status,
        cause: error.cause,
      });
    }

    throw error;
  }
}

export function buildDmmCanonicalUrl(store: DmmStore, workId: string): string {
  const normalizedId = normalizeDmmId(store, workId);

  switch (store) {
    case "fanza_doujin":
      return `https://www.dmm.co.jp/dc/doujin/-/detail/=/cid=${normalizedId}/`;
    case "dmm_tv_av":
      return `https://tv.dmm.co.jp/detail/?content=${normalizedId}`;
    case "fanza_pcgame":
      return `https://dlsoft.dmm.co.jp/detail/${normalizedId}/`;
    case "fanza_books":
      return `https://book.dmm.co.jp/product/${normalizedId}/`;
  }
}

export function normalizeDmmId(store: DmmStore, input: string): string {
  const raw = input.trim();

  if (store === "fanza_doujin") {
    const fromQuery = raw.match(/cid=([a-z0-9_]+)/i)?.[1];
    const candidate = (fromQuery ?? raw).toLowerCase();
    const condensed = candidate.replace(/\.html?$/i, "").replace(/[^a-z0-9_]/g, "");
    const normalized = /^d\d{3,}$/.test(condensed) ? condensed.replace(/^d/, "d_") : condensed;

    if (!/^d_\d{3,}$/.test(normalized)) {
      throw new TypeError(`Invalid FANZA doujin cid: ${input}`);
    }

    return normalized;
  }

  if (store === "dmm_tv_av") {
    const fromQuery = raw.match(/content=([a-z0-9_]+)/i)?.[1];
    const candidate = (fromQuery ?? raw).toLowerCase();
    const normalized = candidate.replace(/[^a-z0-9_]/g, "");

    if (!isDmmTvContentId(normalized)) {
      throw new TypeError(`Invalid DMM TV content id: ${input}`);
    }

    return normalized;
  }

  if (store === "fanza_pcgame") {
    const fromPath = raw.match(/detail\/([^/?#]+)/i)?.[1];
    const candidate = (fromPath ?? raw).toLowerCase();
    const normalized = candidate.replace(/[^a-z0-9_]/g, "");

    if (!isFanzaPcGameSlug(normalized)) {
      throw new TypeError(`Invalid FANZA PC game slug: ${input}`);
    }

    return normalized;
  }

  const fromPath = raw.match(/product\/(?:\d+\/)?([^/?#]+)/i)?.[1];
  const candidate = (fromPath ?? raw).toLowerCase();
  const normalized = candidate.replace(/[^a-z0-9]/g, "");

  if (!isFanzaBooksProductCode(normalized)) {
    throw new TypeError(`Invalid FANZA BOOKS product code: ${input}`);
  }

  return normalized;
}

export function classifyDmmPage(store: DmmStore, html: string, fallbackUrl?: string): WorkPageKind {
  const $ = load(html);
  const title = normalizeText($("title").first().text());
  const canonicalUrl =
    normalizeText($("link[rel='canonical']").attr("href")) ??
    normalizeText($("meta[property='og:url']").attr("content")) ??
    readProductJsonLd($)?.url ??
    fallbackUrl ??
    null;

  if (isDmmAgeCheckHtml(html)) {
    return "age_check";
  }

  if (
    title?.includes("見つかりません") ||
    title?.includes("削除されたページ") ||
    title?.includes("ページが見つかりません") ||
    html.includes("noindex,nofollow")
  ) {
    return "not_found";
  }

  if (canonicalUrl && matchesStoreUrl(store, canonicalUrl) && hasWorkSignals($)) {
    return "work";
  }

  return "unknown";
}

export function extractDmmReferenceFromUrl(rawUrl: string): WorkReference | null {
  let url: URL;

  try {
    url = new URL(rawUrl);
  } catch {
    return null;
  }

  if (url.hostname === "www.dmm.co.jp" && /\/dc\/doujin\//.test(url.pathname)) {
    const cid = url.searchParams.get("cid") ?? url.pathname.match(/cid=([a-z0-9_]+)/i)?.[1];

    if (!cid) {
      return null;
    }

    return {
      store: "fanza_doujin",
      id: normalizeDmmId("fanza_doujin", cid),
      kind: "url",
      sourceUrl: rawUrl,
      matchedText: rawUrl,
    };
  }

  if (
    url.hostname === "tv.dmm.co.jp" &&
    (url.pathname === "/detail/" || url.pathname === "/vod/")
  ) {
    const content = url.searchParams.get("content");

    if (!content) {
      return null;
    }

    return {
      store: "dmm_tv_av",
      id: normalizeDmmId("dmm_tv_av", content),
      kind: "url",
      sourceUrl: rawUrl,
      matchedText: rawUrl,
    };
  }

  if (url.hostname === "dlsoft.dmm.co.jp") {
    const slug = url.pathname.match(/^\/detail\/([^/]+)\/?$/i)?.[1];

    if (!slug) {
      return null;
    }

    return {
      store: "fanza_pcgame",
      id: normalizeDmmId("fanza_pcgame", slug),
      kind: "url",
      sourceUrl: rawUrl,
      matchedText: rawUrl,
    };
  }

  if (url.hostname === "book.dmm.co.jp") {
    const productCode = url.pathname.match(/^\/product\/\d+\/([^/]+)\/?$/i)?.[1];

    if (!productCode) {
      return null;
    }

    return {
      store: "fanza_books",
      id: normalizeDmmId("fanza_books", productCode),
      kind: "url",
      sourceUrl: rawUrl,
      matchedText: rawUrl,
    };
  }

  return null;
}

export function isDmmTvContentId(value: string): boolean {
  return (
    /^[a-z]{3,8}\d{4,6}$/i.test(value) ||
    /^\d[a-z]{3,8}\d{4,6}$/i.test(value) ||
    /^[a-z]_\d[a-z0-9]{5,}$/i.test(value)
  );
}

export function isFanzaPcGameSlug(value: string): boolean {
  return /^[a-z][a-z0-9]{1,}_[0-9]{3,}$/i.test(value) && !/^d_\d{3,}$/i.test(value);
}

export function isFanzaBooksProductCode(value: string): boolean {
  return /^b\d{3,}[a-z]{2,}[a-z0-9]*\d{3,}$/i.test(value);
}

function buildResolvedWorkPage(
  store: DmmStore,
  fetchedUrl: string,
  html: string,
  status: number,
): FetchedWorkPage {
  const resolvedUrl = extractResolvedUrl(html) ?? fetchedUrl;
  return {
    store,
    html,
    fetchedUrl,
    resolvedUrl,
    pageKind: classifyDmmPage(store, html, fetchedUrl),
    status,
  };
}

function buildUnresolvedPage(store: DmmStore, workId: string): FetchedWorkPage {
  return {
    store,
    html: "",
    fetchedUrl: buildDmmCanonicalUrl(store, workId),
    resolvedUrl: buildDmmCanonicalUrl(store, workId),
    pageKind: "not_found",
    status: 404,
  };
}

function extractResolvedUrl(html: string): string | null {
  const $ = load(html);

  return (
    readProductJsonLd($)?.url ??
    normalizeText($("link[rel='canonical']").attr("href")) ??
    normalizeText($("meta[property='og:url']").attr("content"))
  );
}

function readProductJsonLd($: ReturnType<typeof load>): ProductJsonLd | null {
  for (const node of $("script[type='application/ld+json']").toArray()) {
    const raw = $(node).text().trim();

    if (!raw || raw.startsWith("//")) {
      continue;
    }

    try {
      const parsed = JSON.parse(raw) as ProductJsonLd | ProductJsonLd[];
      const candidates = Array.isArray(parsed) ? parsed : [parsed];
      const product = candidates.find((candidate) => candidate["@type"] === "Product");

      if (product) {
        return product;
      }
    } catch {}
  }

  return null;
}

function hasWorkSignals($: ReturnType<typeof load>): boolean {
  return (
    $("meta[property='og:title']").length > 0 ||
    $("script[type='application/ld+json']").length > 0 ||
    $("h1").length > 0
  );
}

function matchesStoreUrl(store: DmmStore, url: string): boolean {
  try {
    const parsed = new URL(url);

    switch (store) {
      case "fanza_doujin":
        return parsed.hostname === "www.dmm.co.jp" && /\/dc\/doujin\//.test(parsed.pathname);
      case "dmm_tv_av":
        return (
          parsed.hostname === "tv.dmm.co.jp" && ["/detail/", "/vod/"].includes(parsed.pathname)
        );
      case "fanza_pcgame":
        return parsed.hostname === "dlsoft.dmm.co.jp" && /\/detail\//.test(parsed.pathname);
      case "fanza_books":
        return parsed.hostname === "book.dmm.co.jp" && /\/product\//.test(parsed.pathname);
    }
  } catch {
    return false;
  }
}

function normalizeText(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length > 0 ? normalized : null;
}
