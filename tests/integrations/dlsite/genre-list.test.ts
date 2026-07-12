import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  buildGenreListUrl,
  fetchGenreList,
  parseGenreListItems,
} from "../../../src/integrations/dlsite/genre-list";

function readFixture(fileName: string): string {
  return readFileSync(resolve(process.cwd(), "tests/fixtures", fileName), "utf8");
}

describe("buildGenreListUrl", () => {
  it("builds the genre list URL for the given surface", () => {
    expect(buildGenreListUrl("maniax")).toBe("https://www.dlsite.com/maniax/genre/list");
    expect(buildGenreListUrl("books")).toBe("https://www.dlsite.com/books/genre/list");
  });
});

describe("parseGenreListItems", () => {
  it("extracts genre id/name pairs and dedupes repeated links", () => {
    const html = readFixture("dlsite-genre-list.html");
    const items = parseGenreListItems(html);

    expect(items).toEqual([
      { id: "509", name: "3D作品" },
      { id: "073", name: "アニメ" },
      { id: "207", name: "つるぺた" },
    ]);
  });

  it("returns an empty list when there are no genre links", () => {
    expect(parseGenreListItems("<html><body>no genres here</body></html>")).toEqual([]);
  });
});

describe("fetchGenreList", () => {
  it("fetches and parses the genre list html", async () => {
    const html = readFixture("dlsite-genre-list.html");
    const fetchImpl = vi.fn().mockResolvedValue(new Response(html, { status: 200 }));

    const items = await fetchGenreList("maniax", { fetchImpl, userAgent: "test-agent" });

    expect(items).toHaveLength(3);
    expect(fetchImpl).toHaveBeenCalledWith("https://www.dlsite.com/maniax/genre/list", {
      headers: { "user-agent": "test-agent" },
      signal: expect.any(AbortSignal),
    });
  });

  it("throws when the genre list page is unavailable (e.g. surface without a genre index)", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response("not found", { status: 404 }));

    await expect(fetchGenreList("books", { fetchImpl, userAgent: "test-agent" })).rejects.toThrow(
      /404/,
    );
  });
});
