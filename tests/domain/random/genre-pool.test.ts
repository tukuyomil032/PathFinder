import { describe, expect, it, vi } from "vitest";
import { createGenrePool } from "../../../src/domain/random/genre-pool";

describe("createGenrePool", () => {
  it("fetches and caches the genre list for a target", async () => {
    const fetchGenreList = vi.fn().mockResolvedValue([{ id: "207", name: "つるぺた" }]);
    const pool = createGenrePool(1_000, { fetchGenreList, now: () => 0 });

    const first = await pool.list("dlsite_maniax");
    const second = await pool.list("dlsite_maniax");

    expect(first).toEqual([{ id: "207", name: "つるぺた" }]);
    expect(second).toEqual(first);
    expect(fetchGenreList).toHaveBeenCalledTimes(1);
  });

  it("re-fetches once the TTL has expired", async () => {
    const fetchGenreList = vi
      .fn()
      .mockResolvedValueOnce([{ id: "207", name: "つるぺた" }])
      .mockResolvedValueOnce([{ id: "073", name: "アニメ" }]);
    let now = 0;
    const pool = createGenrePool(1_000, { fetchGenreList, now: () => now });

    await pool.list("dlsite_maniax");
    now = 1_500;
    const refreshed = await pool.list("dlsite_maniax");

    expect(refreshed).toEqual([{ id: "073", name: "アニメ" }]);
    expect(fetchGenreList).toHaveBeenCalledTimes(2);
  });

  it("keeps store lists independent", async () => {
    const fetchGenreList = vi
      .fn()
      .mockImplementation(async (target: string) => [{ id: target, name: target }]);
    const pool = createGenrePool(1_000, { fetchGenreList, now: () => 0 });

    const maniax = await pool.list("dlsite_maniax");
    const doujin = await pool.list("fanza_doujin");

    expect(maniax).toEqual([{ id: "dlsite_maniax", name: "dlsite_maniax" }]);
    expect(doujin).toEqual([{ id: "fanza_doujin", name: "fanza_doujin" }]);
  });

  it("falls back to an empty list on fetch failure with no prior cache", async () => {
    const fetchGenreList = vi.fn().mockRejectedValue(new Error("boom"));
    const pool = createGenrePool(1_000, { fetchGenreList, now: () => 0, log: { error: vi.fn() } });

    await expect(pool.list("fanza_pcgame")).resolves.toEqual([]);
  });

  it("falls back to the stale cached value on fetch failure after TTL expiry", async () => {
    const fetchGenreList = vi
      .fn()
      .mockResolvedValueOnce([{ id: "207", name: "つるぺた" }])
      .mockRejectedValueOnce(new Error("boom"));
    let now = 0;
    const pool = createGenrePool(1_000, {
      fetchGenreList,
      now: () => now,
      log: { error: vi.fn() },
    });

    await pool.list("dlsite_maniax");
    now = 1_500;
    const result = await pool.list("dlsite_maniax");

    expect(result).toEqual([{ id: "207", name: "つるぺた" }]);
  });
});
