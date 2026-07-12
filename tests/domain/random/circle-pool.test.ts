import { describe, expect, it } from "vitest";
import { createCirclePool } from "../../../src/domain/random/circle-pool";

describe("createCirclePool", () => {
  it("returns null when no circle has been recorded for a store", () => {
    const pool = createCirclePool();

    expect(pool.pickRandom("dlsite")).toBeNull();
  });

  it("records and picks a recorded circle", () => {
    const pool = createCirclePool();
    pool.record("dlsite", "RG70730", "beebee工房");

    expect(pool.pickRandom("dlsite", () => 0)).toEqual({
      makerId: "RG70730",
      makerName: "beebee工房",
    });
  });

  it("ignores records with a missing makerId or makerName", () => {
    const pool = createCirclePool();
    pool.record("dlsite", null, "名前だけ");
    pool.record("dlsite", "RG00000001", null);

    expect(pool.pickRandom("dlsite")).toBeNull();
  });

  it("dedupes repeated makerIds instead of growing unbounded", () => {
    const pool = createCirclePool();
    pool.record("dlsite", "RG70730", "beebee工房");
    pool.record("dlsite", "RG70730", "beebee工房");
    pool.record("dlsite", "RG70730", "beebee工房");

    // 決定的な乱数でも常に同じ1件しか返らない = 内部件数が1件であることの間接検証
    for (let i = 0; i < 5; i++) {
      expect(pool.pickRandom("dlsite", () => i / 5)).toEqual({
        makerId: "RG70730",
        makerName: "beebee工房",
      });
    }
  });

  it("keeps store pools independent", () => {
    const pool = createCirclePool();
    pool.record("dlsite", "RG70730", "beebee工房");
    pool.record("fanza_doujin", "206191", "みずのウロ");

    expect(pool.pickRandom("dlsite", () => 0)?.makerId).toBe("RG70730");
    expect(pool.pickRandom("fanza_doujin", () => 0)?.makerId).toBe("206191");
  });

  it("evicts the oldest entry once the per-store cap is exceeded", () => {
    const pool = createCirclePool(2);
    pool.record("dlsite", "RG000001", "サークルA");
    pool.record("dlsite", "RG000002", "サークルB");
    pool.record("dlsite", "RG000003", "サークルC");

    // 最古のRG000001は破棄され、残る2件のいずれかしか返らない
    const picked = new Set<string>();
    for (let i = 0; i < 10; i++) {
      picked.add(pool.pickRandom("dlsite", () => i / 10)?.makerId ?? "");
    }

    expect(picked.has("RG000001")).toBe(false);
    expect(picked).toEqual(new Set(["RG000002", "RG000003"]));
  });
});
