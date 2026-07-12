import { describe, expect, it, vi } from "vitest";
import {
  DmmHttpError,
  fetchDmmHtmlWithAgeCheck,
  isDmmAgeCheckHtml,
  isDmmAgeCheckUrl,
} from "../../../src/integrations/dmm/http-client";

const TARGET_URL = "https://www.dmm.co.jp/dc/doujin/-/list/narrow/=/word=RPG/";

function cookieHeaderOf(init?: RequestInit): string | undefined {
  return init?.headers && !Array.isArray(init.headers) && !(init.headers instanceof Headers)
    ? (init.headers as Record<string, string>).cookie
    : undefined;
}

describe("fetchDmmHtmlWithAgeCheck", () => {
  it("passes the age-check flow via redirect and returns the target html", async () => {
    const ageCheckUrl = `https://www.dmm.co.jp/age_check/=/?rurl=${encodeURIComponent(TARGET_URL)}`;
    const declaredYesUrl = `https://www.dmm.co.jp/age_check/=/declared=yes/?rurl=${encodeURIComponent(TARGET_URL)}`;

    const fetchImpl = vi
      .fn()
      .mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        const cookieHeader = cookieHeaderOf(init);

        if (url === TARGET_URL && !cookieHeader?.includes("age_check_done=1")) {
          return new Response("", { status: 302, headers: { location: ageCheckUrl } });
        }

        if (url === declaredYesUrl) {
          return new Response("", {
            status: 302,
            headers: {
              location: TARGET_URL,
              "set-cookie": "age_check_done=1; Domain=.dmm.co.jp; Path=/",
            },
          });
        }

        if (url === TARGET_URL && cookieHeader?.includes("age_check_done=1")) {
          return new Response("<html>result</html>", { status: 200 });
        }

        throw new Error(`Unexpected request: ${url}`);
      });

    await expect(fetchDmmHtmlWithAgeCheck(TARGET_URL, { fetchImpl })).resolves.toEqual({
      html: "<html>result</html>",
      fetchedUrl: TARGET_URL,
      status: 200,
    });
  });

  it("follows a 301 URL-normalization redirect on the post-age-check refetch (regression: FANZA doujin page=1)", async () => {
    // Reproduces the bug found in production: DMM returns 302 -> age_check on the first
    // (cookie-less) request, but once age_check_done is set, re-requesting targetUrl itself
    // gets 301'd to a normalized URL (e.g. page=1 is always redirected away). The old
    // implementation returned that 301's empty body as "html", so every first-page search
    // silently came back with 0 results.
    const ageCheckUrl = `https://www.dmm.co.jp/age_check/=/?rurl=${encodeURIComponent(TARGET_URL)}`;
    const declaredYesUrl = `https://www.dmm.co.jp/age_check/=/declared=yes/?rurl=${encodeURIComponent(TARGET_URL)}`;
    const normalizedUrl = "https://www.dmm.co.jp/dc/doujin/-/list/narrow/=/sort=sales/word=RPG/";

    const fetchImpl = vi
      .fn()
      .mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        const cookieHeader = cookieHeaderOf(init);

        if (url === TARGET_URL && !cookieHeader?.includes("age_check_done=1")) {
          return new Response("", { status: 302, headers: { location: ageCheckUrl } });
        }

        if (url === declaredYesUrl) {
          return new Response("", {
            status: 302,
            headers: {
              location: TARGET_URL,
              "set-cookie": "age_check_done=1; Domain=.dmm.co.jp; Path=/",
            },
          });
        }

        if (url === TARGET_URL && cookieHeader?.includes("age_check_done=1")) {
          return new Response("", { status: 301, headers: { location: normalizedUrl } });
        }

        if (url === normalizedUrl) {
          return new Response("<html>normalized result</html>", { status: 200 });
        }

        throw new Error(`Unexpected request: ${url}`);
      });

    await expect(fetchDmmHtmlWithAgeCheck(TARGET_URL, { fetchImpl })).resolves.toEqual({
      html: "<html>normalized result</html>",
      fetchedUrl: normalizedUrl,
      status: 200,
    });
  });

  it("follows a 301 redirect on the post-age-check refetch when age-check was detected via html content", async () => {
    const ageCheckLinkHtml =
      '<html><body>あなたは18歳以上ですか？<a href="https://www.dmm.co.jp/age_check/=/?rurl=foo">age check</a></body></html>';
    const declaredYesUrl = "https://www.dmm.co.jp/age_check/=/declared=yes/?rurl=foo";
    const normalizedUrl = "https://www.dmm.co.jp/dc/doujin/-/list/narrow/=/sort=sales/word=RPG/";
    let targetCallCount = 0;

    const fetchImpl = vi.fn().mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);

      if (url === TARGET_URL) {
        targetCallCount += 1;

        if (targetCallCount === 1) {
          return new Response(ageCheckLinkHtml, { status: 200 });
        }

        return new Response("", { status: 301, headers: { location: normalizedUrl } });
      }

      if (url === declaredYesUrl) {
        return new Response("", {
          status: 302,
          headers: {
            location: TARGET_URL,
            "set-cookie": "age_check_done=1; Domain=.dmm.co.jp; Path=/",
          },
        });
      }

      if (url === normalizedUrl) {
        return new Response("<html>normalized result</html>", { status: 200 });
      }

      throw new Error(`Unexpected request: ${url}`);
    });

    await expect(fetchDmmHtmlWithAgeCheck(TARGET_URL, { fetchImpl })).resolves.toEqual({
      html: "<html>normalized result</html>",
      fetchedUrl: normalizedUrl,
      status: 200,
    });
  });

  it("throws a typed error on network failure", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error("boom"));

    await expect(fetchDmmHtmlWithAgeCheck(TARGET_URL, { fetchImpl })).rejects.toBeInstanceOf(
      DmmHttpError,
    );
  });

  it("throws a typed error on http failure", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response("missing", { status: 404 }));

    await expect(fetchDmmHtmlWithAgeCheck(TARGET_URL, { fetchImpl })).rejects.toBeInstanceOf(
      DmmHttpError,
    );
  });
});

describe("isDmmAgeCheckUrl", () => {
  it("recognizes dmm.co.jp age_check URLs", () => {
    expect(isDmmAgeCheckUrl("https://www.dmm.co.jp/age_check/=/?rurl=foo")).toBe(true);
    expect(isDmmAgeCheckUrl("https://www.dmm.co.jp/dc/doujin/-/detail/=/cid=d_1/")).toBe(false);
    expect(isDmmAgeCheckUrl("not a url")).toBe(false);
  });
});

describe("isDmmAgeCheckHtml", () => {
  it("detects the age-check page by title and known markers", () => {
    expect(isDmmAgeCheckHtml("<title>年齢認証 - FANZA</title>")).toBe(true);
    expect(isDmmAgeCheckHtml("<html>あなたは18歳以上ですか？</html>")).toBe(true);
    expect(isDmmAgeCheckHtml("<html><body>normal page</body></html>")).toBe(false);
  });
});
