import type {
  APIActionRowComponent,
  APIButtonComponent,
  APIEmbed,
  JSONEncodable,
} from "discord.js";
import { describe, expect, it } from "vitest";
import type { SearchSession } from "../../../src/domain/search/session-cache";
import type { SearchResultItem } from "../../../src/domain/search/types";
import {
  buildDisabledSearchMessage,
  buildSearchFailureMessage,
  buildSearchResultMessage,
  hasNextPage,
  hasPreviousPage,
} from "../../../src/presentation/discord/build-search-message";

function toJsonEmbed(embed: APIEmbed | JSONEncodable<APIEmbed> | undefined): APIEmbed | undefined {
  if (!embed) {
    return undefined;
  }

  return "toJSON" in embed ? embed.toJSON() : embed;
}

function toJsonRow(row: unknown): APIActionRowComponent<APIButtonComponent> | undefined {
  if (!row) {
    return undefined;
  }

  return "toJSON" in (row as { toJSON?: () => unknown })
    ? ((
        row as JSONEncodable<APIActionRowComponent<APIButtonComponent>>
      ).toJSON() as APIActionRowComponent<APIButtonComponent>)
    : (row as APIActionRowComponent<APIButtonComponent>);
}

function sampleItem(overrides: Partial<SearchResultItem> = {}): SearchResultItem {
  return {
    store: "dlsite",
    id: "RJ012345",
    title: "サンプル作品",
    url: "https://example.com/RJ012345",
    thumbnailUrl: "https://example.com/thumb.jpg",
    price: "1,320",
    priceValue: 1320,
    makerName: "サンプルサークル",
    makerId: "RG00000000",
    ...overrides,
  };
}

function sampleSession(overrides: Partial<SearchSession> = {}): SearchSession {
  return {
    token: "token-1",
    query: { target: "dlsite_maniax", keyword: "RPG" },
    items: [sampleItem()],
    nextRawPage: 2,
    exhausted: true,
    displayOffset: 0,
    channelId: "channel-1",
    messageId: "message-1",
    ...overrides,
  };
}

describe("buildSearchResultMessage", () => {
  it("renders one embed per item on the current page", () => {
    const session = sampleSession({
      items: [sampleItem({ id: "RJ01" }), sampleItem({ id: "RJ02" })],
    });
    const payload = buildSearchResultMessage(session);

    expect(payload.embeds).toHaveLength(2);
    const embed = toJsonEmbed(payload.embeds?.[0]);
    expect(embed?.title).toBe("サンプル作品");
    expect(embed?.url).toBe("https://example.com/RJ012345");
    expect(embed?.thumbnail?.url).toBe("https://example.com/thumb.jpg");
    expect(embed?.description).toContain("価格: 1,320円");
    expect(embed?.description).toContain("サークル: サンプルサークル");
  });

  it("returns the empty failure message when there is nothing to show on the current page", () => {
    const session = sampleSession({ items: [], displayOffset: 0 });
    const payload = buildSearchResultMessage(session);

    expect(payload.embeds).toBeUndefined();
    expect(payload.content).toContain("見つかりませんでした");
  });

  it("disables the prev button on the first page and enables it afterward", () => {
    expect(hasPreviousPage(sampleSession({ displayOffset: 0 }))).toBe(false);
    expect(hasPreviousPage(sampleSession({ displayOffset: 10 }))).toBe(true);
  });

  it("enables next when more buffered items or upstream pages remain", () => {
    expect(
      hasNextPage(
        sampleSession({ items: Array.from({ length: 5 }, () => sampleItem()), exhausted: true }),
      ),
    ).toBe(false);
    expect(
      hasNextPage(
        sampleSession({ items: Array.from({ length: 10 }, () => sampleItem()), exhausted: false }),
      ),
    ).toBe(true);
    expect(
      hasNextPage(
        sampleSession({ items: Array.from({ length: 20 }, () => sampleItem()), exhausted: true }),
      ),
    ).toBe(true);
  });

  it("reflects pagination state in the button components", () => {
    const session = sampleSession({
      items: Array.from({ length: 20 }, () => sampleItem()),
      displayOffset: 10,
      exhausted: true,
    });
    const payload = buildSearchResultMessage(session);
    const row = toJsonRow(payload.components?.[0]);
    const [prevButton, nextButton] = row?.components ?? [];

    expect(prevButton?.disabled).toBe(false);
    expect(nextButton?.disabled).toBe(true);
    expect(prevButton && "custom_id" in prevButton && prevButton.custom_id).toBe(
      "search:token-1:prev",
    );
    expect(nextButton && "custom_id" in nextButton && nextButton.custom_id).toBe(
      "search:token-1:next",
    );
  });
});

describe("buildDisabledSearchMessage", () => {
  it("forces both buttons disabled regardless of pagination state", () => {
    const session = sampleSession({
      items: Array.from({ length: 20 }, () => sampleItem()),
      displayOffset: 0,
      exhausted: false,
    });
    const payload = buildDisabledSearchMessage(session);
    const row = toJsonRow(payload.components?.[0]);
    const [prevButton, nextButton] = row?.components ?? [];

    expect(prevButton?.disabled).toBe(true);
    expect(nextButton?.disabled).toBe(true);
  });
});

describe("buildSearchFailureMessage", () => {
  it("returns a distinct message per failure kind", () => {
    expect(buildSearchFailureMessage("empty").content).toContain("見つかりませんでした");
    expect(buildSearchFailureMessage("session_expired").content).toContain("失効しました");
    expect(buildSearchFailureMessage("nsfw_gate").content).toContain("NSFW");
    expect(buildSearchFailureMessage("generic").content).toContain("エラーが発生しました");
  });
});
