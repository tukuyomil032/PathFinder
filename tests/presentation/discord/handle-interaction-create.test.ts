import { describe, expect, it, vi } from "vitest";
import type { WorkReference } from "../../../src/domain/rj/types";
import { createInteractionHandler } from "../../../src/presentation/discord/handle-interaction-create";

function createMockInteraction(params: {
  commandName: string;
  subcommand?: string;
  input?: string;
  helpTopic?: "dlsite" | "fanza" | "help" | null;
  nsfw?: boolean;
}) {
  return {
    commandName: params.commandName,
    channel: { nsfw: params.nsfw ?? false },
    isChatInputCommand: () => true,
    options: {
      getSubcommand: () => params.subcommand ?? "maniax",
      getString: (name: string) => {
        if (name === "input") {
          return params.input ?? null;
        }

        if (name === "command") {
          return params.helpTopic ?? null;
        }

        return null;
      },
    },
    reply: vi.fn().mockResolvedValue(undefined),
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
    });

    await handler(interaction as never);

    expect(interaction.reply).toHaveBeenCalledWith(failurePayload);
  });
});
