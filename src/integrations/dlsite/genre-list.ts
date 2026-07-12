import { load } from "cheerio";
import { getEnv } from "../../config/env";
import type { DLSiteSurface } from "../../domain/rj/types";
import type { GenreEntry } from "../../domain/random/genre-pool";

const DLSITE_HOST = "www.dlsite.com";

type FetchGenreListOptions = {
  fetchImpl?: typeof fetch;
  userAgent?: string;
};

/**
 * ジャンルマスターリストページのURL。実機確認済み: `/{surface}/genre/list`に
 * 全ジャンルID/名称のリンク一覧が載っている（maniaxで320件確認）。
 * books/proに同種のページがあるかは未確認 — 無ければ404等でfetchが失敗し、
 * genre-pool側で空リストにフォールバックする。
 */
export function buildGenreListUrl(surface: DLSiteSurface): string {
  return `https://${DLSITE_HOST}/${surface}/genre/list`;
}

export function parseGenreListItems(html: string): GenreEntry[] {
  const $ = load(html);
  const seen = new Map<string, string>();

  for (const node of $('a[href*="/works/genre/=/genre/"]').toArray()) {
    const el = $(node);
    const id = el.attr("href")?.match(/works\/genre\/=\/genre\/(\d+)/)?.[1];
    const name = el.text().replace(/\s+/g, " ").trim();

    if (id && name) {
      seen.set(id, name);
    }
  }

  return Array.from(seen, ([id, name]) => ({ id, name }));
}

export async function fetchGenreList(
  surface: DLSiteSurface,
  options: FetchGenreListOptions = {},
): Promise<GenreEntry[]> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const response = await fetchImpl(buildGenreListUrl(surface), {
    headers: { "user-agent": options.userAgent ?? getEnv().DLSITE_USER_AGENT },
    signal: AbortSignal.timeout(10_000),
  });

  if (!response.ok) {
    throw new Error(`Unexpected status ${response.status} for DLsite genre list (${surface})`);
  }

  return parseGenreListItems(await response.text());
}
