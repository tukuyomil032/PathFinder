import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  fetchWorkPage,
  parseWork,
  WorkPreviewResolutionError,
} from "../../../src/domain/rj/resolve-work";
import type { FetchedWorkPage } from "../../../src/domain/rj/types";

function readFixture(fileName: string): string {
  return readFileSync(resolve(process.cwd(), "tests/fixtures", fileName), "utf8");
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("resolve-work", () => {
  it("parses DLSite books fixtures through the shared flow", () => {
    const page: FetchedWorkPage = {
      store: "dlsite",
      html: readFixture("dlsite-books-work.html"),
      fetchedUrl: "https://www.dlsite.com/books/work/=/product_id/BJ02519460.html",
      resolvedUrl: "https://www.dlsite.com/books/work/=/product_id/BJ02519460.html",
      pageKind: "work",
      status: 200,
    };
    const work = parseWork(page, {
      store: "dlsite",
      id: "BJ02519460",
      kind: "code",
      matchedText: "BJ02519460",
    });

    expect(work).toMatchObject({
      id: "BJ02519460",
      title: "夜更かし読書会",
      serviceName: "DLSite Books",
      parserName: "dlsite/books",
    });
  });

  it("parses DLSite pro fixtures through the shared flow", () => {
    const page: FetchedWorkPage = {
      store: "dlsite",
      html: readFixture("dlsite-pro-work.html"),
      fetchedUrl: "https://www.dlsite.com/pro/work/=/product_id/VJ01004728.html",
      resolvedUrl: "https://www.dlsite.com/pro/work/=/product_id/VJ01004728.html",
      pageKind: "work",
      status: 200,
    };
    const work = parseWork(page, {
      store: "dlsite",
      id: "VJ01004728",
      kind: "url",
      sourceUrl: "https://www.dlsite.com/pro/work/=/product_id/VJ01004728.html",
      matchedText: "https://www.dlsite.com/pro/work/=/product_id/VJ01004728.html",
    });

    expect(work).toMatchObject({
      id: "VJ01004728",
      title: "空色ステップ",
      serviceName: "DLSite 美少女ゲーム",
      parserName: "dlsite/pro",
    });
  });

  it("resolves DLSite bare ids to prefix-based canonical URLs", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(readFixture("dlsite-pro-work.html"), { status: 200 })),
    );

    await expect(
      fetchWorkPage({
        store: "dlsite",
        id: "VJ01004728",
        kind: "code",
        matchedText: "VJ01004728",
      }),
    ).resolves.toMatchObject({
      store: "dlsite",
      fetchedUrl: "https://www.dlsite.com/pro/work/=/product_id/VJ01004728.html",
      resolvedUrl: "https://www.dlsite.com/pro/work/=/product_id/VJ01004728.html",
    });
  });

  it("keeps DLSite URL inputs while normalizing resolvedUrl to the canonical surface", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(new Response(readFixture("dlsite-books-work.html"), { status: 200 })),
    );

    await expect(
      fetchWorkPage({
        store: "dlsite",
        id: "BJ02519460",
        kind: "url",
        sourceUrl: "https://www.dlsite.com/books/work/=/product_id/BJ02519460.html?locale=ja_JP",
        matchedText: "https://www.dlsite.com/books/work/=/product_id/BJ02519460.html?locale=ja_JP",
      }),
    ).resolves.toMatchObject({
      store: "dlsite",
      fetchedUrl: "https://www.dlsite.com/books/work/=/product_id/BJ02519460.html?locale=ja_JP",
      resolvedUrl: "https://www.dlsite.com/books/work/=/product_id/BJ02519460.html",
    });
  });

  it("parses FANZA同人 fixtures as full previews", () => {
    const page: FetchedWorkPage = {
      store: "fanza_doujin",
      html: readFixture("dmm-fanza-doujin-work.html"),
      fetchedUrl: "https://www.dmm.co.jp/dc/doujin/-/detail/=/cid=d_743581/",
      resolvedUrl: "https://www.dmm.co.jp/dc/doujin/-/detail/=/cid=d_743581/",
      pageKind: "work",
      status: 200,
    };
    const work = parseWork(page, {
      store: "fanza_doujin",
      id: "d_743581",
      kind: "url",
      sourceUrl: "https://www.dmm.co.jp/dc/doujin/-/detail/=/cid=d_743581/",
      matchedText: "https://www.dmm.co.jp/dc/doujin/-/detail/=/cid=d_743581/",
    });

    expect(work.store).toBe("fanza_doujin");
    expect(work.parseCoverage).toBe("full");
    expect(work.title).toBe("田舎妹と無知の誘惑2");
  });

  it("resolves DMM TV URLs after passing age check without dropping query", async () => {
    const targetUrl = "https://tv.dmm.co.jp/vod/?content=midv00018";
    const fetchStub = createAgeCheckFetchStub({
      targetUrl,
      workHtml: readFixture("dmm-tv-work.html"),
    });
    vi.stubGlobal("fetch", fetchStub);

    await expect(
      fetchWorkPage({
        store: "dmm_tv_av",
        id: "midv00018",
        kind: "url",
        sourceUrl: targetUrl,
        matchedText: targetUrl,
      }),
    ).resolves.toMatchObject({
      store: "dmm_tv_av",
      pageKind: "work",
      fetchedUrl: targetUrl,
    });

    expect(fetchStub).toHaveBeenCalledTimes(3);
  });

  it("resolves FANZA PCゲーム bare slugs", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(readFixture("dmm-pcgame-work.html"), { status: 200 })),
    );

    await expect(
      fetchWorkPage({
        store: "fanza_pcgame",
        id: "spal_0201",
        kind: "code",
        matchedText: "spal_0201",
      }),
    ).resolves.toMatchObject({
      store: "fanza_pcgame",
      pageKind: "work",
      resolvedUrl: "https://dlsoft.dmm.co.jp/detail/spal_0201/",
    });
  });

  it("resolves FANZA BOOKS bare product codes through canonical probe", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(readFixture("dmm-books-work.html"), { status: 200 })),
    );

    await expect(
      fetchWorkPage({
        store: "fanza_books",
        id: "b915awnmg03757",
        kind: "code",
        matchedText: "b915awnmg03757",
      }),
    ).resolves.toMatchObject({
      store: "fanza_books",
      pageKind: "work",
    });
  });

  it("asks for a URL only when FANZA同人 bare cid cannot be resolved", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(readFixture("fanza-not-found.html"), { status: 200 })),
    );

    await expect(
      fetchWorkPage({
        store: "fanza_doujin",
        id: "d_999999",
        kind: "code",
        matchedText: "d_999999",
      }),
    ).rejects.toEqual(new WorkPreviewResolutionError("fanza_url_required", "d_999999"));
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
        headers: { location: ageCheckUrl },
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
