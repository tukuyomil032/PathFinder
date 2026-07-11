import { describe, expect, it, vi } from "vitest";
import { createSearchSessionCache } from "../../../src/domain/search/session-cache";
import type { RawSearchPage, SearchResultItem } from "../../../src/domain/search/types";
import { createInteractionHandler } from "../../../src/presentation/discord/handle-interaction-create";
import { createSearchRuntime } from "../../../src/presentation/discord/search-runtime";

function item(id: string): SearchResultItem {
  return {
    store: "dlsite",
    id,
    title: `Title ${id}`,
    url: `https://example.com/${id}`,
    thumbnailUrl: null,
    price: "1,000",
    priceValue: 1000,
    makerName: "Circle",
    makerId: "RG1",
  };
}

function page(items: SearchResultItem[], hasNext: boolean): RawSearchPage {
  return { items, hasNext, totalCount: null };
}

describe("search flow integration", () => {
  it("runs /search and then advances to the next page via the search: button", async () => {
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

    const searchRuntime = createSearchRuntime({
      sessionCache: createSearchSessionCache(60_000),
      resolveFetcher: () => fetcher,
      idleTimeoutMs: 60_000,
    });

    const handler = createInteractionHandler({
      previewRuntime: { resolve: vi.fn() } as never,
      searchRuntime,
    });

    const commandInteraction = {
      isChatInputCommand: () => true,
      isButton: () => false,
      commandName: "search",
      channel: { nsfw: true },
      channelId: "channel-1",
      client: { channels: { fetch: vi.fn() } },
      options: {
        getString: (name: string) =>
          name === "store" ? "dlsite_maniax" : name === "keyword" ? "RPG" : null,
        getInteger: () => null,
      },
      reply: vi.fn().mockResolvedValue(undefined),
      fetchReply: vi.fn().mockResolvedValue({ id: "message-1" }),
    };

    await handler(commandInteraction as never);

    expect(fetcher).toHaveBeenCalledTimes(1);
    const firstPagePayload = commandInteraction.reply.mock.calls[0][0];
    expect(firstPagePayload.embeds).toHaveLength(10);
    const customId = firstPagePayload.components[0].toJSON().components[0].custom_id as string;
    const token = customId.match(/^search:(.+):(prev|next)$/)?.[1];

    const buttonInteraction = {
      isChatInputCommand: () => false,
      isButton: () => true,
      customId: `search:${token}:next`,
      client: { channels: { fetch: vi.fn() } },
      update: vi.fn().mockResolvedValue(undefined),
      reply: vi.fn().mockResolvedValue(undefined),
    };

    await handler(buttonInteraction as never);

    expect(fetcher).toHaveBeenCalledTimes(2);
    const secondPagePayload = buttonInteraction.update.mock.calls[0][0];
    expect(secondPagePayload.embeds).toHaveLength(10);
    expect(secondPagePayload.embeds[0].data.title).toBe("Title RJ20");
  });
});
