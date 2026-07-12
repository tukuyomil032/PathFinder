import { load } from "cheerio";
import type { GenreEntry } from "../../domain/random/genre-pool";
import { fetchDmmHtmlWithAgeCheck, type FetchDmmHtmlOptions } from "./http-client";

const DMM_HOST = "www.dmm.co.jp";

/**
 * FANZA同人のジャンル/タグ一覧ページのURL。実機確認済み: `/dc/doujin/-/genre/`に
 * 全タグID/名称のリンク一覧が載っている（約300件超確認、作品詳細ページの
 * `article=keyword/id={id}`リンクからも同じ形式でリンクされている）。
 */
export function buildFanzaDoujinGenreListUrl(): string {
  return `https://${DMM_HOST}/dc/doujin/-/genre/`;
}

export function parseFanzaDoujinGenreListItems(html: string): GenreEntry[] {
  const $ = load(html);
  const seen = new Map<string, string>();

  for (const node of $('a[href*="article=keyword/id="]').toArray()) {
    const el = $(node);
    const id = el.attr("href")?.match(/article=keyword\/id=(\d+)/)?.[1];
    const name = el.text().replace(/\s+/g, " ").trim();

    if (id && name) {
      seen.set(id, name);
    }
  }

  return Array.from(seen, ([id, name]) => ({ id, name }));
}

export async function fetchFanzaDoujinGenreList(
  options: FetchDmmHtmlOptions = {},
): Promise<GenreEntry[]> {
  const result = await fetchDmmHtmlWithAgeCheck(buildFanzaDoujinGenreListUrl(), options);
  return parseFanzaDoujinGenreListItems(result.html);
}
