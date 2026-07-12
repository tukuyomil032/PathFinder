import type {
  ChatInputCommandInteraction,
  InteractionEditReplyOptions,
  InteractionReplyOptions,
} from "discord.js";
import type { CirclePool } from "../../domain/random/circle-pool";
import type { GenrePool } from "../../domain/random/genre-pool";
import {
  NoRandomResultsError,
  pickRandomSearchResultItem,
} from "../../domain/random/pick-random-work";
import { fetchWorkPage, parseWork } from "../../domain/rj/resolve-work";
import type { FetchedWorkPage, WorkPreview, WorkReference } from "../../domain/rj/types";
import {
  IMPLEMENTED_SEARCH_TARGETS,
  resolveSearchFetcher,
} from "../../domain/search/resolve-search";
import {
  isAdultOnlyTarget,
  resolveStoreForTarget,
  type SearchQuery,
  type SearchTarget,
} from "../../domain/search/types";
import { buildPreviewMessage } from "./build-preview-message";
import { buildSearchFailureMessage, type DiscordReplyPayload } from "./build-search-message";
import { getSharedCirclePool, getSharedGenrePool } from "./shared-random-pools";

const MAX_RANDOM_ATTEMPTS = 3;

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
  buildPreviewMessage: (
    work: WorkPreview,
    channelIsNsfw: boolean,
  ) => ReturnType<typeof buildPreviewMessage>;
  random?: () => number;
  log?: Partial<Pick<Console, "error" | "info">>;
};

export function createRandomRuntime(deps: RandomRuntimeDeps) {
  const random = deps.random ?? Math.random;

  return {
    async resolve(
      input: RandomQueryInput,
      interaction: ChatInputCommandInteraction,
      allowAdultDetails: boolean,
    ): Promise<void> {
      const target = input.target ?? pickRandomTarget(random);

      if (isAdultOnlyTarget(target) && !allowAdultDetails) {
        await interaction.reply(toReplyOptions(buildSearchFailureMessage("nsfw_gate")));
        return;
      }

      try {
        await interaction.deferReply();

        let lastError: unknown;

        for (let attempt = 0; attempt < MAX_RANDOM_ATTEMPTS; attempt++) {
          try {
            const query = await buildCandidateQuery(target, input.keyword, {
              genrePool: deps.genrePool,
              circlePool: deps.circlePool,
              random,
            });
            const item = await pickRandomSearchResultItem(query, {
              fetcher: deps.resolveFetcher(target),
              random,
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

            await interaction.editReply(
              toEditReplyOptions(deps.buildPreviewMessage(work, allowAdultDetails)),
            );
            return;
          } catch (error) {
            lastError = error;
          }
        }

        deps.log?.error?.("Failed to pick a random work after retries", lastError);
        await interaction.editReply(
          toEditReplyOptions(
            lastError instanceof NoRandomResultsError
              ? buildSearchFailureMessage("empty")
              : buildSearchFailureMessage("generic"),
          ),
        );
      } catch (error) {
        deps.log?.error?.("Failed to resolve random work", error);
        const failurePayload = buildSearchFailureMessage("generic");

        if (interaction.deferred || interaction.replied) {
          await interaction.editReply(toEditReplyOptions(failurePayload));
        } else {
          await interaction.reply(toReplyOptions(failurePayload));
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

let runtimeRandomRuntime: ReturnType<typeof createRandomRuntime> | null = null;

export function getRuntimeRandomRuntime() {
  runtimeRandomRuntime ??= createRandomRuntime({
    resolveFetcher: resolveSearchFetcher,
    genrePool: getSharedGenrePool(),
    circlePool: getSharedCirclePool(),
    fetchWorkPage,
    parseWork,
    buildPreviewMessage,
    log: console,
  });

  return runtimeRandomRuntime;
}

export type RandomRuntime = ReturnType<typeof createRandomRuntime>;
export type RandomReplyPayload = DiscordReplyPayload;
