import { config as loadEnv } from "dotenv";
import { z } from "zod";

loadEnv();

export const envSchema = z.object({
  DISCORD_BOT_TOKEN: z.string().min(1),
  DISCORD_CLIENT_ID: z.string().min(1).optional(),
  DISCORD_GUILD_ID: z.string().min(1).optional(),
  CACHE_TTL_MS: z.coerce.number().int().positive(),
  DLSITE_USER_AGENT: z.string().min(1),
  NSFW_STRICT_MODE: z.enum(["true", "false"]).transform((value) => value === "true"),
});

export type Env = z.infer<typeof envSchema>;

export function parseEnv(source: NodeJS.ProcessEnv): Env {
  return envSchema.parse(source);
}

export function getEnv(): Env {
  return parseEnv(process.env);
}
