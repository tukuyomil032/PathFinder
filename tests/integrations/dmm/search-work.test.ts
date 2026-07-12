import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { SearchQuery } from "../../../src/domain/search/types";
import {
  buildFanzaDoujinMakerListUrl,
  buildFanzaDoujinSearchUrl,
  fetchFanzaDoujinMakerListPage,
  fetchFanzaDoujinSearchPage,
} from "../../../src/integrations/dmm/search-work";

function readFixture(fileName: string): string {
  return readFileSync(resolve(process.cwd(), "tests/fixtures", fileName), "utf8");
}

const baseQuery: SearchQuery = { target: "fanza_doujin", keyword: "RPG" };

describe("buildFanzaDoujinSearchUrl", () => {
  it("builds the keyword-only URL", () => {
    expect(buildFanzaDoujinSearchUrl(baseQuery, 1)).toBe(
      "https://www.dmm.co.jp/dc/doujin/-/list/narrow/=/word=RPG/page=1/",
    );
  });

  it("appends the sort segment when provided", () => {
    expect(buildFanzaDoujinSearchUrl({ ...baseQuery, sort: "popularity" }, 2)).toBe(
      "https://www.dmm.co.jp/dc/doujin/-/list/narrow/=/word=RPG/sort=sales/page=2/",
    );
  });

  it("omits the sort segment for price_desc since it is not natively supported", () => {
    const url = buildFanzaDoujinSearchUrl({ ...baseQuery, sort: "price_desc" }, 1);
    expect(url).not.toContain("sort=");
  });

  it("encodes keywords containing spaces and symbols", () => {
    const url = buildFanzaDoujinSearchUrl({ ...baseQuery, keyword: "剣と魔法/冒険" }, 1);
    expect(url).toContain(`word=${encodeURIComponent("剣と魔法/冒険")}`);
  });
});

describe("buildFanzaDoujinMakerListUrl", () => {
  it("builds the maker listing URL", () => {
    expect(buildFanzaDoujinMakerListUrl("76353")).toBe(
      "https://www.dmm.co.jp/dc/doujin/-/list/=/article=maker/id=76353/",
    );
  });
});

describe("fetchFanzaDoujinSearchPage", () => {
  it("passes the age-check cookie flow and returns the resulting html", async () => {
    const targetUrl = buildFanzaDoujinSearchUrl(baseQuery, 1);
    const workHtml = readFixture("fanza-doujin-search-results.html");
    const fetchImpl = createAgeCheckFetchStub({ targetUrl, workHtml });

    await expect(
      fetchFanzaDoujinSearchPage(baseQuery, 1, { fetchImpl, userAgent: "test-agent" }),
    ).resolves.toBe(workHtml);
  });
});

function createAgeCheckFetchStub(params: { targetUrl: string; workHtml: string }) {
  const ageCheckUrl = `https://www.dmm.co.jp/age_check/=/?rurl=${encodeURIComponent(params.targetUrl)}`;
  const declaredYesUrl = `https://www.dmm.co.jp/age_check/=/declared=yes/?rurl=${encodeURIComponent(params.targetUrl)}`;

  return vi.fn().mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const cookieHeader =
      init?.headers && !Array.isArray(init.headers) && !(init.headers instanceof Headers)
        ? (init.headers as Record<string, string>).cookie
        : undefined;

    if (url === params.targetUrl && !cookieHeader?.includes("age_check_done=1")) {
      return new Response("", { status: 302, headers: { location: ageCheckUrl } });
    }

    if (url === declaredYesUrl) {
      return new Response("", {
        status: 302,
        headers: {
          location: params.targetUrl,
          "set-cookie": "age_check_done=1; Domain=.dmm.co.jp; Path=/; HttpOnly",
        },
      });
    }

    if (url === params.targetUrl && cookieHeader?.includes("age_check_done=1")) {
      return new Response(params.workHtml, { status: 200 });
    }

    throw new Error(`Unexpected request: ${url}`);
  });
}

describe("fetchFanzaDoujinMakerListPage", () => {
  it("fetches the maker listing html", async () => {
    const html = readFixture("fanza-doujin-maker-list.html");
    const fetchImpl = vi.fn().mockResolvedValue(new Response(html, { status: 200 }));

    await expect(
      fetchFanzaDoujinMakerListPage("76353", { fetchImpl, userAgent: "test-agent" }),
    ).resolves.toBe(html);

    expect(fetchImpl).toHaveBeenCalledWith(
      "https://www.dmm.co.jp/dc/doujin/-/list/=/article=maker/id=76353/",
      expect.objectContaining({ headers: expect.objectContaining({ "user-agent": "test-agent" }) }),
    );
  });
});
