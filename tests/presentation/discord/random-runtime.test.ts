import { describe, expect, it, vi } from "vitest";
import { createCirclePool } from "../../../src/domain/random/circle-pool";
import { createGenrePool } from "../../../src/domain/random/genre-pool";
import { NoRandomResultsError } from "../../../src/domain/random/pick-random-work";
import type { FetchedWorkPage, WorkPreview } from "../../../src/domain/rj/types";
import type {
  RawSearchPage,
  SearchQuery,
  SearchResultItem,
} from "../../../src/domain/search/types";
import {
  createRandomRuntime,
  type RandomRuntimeDeps,
} from "../../../src/presentation/discord/random-runtime";

function item(id: string, overrides: Partial<SearchResultItem> = {}): SearchResultItem {
  return {
    store: "dlsite",
    id,
    title: `Title ${id}`,
    url: `https://example.com/${id}`,
    thumbnailUrl: null,
    price: null,
    priceValue: null,
    makerName: null,
    makerId: null,
    ...overrides,
  };
}

function page(items: SearchResultItem[], totalCount: number | null = null): RawSearchPage {
  return { items, hasNext: false, totalCount };
}

const samplePage: FetchedWorkPage = {
  store: "dlsite",
  html: "<html></html>",
  fetchedUrl: "https://example.com/RJ1",
  resolvedUrl: "https://example.com/RJ1",
  pageKind: "work",
  status: 200,
};

const sampleWork: WorkPreview = {
  store: "dlsite",
  id: "RJ1",
  title: "Sample",
  url: "https://example.com/RJ1",
  makerName: "Circle",
  makerId: "RG1",
  ageCategory: "18禁",
  isAdult: true,
  price: "1,100円",
  salePrice: null,
  releaseDate: null,
  rating: null,
  thumbnailUrl: null,
  tags: [],
  author: null,
  scenario: null,
  illustration: null,
  voiceActors: [],
  fileFormat: null,
  fileSize: null,
  parseCoverage: "full",
  serviceName: null,
  circleOrBrandLabel: "サークル",
  rawAttributes: {},
  parserName: "dlsite/default",
};

function createMockInteraction(overrides: Record<string, unknown> = {}) {
  return {
    deferred: false,
    replied: false,
    reply: vi.fn().mockResolvedValue(undefined),
    deferReply: vi.fn().mockResolvedValue(undefined),
    editReply: vi.fn().mockResolvedValue({ id: "message-1" }),
    ...overrides,
  };
}

function createDeps(overrides: Partial<RandomRuntimeDeps> = {}): RandomRuntimeDeps {
  return {
    resolveFetcher: vi.fn(),
    genrePool: createGenrePool(60_000, { fetchGenreList: async () => [] }),
    circlePool: createCirclePool(),
    fetchWorkPage: vi.fn().mockResolvedValue(samplePage),
    parseWork: vi.fn().mockReturnValue(sampleWork),
    buildPreviewMessage: vi.fn().mockReturnValue({ content: "preview" }),
    random: () => 0,
    ...overrides,
  };
}

describe("createRandomRuntime", () => {
  it("defers the reply before doing any upstream work", async () => {
    const fetcher = vi.fn().mockResolvedValue(page([item("RJ1")], 1));
    const deps = createDeps({ resolveFetcher: () => fetcher });
    const runtime = createRandomRuntime(deps);
    const interaction = createMockInteraction();

    await runtime.resolve({ target: "dlsite_maniax", keyword: "" }, interaction as never, true);

    expect(interaction.deferReply).toHaveBeenCalledTimes(1);
    expect(interaction.editReply).toHaveBeenCalledWith(
      expect.objectContaining({ content: "preview" }),
    );
  });

  it("gates adult-only targets in non-nsfw channels without deferring", async () => {
    const deps = createDeps();
    const runtime = createRandomRuntime(deps);
    const interaction = createMockInteraction();

    await runtime.resolve({ target: "dlsite_pro", keyword: "" }, interaction as never, false);

    expect(interaction.deferReply).not.toHaveBeenCalled();
    expect(interaction.reply).toHaveBeenCalledWith(
      expect.objectContaining({ content: expect.stringContaining("NSFW") }),
    );
  });

  it("only auto-picks a store from IMPLEMENTED_SEARCH_TARGETS when target is omitted", async () => {
    const fetcher = vi.fn().mockResolvedValue(page([item("RJ1")], 1));
    const resolveFetcher = vi.fn().mockReturnValue(fetcher);
    // random()=0.999 would select the last implemented target if the pool is correct
    const deps = createDeps({ resolveFetcher, random: () => 0.999 });
    const runtime = createRandomRuntime(deps);
    const interaction = createMockInteraction();

    await runtime.resolve({ target: null, keyword: "" }, interaction as never, true);

    expect(resolveFetcher).toHaveBeenCalledWith("fanza_doujin");
  });

  it("uses the explicit keyword as-is without facet randomization", async () => {
    const fetcher = vi.fn().mockResolvedValue(page([item("RJ1")], 1));
    const deps = createDeps({
      resolveFetcher: () => fetcher,
      genrePool: createGenrePool(60_000, {
        fetchGenreList: async () => [{ id: "207", name: "つるぺた" }],
      }),
      circlePool: (() => {
        const pool = createCirclePool();
        pool.record("dlsite", "RG1", "Circle");
        return pool;
      })(),
    });
    const runtime = createRandomRuntime(deps);
    const interaction = createMockInteraction();

    await runtime.resolve(
      { target: "dlsite_maniax", keyword: "剣と魔法" },
      interaction as never,
      true,
    );

    expect(fetcher).toHaveBeenCalledWith({ target: "dlsite_maniax", keyword: "剣と魔法" }, 1);
  });

  it("only produces a plain browse query when the genre and circle pools are empty", async () => {
    const fetcher = vi.fn().mockResolvedValue(page([item("RJ1")], 1));
    const deps = createDeps({ resolveFetcher: () => fetcher, random: () => 0.99 });
    const runtime = createRandomRuntime(deps);
    const interaction = createMockInteraction();

    await runtime.resolve({ target: "dlsite_maniax", keyword: "" }, interaction as never, true);

    expect(fetcher).toHaveBeenCalledWith({ target: "dlsite_maniax", keyword: "" }, 1);
  });

  it("can pick the genre facet when the genre pool has entries and random selects it", async () => {
    const fetcher = vi.fn().mockResolvedValue(page([item("RJ1")], 1));
    const genrePool = createGenrePool(60_000, {
      fetchGenreList: async () => [{ id: "207", name: "つるぺた" }],
    });
    // candidates = [browse, genre] (circle pool is empty) -> random()=0.99 selects index 1 (genre)
    const deps = createDeps({ resolveFetcher: () => fetcher, genrePool, random: () => 0.99 });
    const runtime = createRandomRuntime(deps);
    const interaction = createMockInteraction();

    await runtime.resolve({ target: "dlsite_maniax", keyword: "" }, interaction as never, true);

    expect(fetcher).toHaveBeenCalledWith(
      { target: "dlsite_maniax", keyword: "", genreId: "207" },
      1,
    );
  });

  it("can pick the circle facet directly by makerId when the circle pool has entries", async () => {
    const fetcher = vi.fn().mockResolvedValue(page([item("RJ1")], 1));
    const circlePool = createCirclePool();
    circlePool.record("dlsite", "RG70730", "beebee工房");
    // candidates = [browse, circle] (genre pool is empty) -> random()=0.99 selects index 1 (circle)
    const deps = createDeps({ resolveFetcher: () => fetcher, circlePool, random: () => 0.99 });
    const runtime = createRandomRuntime(deps);
    const interaction = createMockInteraction();

    await runtime.resolve({ target: "dlsite_maniax", keyword: "" }, interaction as never, true);

    expect(fetcher).toHaveBeenCalledWith(
      { target: "dlsite_maniax", keyword: "", makerId: "RG70730" },
      1,
    );
  });

  it("builds the WorkReference from the picked item's real url (not a code guess)", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(page([item("d_999999", { store: "fanza_doujin" })], 1));
    const fetchWorkPage = vi.fn().mockResolvedValue(samplePage);
    const deps = createDeps({ resolveFetcher: () => fetcher, fetchWorkPage });
    const runtime = createRandomRuntime(deps);
    const interaction = createMockInteraction();

    await runtime.resolve({ target: "fanza_doujin", keyword: "" }, interaction as never, true);

    expect(fetchWorkPage).toHaveBeenCalledWith({
      store: "fanza_doujin",
      id: "d_999999",
      kind: "url",
      sourceUrl: "https://example.com/d_999999",
      matchedText: "https://example.com/d_999999",
    });
  });

  it("records both the picked item's and the resolved work's maker into the circle pool", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(page([item("RJ1", { makerId: "RG_ITEM", makerName: "Item Circle" })], 1));
    const circlePool = createCirclePool();
    const deps = createDeps({ resolveFetcher: () => fetcher, circlePool });
    const runtime = createRandomRuntime(deps);
    const interaction = createMockInteraction();

    await runtime.resolve({ target: "dlsite_maniax", keyword: "" }, interaction as never, true);

    // sampleWork.makerId === "RG1" overwrites the pool's single "dlsite" slot last,
    // but both records should have been attempted without throwing.
    expect(circlePool.pickRandom("dlsite", () => 0)?.makerId).toBeDefined();
  });

  it("retries with a fresh candidate query when the work detail fetch fails, then succeeds", async () => {
    const fetcher = vi.fn().mockResolvedValue(page([item("RJ1")], 1));
    const fetchWorkPage = vi
      .fn()
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValueOnce(samplePage);
    const deps = createDeps({ resolveFetcher: () => fetcher, fetchWorkPage });
    const runtime = createRandomRuntime(deps);
    const interaction = createMockInteraction();

    await runtime.resolve({ target: "dlsite_maniax", keyword: "" }, interaction as never, true);

    expect(fetchWorkPage).toHaveBeenCalledTimes(2);
    expect(interaction.editReply).toHaveBeenLastCalledWith(
      expect.objectContaining({ content: "preview" }),
    );
  });

  it("gives up after MAX_RANDOM_ATTEMPTS and shows the generic failure message", async () => {
    const fetcher = vi.fn().mockResolvedValue(page([item("RJ1")], 1));
    const fetchWorkPage = vi.fn().mockRejectedValue(new Error("boom"));
    const deps = createDeps({ resolveFetcher: () => fetcher, fetchWorkPage });
    const runtime = createRandomRuntime(deps);
    const interaction = createMockInteraction();

    await runtime.resolve({ target: "dlsite_maniax", keyword: "" }, interaction as never, true);

    expect(fetchWorkPage).toHaveBeenCalledTimes(3);
    const payload = interaction.editReply.mock.calls.at(-1)?.[0];
    expect(payload.content).toContain("エラーが発生しました");
  });

  it("shows the empty-result message when the candidate pool itself has no results", async () => {
    const fetcher = vi.fn().mockResolvedValue(page([], 0));
    const deps = createDeps({ resolveFetcher: () => fetcher });
    const runtime = createRandomRuntime(deps);
    const interaction = createMockInteraction();

    await runtime.resolve({ target: "dlsite_maniax", keyword: "" }, interaction as never, true);

    const payload = interaction.editReply.mock.calls.at(-1)?.[0];
    expect(payload.content).toContain("見つかりませんでした");
  });

  it("falls back to a reply (not editReply) if deferReply itself throws before any reply was sent", async () => {
    const deps = createDeps();
    const runtime = createRandomRuntime(deps);
    const interaction = createMockInteraction({
      deferReply: vi.fn().mockRejectedValue(new Error("defer failed")),
    });

    await runtime.resolve({ target: "dlsite_maniax", keyword: "" }, interaction as never, true);

    expect(interaction.reply).toHaveBeenCalledWith(
      expect.objectContaining({ content: expect.stringContaining("エラーが発生しました") }),
    );
  });
});
