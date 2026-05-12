import type { Message } from "discord.js";
import { getEnv } from "../../config/env";
import { createRjCache, type RjCache } from "../../domain/rj/cache";
import { extractWorkReferences } from "../../domain/rj/extract-work-references";
import { fetchWorkPage, parseWork, WorkPreviewResolutionError } from "../../domain/rj/resolve-work";
import type { FetchedWorkPage, WorkPreview, WorkReference } from "../../domain/rj/types";
import {
  buildFailureMessage,
  buildPreviewMessage,
  type FailureMessageKind,
} from "./build-preview-message";

type MessageCreateDeps = {
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
  parent?: { nsfw?: boolean } | null;
  isThread?: () => boolean;
};

function getChannelNsfwState(message: Message): boolean | null {
  const channel = message.channel as NsfwReadableChannel | null;

  if (typeof channel?.nsfw === "boolean") {
    return channel.nsfw;
  }

  if (channel?.isThread?.() && typeof channel.parent?.nsfw === "boolean") {
    return channel.parent.nsfw;
  }

  return null;
}

function shouldAllowAdultDetails(message: Message): boolean {
  const channelNsfw = getChannelNsfwState(message);

  if (channelNsfw !== null) {
    return channelNsfw;
  }

  return !getEnv().NSFW_STRICT_MODE;
}

export function createMessageHandler(deps: MessageCreateDeps) {
  return async function handleMessageCreate(message: Message): Promise<void> {
    if (message.author.bot) {
      return;
    }

    const [reference] = extractWorkReferences(message.content);

    if (!reference) {
      return;
    }

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
      await message.reply(deps.buildPreviewMessage(work, shouldAllowAdultDetails(message)));
    } catch (error) {
      deps.log?.error?.("Failed to build work preview", error);
      const failureKind = error instanceof WorkPreviewResolutionError ? error.code : undefined;
      await message.reply(
        failureKind
          ? deps.buildFailureMessage(reference.id, failureKind)
          : deps.buildFailureMessage(reference.id),
      );
    }
  };
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

let runtimeHandler: ((message: Message) => Promise<void>) | null = null;

function getRuntimeHandler() {
  runtimeHandler ??= createMessageHandler({
    cache: createRjCache(getEnv().CACHE_TTL_MS),
    fetchWorkPage,
    parseWork,
    buildPreviewMessage,
    buildFailureMessage,
    log: console,
  });

  return runtimeHandler;
}

export async function handleMessageCreate(message: Message): Promise<void> {
  await getRuntimeHandler()(message);
}
