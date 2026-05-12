import { getEnv } from "../../config/env";
import { createRjCache, type RjCache } from "../../domain/rj/cache";
import { fetchWorkPage, parseWork, WorkPreviewResolutionError } from "../../domain/rj/resolve-work";
import type { FetchedWorkPage, WorkPreview, WorkReference } from "../../domain/rj/types";
import {
  buildFailureMessage,
  buildPreviewMessage,
  type DiscordReplyPayload,
  type FailureMessageKind,
} from "./build-preview-message";

export type PreviewRuntimeDeps = {
  cache: RjCache;
  fetchWorkPage: (reference: WorkReference) => Promise<FetchedWorkPage>;
  parseWork: (page: FetchedWorkPage, reference: WorkReference) => WorkPreview;
  buildPreviewMessage: (
    work: WorkPreview,
    channelIsNsfw: boolean,
  ) => ReturnType<typeof buildPreviewMessage>;
  buildFailureMessage: (
    workId?: string,
    kind?: FailureMessageKind,
  ) => ReturnType<typeof buildFailureMessage>;
  log?: Partial<Pick<Console, "error" | "info">>;
};

type NsfwReadableChannel = {
  nsfw?: boolean;
  parent?: unknown;
  isThread?: () => boolean;
};

export function createPreviewRuntime(deps: PreviewRuntimeDeps) {
  return {
    async resolve(reference: WorkReference, channelAllowsAdultDetails: boolean) {
      try {
        const cachedWork = deps.cache.get(reference);
        const shouldRefresh = shouldRefreshFromReference(cachedWork, reference);
        const work =
          cachedWork && !shouldRefresh
            ? cachedWork
            : deps.parseWork(await deps.fetchWorkPage(reference), reference);

        if (!cachedWork || shouldRefresh) {
          deps.cache.set(reference, work);
        }

        deps.log?.info?.("Resolved work preview", {
          store: work.store,
          id: work.id,
          parseCoverage: work.parseCoverage,
          parserName: work.parserName,
          sourceUrl: reference.sourceUrl ?? null,
        });

        return deps.buildPreviewMessage(work, channelAllowsAdultDetails);
      } catch (error) {
        deps.log?.error?.("Failed to build work preview", error);
        const failureKind = error instanceof WorkPreviewResolutionError ? error.code : undefined;

        return failureKind
          ? deps.buildFailureMessage(reference.id, failureKind)
          : deps.buildFailureMessage(reference.id);
      }
    },
  };
}

export function shouldAllowAdultDetails(
  channel: NsfwReadableChannel | null | undefined,
  strictMode = getEnv().NSFW_STRICT_MODE,
): boolean {
  const channelNsfw = getChannelNsfwState(channel);

  if (channelNsfw !== null) {
    return channelNsfw;
  }

  return !strictMode;
}

let runtimePreviewRuntime: ReturnType<typeof createPreviewRuntime> | null = null;

export function getRuntimePreviewRuntime() {
  runtimePreviewRuntime ??= createPreviewRuntime({
    cache: createRjCache(getEnv().CACHE_TTL_MS),
    fetchWorkPage,
    parseWork,
    buildPreviewMessage,
    buildFailureMessage,
    log: console,
  });

  return runtimePreviewRuntime;
}

function getChannelNsfwState(channel: NsfwReadableChannel | null | undefined): boolean | null {
  if (typeof channel?.nsfw === "boolean") {
    return channel.nsfw;
  }

  if (channel?.isThread?.()) {
    const parent = channel.parent;

    if (typeof parent === "object" && parent !== null && "nsfw" in parent) {
      const parentNsfw = Reflect.get(parent, "nsfw");

      if (typeof parentNsfw === "boolean") {
        return parentNsfw;
      }
    }
  }

  return null;
}

function shouldRefreshFromReference(
  cachedWork: WorkPreview | null,
  reference: WorkReference,
): boolean {
  if (!cachedWork || cachedWork.store !== reference.store || reference.store === "dlsite") {
    return false;
  }

  if (cachedWork.parseCoverage !== "partial") {
    return false;
  }

  return reference.kind === "url" && cachedWork.url !== reference.sourceUrl;
}

export type PreviewRuntime = ReturnType<typeof createPreviewRuntime>;
export type PreviewReplyPayload = DiscordReplyPayload;
