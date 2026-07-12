import { describe, expect, it, vi } from "vitest";
import { buildApplicationCommands } from "../../../src/presentation/discord/command-definitions";
import { registerApplicationCommands } from "../../../src/presentation/discord/register-commands";

describe("buildApplicationCommands", () => {
  it("builds dlsite, fanza, search, random, and help commands", () => {
    expect(buildApplicationCommands().map((command) => command.name)).toEqual([
      "dlsite",
      "fanza",
      "search",
      "random",
      "help",
    ]);
  });
});

describe("registerApplicationCommands", () => {
  it("registers guild commands when DISCORD_GUILD_ID is set", async () => {
    const setCommands = vi.fn().mockResolvedValue(undefined);
    const fetchGuild = vi.fn().mockResolvedValue({
      commands: {
        set: setCommands,
      },
    });

    await registerApplicationCommands(
      {
        application: null,
        guilds: { fetch: fetchGuild },
      } as never,
      "guild-1",
    );

    expect(fetchGuild).toHaveBeenCalledWith("guild-1");
    expect(setCommands).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          name: "dlsite",
        }),
      ]),
    );
  });

  it("registers global commands when DISCORD_GUILD_ID is absent", async () => {
    const setCommands = vi.fn().mockResolvedValue(undefined);

    await registerApplicationCommands(
      {
        application: {
          commands: {
            set: setCommands,
          },
        },
        guilds: { fetch: vi.fn() },
      } as never,
      undefined,
    );

    expect(setCommands).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          name: "help",
        }),
      ]),
    );
  });
});
