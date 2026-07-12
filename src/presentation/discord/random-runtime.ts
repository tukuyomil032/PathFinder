import type {
  ButtonInteraction,
  ChatInputCommandInteraction,
  Client,
  InteractionEditReplyOptions,
  InteractionReplyOptions,
  InteractionUpdateOptions,
  MessageEditOptions,
} from "discord.js";
import { getEnv } from "../../config/env";
import type { CirclePool } from "../../domain/random/circle-pool";
import type { GenrePool } from "../../domain/random/genre-pool";
import {
  NoRandomResultsError,
  pickRandomSearchResultItem,
} from "../../domain/random/pick-random-work";
import {
  createRandomSessionCache,
  type RandomResolvedWork,
  type RandomSession,
  type RandomSessionCache,
} from "../../domain/random/random-session-cache";
import { fetchWorkPage, parseWork } from "../../domain/rj/resolve-work";
import type { FetchedWorkPage, WorkPreview, WorkReference } from "../../domain/rj/types";
import {
  IMPLEMENTED_SEARCH_TARGETS,
  resolveSearchFetcher,
} from "../../domain/search/resolve-search";
import {
  resolveStoreForTarget,
  type SearchQuery,
  type SearchTarget,
} from "../../domain/search/types";
import {
  buildDisabledRandomMessage,
  buildRandomResultMessage,
  type ComponentsV2Payload,
} from "./build-random-message";
import { buildSearchFailureMessage, type DiscordReplyPayload } from "./build-search-message";
import { shouldAllowAdultDetails } from "./preview-runtime";
import { getSharedCirclePool, getSharedGenrePool } from "./shared-random-pools";

const MAX_RANDOM_ATTEMPTS = 3;

// 複数件抽選（resolveBatch）用の定数。1件あたりの試行回数の目安は単一版と同じ
// MAX_RANDOM_ATTEMPTSを踏襲し、TARGET_COUNT件分の合計試行回数に上限を設ける。
export const RANDOM_BATCH_TARGET_COUNT = 5;

export type { RandomResolvedWork };

type AttemptOutcome = { ok: true; result: RandomResolvedWork } | { ok: false; noResults: boolean };

type AttemptDeps = {
  resolveFetcher: typeof resolveSearchFetcher;
  genrePool: GenrePool;
  circlePool: CirclePool;
  fetchWorkPage: (reference: WorkReference) => Promise<FetchedWorkPage>;
  parseWork: (page: FetchedWorkPage, reference: WorkReference) => WorkPreview;
  random: () => number;
};

/**
 * 1件分の抽選〜作品詳細取得を1回試みる。候補クエリの組み立て（buildCandidateQuery）
 * が乱数選択に依存する都合上、resolveBatch内で複数回呼ばれるたびに毎回独立して
 * store（省略時）・facetが再抽選される。
 */
async function attemptOnce(
  targetInput: SearchTarget | null,
  keyword: string,
  deps: AttemptDeps,
): Promise<AttemptOutcome> {
  const target = targetInput ?? pickRandomTarget(deps.random);

  try {
    const query = await buildCandidateQuery(target, keyword, {
      genrePool: deps.genrePool,
      circlePool: deps.circlePool,
      random: deps.random,
    });
    const item = await pickRandomSearchResultItem(query, {
      fetcher: deps.resolveFetcher(target),
      random: deps.random,
    });

    deps.circlePool.record(item.store, item.makerId, item.makerName);

    const reference: WorkReference = {
      store: item.store,
      id: item.id,
      kind: "url",
      sourceUrl: item.url,
      matchedText: item.url,
    };

    const page = await deps.fetchWorkPage(reference);
    const work = deps.parseWork(page, reference);
    deps.circlePool.record(work.store, work.makerId, work.makerName);

    return { ok: true, result: { item, work } };
  } catch (error) {
    return { ok: false, noResults: error instanceof NoRandomResultsError };
  }
}

export type ResolveBatchResult = { results: RandomResolvedWork[]; sawRealError: boolean };

/**
 * 最大targetCount件を並列ワーカープールで抽選する。各workerは目標件数に達するか
 * 合計試行回数の上限に達するまでattemptOnceを繰り返すため、個別の枠が失敗しても
 * 同じworker内で自動的に新しい候補へ差し替わる（＝部分失敗の埋め合わせ）。
 * 目標件数に満たないまま上限に達した場合は、その時点で集まった件数
 * （0件のこともある）をそのまま返す。
 */
export async function resolveBatch(
  target: SearchTarget | null,
  keyword: string,
  deps: AttemptDeps,
  targetCount: number = RANDOM_BATCH_TARGET_COUNT,
  maxTotalAttempts: number = targetCount * MAX_RANDOM_ATTEMPTS,
): Promise<ResolveBatchResult> {
  const state = {
    results: [] as RandomResolvedWork[],
    reserved: 0,
    attempts: 0,
    sawRealError: false,
    stop: false,
  };

  async function worker(): Promise<void> {
    for (;;) {
      // reserved/attemptsの判定と加算はawaitを挟まず同期的に行うことで、
      // 複数workerが同時に目標件数を超えて予約してしまう競合を防ぐ
      // （resultsは非同期処理の完了後にしか増えないため、resultsだけを見て
      // 判定するとtargetCountを超過してpushされ得る）。
      if (state.stop || state.reserved >= targetCount || state.attempts >= maxTotalAttempts) {
        return;
      }

      state.reserved += 1;
      state.attempts += 1;
      const outcome = await attemptOnce(target, keyword, deps);

      if (outcome.ok) {
        state.results.push(outcome.result);
      } else {
        state.reserved -= 1;

        if (!outcome.noResults) {
          state.sawRealError = true;
        } else if (keyword) {
          // keyword明示時はクエリが常に同一のため、1回0件と判明すれば
          // 以降のリトライも同じ結果になる。無駄な上流リクエストと
          // レスポンス遅延を避けるため即座に全workerを停止する。
          state.stop = true;
        }
      }
    }
  }

  await Promise.all(Array.from({ length: targetCount }, () => worker()));

  return { results: state.results, sawRealError: state.sawRealError };
}

export type RandomQueryInput = {
  target: SearchTarget | null;
  keyword: string;
};

export type RandomRuntimeDeps = {
  resolveFetcher: typeof resolveSearchFetcher;
  genrePool: GenrePool;
  circlePool: CirclePool;
  fetchWorkPage: (reference: WorkReference) => Promise<FetchedWorkPage>;
  parseWork: (page: FetchedWorkPage, reference: WorkReference) => WorkPreview;
  sessionCache: RandomSessionCache;
  idleTimeoutMs: number;
  random?: () => number;
  log?: Partial<Pick<Console, "error" | "info">>;
};

export function createRandomRuntime(deps: RandomRuntimeDeps) {
  const random = deps.random ?? Math.random;
  const idleTimers = new Map<string, ReturnType<typeof setTimeout>>();

  function clearIdleTimer(token: string): void {
    const timer = idleTimers.get(token);

    if (timer) {
      clearTimeout(timer);
      idleTimers.delete(token);
    }
  }

  function scheduleIdleTimer(token: string, client: Client): void {
    clearIdleTimer(token);

    const timer = setTimeout(() => {
      void disableExpiredSession(token, client);
    }, deps.idleTimeoutMs);

    idleTimers.set(token, timer);
  }

  async function disableExpiredSession(token: string, client: Client): Promise<void> {
    idleTimers.delete(token);
    const session = deps.sessionCache.get(token);
    deps.sessionCache.delete(token);

    if (!session?.messageId) {
      return;
    }

    try {
      const channel = await client.channels.fetch(session.channelId);

      if (channel?.isTextBased()) {
        const message = await channel.messages.fetch(session.messageId);
        const allowAdultDetails = shouldAllowAdultDetails(channel as never);
        await message.edit(
          toComponentsV2EditOptions(buildDisabledRandomMessage(session, allowAdultDetails)),
        );
      }
    } catch (error) {
      deps.log?.error?.("Failed to disable expired random buttons", error);
    }
  }

  return {
    async resolve(
      input: RandomQueryInput,
      interaction: ChatInputCommandInteraction,
      allowAdultDetails: boolean,
    ): Promise<void> {
      try {
        await interaction.deferReply();

        const { results, sawRealError } = await resolveBatch(input.target, input.keyword, {
          resolveFetcher: deps.resolveFetcher,
          genrePool: deps.genrePool,
          circlePool: deps.circlePool,
          fetchWorkPage: deps.fetchWorkPage,
          parseWork: deps.parseWork,
          random,
        });

        if (results.length === 0) {
          await interaction.editReply(
            toEditReplyOptions(
              sawRealError
                ? buildSearchFailureMessage("generic")
                : buildSearchFailureMessage("empty"),
            ),
          );
          return;
        }

        const token = crypto.randomUUID();
        let session: RandomSession = {
          token,
          results,
          currentIndex: 0,
          channelId: interaction.channelId,
          messageId: null,
        };

        deps.sessionCache.set(token, session);

        const reply = await interaction.editReply(
          toComponentsV2EditReplyOptions(buildRandomResultMessage(session, allowAdultDetails)),
        );

        session = { ...session, messageId: reply.id };
        deps.sessionCache.set(token, session);
        scheduleIdleTimer(token, interaction.client);
      } catch (error) {
        deps.log?.error?.("Failed to resolve random works", error);
        const failurePayload = buildSearchFailureMessage("generic");

        if (interaction.deferred || interaction.replied) {
          await interaction.editReply(toEditReplyOptions(failurePayload));
        } else {
          await interaction.reply(toReplyOptions(failurePayload));
        }
      }
    },

    async handleButton(interaction: ButtonInteraction): Promise<void> {
      const parsed = parseCustomId(interaction.customId);

      if (!parsed) {
        return;
      }

      const session = deps.sessionCache.get(parsed.token);

      if (!session) {
        clearIdleTimer(parsed.token);
        await interaction.reply({
          content: buildSearchFailureMessage("session_expired").content,
          ephemeral: true,
        });
        return;
      }

      // interaction.update()実行中に旧タイマーが発火すると、セッション削除
      // (disableExpiredSession)とこの更新処理が競合してしまう。取得直後に
      // 即座に止め、成功時はscheduleIdleTimerで、失敗時はcatch節で
      // セッションが生きていれば再度張り直す。
      clearIdleTimer(parsed.token);

      try {
        // 5件は全て事前に取得済みのため、prev/nextはインデックスの入れ替えのみで
        // 上流への再フェッチは発生しない（/searchのnextと異なりdeferUpdateも不要）。
        const currentIndex =
          parsed.action === "next"
            ? Math.min(session.currentIndex + 1, session.results.length - 1)
            : Math.max(session.currentIndex - 1, 0);
        const updated: RandomSession = { ...session, currentIndex };
        deps.sessionCache.set(updated.token, updated);

        const allowAdultDetails = shouldAllowAdultDetails(interaction.channel as never);
        await interaction.update(
          toComponentsV2UpdateOptions(buildRandomResultMessage(updated, allowAdultDetails)),
        );
        scheduleIdleTimer(updated.token, interaction.client);
      } catch (error) {
        deps.log?.error?.("Failed to update random page", error);

        if (deps.sessionCache.get(parsed.token)) {
          scheduleIdleTimer(parsed.token, interaction.client);
        }

        const failurePayload = buildSearchFailureMessage("generic");

        if (interaction.deferred || interaction.replied) {
          await interaction.editReply(toEditReplyOptions(failurePayload));
        } else {
          await interaction.reply({ content: failurePayload.content, ephemeral: true });
        }
      }
    },
  };
}

/**
 * store・keyword自動抽選のクエリ組み立て。ユーザーがkeywordを明示指定した場合は
 * それをそのまま使う（/searchと同じ予測可能な挙動、facetでの上書きはしない）。
 * keyword省略時は「無条件ブラウズ」「ジャンルfacet」「サークルfacet」から乱数で
 * 1つを選ぶ。各プールが空のうちは自動的に無条件ブラウズのみに絞られる。
 */
async function buildCandidateQuery(
  target: SearchTarget,
  keyword: string,
  deps: { genrePool: GenrePool; circlePool: CirclePool; random: () => number },
): Promise<SearchQuery> {
  if (keyword) {
    return { target, keyword };
  }

  const store = resolveStoreForTarget(target);
  const genres = await deps.genrePool.list(target);
  const genreCandidate =
    genres.length > 0 ? genres[Math.floor(deps.random() * genres.length)] : null;
  const circleCandidate = deps.circlePool.pickRandom(store, deps.random);

  const candidates: SearchQuery[] = [{ target, keyword: "" }];

  if (genreCandidate) {
    candidates.push({ target, keyword: "", genreId: genreCandidate.id });
  }

  if (circleCandidate) {
    candidates.push({ target, keyword: "", makerId: circleCandidate.makerId });
  }

  return candidates[Math.floor(deps.random() * candidates.length)];
}

function pickRandomTarget(random: () => number): SearchTarget {
  const pool = IMPLEMENTED_SEARCH_TARGETS;
  return pool[Math.floor(random() * pool.length)];
}

function toReplyOptions(payload: DiscordReplyPayload): InteractionReplyOptions {
  return {
    content: payload.content,
    embeds: payload.embeds,
    components: payload.components,
    files: payload.files,
    allowedMentions: payload.allowedMentions,
  };
}

function toEditReplyOptions(payload: DiscordReplyPayload): InteractionEditReplyOptions {
  return {
    content: payload.content,
    embeds: payload.embeds,
    components: payload.components,
    files: payload.files,
    allowedMentions: payload.allowedMentions,
  };
}

// Components V2ペイロード用の変換ヘルパー。IsComponentsV2は一度付与すると解除できないため、
// 通常表示・ページング更新・アイドルタイムアウトによるdisabled化のいずれでも必ずflagsを渡す。
function toComponentsV2EditReplyOptions(payload: ComponentsV2Payload): InteractionEditReplyOptions {
  return {
    components: payload.components,
    flags: payload.flags,
    allowedMentions: payload.allowedMentions,
  };
}

function toComponentsV2UpdateOptions(payload: ComponentsV2Payload): InteractionUpdateOptions {
  return {
    components: payload.components,
    flags: payload.flags,
    allowedMentions: payload.allowedMentions,
  };
}

function toComponentsV2EditOptions(payload: ComponentsV2Payload): MessageEditOptions {
  return {
    components: payload.components,
    flags: payload.flags,
    allowedMentions: payload.allowedMentions,
  };
}

function parseCustomId(customId: string): { token: string; action: "prev" | "next" } | null {
  const match = customId.match(/^random:(.+):(prev|next)$/);

  if (!match) {
    return null;
  }

  return { token: match[1], action: match[2] as "prev" | "next" };
}

let runtimeRandomRuntime: ReturnType<typeof createRandomRuntime> | null = null;

export function getRuntimeRandomRuntime() {
  runtimeRandomRuntime ??= createRandomRuntime({
    resolveFetcher: resolveSearchFetcher,
    genrePool: getSharedGenrePool(),
    circlePool: getSharedCirclePool(),
    fetchWorkPage,
    parseWork,
    sessionCache: createRandomSessionCache(getEnv().SEARCH_SESSION_TTL_MS),
    idleTimeoutMs: getEnv().SEARCH_SESSION_TTL_MS,
    log: console,
  });

  return runtimeRandomRuntime;
}

export type RandomRuntime = ReturnType<typeof createRandomRuntime>;
export type RandomReplyPayload = DiscordReplyPayload;
