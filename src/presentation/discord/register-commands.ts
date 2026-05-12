import type { Client, RESTPostAPIChatInputApplicationCommandsJSONBody } from "discord.js";
import { buildApplicationCommands } from "./command-definitions";

type RegisterCommandsDeps = {
  commands?: RESTPostAPIChatInputApplicationCommandsJSONBody[];
  log?: Partial<Pick<Console, "info">>;
};

export async function registerApplicationCommands(
  client: Pick<Client, "application" | "guilds">,
  guildId?: string,
  deps: RegisterCommandsDeps = {},
): Promise<void> {
  const commands = deps.commands ?? buildApplicationCommands();

  if (guildId) {
    const guild = await client.guilds.fetch(guildId);
    await guild.commands.set(commands);
    deps.log?.info?.("Registered guild application commands", { guildId, count: commands.length });
    return;
  }

  if (!client.application) {
    throw new Error("Discord application is not ready");
  }

  await client.application.commands.set(commands);
  deps.log?.info?.("Registered global application commands", { count: commands.length });
}
