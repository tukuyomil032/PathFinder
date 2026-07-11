import { describe, expect, it } from "vitest";
import { createSearchSessionCache } from "../../../src/domain/search/session-cache";
import type { SearchSession } from "../../../src/domain/search/session-cache";

const sampleSession: SearchSession = {
  token: "token-1",
  query: { target: "dlsite_maniax", keyword: "RPG" },
  items: [],
  nextRawPage: 1,
  exhausted: false,
  displayOffset: 0,
  channelId: "channel-1",
  messageId: null,
};

describe("createSearchSessionCache", () => {
  it("returns cached sessions within ttl", () => {
    let current = 1_000;
    const cache = createSearchSessionCache(500, () => current);

    cache.set(sampleSession.token, sampleSession);

    current += 499;
    expect(cache.get(sampleSession.token)).toEqual(sampleSession);
  });

  it("expires cached sessions after ttl", () => {
    let current = 1_000;
    const cache = createSearchSessionCache(500, () => current);

    cache.set(sampleSession.token, sampleSession);

    current += 500;
    expect(cache.get(sampleSession.token)).toBeNull();
  });

  it("returns null for unknown tokens", () => {
    const cache = createSearchSessionCache(500);

    expect(cache.get("missing-token")).toBeNull();
  });

  it("deletes sessions on demand", () => {
    const cache = createSearchSessionCache(500);

    cache.set(sampleSession.token, sampleSession);
    cache.delete(sampleSession.token);

    expect(cache.get(sampleSession.token)).toBeNull();
  });

  it("overwrites an existing session and refreshes its ttl", () => {
    let current = 1_000;
    const cache = createSearchSessionCache(500, () => current);

    cache.set(sampleSession.token, sampleSession);
    current += 400;
    cache.set(sampleSession.token, { ...sampleSession, displayOffset: 10 });

    current += 400;
    expect(cache.get(sampleSession.token)?.displayOffset).toBe(10);
  });
});
