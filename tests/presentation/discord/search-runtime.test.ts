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
    deferred: false,
    replied: false,
    reply: vi.fn().mockResolvedValue(undefined),
    deferReply: vi.fn().mockResolvedValue(undefined),
    editReply: vi.fn().mockResolvedValue({ id: "message-1" }),
    fetchReply: vi.fn().mockResolvedValue({ id: "message-1" }),
    ...overrides,
  };
}

function createMockButtonInteraction(customId: string, overrides: Record<string, unknown> = {}) {
  return {
    customId,
    client: { channels: { fetch: vi.fn() } },
    deferred: false,
    replied: false,
    update: vi.fn().mockResolvedValue(undefined),
    deferUpdate: vi.fn().mockResolvedValue(undefined),
    editReply: vi.fn().mockResolvedValue({ id: "message-1" }),
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

  it("buffers a full page on the first resolve and defers+edits the reply once", async () => {
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
    expect(interaction.deferReply).toHaveBeenCalledTimes(1);
    expect(interaction.editReply).toHaveBeenCalledTimes(1);
    const payload = interaction.editReply.mock.calls[0][0];
    expect(payload.embeds).toHaveLength(10);
  });

  it("gates adult-only targets in non-nsfw channels without fetching or deferring", async () => {
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
    expect(interaction.deferReply).not.toHaveBeenCalled();
    expect(interaction.reply).toHaveBeenCalledWith(
      expect.objectContaining({ content: expect.stringContaining("NSFW") }),
    );
  });

  it("replies with the empty-result message and does not schedule an idle timer when the search yields no results", async () => {
    const fetcher = vi.fn().mockResolvedValue(page([], false));
    const sessionCache = createSearchSessionCache(60_000);
    const deps: SearchRuntimeDeps = {
      sessionCache,
      resolveFetcher: () => fetcher,
      idleTimeoutMs: 60_000,
    };
    const runtime = createSearchRuntime(deps);
    const interaction = createMockInteraction();

    await runtime.resolve(baseQuery, interaction as never, true);

    expect(interaction.editReply).toHaveBeenCalledTimes(1);
    const payload = interaction.editReply.mock.calls[0][0];
    expect(payload.content).toContain("見つかりませんでした");
    expect(payload.embeds).toBeUndefined();
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
    const payload = interaction.editReply.mock.calls[0][0];
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
    const token = extractToken(interaction.editReply.mock.calls[0][0]);

    const nextInteraction = createMockButtonInteraction(`search:${token}:next`);
    await runtime.handleButton(nextInteraction as never);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(nextInteraction.deferUpdate).toHaveBeenCalledTimes(1);
    expect(nextInteraction.editReply).toHaveBeenCalledTimes(1);

    const prevInteraction = createMockButtonInteraction(`search:${token}:prev`);
    await runtime.handleButton(prevInteraction as never);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(prevInteraction.update).toHaveBeenCalledTimes(1);
  });

  it("returns 12 items across two pages without duplicating any when total count is not a multiple of the page size", async () => {
    const fetcher = vi.fn().mockResolvedValue(
      page(
        Array.from({ length: 12 }, (_, i) => item(`RJ${i}`)),
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
    const firstPageIds = interaction.editReply.mock.calls[0][0].embeds.map(
      (embed: { data: { title: string } }) => embed.data.title,
    );
    const token = extractToken(interaction.editReply.mock.calls[0][0]);

    const nextInteraction = createMockButtonInteraction(`search:${token}:next`);
    await runtime.handleButton(nextInteraction as never);
    const secondPageIds = nextInteraction.editReply.mock.calls[0][0].embeds.map(
      (embed: { data: { title: string } }) => embed.data.title,
    );

    expect(firstPageIds).toHaveLength(10);
    expect(secondPageIds).toHaveLength(2);
    expect(new Set([...firstPageIds, ...secondPageIds]).size).toBe(12);
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
