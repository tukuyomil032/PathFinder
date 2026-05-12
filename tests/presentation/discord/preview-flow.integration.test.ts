import { describe, expect, it, vi } from "vitest";
import { createRjCache } from "../../../src/domain/rj/cache";
import type { FetchedWorkPage, WorkPreview } from "../../../src/domain/rj/types";
import { createMessageHandler } from "../../../src/presentation/discord/handle-message-create";

const sampleWork: WorkPreview = {
  store: "dlsite",
  id: "RJ012345",
  title: "星巡りの耳かき",
  url: "https://example.com/RJ012345",
  makerName: "月明かりラボ",
  ageCategory: "全年齢",
  isAdult: false,
  price: "1,320円",
  salePrice: null,
  releaseDate: "2025年01月15日",
  rating: "4.8",
  thumbnailUrl: null,
  tags: ["ASMR"],
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
    const fetchedPage: FetchedWorkPage = {
      store: "dlsite",
      html: "<html>fixture</html>",
      fetchedUrl: "https://www.dlsite.com/maniax/work/=/product_id/RJ012345.html",
      resolvedUrl: "https://www.dlsite.com/maniax/work/=/product_id/RJ012345.html",
      pageKind: "work",
      status: 200,
    };
    const fetchWorkPage = vi.fn().mockResolvedValue(fetchedPage);
    const parseWork = vi.fn().mockReturnValue(sampleWork);
    const buildPreviewMessage = vi
      .fn()
      .mockImplementation((work: WorkPreview) => ({ content: work.title }));
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
    expect(fetchWorkPage).toHaveBeenCalledWith({
      store: "dlsite",
      id: "RJ012345",
      kind: "code",
      matchedText: "RJ012345",
    });
    expect(parseWork).toHaveBeenCalledTimes(1);
    expect(parseWork).toHaveBeenCalledWith(fetchedPage, {
      store: "dlsite",
      id: "RJ012345",
      kind: "code",
      matchedText: "RJ012345",
    });
    expect(first.reply).toHaveBeenCalledWith({ content: "星巡りの耳かき" });
    expect(second.reply).toHaveBeenCalledWith({ content: "星巡りの耳かき" });
  });

  it("reuses cached previews for BJ and VJ references", async () => {
    const cache = createRjCache(60_000);
    const fetchWorkPage = vi
      .fn()
      .mockResolvedValueOnce({
        store: "dlsite",
        html: "<html>fixture</html>",
        fetchedUrl: "https://www.dlsite.com/books/work/=/product_id/BJ02519460.html",
        resolvedUrl: "https://www.dlsite.com/books/work/=/product_id/BJ02519460.html",
        pageKind: "work",
        status: 200,
      })
      .mockResolvedValueOnce({
        store: "dlsite",
        html: "<html>fixture</html>",
        fetchedUrl: "https://www.dlsite.com/pro/work/=/product_id/VJ01004728.html",
        resolvedUrl: "https://www.dlsite.com/pro/work/=/product_id/VJ01004728.html",
        pageKind: "work",
        status: 200,
      });
    const parseWork = vi
      .fn()
      .mockReturnValueOnce({
        ...sampleWork,
        id: "BJ02519460",
        title: "夜更かし読書会",
        url: "https://www.dlsite.com/books/work/=/product_id/BJ02519460.html",
        makerName: "朝霧栞",
        circleOrBrandLabel: "著者",
        serviceName: "DLSite Books",
        parserName: "dlsite/books",
        rawAttributes: { surface: "books" },
      })
      .mockReturnValueOnce({
        ...sampleWork,
        id: "VJ01004728",
        title: "空色ステップ",
        url: "https://www.dlsite.com/pro/work/=/product_id/VJ01004728.html",
        makerName: "Lune Palette",
        circleOrBrandLabel: "ブランド",
        serviceName: "DLSite 美少女ゲーム",
        parserName: "dlsite/pro",
        rawAttributes: { surface: "pro" },
      });
    const buildPreviewMessage = vi
      .fn()
      .mockImplementation((work: WorkPreview) => ({ content: work.title }));
    const handler = createMessageHandler({
      cache,
      fetchWorkPage,
      parseWork,
      buildPreviewMessage,
      buildFailureMessage: vi.fn(),
    });

    const first = createMockMessage("BJ02519460");
    await handler(first as never);

    const second = createMockMessage(
      "https://www.dlsite.com/books/work/=/product_id/BJ02519460.html",
    );
    await handler(second as never);

    const third = createMockMessage("VJ01004728");
    await handler(third as never);

    const fourth = createMockMessage(
      "https://www.dlsite.com/pro/work/=/product_id/VJ01004728.html",
    );
    await handler(fourth as never);

    expect(fetchWorkPage).toHaveBeenCalledTimes(2);
    expect(second.reply).toHaveBeenCalledWith({ content: "夜更かし読書会" });
    expect(fourth.reply).toHaveBeenCalledWith({ content: "空色ステップ" });
  });
});
