import { describe, expect, it } from "vitest";
import { createRjCache } from "../../../src/domain/rj/cache";
import type { DLSiteWork, WorkReference } from "../../../src/domain/rj/types";

const sampleWork: DLSiteWork = {
  store: "dlsite",
  id: "RJ012345",
  title: "Sample",
  url: "https://example.com",
  makerName: "Circle",
  makerId: null,
  ageCategory: "18禁",
  isAdult: true,
  price: "1,100円",
  salePrice: null,
  releaseDate: "2025-01-01",
  rating: "4.8",
  thumbnailUrl: "https://example.com/thumb.jpg",
  tags: ["ASMR"],
  author: null,
  scenario: null,
  illustration: null,
  voiceActors: [],
  fileFormat: null,
  fileSize: null,
  parseCoverage: "full",
  serviceName: null,
  circleOrBrandLabel: "サークル",
  rawAttributes: {},
  parserName: "dlsite/default",
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

  it("separates cache entries by store", () => {
    const cache = createRjCache(500);
    const fanzaReference: WorkReference = {
      store: "fanza_doujin",
      id: "d_123456",
      kind: "code",
      matchedText: "d_123456",
    };

    cache.set(fanzaReference, { ...sampleWork, store: "fanza_doujin", id: "d_123456" });

    expect(cache.get("RJ012345")).toBeNull();
    expect(cache.get({ ...fanzaReference, id: "D_123456" })?.id).toBe("d_123456");
  });

  it("does not collide across DMM family services", () => {
    const cache = createRjCache(500);

    cache.set(
      {
        store: "dmm_tv_av",
        id: "midv00018",
        kind: "code",
        matchedText: "midv00018",
      },
      { ...sampleWork, store: "dmm_tv_av", id: "midv00018" },
    );
    cache.set(
      {
        store: "fanza_books",
        id: "b915awnmg03757",
        kind: "code",
        matchedText: "b915awnmg03757",
      },
      { ...sampleWork, store: "fanza_books", id: "b915awnmg03757" },
    );

    expect(
      cache.get({
        store: "dmm_tv_av",
        id: "MIDV00018",
        kind: "code",
        matchedText: "MIDV00018",
      })?.id,
    ).toBe("midv00018");
    expect(
      cache.get({
        store: "fanza_books",
        id: "B915AWNMG03757",
        kind: "code",
        matchedText: "B915AWNMG03757",
      })?.id,
    ).toBe("b915awnmg03757");
  });
});
