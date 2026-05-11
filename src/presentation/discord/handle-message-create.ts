import type { Message } from "discord.js";
import { getEnv } from "../../config/env";
import { createRjCache, type RjCache } from "../../domain/rj/cache";
import { extractRjCodes } from "../../domain/rj/extract-rj-codes";
import type { DLSiteWork } from "../../domain/rj/types";
import { fetchWorkPage } from "../../integrations/dlsite/fetch-work-page";
import { parseWork } from "../../integrations/dlsite/parse-work";
import { buildFailureMessage, buildPreviewMessage } from "./build-preview-message";

type MessageCreateDeps = {
  cache: RjCache;
  fetchWorkPage: (rjCode: string) => Promise<string>;
  parseWork: (html: string, rjCode: string) => DLSiteWork;
  buildPreviewMessage: (
    work: DLSiteWork,
    channelIsNsfw: boolean,
  ) => ReturnType<typeof buildPreviewMessage>;
  buildFailureMessage: (rjCode?: string) => ReturnType<typeof buildFailureMessage>;
  log?: Pick<Console, "error">;
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

    const [rjCode] = extractRjCodes(message.content);

    if (!rjCode) {
      return;
    }

    try {
      const cachedWork = deps.cache.get(rjCode);
      const work = cachedWork ?? deps.parseWork(await deps.fetchWorkPage(rjCode), rjCode);

      if (!cachedWork) {
        deps.cache.set(rjCode, work);
      }

      await message.reply(deps.buildPreviewMessage(work, shouldAllowAdultDetails(message)));
    } catch (error) {
      deps.log?.error("Failed to build RJ preview", error);
      await message.reply(deps.buildFailureMessage(rjCode));
    }
  };
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
