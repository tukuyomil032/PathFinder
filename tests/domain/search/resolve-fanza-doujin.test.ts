import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SearchQuery } from "../../../src/domain/search/types";

const fetchFanzaDoujinSearchPage = vi.fn();
const fetchFanzaDoujinMakerListPage = vi.fn();

vi.mock("../../../src/integrations/dmm/search-work", () => ({
  fetchFanzaDoujinSearchPage: (...args: unknown[]) => fetchFanzaDoujinSearchPage(...args),
  fetchFanzaDoujinMakerListPage: (...args: unknown[]) => fetchFanzaDoujinMakerListPage(...args),
}));

const { resolveSearchFetcher } = await import("../../../src/domain/search/resolve-search");

const baseQuery: SearchQuery = { target: "fanza_doujin", keyword: "夜霧" };

function fanzaHtmlWithItems(
  items: Array<{ id: string; title: string; makerName: string; makerId: string }>,
): string {
  const listItems = items
    .map(
      (item) =>
        `<li class="productList__item"><div class="tileListTtl"><div class="tileListTtl__txt"><a href="https://www.dmm.co.jp/dc/doujin/-/detail/=/cid=${item.id}/">${item.title}</a></div><div class="tileListTtl__txt--author"><a href="https://www.dmm.co.jp/dc/doujin/-/list/=/article=maker/id=${item.makerId}/">${item.makerName}</a></div></div><div class="tileListPurchase"><a class="tileListPurchaseStatus__btn--addToBasket" data-cid="${item.id}" data-price="1000"></a></div></li>`,
    )
    .join("");

  return `<div id="list">${listItems}</div>`;
}

describe("resolveSearchFetcher fanza_doujin circle resolution", () => {
  beforeEach(() => {
    fetchFanzaDoujinSearchPage.mockReset();
    fetchFanzaDoujinMakerListPage.mockReset();
  });

  it("returns the plain keyword search result when circle is not specified", async () => {
    fetchFanzaDoujinSearchPage.mockResolvedValueOnce(
      fanzaHtmlWithItems([
        { id: "d_763930", title: "夜霧の作品", makerName: "Whisp", makerId: "76353" },
      ]),
    );

    const fetcher = resolveSearchFetcher("fanza_doujin");
    const page = await fetcher(baseQuery, 1);

    expect(page.items).toHaveLength(1);
    expect(fetchFanzaDoujinMakerListPage).not.toHaveBeenCalled();
  });

  it("resolves the maker id from a matching item and re-fetches the maker's full catalog", async () => {
    fetchFanzaDoujinSearchPage.mockResolvedValueOnce(
      fanzaHtmlWithItems([
        { id: "d_763930", title: "夜霧の作品A", makerName: "Whisp", makerId: "76353" },
        { id: "d_000001", title: "無関係の作品", makerName: "別サークル", makerId: "1" },
      ]),
    );
    fetchFanzaDoujinMakerListPage.mockResolvedValueOnce(
      fanzaHtmlWithItems([
        { id: "d_763930", title: "夜霧の作品A", makerName: "Whisp", makerId: "76353" },
        { id: "d_763931", title: "夜霧の作品B", makerName: "Whisp", makerId: "76353" },
        { id: "d_763932", title: "全く別のタイトル", makerName: "Whisp", makerId: "76353" },
      ]),
    );

    const fetcher = resolveSearchFetcher("fanza_doujin");
    const page = await fetcher({ ...baseQuery, circle: "Whisp" }, 1);

    expect(fetchFanzaDoujinMakerListPage).toHaveBeenCalledWith("76353");
    expect(page.items.map((item) => item.id)).toEqual(["d_763930", "d_763931"]);
    expect(page.hasNext).toBe(false);
  });

  it("propagates hasNext and returns no items when the circle hasn't been found on this page", async () => {
    // parseFanzaDoujinSearchResult's hasNext is derived from the pageNation text,
    // which is absent in this minimal fixture, so hasNext falls back to items.length > 0.
    fetchFanzaDoujinSearchPage.mockResolvedValueOnce(
      fanzaHtmlWithItems([
        { id: "d_000001", title: "無関係の作品", makerName: "別サークル", makerId: "1" },
      ]),
    );

    const fetcher = resolveSearchFetcher("fanza_doujin");
    const page = await fetcher({ ...baseQuery, circle: "存在しないサークル" }, 1);

    expect(fetchFanzaDoujinMakerListPage).not.toHaveBeenCalled();
    expect(page.items).toEqual([]);
  });
});
