import { load } from "cheerio";
import { FetchFanzaPageError } from "./errors";

export type FanzaSurface = "dc/doujin" | "digital/videoa" | "unknown";
export type FanzaPageKind = "work" | "age_check" | "not_found" | "unknown";

export const FANZA_CID_PROBE_SURFACES = ["dc/doujin", "digital/videoa"] as const;

export type FanzaResolvedWorkPage = {
  fetchedUrl: string;
  resolvedUrl: string;
  surface: FanzaSurface;
  pageKind: FanzaPageKind;
  html: string;
  status: number;
};

type FetchLike = typeof fetch;

type FetchFanzaPageOptions = {
  fetchImpl?: FetchLike;
  userAgent?: string;
  surface?: FanzaSurface;
  sourceUrl?: string;
};

type CookieJar = Map<string, string>;
type ProductJsonLd = { "@type"?: string; url?: string };

export function normalizeCid(input: string): string {
  const raw = input.trim();
  const fromQuery = raw.match(/cid=([a-z0-9_]+)/i)?.[1];
  const candidate = (fromQuery ?? raw).toLowerCase();
  const stripped = candidate.replace(/\.html?$/i, "").replace(/[^a-z0-9_]/g, "");

  if (!/[0-9]/.test(stripped) || stripped.length < 3) {
    throw new TypeError(`Invalid FANZA cid: ${input}`);
  }

  return stripped;
}

export function buildCanonicalUrl(cid: string, surface: FanzaSurface = "dc/doujin"): string {
  const normalizedCid = normalizeCid(cid);

  if (surface === "dc/doujin") {
    return `https://www.dmm.co.jp/dc/doujin/-/detail/=/cid=${normalizedCid}/`;
  }

  if (surface === "digital/videoa") {
    return `https://www.dmm.co.jp/digital/videoa/-/detail/=/cid=${normalizedCid}/`;
  }

  return `https://www.dmm.co.jp/-/detail/=/cid=${normalizedCid}/`;
}

export function detectFanzaSurface(sourceUrl?: string): FanzaSurface {
  if (!sourceUrl) {
    return "dc/doujin";
  }

  try {
    const url = new URL(sourceUrl);

    if (/\/dc\/doujin\//.test(url.pathname)) {
      return "dc/doujin";
    }

    if (/\/digital\/videoa\//.test(url.pathname)) {
      return "digital/videoa";
    }
  } catch {}

  return "unknown";
}

export async function fetchFanzaWorkPage(
  cid: string,
  options: FetchFanzaPageOptions = {},
): Promise<string> {
  const resolved = await resolveFanzaWorkPage(cid, options);

  if (resolved.pageKind !== "work") {
    throw new FetchFanzaPageError({
      code: "unexpected_page",
      message: `Unexpected FANZA page kind ${resolved.pageKind} for ${normalizeCid(cid)}`,
      cid: normalizeCid(cid),
      status: resolved.status,
    });
  }

  return resolved.html;
}

export async function probeFanzaWorkPage(
  cid: string,
  options: Omit<FetchFanzaPageOptions, "surface" | "sourceUrl"> = {},
): Promise<FanzaResolvedWorkPage | null> {
  const normalizedCid = normalizeCid(cid);

  for (const surface of FANZA_CID_PROBE_SURFACES) {
    try {
      const resolved = await resolveFanzaWorkPage(normalizedCid, {
        ...options,
        surface,
      });

      if (resolved.pageKind === "work") {
        return resolved;
      }
    } catch (error) {
      if (
        error instanceof FetchFanzaPageError &&
        (error.code === "http_error" || error.code === "unexpected_page")
      ) {
        continue;
      }

      throw error;
    }
  }

  return null;
}

export async function resolveFanzaWorkPage(
  cid: string,
  options: FetchFanzaPageOptions = {},
): Promise<FanzaResolvedWorkPage> {
  const normalizedCid = normalizeCid(cid);
  const targetUrl =
    options.sourceUrl ?? buildCanonicalUrl(normalizedCid, options.surface ?? "dc/doujin");
  const fetchImpl = options.fetchImpl ?? fetch;
  const userAgent = options.userAgent ?? "Mozilla/5.0 FANZA Preview Bot";
  const cookies: CookieJar = new Map();

  const initialResponse = await fetchWithCookies(fetchImpl, targetUrl, userAgent, cookies);

  if (isRedirect(initialResponse.status)) {
    const redirectUrl = readLocation(initialResponse, targetUrl);

    if (!redirectUrl) {
      throw new FetchFanzaPageError({
        code: "unexpected_page",
        message: `Redirect without location for ${normalizedCid}`,
        cid: normalizedCid,
        status: initialResponse.status,
      });
    }

    if (isAgeCheckUrl(redirectUrl)) {
      await passAgeCheck(fetchImpl, redirectUrl, userAgent, cookies, normalizedCid);
      const workResponse = await fetchWithCookies(fetchImpl, targetUrl, userAgent, cookies);
      return buildResolvedWorkPage(await workResponse.text(), workResponse.status, targetUrl);
    }

    const redirectedResponse = await fetchWithCookies(fetchImpl, redirectUrl, userAgent, cookies);
    return buildResolvedWorkPage(
      await redirectedResponse.text(),
      redirectedResponse.status,
      redirectUrl,
    );
  }

  return buildResolvedWorkPage(await initialResponse.text(), initialResponse.status, targetUrl);
}

async function passAgeCheck(
  fetchImpl: FetchLike,
  ageCheckUrl: string,
  userAgent: string,
  cookies: CookieJar,
  cid: string,
): Promise<void> {
  const declaredYesUrl = buildDeclaredYesUrl(ageCheckUrl);
  const response = await fetchWithCookies(fetchImpl, declaredYesUrl, userAgent, cookies);

  if (!cookies.has("age_check_done")) {
    throw new FetchFanzaPageError({
      code: "unexpected_page",
      message: `FANZA age check cookie was not set for ${cid}`,
      cid,
      status: response.status,
    });
  }
}

async function fetchWithCookies(
  fetchImpl: FetchLike,
  targetUrl: string,
  userAgent: string,
  cookies: CookieJar,
): Promise<Response> {
  let response: Response;

  try {
    response = await fetchImpl(targetUrl, {
      redirect: "manual",
      headers: buildHeaders(userAgent, cookies),
    });
  } catch (error) {
    throw new FetchFanzaPageError({
      code: "network_error",
      message: `Failed to fetch FANZA page ${targetUrl}`,
      cid: normalizeCid(targetUrl),
      cause: error,
    });
  }

  storeCookies(response, cookies);

  if (response.status >= 400) {
    throw new FetchFanzaPageError({
      code: "http_error",
      message: `Unexpected status ${response.status} for ${targetUrl}`,
      cid: normalizeCid(targetUrl),
      status: response.status,
    });
  }

  return response;
}

function buildResolvedWorkPage(
  html: string,
  status: number,
  fetchedUrl: string,
): FanzaResolvedWorkPage {
  const pageKind = classifyFanzaPage(html, fetchedUrl);
  const resolvedUrl = extractResolvedUrl(html) ?? fetchedUrl;

  return {
    fetchedUrl,
    resolvedUrl,
    surface: detectFanzaSurface(resolvedUrl),
    pageKind,
    html,
    status,
  };
}

export function classifyFanzaPage(html: string, fallbackUrl?: string): FanzaPageKind {
  const $ = load(html);
  const title = normalizeText($("title").first().text());
  const canonicalUrl =
    normalizeText($("link[rel='canonical']").attr("href")) ??
    normalizeText($("meta[property='og:url']").attr("content")) ??
    readProductJsonLd($)?.url ??
    fallbackUrl ??
    null;

  if (
    title === "年齢認証 - FANZA" ||
    html.includes("age_check_done") ||
    html.includes("あなたは18歳以上ですか？")
  ) {
    return "age_check";
  }

  if (
    title?.includes("見つかりません") ||
    title?.includes("削除されたページ") ||
    html.includes("noindex,nofollow")
  ) {
    return "not_found";
  }

  if (canonicalUrl && /\/-\/detail\/=\/cid=/.test(canonicalUrl) && readProductJsonLd($)) {
    return "work";
  }

  if (
    canonicalUrl &&
    /\/-\/detail\/=\/cid=/.test(canonicalUrl) &&
    $("meta[property='og:title']").length > 0
  ) {
    return "work";
  }

  return "unknown";
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

function buildHeaders(userAgent: string, cookies: CookieJar): HeadersInit {
  const headers: Record<string, string> = {
    "user-agent": userAgent,
  };
  const cookieHeader = serializeCookies(cookies);

  if (cookieHeader) {
    headers.cookie = cookieHeader;
  }

  return headers;
}

function serializeCookies(cookies: CookieJar): string | undefined {
  if (cookies.size === 0) {
    return undefined;
  }

  return Array.from(cookies.entries())
    .map(([name, value]) => `${name}=${value}`)
    .join("; ");
}

function storeCookies(response: Response, cookies: CookieJar): void {
  for (const rawCookie of getSetCookieHeaders(response.headers)) {
    for (const pair of rawCookie.matchAll(/(?:^|,)\s*([^=;,\s]+)=([^;,\r\n]*)/g)) {
      const [, name, value] = pair;

      if (name && value) {
        cookies.set(name, value);
      }
    }
  }
}

function getSetCookieHeaders(headers: Headers): string[] {
  const getSetCookie = Reflect.get(headers, "getSetCookie");

  if (typeof getSetCookie === "function") {
    return getSetCookie.call(headers) as string[];
  }

  const raw = headers.get("set-cookie");
  return raw ? [raw] : [];
}

function isRedirect(status: number): boolean {
  return status >= 300 && status < 400;
}

function readLocation(response: Response, baseUrl: string): string | null {
  const location = response.headers.get("location");

  if (!location) {
    return null;
  }

  return new URL(location, baseUrl).toString();
}

function isAgeCheckUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return /\/age_check\//.test(parsed.pathname);
  } catch {
    return false;
  }
}

function buildDeclaredYesUrl(ageCheckUrl: string): string {
  const url = new URL(ageCheckUrl);
  url.pathname = "/age_check/=/declared=yes/";
  return url.toString();
}

function normalizeText(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length > 0 ? normalized : null;
}
