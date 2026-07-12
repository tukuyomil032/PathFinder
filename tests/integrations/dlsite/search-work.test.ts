import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { FetchSearchPageError } from "../../../src/integrations/dlsite/errors";
import {
  buildCircleProfileUrl,
  buildSearchAjaxUrl,
  fetchCircleProfilePage,
  fetchSearchAjaxPage,
} from "../../../src/integrations/dlsite/search-work";
import type { SearchQuery } from "../../../src/domain/search/types";

function readFixture(fileName: string): string {
  return readFileSync(resolve(process.cwd(), "tests/fixtures", fileName), "utf8");
}

const baseQuery: SearchQuery = { target: "dlsite_maniax", keyword: "RPG" };

describe("buildSearchAjaxUrl", () => {
  it("builds the keyword-only URL for the maniax surface", () => {
    expect(buildSearchAjaxUrl(baseQuery, 1)).toBe(
      "https://www.dlsite.com/maniax/fsr/ajax/=/language/jp/keyword/RPG/page/1/",
    );
  });

  it("maps surfaces from the search target", () => {
    expect(buildSearchAjaxUrl({ ...baseQuery, target: "dlsite_books" }, 1)).toContain(
      "https://www.dlsite.com/books/fsr/ajax/=/",
    );
    expect(buildSearchAjaxUrl({ ...baseQuery, target: "dlsite_pro" }, 1)).toContain(
      "https://www.dlsite.com/pro/fsr/ajax/=/",
    );
  });

  it("appends sort, price range and page segments when provided", () => {
    const url = buildSearchAjaxUrl(
      { ...baseQuery, sort: "price_asc", priceMin: 900, priceMax: 2000 },
      3,
    );

    expect(url).toBe(
      "https://www.dlsite.com/maniax/fsr/ajax/=/language/jp/keyword/RPG/order%5B0%5D/price/price_low/900/price_high/2000/page/3/",
    );
  });

  it("encodes keywords containing spaces and symbols", () => {
    const url = buildSearchAjaxUrl({ ...baseQuery, keyword: "剣と魔法/冒険" }, 1);

    expect(url).toContain(`keyword/${encodeURIComponent("剣と魔法/冒険")}/`);
  });

  it("omits the keyword segment entirely when keyword is empty (browse-all for /random)", () => {
    const url = buildSearchAjaxUrl({ ...baseQuery, keyword: "" }, 1);

    expect(url).toBe("https://www.dlsite.com/maniax/fsr/ajax/=/language/jp/page/1/");
  });

  it("appends genre[0] when genreId is set without a keyword", () => {
    const url = buildSearchAjaxUrl({ ...baseQuery, keyword: "", genreId: "207" }, 1);

    expect(url).toBe(
      "https://www.dlsite.com/maniax/fsr/ajax/=/language/jp/genre%5B0%5D/207/page/1/",
    );
  });
});

describe("buildCircleProfileUrl", () => {
  it("builds the circle profile URL for the given surface", () => {
    expect(buildCircleProfileUrl("dlsite_maniax", "RG70730")).toBe(
      "https://www.dlsite.com/maniax/circle/profile/=/maker_id/RG70730.html",
    );
  });
});

describe("fetchSearchAjaxPage", () => {
  it("parses the JSON envelope into search html and page info", async () => {
    const raw = readFixture("dlsite-search-results.json");
    const fetchImpl = vi.fn().mockResolvedValue(new Response(raw, { status: 200 }));

    const result = await fetchSearchAjaxPage(baseQuery, 1, { fetchImpl, userAgent: "test-agent" });

    expect(result.totalCount).toBe(31231);
    expect(result.firstIndice).toBe(1);
    expect(result.lastIndice).toBe(30);
    expect(result.searchResultHtml).toContain("RJ01177942");
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://www.dlsite.com/maniax/fsr/ajax/=/language/jp/keyword/RPG/page/1/",
      { headers: { "user-agent": "test-agent" } },
    );
  });

  it("throws a typed error when the response is not valid JSON", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(new Response("<html>not json</html>", { status: 200 }));

    await expect(
      fetchSearchAjaxPage(baseQuery, 1, { fetchImpl, userAgent: "test-agent" }),
    ).rejects.toBeInstanceOf(FetchSearchPageError);
  });

  it("throws a typed error on http failure", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response("missing", { status: 404 }));

    await expect(
      fetchSearchAjaxPage(baseQuery, 1, { fetchImpl, userAgent: "test-agent" }),
    ).rejects.toBeInstanceOf(FetchSearchPageError);
  });

  it("throws a typed error on network failure", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error("boom"));

    await expect(
      fetchSearchAjaxPage(baseQuery, 1, { fetchImpl, userAgent: "test-agent" }),
    ).rejects.toBeInstanceOf(FetchSearchPageError);
  });
});

describe("fetchCircleProfilePage", () => {
  it("fetches the circle profile html", async () => {
    const html = readFixture("dlsite-circle-profile.html");
    const fetchImpl = vi.fn().mockResolvedValue(new Response(html, { status: 200 }));

    await expect(
      fetchCircleProfilePage("dlsite_maniax", "RG01009393", { fetchImpl, userAgent: "test-agent" }),
    ).resolves.toBe(html);

    expect(fetchImpl).toHaveBeenCalledWith(
      "https://www.dlsite.com/maniax/circle/profile/=/maker_id/RG01009393.html",
      { headers: { "user-agent": "test-agent" } },
    );
  });
});
