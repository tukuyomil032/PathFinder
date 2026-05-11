import { afterEach, describe, expect, it, vi } from "vitest";
import type { DLSiteWork } from "../../../src/domain/rj/types";
import { createMessageHandler } from "../../../src/presentation/discord/handle-message-create";

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

const sampleWork: DLSiteWork = {
  id: "RJ012345",
  title: "星巡りの耳かき",
  url: "https://example.com/RJ012345",
  makerName: "月明かりラボ",
  price: "1,320円",
  salePrice: null,
  ageCategory: "18禁",
  releaseDate: null,
  rating: null,
  thumbnailUrl: null,
  tags: [],
  isAdult: true,
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
  it("does nothing when no RJ code exists", async () => {
    const message = createMockMessage("hello");
    const handler = createMessageHandler({
      fetchWorkPage: vi.fn(),
      parseWork: vi.fn(),
      buildPreviewMessage: vi.fn(),
      buildFailureMessage: vi.fn(),
    });

    await handler(message as never);

    expect(message.reply).not.toHaveBeenCalled();
  });

  it("replies with a preview payload", async () => {
    const message = createMockMessage("RJ012345", { nsfw: true });
    const fetchWorkPage = vi.fn().mockResolvedValue("<html></html>");
    const parseWork = vi.fn().mockReturnValue(sampleWork);
    const previewPayload = { embeds: [{ title: "preview" }] };
    const buildPreview = vi.fn().mockReturnValue(previewPayload);
    const handler = createMessageHandler({
      fetchWorkPage,
      parseWork,
      buildPreviewMessage: buildPreview,
      buildFailureMessage: vi.fn(),
    });

    await handler(message as never);

    expect(fetchWorkPage).toHaveBeenCalledWith("RJ012345");
    expect(parseWork).toHaveBeenCalledWith("<html></html>", "RJ012345");
    expect(buildPreview).toHaveBeenCalledWith(sampleWork, true);
    expect(message.reply).toHaveBeenCalledWith(previewPayload);
  });

  it("replies with a fallback message on failure", async () => {
    const message = createMockMessage("RJ012345", { nsfw: false });
    const fallbackPayload = { content: "failed" };
    const buildFailure = vi.fn().mockReturnValue(fallbackPayload);
    const handler = createMessageHandler({
      fetchWorkPage: vi.fn().mockRejectedValue(new Error("boom")),
      parseWork: vi.fn(),
      buildPreviewMessage: vi.fn(),
      buildFailureMessage: buildFailure,
      log: { error: vi.fn() },
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
      fetchWorkPage: vi.fn().mockResolvedValue("<html></html>"),
      parseWork: vi.fn().mockReturnValue(sampleWork),
      buildPreviewMessage: buildPreview,
      buildFailureMessage: vi.fn(),
    });

    await handler(message as never);

    expect(buildPreview).toHaveBeenCalledWith(sampleWork, true);
  });

  it("suppresses details on unknown channel state when strict mode is enabled", async () => {
    stubRuntimeEnv("true");

    const message = createMockMessage("RJ012345");
    const buildPreview = vi.fn().mockReturnValue({ content: "strict" });
    const handler = createMessageHandler({
      fetchWorkPage: vi.fn().mockResolvedValue("<html></html>"),
      parseWork: vi.fn().mockReturnValue(sampleWork),
      buildPreviewMessage: buildPreview,
      buildFailureMessage: vi.fn(),
    });

    await handler(message as never);

    expect(buildPreview).toHaveBeenCalledWith(sampleWork, false);
  });

  it("allows details on unknown channel state when strict mode is disabled", async () => {
    stubRuntimeEnv("false");

    const message = createMockMessage("RJ012345");
    const buildPreview = vi.fn().mockReturnValue({ content: "non-strict" });
    const handler = createMessageHandler({
      fetchWorkPage: vi.fn().mockResolvedValue("<html></html>"),
      parseWork: vi.fn().mockReturnValue(sampleWork),
      buildPreviewMessage: buildPreview,
      buildFailureMessage: vi.fn(),
    });

    await handler(message as never);

    expect(buildPreview).toHaveBeenCalledWith(sampleWork, true);
  });
});
