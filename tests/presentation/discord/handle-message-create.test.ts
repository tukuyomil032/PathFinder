import { afterEach, describe, expect, it, vi } from "vitest";
import { createRjCache } from "../../../src/domain/rj/cache";
import type { FetchedWorkPage, WorkPreview, WorkReference } from "../../../src/domain/rj/types";
import { createMessageHandler } from "../../../src/presentation/discord/handle-message-create";
import { createPreviewRuntime } from "../../../src/presentation/discord/preview-runtime";

function createMockMessage(
  content: string,
  options: {
    nsfw?: boolean;
    parentNsfw?: boolean;
    isThread?: boolean;
  } = {},
) {
  return {
    content,
    author: { bot: false },
    channel: {
      nsfw: options.nsfw,
      parent: options.parentNsfw === undefined ? null : { nsfw: options.parentNsfw },
      isThread: () => options.isThread ?? false,
    },
    reply: vi.fn().mockResolvedValue(undefined),
  };
}

const sampleWork: WorkPreview = {
  store: "dlsite",
  id: "RJ012345",
  title: "星巡りの耳かき",
  url: "https://example.com/RJ012345",
  makerName: "月明かりラボ",
  ageCategory: "18禁",
  isAdult: true,
  price: "1,320円",
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

const samplePage: FetchedWorkPage = {
  store: "dlsite",
  html: "<html></html>",
  fetchedUrl: "https://www.dlsite.com/maniax/work/=/product_id/RJ012345.html",
  resolvedUrl: "https://www.dlsite.com/maniax/work/=/product_id/RJ012345.html",
  pageKind: "work",
  status: 200,
};

function stubRuntimeEnv(strictMode: "true" | "false") {
  vi.stubEnv("DISCORD_BOT_TOKEN", "token");
  vi.stubEnv("CACHE_TTL_MS", "60000");
  vi.stubEnv("DLSITE_USER_AGENT", "test-agent");
  vi.stubEnv("NSFW_STRICT_MODE", strictMode);
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("createMessageHandler", () => {
  it("does nothing when no work reference exists", async () => {
    const message = createMockMessage("hello");
    const handler = createMessageHandler({
      previewRuntime: createPreviewRuntime({
        cache: createRjCache(1_000),
        fetchWorkPage: vi.fn(),
        parseWork: vi.fn(),
        buildPreviewMessage: vi.fn(),
        buildFailureMessage: vi.fn(),
      }),
    });

    await handler(message as never);

    expect(message.reply).not.toHaveBeenCalled();
  });

  it("replies with a preview payload", async () => {
    const message = createMockMessage("RJ012345", { nsfw: true });
    const fetchWorkPage = vi.fn().mockResolvedValue(samplePage);
    const parseWork = vi.fn().mockReturnValue(sampleWork);
    const previewPayload = { embeds: [{ title: "preview" }] };
    const buildPreview = vi.fn().mockReturnValue(previewPayload);
    const handler = createMessageHandler({
      previewRuntime: createPreviewRuntime({
        cache: createRjCache(1_000),
        fetchWorkPage,
        parseWork,
        buildPreviewMessage: buildPreview,
        buildFailureMessage: vi.fn(),
      }),
    });

    await handler(message as never);

    expect(fetchWorkPage).toHaveBeenCalledWith(reference("RJ012345"));
    expect(parseWork).toHaveBeenCalledWith(samplePage, reference("RJ012345"));
    expect(buildPreview).toHaveBeenCalledWith(sampleWork, true);
    expect(message.reply).toHaveBeenCalledWith(previewPayload);
  });

  it("routes BJ bare ids through the shared DLSite flow", async () => {
    const message = createMockMessage("BJ02519460", { nsfw: true });
    const fetchWorkPage = vi.fn().mockResolvedValue({
      ...samplePage,
      fetchedUrl: "https://www.dlsite.com/books/work/=/product_id/BJ02519460.html",
      resolvedUrl: "https://www.dlsite.com/books/work/=/product_id/BJ02519460.html",
    });
    const parseWork = vi.fn().mockReturnValue({
      ...sampleWork,
      id: "BJ02519460",
      url: "https://www.dlsite.com/books/work/=/product_id/BJ02519460.html",
      makerName: "朝霧栞",
      circleOrBrandLabel: "著者",
      serviceName: "DLSite Books",
      parserName: "dlsite/books",
      rawAttributes: { surface: "books" },
    });
    const handler = createMessageHandler({
      previewRuntime: createPreviewRuntime({
        cache: createRjCache(1_000),
        fetchWorkPage,
        parseWork,
        buildPreviewMessage: vi.fn().mockReturnValue({ content: "books" }),
        buildFailureMessage: vi.fn(),
      }),
    });

    await handler(message as never);

    expect(fetchWorkPage).toHaveBeenCalledWith({
      store: "dlsite",
      id: "BJ02519460",
      kind: "code",
      matchedText: "BJ02519460",
    });
  });

  it("uses cache hits instead of refetching", async () => {
    const cache = createRjCache(1_000);
    cache.set(reference("RJ012345"), sampleWork);
    const message = createMockMessage("RJ012345", { nsfw: false });
    const fetchWorkPage = vi.fn();
    const parseWork = vi.fn();
    const buildPreview = vi.fn().mockReturnValue({ content: "cached" });
    const handler = createMessageHandler({
      previewRuntime: createPreviewRuntime({
        cache,
        fetchWorkPage,
        parseWork,
        buildPreviewMessage: buildPreview,
        buildFailureMessage: vi.fn(),
      }),
    });

    await handler(message as never);

    expect(fetchWorkPage).not.toHaveBeenCalled();
    expect(parseWork).not.toHaveBeenCalled();
    expect(buildPreview).toHaveBeenCalledWith(sampleWork, false);
  });

  it("replies with a fallback message on failure", async () => {
    const message = createMockMessage("RJ012345", { nsfw: false });
    const fallbackPayload = { content: "failed" };
    const buildFailure = vi.fn().mockReturnValue(fallbackPayload);
    const handler = createMessageHandler({
      previewRuntime: createPreviewRuntime({
        cache: createRjCache(1_000),
        fetchWorkPage: vi.fn().mockRejectedValue(new Error("boom")),
        parseWork: vi.fn(),
        buildPreviewMessage: vi.fn(),
        buildFailureMessage: buildFailure,
        log: { error: vi.fn() },
      }),
    });

    await handler(message as never);

    expect(buildFailure).toHaveBeenCalledWith("RJ012345");
    expect(message.reply).toHaveBeenCalledWith(fallbackPayload);
  });

  it("treats thread parent nsfw as nsfw", async () => {
    const message = createMockMessage("RJ012345", {
      parentNsfw: true,
      isThread: true,
    });
    const buildPreview = vi.fn().mockReturnValue({ content: "thread" });
    const handler = createMessageHandler({
      previewRuntime: createPreviewRuntime({
        cache: createRjCache(1_000),
        fetchWorkPage: vi.fn().mockResolvedValue(samplePage),
        parseWork: vi.fn().mockReturnValue(sampleWork),
        buildPreviewMessage: buildPreview,
        buildFailureMessage: vi.fn(),
      }),
    });

    await handler(message as never);

    expect(buildPreview).toHaveBeenCalledWith(sampleWork, true);
  });

  it("suppresses details on unknown channel state when strict mode is enabled", async () => {
    stubRuntimeEnv("true");

    const message = createMockMessage("RJ012345");
    const buildPreview = vi.fn().mockReturnValue({ content: "strict" });
    const handler = createMessageHandler({
      previewRuntime: createPreviewRuntime({
        cache: createRjCache(1_000),
        fetchWorkPage: vi.fn().mockResolvedValue(samplePage),
        parseWork: vi.fn().mockReturnValue(sampleWork),
        buildPreviewMessage: buildPreview,
        buildFailureMessage: vi.fn(),
      }),
    });

    await handler(message as never);

    expect(buildPreview).toHaveBeenCalledWith(sampleWork, false);
  });

  it("allows details on unknown channel state when strict mode is disabled", async () => {
    stubRuntimeEnv("false");

    const message = createMockMessage("RJ012345");
    const buildPreview = vi.fn().mockReturnValue({ content: "non-strict" });
    const handler = createMessageHandler({
      previewRuntime: createPreviewRuntime({
        cache: createRjCache(1_000),
        fetchWorkPage: vi.fn().mockResolvedValue(samplePage),
        parseWork: vi.fn().mockReturnValue(sampleWork),
        buildPreviewMessage: buildPreview,
        buildFailureMessage: vi.fn(),
      }),
    });

    await handler(message as never);

    expect(buildPreview).toHaveBeenCalledWith(sampleWork, true);
  });

  it("extracts and routes DMM TV references", async () => {
    const message = createMockMessage("https://tv.dmm.co.jp/detail/?content=midv00018");
    const dmmWork: WorkPreview = {
      ...sampleWork,
      store: "dmm_tv_av",
      id: "midv00018",
      url: "https://tv.dmm.co.jp/detail/?content=midv00018",
      parseCoverage: "partial",
      parserName: "dmm_tv_av/detail-partial",
    };
    const page: FetchedWorkPage = {
      ...samplePage,
      store: "dmm_tv_av",
      fetchedUrl: "https://tv.dmm.co.jp/detail/?content=midv00018",
      resolvedUrl: "https://tv.dmm.co.jp/detail/?content=midv00018",
    };
    const fetchWorkPage = vi.fn().mockResolvedValue(page);
    const parseWork = vi.fn().mockReturnValue(dmmWork);
    const buildPreview = vi.fn().mockReturnValue({ content: "dmm-tv" });
    const handler = createMessageHandler({
      previewRuntime: createPreviewRuntime({
        cache: createRjCache(1_000),
        fetchWorkPage,
        parseWork,
        buildPreviewMessage: buildPreview,
        buildFailureMessage: vi.fn(),
      }),
    });

    await handler(message as never);

    expect(fetchWorkPage).toHaveBeenCalledWith({
      store: "dmm_tv_av",
      id: "midv00018",
      kind: "url",
      sourceUrl: "https://tv.dmm.co.jp/detail/?content=midv00018",
      matchedText: "https://tv.dmm.co.jp/detail/?content=midv00018",
    });
    expect(buildPreview).toHaveBeenCalledWith(dmmWork, false);
  });

  it("routes VJ URLs through the shared DLSite flow", async () => {
    const sourceUrl = "https://www.dlsite.com/pro/work/=/product_id/VJ01004728.html";
    const message = createMockMessage(sourceUrl, { nsfw: true });
    const fetchWorkPage = vi.fn().mockResolvedValue({
      ...samplePage,
      fetchedUrl: sourceUrl,
      resolvedUrl: sourceUrl,
    });
    const parseWork = vi.fn().mockReturnValue({
      ...sampleWork,
      id: "VJ01004728",
      url: sourceUrl,
      makerName: "Lune Palette",
      circleOrBrandLabel: "ブランド",
      serviceName: "DLSite 美少女ゲーム",
      parserName: "dlsite/pro",
      rawAttributes: { surface: "pro" },
    });
    const buildPreview = vi.fn().mockReturnValue({ content: "vj" });
    const handler = createMessageHandler({
      previewRuntime: createPreviewRuntime({
        cache: createRjCache(1_000),
        fetchWorkPage,
        parseWork,
        buildPreviewMessage: buildPreview,
        buildFailureMessage: vi.fn(),
      }),
    });

    await handler(message as never);

    expect(fetchWorkPage).toHaveBeenCalledWith({
      store: "dlsite",
      id: "VJ01004728",
      kind: "url",
      sourceUrl,
      matchedText: sourceUrl,
    });
    expect(buildPreview).toHaveBeenCalled();
  });

  it("upgrades cached bare DMM partial results when a canonical URL is referenced", async () => {
    const cache = createRjCache(1_000);
    const cachedPartial: WorkPreview = {
      ...sampleWork,
      store: "fanza_doujin",
      id: "d_123456",
      url: "https://www.dmm.co.jp/-/detail/=/cid=d_123456/",
      parseCoverage: "partial",
      parserName: "fanza_doujin/dc-doujin-partial",
    };
    const fullWork: WorkPreview = {
      ...cachedPartial,
      url: "https://www.dmm.co.jp/dc/doujin/-/detail/=/cid=d_123456/",
      parseCoverage: "full",
      parserName: "fanza_doujin/dc-doujin",
    };

    cache.set(
      {
        store: "fanza_doujin",
        id: "d_123456",
        kind: "code",
        matchedText: "d_123456",
      },
      cachedPartial,
    );

    const message = createMockMessage("https://www.dmm.co.jp/dc/doujin/-/detail/=/cid=d_123456/");
    const page: FetchedWorkPage = {
      ...samplePage,
      store: "fanza_doujin",
      fetchedUrl: "https://www.dmm.co.jp/dc/doujin/-/detail/=/cid=d_123456/",
      resolvedUrl: "https://www.dmm.co.jp/dc/doujin/-/detail/=/cid=d_123456/",
    };
    const fetchWorkPage = vi.fn().mockResolvedValue(page);
    const parseWork = vi.fn().mockReturnValue(fullWork);
    const handler = createMessageHandler({
      previewRuntime: createPreviewRuntime({
        cache,
        fetchWorkPage,
        parseWork,
        buildPreviewMessage: vi.fn().mockReturnValue({ content: "upgraded" }),
        buildFailureMessage: vi.fn(),
      }),
    });

    await handler(message as never);

    expect(fetchWorkPage).toHaveBeenCalledTimes(1);
    expect(parseWork).toHaveBeenCalledTimes(1);
    expect(
      cache.get({
        store: "fanza_doujin",
        id: "d_123456",
        kind: "code",
        matchedText: "d_123456",
      }),
    ).toEqual(fullWork);
  });

  it("guides users to send a FANZA同人 URL when bare cid cannot be resolved", async () => {
    const message = createMockMessage("d_743581", { nsfw: true });
    const fallbackPayload = { content: "needs url" };
    const handler = createMessageHandler({
      previewRuntime: {
        resolve: vi.fn().mockResolvedValue(fallbackPayload),
      } as never,
    });

    await handler(message as never);

    expect(message.reply).toHaveBeenCalledWith(fallbackPayload);
  });

  it("routes d123456 through the FANZA同人 flow with normalized id", async () => {
    const message = createMockMessage("d123456", { nsfw: true });
    const fanzaWork: WorkPreview = {
      ...sampleWork,
      store: "fanza_doujin",
      id: "d_123456",
      url: "https://www.dmm.co.jp/dc/doujin/-/detail/=/cid=d_123456/",
      parseCoverage: "partial",
      parserName: "fanza_doujin/dc-doujin-partial",
    };
    const page: FetchedWorkPage = {
      ...samplePage,
      store: "fanza_doujin",
      fetchedUrl: "https://www.dmm.co.jp/dc/doujin/-/detail/=/cid=d_123456/",
      resolvedUrl: "https://www.dmm.co.jp/dc/doujin/-/detail/=/cid=d_123456/",
    };
    const fetchWorkPage = vi.fn().mockResolvedValue(page);
    const parseWork = vi.fn().mockReturnValue(fanzaWork);
    const buildPreview = vi.fn().mockReturnValue({ content: "fanza-doujin" });
    const handler = createMessageHandler({
      previewRuntime: createPreviewRuntime({
        cache: createRjCache(1_000),
        fetchWorkPage,
        parseWork,
        buildPreviewMessage: buildPreview,
        buildFailureMessage: vi.fn(),
      }),
    });

    await handler(message as never);

    expect(fetchWorkPage).toHaveBeenCalledWith({
      store: "fanza_doujin",
      id: "d_123456",
      kind: "code",
      matchedText: "d123456",
    });
    expect(parseWork).toHaveBeenCalledWith(page, {
      store: "fanza_doujin",
      id: "d_123456",
      kind: "code",
      matchedText: "d123456",
    });
    expect(message.reply).toHaveBeenCalledWith({ content: "fanza-doujin" });
  });
});

function reference(id: string): WorkReference {
  return {
    store: "dlsite",
    id,
    kind: "code",
    matchedText: id,
  };
}
