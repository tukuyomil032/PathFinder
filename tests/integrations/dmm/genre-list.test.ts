import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";

function readFixture(fileName: string): string {
  return readFileSync(resolve(process.cwd(), "tests/fixtures", fileName), "utf8");
}

const fetchDmmHtmlWithAgeCheck = vi.fn();

vi.mock("../../../src/integrations/dmm/http-client", () => ({
  fetchDmmHtmlWithAgeCheck: (...args: unknown[]) => fetchDmmHtmlWithAgeCheck(...args),
}));

const { buildFanzaDoujinGenreListUrl, fetchFanzaDoujinGenreList, parseFanzaDoujinGenreListItems } =
  await import("../../../src/integrations/dmm/genre-list");

describe("buildFanzaDoujinGenreListUrl", () => {
  it("builds the genre list URL", () => {
    expect(buildFanzaDoujinGenreListUrl()).toBe("https://www.dmm.co.jp/dc/doujin/-/genre/");
  });
});

describe("parseFanzaDoujinGenreListItems", () => {
  it("extracts tag id/name pairs and dedupes repeated links regardless of absolute/relative href", () => {
    const html = readFixture("fanza-doujin-genre-list.html");
    const items = parseFanzaDoujinGenreListItems(html);

    expect(items).toEqual([
      { id: "4127", name: "アドベンチャー" },
      { id: "5001", name: "中出し" },
      { id: "2001", name: "巨乳" },
    ]);
  });

  it("returns an empty list when there are no tag links", () => {
    expect(parseFanzaDoujinGenreListItems("<html><body>no tags here</body></html>")).toEqual([]);
  });
});

describe("fetchFanzaDoujinGenreList", () => {
  it("fetches through the age-check flow and parses the resulting html", async () => {
    const html = readFixture("fanza-doujin-genre-list.html");
    fetchDmmHtmlWithAgeCheck.mockReset().mockResolvedValueOnce({ html, status: 200 });

    const items = await fetchFanzaDoujinGenreList();

    expect(fetchDmmHtmlWithAgeCheck).toHaveBeenCalledWith(
      "https://www.dmm.co.jp/dc/doujin/-/genre/",
      {},
    );
    expect(items).toHaveLength(3);
  });
});
