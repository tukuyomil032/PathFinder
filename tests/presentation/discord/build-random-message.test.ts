import { MessageFlags } from "discord.js";
import { describe, expect, it } from "vitest";
import type {
  RandomResolvedWork,
  RandomSession,
} from "../../../src/domain/random/random-session-cache";
import type { WorkPreview } from "../../../src/domain/rj/types";
import type { SearchResultItem } from "../../../src/domain/search/types";
import {
  buildDisabledRandomMessage,
  buildRandomResultMessage,
} from "../../../src/presentation/discord/build-random-message";

const ComponentType = {
  ActionRow: 1,
  Button: 2,
  Section: 9,
  TextDisplay: 10,
  Thumbnail: 11,
  Separator: 14,
  Container: 17,
} as const;

function work(overrides: Partial<WorkPreview> = {}): WorkPreview {
  return {
    store: "dlsite",
    id: "RJ012345",
    title: "星巡りの耳かき",
    url: "https://www.dlsite.com/maniax/work/=/product_id/RJ012345.html",
    makerName: "月明かりラボ",
    makerId: "RG70730",
    ageCategory: "18禁",
    isAdult: true,
    price: "1,320円",
    salePrice: null,
    releaseDate: "2025年01月15日",
    rating: "4.8",
    thumbnailUrl: "https://img.dlsite.jp/thumb.jpg",
    tags: ["ASMR", "癒やし"],
    author: null,
    scenario: null,
    illustration: null,
    voiceActors: ["高原鈴音"],
    fileFormat: "WAV/MP3",
    fileSize: "1.2GB",
    parseCoverage: "full",
    serviceName: "DLSite 同人",
    circleOrBrandLabel: "サークル",
    rawAttributes: {},
    parserName: "dlsite/maniax",
    ...overrides,
  };
}

function item(overrides: Partial<SearchResultItem> = {}): SearchResultItem {
  return {
    store: "dlsite",
    id: "RJ012345",
    title: "星巡りの耳かき",
    url: "https://www.dlsite.com/maniax/work/=/product_id/RJ012345.html",
    thumbnailUrl: null,
    price: "1,320円",
    priceValue: 1320,
    makerName: "月明かりラボ",
    makerId: "RG70730",
    ...overrides,
  };
}

function resolved(workOverrides: Partial<WorkPreview> = {}): RandomResolvedWork {
  const w = work(workOverrides);
  return { item: item({ id: w.id, title: w.title, url: w.url }), work: w };
}

function session(results: RandomResolvedWork[], currentIndex = 0): RandomSession {
  return {
    token: "token-1",
    results,
    currentIndex,
    channelId: "channel-1",
    messageId: null,
  };
}

function flattenComponents(payload: ReturnType<typeof buildRandomResultMessage>) {
  const container = (payload.components?.[0] as { toJSON(): unknown }).toJSON() as {
    type: number;
    components: unknown[];
  };
  return container;
}

describe("buildRandomResultMessage", () => {
  it("always sets the IsComponentsV2 flag and never sets content/embeds", () => {
    const payload = buildRandomResultMessage(session([resolved()]), true);

    expect(payload.flags).toBe(MessageFlags.IsComponentsV2);
    expect("content" in payload).toBe(false);
    expect("embeds" in payload).toBe(false);
  });

  it("wraps everything in a single top-level Container", () => {
    const payload = buildRandomResultMessage(session([resolved()]), true);

    expect(payload.components).toHaveLength(1);
    expect(flattenComponents(payload).type).toBe(ComponentType.Container);
  });

  it("includes a markdown hyperlink and key fields for every summary line", () => {
    const results = [
      resolved({ id: "RJ1", title: "作品A", url: "https://example.com/RJ1" }),
      resolved({ id: "RJ2", title: "作品B", url: "https://example.com/RJ2" }),
    ];
    const payload = buildRandomResultMessage(session(results), true);
    const serialized = JSON.stringify(flattenComponents(payload));

    expect(serialized).toContain("[作品A](https://example.com/RJ1)");
    expect(serialized).toContain("[作品B](https://example.com/RJ2)");
    expect(serialized).toContain("月明かりラボ");
    expect(serialized).toContain("1,320円");
    expect(serialized).toContain("2025年01月15日");
    expect(serialized).toContain("4.8");
    expect(serialized).toContain("高原鈴音");
  });

  it("falls back to the unknown-price label instead of the literal string null when only a sale price is present", () => {
    const results = [resolved({ price: null, salePrice: "990円" })];
    const payload = buildRandomResultMessage(session(results), true);
    const serialized = JSON.stringify(flattenComponents(payload));

    expect(serialized).toContain("不明（セール: 990円）");
    expect(serialized).not.toContain("null");
  });

  it("shows an author line instead of voiceActors when voiceActors is empty", () => {
    const results = [resolved({ voiceActors: [], author: "鳥居ヨシツナ" })];
    const payload = buildRandomResultMessage(session(results), true);
    const serialized = JSON.stringify(flattenComponents(payload));

    expect(serialized).toContain("著者: 鳥居ヨシツナ");
    expect(serialized).not.toContain("声優:");
  });

  it("suppresses summary details for an adult work in a non-NSFW channel but keeps the title link", () => {
    const results = [
      resolved({ id: "RJ1", title: "隠される作品", url: "https://example.com/RJ1", isAdult: true }),
    ];
    const payload = buildRandomResultMessage(session(results), false);
    const serialized = JSON.stringify(flattenComponents(payload));

    expect(serialized).toContain("[隠される作品](https://example.com/RJ1)");
    expect(serialized).not.toContain("月明かりラボ");
    expect(serialized).not.toContain("1,320円");
  });

  it("does not suppress an all-ages DLsite work in a non-NSFW channel", () => {
    const results = [resolved({ isAdult: false })];
    const payload = buildRandomResultMessage(session(results), false);
    const serialized = JSON.stringify(flattenComponents(payload));

    expect(serialized).toContain("月明かりラボ");
  });

  it("renders only the current index's work in the detail block", () => {
    const results = [
      resolved({
        id: "RJ1",
        title: "1番目の作品",
        url: "https://example.com/RJ1",
        thumbnailUrl: "https://img.example.com/RJ1.jpg",
      }),
      resolved({
        id: "RJ2",
        title: "2番目の作品",
        url: "https://example.com/RJ2",
        thumbnailUrl: "https://img.example.com/RJ2.jpg",
      }),
    ];

    const firstContainer = flattenComponents(buildRandomResultMessage(session(results, 0), true));
    const secondContainer = flattenComponents(buildRandomResultMessage(session(results, 1), true));
    const first = JSON.stringify(firstContainer);
    const second = JSON.stringify(secondContainer);

    expect(first).toContain("1 / 2件目");
    expect(second).toContain("2 / 2件目");

    // まとめブロックには両作品が常に含まれるため、件数表示だけでなく詳細ブロック
    // （Thumbnailアクセサリ）の実内容がcurrentIndexの1件だけであることも検証する。
    const firstSection = firstContainer.components.find(
      (c) => (c as { type: number }).type === ComponentType.Section,
    ) as { accessory: { media: { url: string } } } | undefined;
    const secondSection = secondContainer.components.find(
      (c) => (c as { type: number }).type === ComponentType.Section,
    ) as { accessory: { media: { url: string } } } | undefined;

    expect(firstSection?.accessory.media.url).toBe("https://img.example.com/RJ1.jpg");
    expect(secondSection?.accessory.media.url).toBe("https://img.example.com/RJ2.jpg");
  });

  it("uses a Section with a Thumbnail accessory when thumbnailUrl is present", () => {
    const payload = buildRandomResultMessage(session([resolved()]), true);
    const container = flattenComponents(payload);
    const section = container.components.find(
      (c) => (c as { type: number }).type === ComponentType.Section,
    ) as { accessory: { type: number; media: { url: string } } } | undefined;

    expect(section).toBeDefined();
    expect(section?.accessory.type).toBe(ComponentType.Thumbnail);
    expect(section?.accessory.media.url).toBe("https://img.dlsite.jp/thumb.jpg");
  });

  it("falls back to plain TextDisplay components (no Section) when thumbnailUrl is missing", () => {
    const results = [resolved({ thumbnailUrl: null })];
    const payload = buildRandomResultMessage(session(results), true);
    const container = flattenComponents(payload);
    const hasSection = container.components.some(
      (c) => (c as { type: number }).type === ComponentType.Section,
    );

    expect(hasSection).toBe(false);
    expect(JSON.stringify(container)).toContain("月明かりラボ");
  });

  it("enables next but disables prev on the first page", () => {
    const results = [resolved({ id: "RJ1" }), resolved({ id: "RJ2" })];
    const payload = buildRandomResultMessage(session(results, 0), true);
    const buttons = findButtons(flattenComponents(payload));

    expect(buttons[0].disabled).toBe(true); // prev
    expect(buttons[1].disabled).toBe(false); // next
  });

  it("enables prev but disables next on the last page", () => {
    const results = [resolved({ id: "RJ1" }), resolved({ id: "RJ2" })];
    const payload = buildRandomResultMessage(session(results, 1), true);
    const buttons = findButtons(flattenComponents(payload));

    expect(buttons[0].disabled).toBe(false); // prev
    expect(buttons[1].disabled).toBe(true); // next
  });

  it("uses random:{token}:prev|next as button custom ids", () => {
    const payload = buildRandomResultMessage(session([resolved(), resolved()], 0), true);
    const buttons = findButtons(flattenComponents(payload));

    expect(buttons[0].custom_id).toBe("random:token-1:prev");
    expect(buttons[1].custom_id).toBe("random:token-1:next");
  });
});

describe("buildDisabledRandomMessage", () => {
  it("disables both pagination buttons regardless of position", () => {
    const results = [resolved({ id: "RJ1" }), resolved({ id: "RJ2" })];
    const payload = buildDisabledRandomMessage(session(results, 0), true);
    const buttons = findButtons(flattenComponents(payload));

    expect(buttons[0].disabled).toBe(true);
    expect(buttons[1].disabled).toBe(true);
    expect(payload.flags).toBe(MessageFlags.IsComponentsV2);
  });
});

function findButtons(container: { components: unknown[] }): Array<{
  custom_id: string;
  disabled: boolean;
}> {
  const actionRow = container.components.find(
    (c) => (c as { type: number }).type === ComponentType.ActionRow,
  ) as { components: Array<{ custom_id: string; disabled: boolean }> };

  return actionRow.components;
}
