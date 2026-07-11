import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SearchQuery } from "../../../src/domain/search/types";

const fetchSearchAjaxPage = vi.fn();
const fetchCircleProfilePage = vi.fn();

vi.mock("../../../src/integrations/dlsite/search-work", () => ({
  fetchSearchAjaxPage: (...args: unknown[]) => fetchSearchAjaxPage(...args),
  fetchCircleProfilePage: (...args: unknown[]) => fetchCircleProfilePage(...args),
}));

const { resolveSearchFetcher } = await import("../../../src/domain/search/resolve-search");

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

  it("falls back to filtering the initial page when no matching circle is found", async () => {
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
  });
});
