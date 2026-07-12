import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SearchQuery } from "../../../src/domain/search/types";

const fetchSearchAjaxPage = vi.fn();
const fetchCircleProfilePage = vi.fn();

vi.mock("../../../src/integrations/dlsite/search-work", () => ({
  fetchSearchAjaxPage: (...args: unknown[]) => fetchSearchAjaxPage(...args),
  fetchCircleProfilePage: (...args: unknown[]) => fetchCircleProfilePage(...args),
}));

const { resolveSearchFetcher, IMPLEMENTED_SEARCH_TARGETS } = await import(
  "../../../src/domain/search/resolve-search"
);

const baseQuery: SearchQuery = { target: "dlsite_maniax", keyword: "夜霧" };

function ajaxHtmlWithItems(
  items: Array<{ id: string; title: string; makerName: string; makerId: string }>,
): string {
  return items
    .map(
      (item) =>
        `<li data-list_item_product_id="${item.id}"><dl class="work_img_main"><dd class="work_name"><a href="https://www.dlsite.com/maniax/work/=/product_id/${item.id}.html" title="${item.title}">${item.title}</a></dd><dd class="maker_name"><a href="https://www.dlsite.com/maniax/circle/profile/=/maker_id/${item.makerId}.html">${item.makerName}</a></dd><dd class="work_price_wrap"><span class="work_price_base">1,000</span></dd></dl></li>`,
    )
    .join("");
}

describe("resolveSearchFetcher circle resolution", () => {
  beforeEach(() => {
    fetchSearchAjaxPage.mockReset();
    fetchCircleProfilePage.mockReset();
  });

  it("returns the plain keyword search result when circle is not specified", async () => {
    fetchSearchAjaxPage.mockResolvedValueOnce({
      searchResultHtml: ajaxHtmlWithItems([
        { id: "RJ01177942", title: "復讐の夜霧", makerName: "beebee工房", makerId: "RG70730" },
      ]),
      totalCount: 1,
      firstIndice: 1,
      lastIndice: 1,
    });

    const fetcher = resolveSearchFetcher("dlsite_maniax");
    const page = await fetcher(baseQuery, 1);

    expect(page.items).toHaveLength(1);
    expect(fetchCircleProfilePage).not.toHaveBeenCalled();
  });

  it("resolves the maker id from a matching item and re-fetches the circle's full catalog", async () => {
    fetchSearchAjaxPage.mockResolvedValueOnce({
      searchResultHtml: ajaxHtmlWithItems([
        { id: "RJ01177942", title: "復讐の夜霧", makerName: "beebee工房", makerId: "RG70730" },
        { id: "RJ00000001", title: "無関係の作品", makerName: "別サークル", makerId: "RG00000001" },
      ]),
      totalCount: 2,
      firstIndice: 1,
      lastIndice: 2,
    });
    fetchCircleProfilePage.mockResolvedValueOnce(
      ajaxHtmlWithItems([
        { id: "RJ01177942", title: "復讐の夜霧", makerName: "beebee工房", makerId: "RG70730" },
        { id: "RJ01200000", title: "別の夜霧作品", makerName: "beebee工房", makerId: "RG70730" },
        {
          id: "RJ01300000",
          title: "全く別のタイトル",
          makerName: "beebee工房",
          makerId: "RG70730",
        },
      ]),
    );

    const fetcher = resolveSearchFetcher("dlsite_maniax");
    const page = await fetcher({ ...baseQuery, circle: "beebee" }, 1);

    expect(fetchCircleProfilePage).toHaveBeenCalledWith("dlsite_maniax", "RG70730");
    expect(page.items.map((item) => item.id)).toEqual(["RJ01177942", "RJ01200000"]);
    expect(page.hasNext).toBe(false);
  });

  it("propagates the upstream hasNext flag when the circle hasn't been found yet, so callers can keep paging", async () => {
    fetchSearchAjaxPage.mockResolvedValueOnce({
      searchResultHtml: ajaxHtmlWithItems([
        { id: "RJ00000001", title: "無関係の作品", makerName: "別サークル", makerId: "RG00000001" },
      ]),
      totalCount: 100,
      firstIndice: 1,
      lastIndice: 30,
    });

    const fetcher = resolveSearchFetcher("dlsite_maniax");
    const page = await fetcher({ ...baseQuery, circle: "beebee" }, 1);

    expect(page.items).toEqual([]);
    expect(page.hasNext).toBe(true);
    expect(fetchCircleProfilePage).not.toHaveBeenCalled();
  });

  it("returns no items and hasNext:false once upstream pages are exhausted without a match", async () => {
    fetchSearchAjaxPage.mockResolvedValueOnce({
      searchResultHtml: ajaxHtmlWithItems([
        { id: "RJ00000001", title: "無関係の作品", makerName: "別サークル", makerId: "RG00000001" },
      ]),
      totalCount: 1,
      firstIndice: 1,
      lastIndice: 1,
    });

    const fetcher = resolveSearchFetcher("dlsite_maniax");
    const page = await fetcher({ ...baseQuery, circle: "存在しないサークル" }, 1);

    expect(fetchCircleProfilePage).not.toHaveBeenCalled();
    expect(page.items).toEqual([]);
    expect(page.hasNext).toBe(false);
  });

  it("fetches the circle catalog directly by makerId, skipping name resolution entirely (/random)", async () => {
    fetchCircleProfilePage.mockResolvedValueOnce(
      ajaxHtmlWithItems([
        { id: "RJ01177942", title: "復讐の夜霧", makerName: "beebee工房", makerId: "RG70730" },
        { id: "RJ01200000", title: "別の夜霧作品", makerName: "beebee工房", makerId: "RG70730" },
      ]),
    );

    const fetcher = resolveSearchFetcher("dlsite_maniax");
    const page = await fetcher({ ...baseQuery, keyword: "", makerId: "RG70730" }, 1);

    expect(fetchSearchAjaxPage).not.toHaveBeenCalled();
    expect(fetchCircleProfilePage).toHaveBeenCalledWith("dlsite_maniax", "RG70730");
    expect(page.items).toHaveLength(2);
    expect(page.hasNext).toBe(false);
    expect(page.totalCount).toBe(2);
  });
});

describe("IMPLEMENTED_SEARCH_TARGETS", () => {
  it("only lists targets whose search fetcher is actually implemented", () => {
    expect(IMPLEMENTED_SEARCH_TARGETS).toEqual([
      "dlsite_maniax",
      "dlsite_books",
      "dlsite_pro",
      "fanza_doujin",
    ]);

    for (const target of IMPLEMENTED_SEARCH_TARGETS) {
      expect(() => resolveSearchFetcher(target)).not.toThrow();
    }
  });

  it("excludes targets whose search fetcher throws", () => {
    expect(IMPLEMENTED_SEARCH_TARGETS).not.toContain("fanza_pcgame");
    expect(IMPLEMENTED_SEARCH_TARGETS).not.toContain("fanza_books");
    expect(() => resolveSearchFetcher("fanza_pcgame")).toThrow(TypeError);
  });
});
