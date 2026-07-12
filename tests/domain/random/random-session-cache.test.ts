import { describe, expect, it } from "vitest";
import { createRandomSessionCache } from "../../../src/domain/random/random-session-cache";
import type { RandomSession } from "../../../src/domain/random/random-session-cache";

const sampleSession: RandomSession = {
  token: "token-1",
  results: [],
  currentIndex: 0,
  channelId: "channel-1",
  messageId: null,
};

describe("createRandomSessionCache", () => {
  it("returns cached sessions within ttl", () => {
    let current = 1_000;
    const cache = createRandomSessionCache(500, () => current);

    cache.set(sampleSession.token, sampleSession);

    current += 499;
    expect(cache.get(sampleSession.token)).toEqual(sampleSession);
  });

  it("expires cached sessions after ttl", () => {
    let current = 1_000;
    const cache = createRandomSessionCache(500, () => current);

    cache.set(sampleSession.token, sampleSession);

    current += 500;
    expect(cache.get(sampleSession.token)).toBeNull();
  });

  it("returns null for unknown tokens", () => {
    const cache = createRandomSessionCache(500);

    expect(cache.get("missing-token")).toBeNull();
  });

  it("deletes sessions on demand", () => {
    const cache = createRandomSessionCache(500);

    cache.set(sampleSession.token, sampleSession);
    cache.delete(sampleSession.token);

    expect(cache.get(sampleSession.token)).toBeNull();
  });

  it("overwrites an existing session and refreshes its ttl", () => {
    let current = 1_000;
    const cache = createRandomSessionCache(500, () => current);

    cache.set(sampleSession.token, sampleSession);
    current += 400;
    cache.set(sampleSession.token, { ...sampleSession, currentIndex: 2 });

    current += 400;
    expect(cache.get(sampleSession.token)?.currentIndex).toBe(2);
  });
});
