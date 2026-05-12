import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  buildDmmCanonicalUrl,
  classifyDmmPage,
  extractDmmReferenceFromUrl,
  FetchDmmWorkPageError,
  fetchDmmWorkPage,
  isDmmTvContentId,
  isFanzaBooksProductCode,
  isFanzaPcGameSlug,
  normalizeDmmId,
  probeDmmWorkPage,
  resolveDmmWorkPage,
} from "../../../src/integrations/dmm/fetch-work-page";

function readFixture(fileName: string): string {
  return readFileSync(resolve(process.cwd(), "tests/fixtures", fileName), "utf8");
}

describe("fetchDmmWorkPage", () => {
  it("normalizes ids by service", () => {
    expect(normalizeDmmId("fanza_doujin", "D_123456")).toBe("d_123456");
    expect(normalizeDmmId("dmm_tv_av", "MIDV00018")).toBe("midv00018");
    expect(normalizeDmmId("fanza_pcgame", "SPAL_0201")).toBe("spal_0201");
    expect(normalizeDmmId("fanza_books", "B915AWNMG03757")).toBe("b915awnmg03757");
  });

  it("builds canonical URLs by service", () => {
    expect(buildDmmCanonicalUrl("fanza_doujin", "d_123456")).toBe(
      "https://www.dmm.co.jp/dc/doujin/-/detail/=/cid=d_123456/",
    );
    expect(buildDmmCanonicalUrl("dmm_tv_av", "midv00018")).toBe(
      "https://tv.dmm.co.jp/detail/?content=midv00018",
    );
    expect(buildDmmCanonicalUrl("fanza_pcgame", "spal_0201")).toBe(
      "https://dlsoft.dmm.co.jp/detail/spal_0201/",
    );
    expect(buildDmmCanonicalUrl("fanza_books", "b915awnmg03757")).toBe(
      "https://book.dmm.co.jp/product/b915awnmg03757/",
    );
  });

  it("detects supported bare id patterns", () => {
    expect(isDmmTvContentId("midv00018")).toBe(true);
    expect(isDmmTvContentId("h_189pc00037")).toBe(true);
    expect(isFanzaPcGameSlug("spal_0201")).toBe(true);
    expect(isFanzaBooksProductCode("b915awnmg03757")).toBe(true);
  });

  it("extracts service-specific references from URL", () => {
    expect(extractDmmReferenceFromUrl("https://tv.dmm.co.jp/vod/?content=midv00018")).toEqual({
      store: "dmm_tv_av",
      id: "midv00018",
      kind: "url",
      sourceUrl: "https://tv.dmm.co.jp/vod/?content=midv00018",
      matchedText: "https://tv.dmm.co.jp/vod/?content=midv00018",
    });
  });

  it("classifies age_check, work, and not_found pages", () => {
    expect(classifyDmmPage("fanza_doujin", readFixture("fanza-age-check.html"))).toBe("age_check");
    expect(classifyDmmPage("fanza_doujin", readFixture("dmm-fanza-doujin-work.html"))).toBe("work");
    expect(classifyDmmPage("fanza_doujin", readFixture("fanza-not-found.html"))).toBe("not_found");
  });

  it("passes age check and returns work metadata for tv URLs", async () => {
    const targetUrl = "https://tv.dmm.co.jp/vod/?content=midv00018";
    const fetchImpl = createAgeCheckFetchStub({
      targetUrl,
      workHtml: readFixture("dmm-tv-work.html"),
    });

    await expect(
      resolveDmmWorkPage("dmm_tv_av", "midv00018", {
        fetchImpl,
        targetUrl,
      }),
    ).resolves.toMatchObject({
      fetchedUrl: targetUrl,
      resolvedUrl: "https://tv.dmm.co.jp/detail/?content=midv00018",
      store: "dmm_tv_av",
      pageKind: "work",
    });
  });

  it("probes FANZA BOOKS bare ids through a canonical URL", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(new Response(readFixture("dmm-books-work.html"), { status: 200 }));

    await expect(
      probeDmmWorkPage(
        {
          store: "fanza_books",
          id: "b915awnmg03757",
          kind: "code",
          matchedText: "b915awnmg03757",
        },
        { fetchImpl },
      ),
    ).resolves.toMatchObject({
      store: "fanza_books",
      pageKind: "work",
      resolvedUrl: "https://book.dmm.co.jp/product/6214499/b915awnmg03757/",
    });
  });

  it("throws typed error on http failure", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response("missing", { status: 404 }));

    await expect(
      fetchDmmWorkPage(
        {
          store: "fanza_pcgame",
          id: "spal_0201",
          kind: "url",
          sourceUrl: "https://dlsoft.dmm.co.jp/detail/spal_0201/",
          matchedText: "https://dlsoft.dmm.co.jp/detail/spal_0201/",
        },
        { fetchImpl },
      ),
    ).rejects.toBeInstanceOf(FetchDmmWorkPageError);
  });

  it("throws typed error on network failure", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error("boom"));

    await expect(
      fetchDmmWorkPage(
        {
          store: "fanza_doujin",
          id: "d_000001",
          kind: "url",
          sourceUrl: "https://www.dmm.co.jp/dc/doujin/-/detail/=/cid=d_000001/",
          matchedText: "https://www.dmm.co.jp/dc/doujin/-/detail/=/cid=d_000001/",
        },
        { fetchImpl },
      ),
    ).rejects.toBeInstanceOf(FetchDmmWorkPageError);
  });
});

function createAgeCheckFetchStub(params: { targetUrl: string; workHtml: string }) {
  const ageCheckUrl = `https://www.dmm.co.jp/age_check/=/?rurl=${encodeURIComponent(params.targetUrl)}`;
  const declaredYesUrl = `https://www.dmm.co.jp/age_check/=/declared=yes/?rurl=${encodeURIComponent(params.targetUrl)}`;

  return vi.fn().mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const cookieHeader =
      init?.headers && !Array.isArray(init.headers) && !(init.headers instanceof Headers)
        ? init.headers.cookie
        : undefined;

    if (url === params.targetUrl && !cookieHeader?.includes("age_check_done=1")) {
      return new Response("", {
        status: 302,
        headers: {
          location: ageCheckUrl,
        },
      });
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
