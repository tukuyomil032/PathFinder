import { describe, expect, it, vi } from "vitest";
import {
  NoRandomResultsError,
  pickRandomSearchResultItem,
} from "../../../src/domain/random/pick-random-work";
import type {
  RawSearchPage,
  SearchQuery,
  SearchResultItem,
} from "../../../src/domain/search/types";

const baseQuery: SearchQuery = { target: "dlsite_maniax", keyword: "" };

function item(id: string): SearchResultItem {
  return {
    store: "dlsite",
    id,
    title: id,
    url: `https://example.com/${id}`,
    thumbnailUrl: null,
    price: null,
    priceValue: null,
    makerName: null,
    makerId: null,
  };
}

function page(
  items: SearchResultItem[],
  totalCount: number | null,
  hasNext = false,
): RawSearchPage {
  return { items, hasNext, totalCount };
}

describe("pickRandomSearchResultItem", () => {
  it("throws NoRandomResultsError when the first page is empty", async () => {
    const fetcher = vi.fn().mockResolvedValue(page([], 0));

    await expect(
      pickRandomSearchResultItem(baseQuery, { fetcher, random: () => 0 }),
    ).rejects.toBeInstanceOf(NoRandomResultsError);
  });

  it("picks from the first page directly when totalCount is unknown", async () => {
    const items = [item("RJ1"), item("RJ2"), item("RJ3")];
    const fetcher = vi.fn().mockResolvedValue(page(items, null));

    const picked = await pickRandomSearchResultItem(baseQuery, { fetcher, random: () => 0.5 });

    expect(picked.id).toBe("RJ2");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("picks from the first page directly when totalCount does not exceed perPage", async () => {
    const items = [item("RJ1"), item("RJ2")];
    const fetcher = vi.fn().mockResolvedValue(page(items, 2));

    await pickRandomSearchResultItem(baseQuery, { fetcher, random: () => 0 });

    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("re-fetches a randomly computed page when totalCount exceeds perPage", async () => {
    const firstPage = page([item("A1"), item("A2")], 6);
    const secondPage = page([item("B1"), item("B2")], 6);
    const fetcher = vi.fn().mockResolvedValueOnce(firstPage).mockResolvedValueOnce(secondPage);

    // random() calls: 1st -> targetRawPage計算, 2nd -> ページ内index計算
    // maxRawPage = ceil(6/2) = 3。random()=0.5 -> targetRawPage = 1 + floor(0.5*3) = 2
    const randomValues = [0.5, 0];
    let call = 0;
    const random = () => randomValues[call++];

    const picked = await pickRandomSearchResultItem(baseQuery, { fetcher, random });

    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(fetcher).toHaveBeenNthCalledWith(1, baseQuery, 1);
    expect(fetcher).toHaveBeenNthCalledWith(2, baseQuery, 2);
    expect(picked.id).toBe("B1");
  });

  it("falls back to the first page when the randomly computed page turns out empty", async () => {
    const firstPage = page([item("A1"), item("A2")], 6);
    const emptySecondPage = page([], 6);
    const fetcher = vi.fn().mockResolvedValueOnce(firstPage).mockResolvedValueOnce(emptySecondPage);

    const randomValues = [0.5, 0];
    let call = 0;
    const random = () => randomValues[call++];

    const picked = await pickRandomSearchResultItem(baseQuery, { fetcher, random });

    expect(picked.id).toBe("A1");
  });

  it("uses Math.random by default when random is not injected", async () => {
    const items = [item("RJ1")];
    const fetcher = vi.fn().mockResolvedValue(page(items, 1));

    const picked = await pickRandomSearchResultItem(baseQuery, { fetcher });

    expect(picked.id).toBe("RJ1");
  });

  it("picks straight from a single-page maker catalog query (makerId-based, hasNext always false)", async () => {
    const items = [item("RJ1"), item("RJ2"), item("RJ3")];
    // resolve-search.tsのfetchMakerCatalogPageはtotalCount===items.lengthの1ページを返す
    const fetcher = vi.fn().mockResolvedValue(page(items, items.length, false));

    const picked = await pickRandomSearchResultItem(
      { ...baseQuery, makerId: "RG70730" },
      { fetcher, random: () => 0.99 },
    );

    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(picked.id).toBe("RJ3");
  });
});
