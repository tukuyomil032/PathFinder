import { getEnv } from "../../config/env";
import { createCirclePool, type CirclePool } from "../../domain/random/circle-pool";
import {
  createGenrePool,
  defaultFetchGenreList,
  type GenrePool,
} from "../../domain/random/genre-pool";

// /random・/search・/dlsite・/fanzaの各ランタイムが同じインスタンスを共有するための
// プロセス単位シングルトン。search-runtime.ts/preview-runtime.tsの収集フックと
// random-runtime.tsの抽選ロジックの両方から参照される。

let sharedCirclePool: CirclePool | null = null;
let sharedGenrePool: GenrePool | null = null;

export function getSharedCirclePool(): CirclePool {
  sharedCirclePool ??= createCirclePool();
  return sharedCirclePool;
}

export function getSharedGenrePool(): GenrePool {
  sharedGenrePool ??= createGenrePool(getEnv().RANDOM_GENRE_CACHE_TTL_MS, {
    fetchGenreList: defaultFetchGenreList,
    log: console,
  });
  return sharedGenrePool;
}
