import { load } from "cheerio";

export type FetchLike = typeof fetch;
export type CookieJar = Map<string, string>;

export type FetchedDmmHtml = {
  html: string;
  fetchedUrl: string;
  status: number;
};

export type FetchDmmHtmlOptions = {
  fetchImpl?: FetchLike;
  userAgent?: string;
};

export class DmmHttpError extends Error {
  readonly code: "network_error" | "http_error" | "unexpected_page";
  readonly status?: number;

  constructor(params: {
    code: "network_error" | "http_error" | "unexpected_page";
    message: string;
    status?: number;
    cause?: unknown;
  }) {
    super(params.message, { cause: params.cause });
    this.name = "DmmHttpError";
    this.code = params.code;
    this.status = params.status;
  }
}

/**
 * targetUrl を取得する。年齢確認へリダイレクト/フォールバックされた場合は
 * age_check_done Cookie を取得してから targetUrl を再取得する。
 * 年齢確認以外のリダイレクトは1回だけ追従する。
 */
export async function fetchDmmHtmlWithAgeCheck(
  targetUrl: string,
  options: FetchDmmHtmlOptions = {},
): Promise<FetchedDmmHtml> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const userAgent = options.userAgent ?? "Mozilla/5.0 DMM Preview Bot";
  const cookies: CookieJar = new Map();

  const initialResponse = await fetchWithCookies(fetchImpl, targetUrl, userAgent, cookies);

  if (isRedirectStatus(initialResponse.status)) {
    const redirectUrl = readRedirectLocation(initialResponse, targetUrl);

    if (!redirectUrl) {
      throw new DmmHttpError({
        code: "unexpected_page",
        message: `Redirect without location for ${targetUrl}`,
        status: initialResponse.status,
      });
    }

    if (isDmmAgeCheckUrl(redirectUrl)) {
      await passDmmAgeCheck(fetchImpl, redirectUrl, userAgent, cookies);
      return fetchFollowingOneRedirect(fetchImpl, targetUrl, userAgent, cookies);
    }

    const redirectedResponse = await fetchWithCookies(fetchImpl, redirectUrl, userAgent, cookies);
    return {
      html: await redirectedResponse.text(),
      fetchedUrl: redirectUrl,
      status: redirectedResponse.status,
    };
  }

  const html = await initialResponse.text();

  if (isDmmAgeCheckHtml(html)) {
    const ageCheckUrl = extractDmmAgeCheckLinkUrl(html);

    if (ageCheckUrl) {
      await passDmmAgeCheck(fetchImpl, ageCheckUrl, userAgent, cookies);
      return fetchFollowingOneRedirect(fetchImpl, targetUrl, userAgent, cookies);
    }
  }

  return { html, fetchedUrl: targetUrl, status: initialResponse.status };
}

/**
 * 年齢確認突破後に targetUrl を再取得する。DMM 側は URL 正規化のため
 * targetUrl 自体が別URLへ 301/302 リダイレクトされることがある
 * （例: FANZA同人検索の page=1 は常に省略先URLへ301される）ため、
 * そのリダイレクトも1回だけ追従する。
 */
async function fetchFollowingOneRedirect(
  fetchImpl: FetchLike,
  targetUrl: string,
  userAgent: string,
  cookies: CookieJar,
): Promise<FetchedDmmHtml> {
  const response = await fetchWithCookies(fetchImpl, targetUrl, userAgent, cookies);

  if (isRedirectStatus(response.status)) {
    const redirectUrl = readRedirectLocation(response, targetUrl);

    if (redirectUrl) {
      const redirectedResponse = await fetchWithCookies(fetchImpl, redirectUrl, userAgent, cookies);
      return {
        html: await redirectedResponse.text(),
        fetchedUrl: redirectUrl,
        status: redirectedResponse.status,
      };
    }
  }

  return { html: await response.text(), fetchedUrl: targetUrl, status: response.status };
}

export function isDmmAgeCheckHtml(html: string): boolean {
  const $ = load(html);
  const title = normalizeText($("title").first().text());

  return (
    title === "年齢認証 - FANZA" ||
    html.includes("age_check_done") ||
    html.includes("あなたは18歳以上ですか？")
  );
}

export function isDmmAgeCheckUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.hostname === "www.dmm.co.jp" && /\/age_check\//.test(parsed.pathname);
  } catch {
    return false;
  }
}

async function passDmmAgeCheck(
  fetchImpl: FetchLike,
  ageCheckUrl: string,
  userAgent: string,
  cookies: CookieJar,
): Promise<void> {
  const declaredYesUrl = buildDmmDeclaredYesUrl(ageCheckUrl);
  const response = await fetchWithCookies(fetchImpl, declaredYesUrl, userAgent, cookies);

  if (!cookies.has("age_check_done")) {
    throw new DmmHttpError({
      code: "unexpected_page",
      message: `DMM age check cookie was not set for ${ageCheckUrl}`,
      status: response.status,
    });
  }
}

function buildDmmDeclaredYesUrl(ageCheckUrl: string): string {
  const url = new URL(ageCheckUrl);
  url.pathname = "/age_check/=/declared=yes/";
  return url.toString();
}

function extractDmmAgeCheckLinkUrl(html: string): string | null {
  const $ = load(html);

  for (const href of $("a[href]")
    .map((_, node) => $(node).attr("href"))
    .get()) {
    if (href && isDmmAgeCheckUrl(href)) {
      return href;
    }
  }

  return null;
}

function normalizeText(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length > 0 ? normalized : null;
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
    throw new DmmHttpError({
      code: "network_error",
      message: `Failed to fetch DMM page ${targetUrl}`,
      cause: error,
    });
  }

  storeCookies(response, cookies);

  if (response.status >= 400) {
    throw new DmmHttpError({
      code: "http_error",
      message: `Unexpected status ${response.status} for ${targetUrl}`,
      status: response.status,
    });
  }

  return response;
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

function isRedirectStatus(status: number): boolean {
  return status >= 300 && status < 400;
}

function readRedirectLocation(response: Response, baseUrl: string): string | null {
  const location = response.headers.get("location");

  if (!location) {
    return null;
  }

  return new URL(location, baseUrl).toString();
}
