import { once } from "node:events";
import { Client, GatewayIntentBits } from "discord.js";
import { getEnv } from "../config/env";
import { handleInteractionCreate } from "../presentation/discord/handle-interaction-create";
import { handleMessageCreate } from "../presentation/discord/handle-message-create";
import { registerApplicationCommands } from "../presentation/discord/register-commands";

export function createDiscordClient(): Client {
  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
    ],
  });

  client.on("messageCreate", handleMessageCreate);
  client.on("interactionCreate", handleInteractionCreate);

  return client;
}

export async function startBot(): Promise<Client> {
  const client = createDiscordClient();

  const shutdown = async (signal: NodeJS.Signals) => {
    console.info(`Received ${signal}, shutting down Discord client`);
    client.removeAllListeners();
    await client.destroy();
    process.exit(0);
  };

  process.once("SIGINT", () => {
    void shutdown("SIGINT");
  });

  process.once("SIGTERM", () => {
    void shutdown("SIGTERM");
  });

  await client.login(getEnv().DISCORD_BOT_TOKEN);
  if (!client.isReady()) {
    await once(client, "clientReady");
  }
  await registerApplicationCommands(client, getEnv().DISCORD_GUILD_ID, { log: console });
  return client;
}

if (import.meta.main) {
  void startBot();
}
