import { describe, expect, it, vi } from "vitest";
import { createRjCache } from "../../../src/domain/rj/cache";
import type { DLSiteWork } from "../../../src/domain/rj/types";
import { createMessageHandler } from "../../../src/presentation/discord/handle-message-create";

const sampleWork: DLSiteWork = {
  id: "RJ012345",
  title: "星巡りの耳かき",
  url: "https://example.com/RJ012345",
  makerName: "月明かりラボ",
  price: "1,320円",
  salePrice: null,
  ageCategory: "全年齢",
  releaseDate: "2025年01月15日",
  rating: "4.8",
  thumbnailUrl: null,
  tags: ["ASMR"],
  isAdult: false,
};

function createMockMessage(content: string) {
  return {
    content,
    author: { bot: false },
    channel: { nsfw: false },
    reply: vi.fn().mockResolvedValue(undefined),
  };
}

describe("preview flow integration", () => {
  it("fetches, parses, caches and reuses the first RJ code", async () => {
    const cache = createRjCache(60_000);
    const fetchWorkPage = vi.fn().mockResolvedValue("<html>fixture</html>");
    const parseWork = vi.fn().mockReturnValue(sampleWork);
    const buildPreviewMessage = vi
      .fn()
      .mockImplementation((work: DLSiteWork) => ({ content: work.title }));
    const handler = createMessageHandler({
      cache,
      fetchWorkPage,
      parseWork,
      buildPreviewMessage,
      buildFailureMessage: vi.fn(),
    });

    const first = createMockMessage("RJ012345 RJ999999");
    await handler(first as never);

    const second = createMockMessage("rj012345");
    await handler(second as never);

    expect(fetchWorkPage).toHaveBeenCalledTimes(1);
    expect(fetchWorkPage).toHaveBeenCalledWith("RJ012345");
    expect(parseWork).toHaveBeenCalledTimes(1);
    expect(first.reply).toHaveBeenCalledWith({ content: "星巡りの耳かき" });
    expect(second.reply).toHaveBeenCalledWith({ content: "星巡りの耳かき" });
  });
});
