import { describe, expect, it } from "vitest";
import { isAdultOnlyTarget, resolveStoreForTarget } from "../../../src/domain/search/types";

describe("resolveStoreForTarget", () => {
  it("maps each DLsite surface to the dlsite store", () => {
    expect(resolveStoreForTarget("dlsite_maniax")).toBe("dlsite");
    expect(resolveStoreForTarget("dlsite_books")).toBe("dlsite");
    expect(resolveStoreForTarget("dlsite_pro")).toBe("dlsite");
  });

  it("maps each FANZA target to its own store", () => {
    expect(resolveStoreForTarget("fanza_doujin")).toBe("fanza_doujin");
    expect(resolveStoreForTarget("fanza_pcgame")).toBe("fanza_pcgame");
    expect(resolveStoreForTarget("fanza_books")).toBe("fanza_books");
  });
});

describe("isAdultOnlyTarget", () => {
  it("does not gate dlsite_maniax since it also contains all-ages works", () => {
    expect(isAdultOnlyTarget("dlsite_maniax")).toBe(false);
  });

  it("gates every other target as adult-only", () => {
    expect(isAdultOnlyTarget("dlsite_books")).toBe(true);
    expect(isAdultOnlyTarget("dlsite_pro")).toBe(true);
    expect(isAdultOnlyTarget("fanza_doujin")).toBe(true);
    expect(isAdultOnlyTarget("fanza_pcgame")).toBe(true);
    expect(isAdultOnlyTarget("fanza_books")).toBe(true);
  });
});
