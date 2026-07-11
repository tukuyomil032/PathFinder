import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  parseSearchAjaxResult,
  parseSearchResultItems,
} from "../../../src/integrations/dlsite/parse-search-results";

function readFixture(fileName: string): string {
  return readFileSync(resolve(process.cwd(), "tests/fixtures", fileName), "utf8");
}

function readJsonFixture(fileName: string): {
  search_result: string;
  page_info: { count: number; first_indice: number; last_indice: number };
} {
  return JSON.parse(readFixture(fileName));
}

describe("parseSearchResultItems", () => {
  it("parses title, url, maker, price and thumbnail from search result markup", () => {
    const fixture = readJsonFixture("dlsite-search-results.json");
    const items = parseSearchResultItems(fixture.search_result);

    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({
      store: "dlsite",
      id: "RJ01177942",
      title: "復讐の夜霧",
      url: "https://www.dlsite.com/maniax/work/=/product_id/RJ01177942.html",
      makerName: "beebee工房",
      makerId: "RG70730",
      price: "2,530",
      priceValue: 2530,
    });
    expect(items[0].thumbnailUrl).toBe(
      "https://img.dlsite.jp/resize/images2/work/doujin/RJ01178000/RJ01177942_img_main_240x240.webp",
    );
  });

  it("parses the second item independently", () => {
    const fixture = readJsonFixture("dlsite-search-results.json");
    const items = parseSearchResultItems(fixture.search_result);

    expect(items[1]).toMatchObject({
      id: "RJ01641016",
      title: "○リマゾ三重奏～M男向け色仕掛け命乞いSRPG～",
      makerName: "ロリマゾ生活",
      makerId: "RG01034899",
      price: "110",
      priceValue: 110,
    });
  });

  it("skips items missing required fields instead of failing entirely", () => {
    const fixture = readJsonFixture("dlsite-search-results-partial.json");
    const items = parseSearchResultItems(fixture.search_result);

    expect(items).toHaveLength(1);
    expect(items[0].id).toBe("RJ01177942");
  });

  it("returns an empty list for a work-not-found response", () => {
    const fixture = readJsonFixture("dlsite-search-empty.json");
    const items = parseSearchResultItems(fixture.search_result);

    expect(items).toEqual([]);
  });
});

describe("parseSearchAjaxResult", () => {
  it("marks hasNext true when last_indice is below the total count", () => {
    const fixture = readJsonFixture("dlsite-search-results.json");
    const page = parseSearchAjaxResult({
      searchResultHtml: fixture.search_result,
      totalCount: fixture.page_info.count,
      firstIndice: fixture.page_info.first_indice,
      lastIndice: fixture.page_info.last_indice,
    });

    expect(page.totalCount).toBe(31231);
    expect(page.hasNext).toBe(true);
    expect(page.items).toHaveLength(2);
  });

  it("marks hasNext false and totalCount 0 for an empty result", () => {
    const fixture = readJsonFixture("dlsite-search-empty.json");
    const page = parseSearchAjaxResult({
      searchResultHtml: fixture.search_result,
      totalCount: fixture.page_info.count,
      firstIndice: fixture.page_info.first_indice,
      lastIndice: fixture.page_info.last_indice,
    });

    expect(page).toEqual({ items: [], hasNext: false, totalCount: 0 });
  });

  it("falls back to items.length when page_info is unavailable", () => {
    const page = parseSearchAjaxResult({
      searchResultHtml: "<ul></ul>",
      totalCount: null,
      firstIndice: null,
      lastIndice: null,
    });

    expect(page).toEqual({ items: [], hasNext: false, totalCount: null });
  });
});
