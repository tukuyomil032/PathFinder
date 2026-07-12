import { describe, expect, it, vi } from "vitest";
import type { WorkReference } from "../../../src/domain/rj/types";
import { createInteractionHandler } from "../../../src/presentation/discord/handle-interaction-create";

function createMockInteraction(params: {
  commandName: string;
  subcommand?: string;
  input?: string;
  helpTopic?: "dlsite" | "fanza" | "help" | null;
  nsfw?: boolean;
  searchOptions?: Record<string, string | number | null>;
}) {
  return {
    commandName: params.commandName,
    channel: { nsfw: params.nsfw ?? false },
    isChatInputCommand: () => true,
    isButton: () => false,
    options: {
      getSubcommand: () => params.subcommand ?? "maniax",
      getString: (name: string) => {
        if (params.searchOptions && name in params.searchOptions) {
          const value = params.searchOptions[name];
          return typeof value === "string" ? value : null;
        }

        if (name === "input") {
          return params.input ?? null;
        }

        if (name === "command") {
          return params.helpTopic ?? null;
        }

        return null;
      },
      getInteger: (name: string) => {
        const value = params.searchOptions?.[name];
        return typeof value === "number" ? value : null;
      },
    },
    reply: vi.fn().mockResolvedValue(undefined),
  };
}

function createMockButtonInteraction(customId: string) {
  return {
    isChatInputCommand: () => false,
    isButton: () => true,
    customId,
  };
}

describe("createInteractionHandler", () => {
  it("maps /dlsite maniax input to the shared preview runtime", async () => {
    const previewRuntime = {
      resolve: vi.fn().mockResolvedValue({ content: "maniax" }),
    };
    const interaction = createMockInteraction({
      commandName: "dlsite",
      subcommand: "maniax",
      input: "RJ012345",
      nsfw: true,
    });
    const handler = createInteractionHandler({
      previewRuntime: previewRuntime as never,
      searchRuntime: { resolve: vi.fn(), handleButton: vi.fn() } as never,
      randomRuntime: { resolve: vi.fn() } as never,
    });

    await handler(interaction as never);

    expect(previewRuntime.resolve).toHaveBeenCalledWith(
      {
        store: "dlsite",
        id: "RJ012345",
        kind: "code",
        matchedText: "RJ012345",
      },
      true,
    );
    expect(interaction.reply).toHaveBeenCalledWith({ content: "maniax" });
  });

  it("maps /fanza av URLs to the shared preview runtime", async () => {
    const previewRuntime = {
      resolve: vi.fn().mockResolvedValue({ content: "av" }),
    };
    const interaction = createMockInteraction({
      commandName: "fanza",
      subcommand: "av",
      input: "https://tv.dmm.co.jp/detail/?content=mide00924",
    });
    const handler = createInteractionHandler({
      previewRuntime: previewRuntime as never,
      searchRuntime: { resolve: vi.fn(), handleButton: vi.fn() } as never,
      randomRuntime: { resolve: vi.fn() } as never,
    });

    await handler(interaction as never);

    expect(previewRuntime.resolve).toHaveBeenCalledWith(
      {
        store: "dmm_tv_av",
        id: "mide00924",
        kind: "url",
        sourceUrl: "https://tv.dmm.co.jp/detail/?content=mide00924",
        matchedText: "https://tv.dmm.co.jp/detail/?content=mide00924",
      },
      false,
    );
  });

  it("returns usage for invalid command input", async () => {
    const previewRuntime = {
      resolve: vi.fn(),
    };
    const interaction = createMockInteraction({
      commandName: "fanza",
      subcommand: "game",
      input: "RJ012345",
    });
    const handler = createInteractionHandler({
      previewRuntime: previewRuntime as never,
      searchRuntime: { resolve: vi.fn(), handleButton: vi.fn() } as never,
      randomRuntime: { resolve: vi.fn() } as never,
    });

    await handler(interaction as never);

    expect(previewRuntime.resolve).not.toHaveBeenCalled();
    expect(interaction.reply).toHaveBeenCalledWith({
      content: "使い方: /fanza game input:spal_0201 または FANZA GAMES作品URL",
      ephemeral: true,
      allowedMentions: { repliedUser: false },
    });
  });

  it("replies with help content ephemerally", async () => {
    const previewRuntime = {
      resolve: vi.fn(),
    };
    const interaction = createMockInteraction({
      commandName: "help",
      helpTopic: "fanza",
    });
    const handler = createInteractionHandler({
      previewRuntime: previewRuntime as never,
      searchRuntime: { resolve: vi.fn(), handleButton: vi.fn() } as never,
      randomRuntime: { resolve: vi.fn() } as never,
    });

    await handler(interaction as never);

    expect(previewRuntime.resolve).not.toHaveBeenCalled();
    expect(interaction.reply).toHaveBeenCalledWith({
      content: expect.stringContaining("/fanza"),
      ephemeral: true,
      allowedMentions: { repliedUser: false },
    });
  });

  it("passes fanza_url_required failures through the shared preview runtime", async () => {
    const failurePayload = { content: "needs url" };
    const previewRuntime = {
      resolve: vi.fn().mockImplementation(async (reference: WorkReference) => {
        expect(reference).toEqual({
          store: "fanza_doujin",
          id: "d_123456",
          kind: "code",
          matchedText: "d123456",
        });
        return failurePayload;
      }),
    };
    const interaction = createMockInteraction({
      commandName: "fanza",
      subcommand: "doujin",
      input: "d123456",
      nsfw: true,
    });
    const handler = createInteractionHandler({
      previewRuntime: previewRuntime as never,
      searchRuntime: { resolve: vi.fn(), handleButton: vi.fn() } as never,
      randomRuntime: { resolve: vi.fn() } as never,
    });

    await handler(interaction as never);

    expect(interaction.reply).toHaveBeenCalledWith(failurePayload);
  });

  it("routes /search to the search runtime with the resolved query", async () => {
    const searchRuntime = { resolve: vi.fn().mockResolvedValue(undefined), handleButton: vi.fn() };
    const interaction = createMockInteraction({
      commandName: "search",
      nsfw: true,
      searchOptions: {
        store: "dlsite_maniax",
        keyword: "RPG",
        sort: "popularity",
        price_min: 500,
        price_max: 2000,
        circle: "サンプル",
      },
    });
    const handler = createInteractionHandler({
      previewRuntime: { resolve: vi.fn() } as never,
      searchRuntime: searchRuntime as never,
      randomRuntime: { resolve: vi.fn() } as never,
    });

    await handler(interaction as never);

    expect(searchRuntime.resolve).toHaveBeenCalledWith(
      {
        target: "dlsite_maniax",
        keyword: "RPG",
        sort: "popularity",
        priceMin: 500,
        priceMax: 2000,
        circle: "サンプル",
      },
      interaction,
      true,
    );
  });

  it("routes /random to the random runtime with the resolved query", async () => {
    const randomRuntime = { resolve: vi.fn().mockResolvedValue(undefined) };
    const interaction = createMockInteraction({
      commandName: "random",
      nsfw: true,
      searchOptions: { store: "fanza_doujin", keyword: "ロリ" },
    });
    const handler = createInteractionHandler({
      previewRuntime: { resolve: vi.fn() } as never,
      searchRuntime: { resolve: vi.fn(), handleButton: vi.fn() } as never,
      randomRuntime: randomRuntime as never,
    });

    await handler(interaction as never);

    expect(randomRuntime.resolve).toHaveBeenCalledWith(
      { target: "fanza_doujin", keyword: "ロリ" },
      interaction,
      true,
    );
  });

  it("routes /random with no options to the random runtime with a null target and empty keyword", async () => {
    const randomRuntime = { resolve: vi.fn().mockResolvedValue(undefined) };
    const interaction = createMockInteraction({ commandName: "random", nsfw: true });
    const handler = createInteractionHandler({
      previewRuntime: { resolve: vi.fn() } as never,
      searchRuntime: { resolve: vi.fn(), handleButton: vi.fn() } as never,
      randomRuntime: randomRuntime as never,
    });

    await handler(interaction as never);

    expect(randomRuntime.resolve).toHaveBeenCalledWith(
      { target: null, keyword: "" },
      interaction,
      true,
    );
  });

  it("routes search: button interactions to the search runtime and ignores others", async () => {
    const searchRuntime = { resolve: vi.fn(), handleButton: vi.fn().mockResolvedValue(undefined) };
    const handler = createInteractionHandler({
      previewRuntime: { resolve: vi.fn() } as never,
      searchRuntime: searchRuntime as never,
      randomRuntime: { resolve: vi.fn() } as never,
    });

    const searchButton = createMockButtonInteraction("search:token-1:next");
    await handler(searchButton as never);
    expect(searchRuntime.handleButton).toHaveBeenCalledWith(searchButton);

    const otherButton = createMockButtonInteraction("something-else:token-1");
    await handler(otherButton as never);
    expect(searchRuntime.handleButton).toHaveBeenCalledTimes(1);
  });
});
