import type { SearchFetcher } from "../search/resolve-search";
import type { SearchQuery, SearchResultItem } from "../search/types";

export class NoRandomResultsError extends Error {
  readonly target: SearchQuery["target"];

  constructor(target: SearchQuery["target"]) {
    super(`No results available to pick randomly for target ${target}`);
    this.name = "NoRandomResultsError";
    this.target = target;
  }
}

export type PickRandomWorkDeps = {
  fetcher: SearchFetcher;
  random?: () => number;
};

/**
 * 「1ページ目取得 → 総件数からランダムページを算出 → そのページ内で乱選」という
 * 近似的な一様分布での抽選。ID乱数生成と違い、必ず実在する検索結果一覧を母集団に
 * するため無効な候補を引かない。makerId指定クエリ（resolve-search.tsが常に
 * hasNext:falseの1ページで全件返す）の場合は自然にtotalCount<=perPageとなり、
 * 2回目のfetchは発生せずそのまま1ページ内から選ばれる。
 */
export async function pickRandomSearchResultItem(
  query: SearchQuery,
  deps: PickRandomWorkDeps,
): Promise<SearchResultItem> {
  const random = deps.random ?? Math.random;
  const firstPage = await deps.fetcher(query, 1);

  if (firstPage.items.length === 0) {
    throw new NoRandomResultsError(query.target);
  }

  const perPage = firstPage.items.length;
  const totalCount = firstPage.totalCount;
  let candidatePage = firstPage;

  if (totalCount !== null && totalCount > perPage) {
    const maxRawPage = Math.max(1, Math.ceil(totalCount / perPage));
    const targetRawPage = 1 + Math.floor(random() * maxRawPage);

    if (targetRawPage > 1) {
      const fetched = await deps.fetcher(query, targetRawPage);

      if (fetched.items.length > 0) {
        candidatePage = fetched;
      }
    }
  }

  const index = Math.floor(random() * candidatePage.items.length);
  return candidatePage.items[index];
}
