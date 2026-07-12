import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  parseFanzaDoujinSearchItems,
  parseFanzaDoujinSearchResult,
} from "../../../src/integrations/dmm/parse-search-results";

function readFixture(fileName: string): string {
  return readFileSync(resolve(process.cwd(), "tests/fixtures", fileName), "utf8");
}

describe("parseFanzaDoujinSearchItems", () => {
  it("parses title, url, maker, price and thumbnail from search result markup", () => {
    const html = readFixture("fanza-doujin-search-results.html");
    const items = parseFanzaDoujinSearchItems(html);

    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({
      store: "fanza_doujin",
      id: "d_763930",
      title: "【FANZA限定】ド田舎兄妹_アペンドコンプリートセット",
      url: "https://www.dmm.co.jp/dc/doujin/-/detail/=/cid=d_763930/",
      makerName: "Whisp",
      makerId: "76353",
      price: "6,600",
      priceValue: 6600,
    });
    expect(items[0].thumbnailUrl).toBe(
      "https://doujin-assets.dmm.co.jp/digital/game/d_763930/d_763930pl.jpg",
    );
  });

  it("parses the second item independently", () => {
    const html = readFixture("fanza-doujin-search-results.html");
    const items = parseFanzaDoujinSearchItems(html);

    expect(items[1]).toMatchObject({
      id: "d_764635",
      title: "終末のオルターエゴイズム＋DLCセット",
      makerName: "ONEONE1",
      makerId: "27555",
      price: "9,240",
      priceValue: 9240,
    });
  });

  it("returns an empty list for a not-found response", () => {
    const html = readFixture("fanza-doujin-search-empty.html");
    expect(parseFanzaDoujinSearchItems(html)).toEqual([]);
  });

  it("parses a maker (brand) full-catalog listing page with the same selectors", () => {
    const html = readFixture("fanza-doujin-maker-list.html");
    const items = parseFanzaDoujinSearchItems(html);

    expect(items).toHaveLength(3);
    expect(items.map((item) => item.id)).toEqual(["d_763930", "d_386956", "d_772614"]);
  });
});

describe("parseFanzaDoujinSearchResult", () => {
  it("extracts total count and marks hasNext true when more pages remain", () => {
    const html = readFixture("fanza-doujin-search-results.html");
    const page = parseFanzaDoujinSearchResult(html);

    expect(page.totalCount).toBe(9008);
    expect(page.hasNext).toBe(true);
    expect(page.items).toHaveLength(2);
  });

  it("falls back to items.length when page info is unavailable", () => {
    const html = readFixture("fanza-doujin-search-empty.html");
    const page = parseFanzaDoujinSearchResult(html);

    expect(page).toEqual({ items: [], hasNext: false, totalCount: null });
  });
});
