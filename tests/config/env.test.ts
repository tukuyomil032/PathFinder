import { describe, expect, it } from "vitest";
import { parseEnv } from "../../src/config/env";

describe("parseEnv", () => {
  it("accepts required variables", () => {
    const result = parseEnv({
      DISCORD_BOT_TOKEN: "token",
      DISCORD_CLIENT_ID: "client-id",
      DISCORD_GUILD_ID: "guild-id",
      CACHE_TTL_MS: "60000",
      DLSITE_USER_AGENT: "test-agent",
      NSFW_STRICT_MODE: "true",
    });

    expect(result.CACHE_TTL_MS).toBe(60000);
    expect(result.DISCORD_GUILD_ID).toBe("guild-id");
    expect(result.NSFW_STRICT_MODE).toBe(true);
    expect(result.SEARCH_SESSION_TTL_MS).toBe(600_000);
    expect(result.RANDOM_GENRE_CACHE_TTL_MS).toBe(86_400_000);
  });

  it("accepts an explicit SEARCH_SESSION_TTL_MS override", () => {
    const result = parseEnv({
      DISCORD_BOT_TOKEN: "token",
      CACHE_TTL_MS: "60000",
      SEARCH_SESSION_TTL_MS: "120000",
      DLSITE_USER_AGENT: "test-agent",
      NSFW_STRICT_MODE: "true",
    });

    expect(result.SEARCH_SESSION_TTL_MS).toBe(120_000);
  });

  it("accepts an explicit RANDOM_GENRE_CACHE_TTL_MS override", () => {
    const result = parseEnv({
      DISCORD_BOT_TOKEN: "token",
      CACHE_TTL_MS: "60000",
      RANDOM_GENRE_CACHE_TTL_MS: "3600000",
      DLSITE_USER_AGENT: "test-agent",
      NSFW_STRICT_MODE: "true",
    });

    expect(result.RANDOM_GENRE_CACHE_TTL_MS).toBe(3_600_000);
  });

  it("fails fast when required variables are missing", () => {
    expect(() =>
      parseEnv({
        DISCORD_BOT_TOKEN: "",
        CACHE_TTL_MS: "0",
        DLSITE_USER_AGENT: "",
        NSFW_STRICT_MODE: "maybe",
      }),
    ).toThrowError();
  });
});
