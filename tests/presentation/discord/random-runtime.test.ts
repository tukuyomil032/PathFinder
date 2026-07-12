import { MessageFlags } from "discord.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createCirclePool } from "../../../src/domain/random/circle-pool";
import { createGenrePool } from "../../../src/domain/random/genre-pool";
import { createRandomSessionCache } from "../../../src/domain/random/random-session-cache";
import type { FetchedWorkPage, WorkPreview } from "../../../src/domain/rj/types";
import type { RawSearchPage, SearchResultItem } from "../../../src/domain/search/types";
import {
  createRandomRuntime,
  RANDOM_BATCH_TARGET_COUNT,
  resolveBatch,
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
    channelId: "channel-1",
    channel: { nsfw: true },
    client: { channels: { fetch: vi.fn() } },
    deferred: false,
    replied: false,
    reply: vi.fn().mockResolvedValue(undefined),
    deferReply: vi.fn().mockResolvedValue(undefined),
    editReply: vi.fn().mockResolvedValue({ id: "message-1" }),
    ...overrides,
  };
}

function createMockButtonInteraction(customId: string, overrides: Record<string, unknown> = {}) {
  return {
    customId,
    channel: { nsfw: true },
    client: { channels: { fetch: vi.fn() } },
    deferred: false,
    replied: false,
    update: vi.fn().mockResolvedValue(undefined),
    editReply: vi.fn().mockResolvedValue({ id: "message-1" }),
    reply: vi.fn().mockResolvedValue(undefined),
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
    sessionCache: createRandomSessionCache(60_000),
    idleTimeoutMs: 60_000,
    random: () => 0,
    ...overrides,
  };
}

function extractToken(payload: {
  components: ReadonlyArray<{ toJSON(): { components: Array<{ type: number }> } }>;
}): string {
  const container = payload.components[0].toJSON();
  const actionRow = container.components.find((c) => c.type === 1) as unknown as {
    components: Array<{ custom_id: string }>;
  };
  const customId = actionRow.components[0].custom_id;
  const match = customId.match(/^random:(.+):(prev|next)$/);

  if (!match) {
    throw new Error(`Unable to extract token from customId: ${customId}`);
  }

  return match[1];
}

describe("resolveBatch", () => {
  function batchDeps(overrides: Record<string, unknown> = {}) {
    return {
      resolveFetcher: vi.fn().mockReturnValue(vi.fn().mockResolvedValue(page([item("RJ1")], 1))),
      genrePool: createGenrePool(60_000, { fetchGenreList: async () => [] }),
      circlePool: createCirclePool(),
      fetchWorkPage: vi.fn().mockResolvedValue(samplePage),
      parseWork: vi.fn().mockReturnValue(sampleWork),
      random: () => 0,
      ...overrides,
    };
  }

  it("resolves targetCount items in parallel when every attempt succeeds", async () => {
    const deps = batchDeps();

    const { results, sawRealError } = await resolveBatch("dlsite_maniax", "", deps as never, 3);

    expect(results).toHaveLength(3);
    expect(sawRealError).toBe(false);
  });

  it("backfills a failing slot with a fresh attempt inside the same worker", async () => {
    // targetCount=1 keeps this deterministic (a single worker, no cross-worker
    // interleaving ambiguity) while still exercising the retry-within-worker path.
    const fetchWorkPage = vi
      .fn()
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValue(samplePage);
    const deps = batchDeps({ fetchWorkPage });

    const { results } = await resolveBatch("dlsite_maniax", "", deps as never, 1, 10);

    expect(results).toHaveLength(1);
    expect(fetchWorkPage).toHaveBeenCalledTimes(2);
  });

  it("stops at maxTotalAttempts and returns fewer than targetCount when every attempt fails", async () => {
    const fetchWorkPage = vi.fn().mockRejectedValue(new Error("boom"));
    const deps = batchDeps({ fetchWorkPage });

    const { results, sawRealError } = await resolveBatch("dlsite_maniax", "", deps as never, 3, 6);

    expect(results).toHaveLength(0);
    expect(fetchWorkPage).toHaveBeenCalledTimes(6);
    expect(sawRealError).toBe(true);
  });

  it("reports sawRealError=false when the population itself is empty (NoRandomResultsError)", async () => {
    const emptyFetcher = vi.fn().mockResolvedValue(page([], 0));
    const deps = batchDeps({ resolveFetcher: () => emptyFetcher });

    const { results, sawRealError } = await resolveBatch("dlsite_maniax", "", deps as never, 2, 4);

    expect(results).toHaveLength(0);
    expect(sawRealError).toBe(false);
  });
});

describe("createRandomRuntime", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("defers the reply before doing any upstream work and shows a Components V2 result", async () => {
    const fetcher = vi.fn().mockResolvedValue(page([item("RJ1")], 1));
    const deps = createDeps({ resolveFetcher: () => fetcher });
    const runtime = createRandomRuntime(deps);
    const interaction = createMockInteraction();

    await runtime.resolve({ target: "dlsite_maniax", keyword: "" }, interaction as never, true);

    expect(interaction.deferReply).toHaveBeenCalledTimes(1);
    expect(interaction.editReply).toHaveBeenCalledWith(
      expect.objectContaining({ flags: MessageFlags.IsComponentsV2 }),
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

  it("resolves up to RANDOM_BATCH_TARGET_COUNT works and creates a paginated session", async () => {
    const fetcher = vi.fn().mockResolvedValue(page([item("RJ1")], 1));
    const deps = createDeps({ resolveFetcher: () => fetcher });
    const runtime = createRandomRuntime(deps);
    const interaction = createMockInteraction();

    await runtime.resolve({ target: "dlsite_maniax", keyword: "" }, interaction as never, true);

    const token = extractToken(interaction.editReply.mock.calls[0][0]);
    expect(deps.sessionCache.get(token)?.results).toHaveLength(RANDOM_BATCH_TARGET_COUNT);
    expect(deps.sessionCache.get(token)?.messageId).toBe("message-1");
  });

  it("recovers from a failing attempt within a worker and still reaches a Components V2 result", async () => {
    const fetcher = vi.fn().mockResolvedValue(page([item("RJ1")], 1));
    const fetchWorkPage = vi
      .fn()
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValue(samplePage);
    const deps = createDeps({ resolveFetcher: () => fetcher, fetchWorkPage });
    const runtime = createRandomRuntime(deps);
    const interaction = createMockInteraction();

    await runtime.resolve({ target: "dlsite_maniax", keyword: "" }, interaction as never, true);

    expect(interaction.editReply).toHaveBeenCalledWith(
      expect.objectContaining({ flags: MessageFlags.IsComponentsV2 }),
    );
  });

  it("shows the generic failure message when every attempt fails with a real error", async () => {
    const fetcher = vi.fn().mockResolvedValue(page([item("RJ1")], 1));
    const fetchWorkPage = vi.fn().mockRejectedValue(new Error("boom"));
    const deps = createDeps({ resolveFetcher: () => fetcher, fetchWorkPage });
    const runtime = createRandomRuntime(deps);
    const interaction = createMockInteraction();

    await runtime.resolve({ target: "dlsite_maniax", keyword: "" }, interaction as never, true);

    // RANDOM_BATCH_TARGET_COUNT件 x 1件あたりの試行回数(3) = 合計試行回数の上限
    expect(fetchWorkPage).toHaveBeenCalledTimes(RANDOM_BATCH_TARGET_COUNT * 3);
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

  describe("handleButton", () => {
    async function resolveSession(deps: RandomRuntimeDeps) {
      const fetcher = vi
        .fn()
        .mockResolvedValueOnce(page([item("RJ1", { title: "作品1" })], 1))
        .mockResolvedValue(page([item("RJ2", { title: "作品2" })], 1));
      const runtime = createRandomRuntime({ ...deps, resolveFetcher: () => fetcher });
      const interaction = createMockInteraction();

      await runtime.resolve({ target: "dlsite_maniax", keyword: "" }, interaction as never, true);

      const token = extractToken(interaction.editReply.mock.calls[0][0]);
      return { runtime, token };
    }

    it("moves to the next item without re-fetching upstream data", async () => {
      const deps = createDeps();
      const { runtime, token } = await resolveSession(deps);
      const before = deps.sessionCache.get(token);
      const fetchCallsBefore = (deps.fetchWorkPage as ReturnType<typeof vi.fn>).mock.calls.length;

      const nextInteraction = createMockButtonInteraction(`random:${token}:next`);
      await runtime.handleButton(nextInteraction as never);

      expect(deps.sessionCache.get(token)?.currentIndex).toBe((before?.currentIndex ?? 0) + 1);
      expect(nextInteraction.update).toHaveBeenCalledWith(
        expect.objectContaining({ flags: MessageFlags.IsComponentsV2 }),
      );
      expect((deps.fetchWorkPage as ReturnType<typeof vi.fn>).mock.calls.length).toBe(
        fetchCallsBefore,
      );
    });

    it("clamps at the last item and does not go out of bounds", async () => {
      const deps = createDeps();
      const { runtime, token } = await resolveSession(deps);
      const total = deps.sessionCache.get(token)?.results.length ?? 0;

      for (let i = 0; i < total + 2; i++) {
        const nextInteraction = createMockButtonInteraction(`random:${token}:next`);
        await runtime.handleButton(nextInteraction as never);
      }

      expect(deps.sessionCache.get(token)?.currentIndex).toBe(total - 1);
    });

    it("clamps at the first item when going previous from index 0", async () => {
      const deps = createDeps();
      const { runtime, token } = await resolveSession(deps);

      const prevInteraction = createMockButtonInteraction(`random:${token}:prev`);
      await runtime.handleButton(prevInteraction as never);

      expect(deps.sessionCache.get(token)?.currentIndex).toBe(0);
    });

    it("replies with an ephemeral session-expired message when the token is unknown", async () => {
      const deps = createDeps();
      const runtime = createRandomRuntime(deps);
      const buttonInteraction = createMockButtonInteraction("random:missing-token:next");

      await runtime.handleButton(buttonInteraction as never);

      expect(buttonInteraction.reply).toHaveBeenCalledWith(
        expect.objectContaining({ ephemeral: true, content: expect.stringContaining("失効") }),
      );
    });
  });

  it("disables the buttons on the message once the idle timeout elapses", async () => {
    const fetcher = vi.fn().mockResolvedValue(page([item("RJ1")], 1));
    const deps = createDeps({ resolveFetcher: () => fetcher, idleTimeoutMs: 5_000 });
    const runtime = createRandomRuntime(deps);
    const editMock = vi.fn().mockResolvedValue(undefined);
    const channel = {
      isTextBased: () => true,
      nsfw: true,
      messages: { fetch: vi.fn().mockResolvedValue({ edit: editMock }) },
    };
    const interaction = createMockInteraction({
      client: { channels: { fetch: vi.fn().mockResolvedValue(channel) } },
    });

    await runtime.resolve({ target: "dlsite_maniax", keyword: "" }, interaction as never, true);
    await vi.advanceTimersByTimeAsync(5_000);

    expect(editMock).toHaveBeenCalledWith(
      expect.objectContaining({ flags: MessageFlags.IsComponentsV2 }),
    );
  });
});
