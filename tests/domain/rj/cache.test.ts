import { describe, expect, it } from "vitest";
import { createRjCache } from "../../../src/domain/rj/cache";
import type { DLSiteWork } from "../../../src/domain/rj/types";

const sampleWork: DLSiteWork = {
  id: "RJ012345",
  title: "Sample",
  url: "https://example.com",
  makerName: "Circle",
  price: "1,100円",
  salePrice: null,
  ageCategory: "18禁",
  releaseDate: "2025-01-01",
  rating: "4.8",
  thumbnailUrl: "https://example.com/thumb.jpg",
  tags: ["ASMR"],
  isAdult: true,
};

describe("createRjCache", () => {
  it("returns cached values within ttl", () => {
    let current = 1_000;
    const cache = createRjCache(500, () => current);

    cache.set("rj012345", sampleWork);

    current += 499;
    expect(cache.get("RJ012345")).toEqual(sampleWork);
  });

  it("expires cached values after ttl", () => {
    let current = 1_000;
    const cache = createRjCache(500, () => current);

    cache.set("RJ012345", sampleWork);

    current += 500;
    expect(cache.get("RJ012345")).toBeNull();
  });
});
