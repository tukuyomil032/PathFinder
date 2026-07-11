import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createSearchSessionCache } from "../../../src/domain/search/session-cache";
import type {
  RawSearchPage,
  SearchQuery,
  SearchResultItem,
} from "../../../src/domain/search/types";
import {
  createSearchRuntime,
  type SearchRuntimeDeps,
} from "../../../src/presentation/discord/search-runtime";

function item(id: string, priceValue: number | null = 1000): SearchResultItem {
  return {
    store: "dlsite",
    id,
    title: `Title ${id}`,
    url: `https://example.com/${id}`,
    thumbnailUrl: null,
    price: priceValue === null ? null : String(priceValue),
    priceValue,
    makerName: "Circle",
    makerId: "RG1",
  };
}

function page(items: SearchResultItem[], hasNext: boolean): RawSearchPage {
  return { items, hasNext, totalCount: null };
}

function createMockInteraction(overrides: Record<string, unknown> = {}) {
  return {
    channelId: "channel-1",
    client: { channels: { fetch: vi.fn() } },
    reply: vi.fn().mockResolvedValue(undefined),
    fetchReply: vi.fn().mockResolvedValue({ id: "message-1" }),
    ...overrides,
  };
}

function createMockButtonInteraction(customId: string, overrides: Record<string, unknown> = {}) {
  return {
    customId,
    client: { channels: { fetch: vi.fn() } },
    update: vi.fn().mockResolvedValue(undefined),
    reply: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

const baseQuery: SearchQuery = { target: "dlsite_maniax", keyword: "RPG" };

describe("createSearchRuntime", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("buffers a full page on the first resolve and replies once", async () => {
    const fetcher = vi.fn().mockResolvedValue(
      page(
        Array.from({ length: 10 }, (_, i) => item(`RJ${i}`)),
        true,
      ),
    );
    const deps: SearchRuntimeDeps = {
      sessionCache: createSearchSessionCache(60_000),
      resolveFetcher: () => fetcher,
      idleTimeoutMs: 60_000,
    };
    const runtime = createSearchRuntime(deps);
    const interaction = createMockInteraction();

    await runtime.resolve(baseQuery, interaction as never, true);

    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(interaction.reply).toHaveBeenCalledTimes(1);
    const payload = interaction.reply.mock.calls[0][0];
    expect(payload.embeds).toHaveLength(10);
  });

  it("gates adult-only targets in non-nsfw channels without fetching", async () => {
    const fetcher = vi.fn();
    const deps: SearchRuntimeDeps = {
      sessionCache: createSearchSessionCache(60_000),
      resolveFetcher: () => fetcher,
      idleTimeoutMs: 60_000,
    };
    const runtime = createSearchRuntime(deps);
    const interaction = createMockInteraction();

    await runtime.resolve({ ...baseQuery, target: "dlsite_pro" }, interaction as never, false);

    expect(fetcher).not.toHaveBeenCalled();
    expect(interaction.reply).toHaveBeenCalledWith(
      expect.objectContaining({ content: expect.stringContaining("NSFW") }),
    );
  });

  it("does not call fetchReply when the search yields no results", async () => {
    const fetcher = vi.fn().mockResolvedValue(page([], false));
    const deps: SearchRuntimeDeps = {
      sessionCache: createSearchSessionCache(60_000),
      resolveFetcher: () => fetcher,
      idleTimeoutMs: 60_000,
    };
    const runtime = createSearchRuntime(deps);
    const interaction = createMockInteraction();

    await runtime.resolve(baseQuery, interaction as never, true);

    expect(interaction.fetchReply).not.toHaveBeenCalled();
  });

  it("keeps fetching upstream pages until the client-side price filter fills a page", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        page(
          [item("RJ1", 100), item("RJ2", 200)], // both filtered out by priceMin
          true,
        ),
      )
      .mockResolvedValueOnce(
        page(
          Array.from({ length: 10 }, (_, i) => item(`RJ1${i}`, 2000)),
          true,
        ),
      );
    const deps: SearchRuntimeDeps = {
      sessionCache: createSearchSessionCache(60_000),
      resolveFetcher: () => fetcher,
      idleTimeoutMs: 60_000,
    };
    const runtime = createSearchRuntime(deps);
    const interaction = createMockInteraction();

    await runtime.resolve({ ...baseQuery, priceMin: 1500 }, interaction as never, true);

    expect(fetcher).toHaveBeenCalledTimes(2);
    const payload = interaction.reply.mock.calls[0][0];
    expect(payload.embeds).toHaveLength(10);
  });

  it("does not re-fetch upstream when navigating to the previous page", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        page(
          Array.from({ length: 10 }, (_, i) => item(`RJ${i}`)),
          true,
        ),
      )
      .mockResolvedValueOnce(
        page(
          Array.from({ length: 10 }, (_, i) => item(`RJ2${i}`)),
          false,
        ),
      );
    const sessionCache = createSearchSessionCache(60_000);
    const deps: SearchRuntimeDeps = {
      sessionCache,
      resolveFetcher: () => fetcher,
      idleTimeoutMs: 60_000,
    };
    const runtime = createSearchRuntime(deps);
    const interaction = createMockInteraction();

    await runtime.resolve(baseQuery, interaction as never, true);
    const token = extractToken(interaction.reply.mock.calls[0][0]);

    const nextInteraction = createMockButtonInteraction(`search:${token}:next`);
    await runtime.handleButton(nextInteraction as never);
    expect(fetcher).toHaveBeenCalledTimes(2);

    const prevInteraction = createMockButtonInteraction(`search:${token}:prev`);
    await runtime.handleButton(prevInteraction as never);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("replies with an ephemeral message when the session has expired", async () => {
    const deps: SearchRuntimeDeps = {
      sessionCache: createSearchSessionCache(60_000),
      resolveFetcher: () => vi.fn(),
      idleTimeoutMs: 60_000,
    };
    const runtime = createSearchRuntime(deps);
    const buttonInteraction = createMockButtonInteraction("search:missing-token:next");

    await runtime.handleButton(buttonInteraction as never);

    expect(buttonInteraction.reply).toHaveBeenCalledWith(
      expect.objectContaining({ ephemeral: true, content: expect.stringContaining("失効") }),
    );
  });

  it("disables the buttons on the message once the idle timeout elapses", async () => {
    const fetcher = vi.fn().mockResolvedValue(
      page(
        Array.from({ length: 10 }, (_, i) => item(`RJ${i}`)),
        true,
      ),
    );
    const deps: SearchRuntimeDeps = {
      sessionCache: createSearchSessionCache(60_000),
      resolveFetcher: () => fetcher,
      idleTimeoutMs: 5_000,
    };
    const runtime = createSearchRuntime(deps);
    const editMock = vi.fn().mockResolvedValue(undefined);
    const channel = {
      isTextBased: () => true,
      messages: { fetch: vi.fn().mockResolvedValue({ edit: editMock }) },
    };
    const interaction = createMockInteraction({
      client: { channels: { fetch: vi.fn().mockResolvedValue(channel) } },
    });

    await runtime.resolve(baseQuery, interaction as never, true);
    await vi.advanceTimersByTimeAsync(5_000);

    expect(editMock).toHaveBeenCalledTimes(1);
  });
});

function extractToken(payload: {
  components?: Array<{ toJSON(): { components: Array<{ custom_id: string }> } }>;
}): string {
  const customId = payload.components?.[0]?.toJSON().components?.[0]?.custom_id ?? "";
  const match = customId.match(/^search:(.+):(prev|next)$/);

  if (!match) {
    throw new Error(`Unable to extract token from customId: ${customId}`);
  }

  return match[1];
}
