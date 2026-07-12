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
import { resolveSearchFetcher, type SearchFetcher } from "../../domain/search/resolve-search";
import {
  createSearchSessionCache,
  type SearchSession,
  type SearchSessionCache,
} from "../../domain/search/session-cache";
import {
  isAdultOnlyTarget,
  type SearchQuery,
  type SearchResultItem,
} from "../../domain/search/types";
import {
  buildDisabledSearchMessage,
  buildSearchFailureMessage,
  buildSearchResultMessage,
  SEARCH_PAGE_SIZE,
  type DiscordReplyPayload,
} from "./build-search-message";
import { getSharedCirclePool } from "./shared-random-pools";

const MAX_RAW_PAGES_PER_STEP = 20;

export type SearchRuntimeDeps = {
  sessionCache: SearchSessionCache;
  resolveFetcher: (target: SearchQuery["target"]) => SearchFetcher;
  idleTimeoutMs: number;
  // /randomのサークルfacet用プール。取得したページの全アイテムを記録する（任意、省略可）。
  circlePool?: CirclePool;
  log?: Partial<Pick<Console, "error" | "info">>;
};

export function createSearchRuntime(deps: SearchRuntimeDeps) {
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
        await message.edit(toEditOptions(buildDisabledSearchMessage(session)));
      }
    } catch (error) {
      deps.log?.error?.("Failed to disable expired search buttons", error);
    }
  }

  return {
    async resolve(
      query: SearchQuery,
      interaction: ChatInputCommandInteraction,
      allowAdultDetails: boolean,
    ): Promise<void> {
      if (isAdultOnlyTarget(query.target) && !allowAdultDetails) {
        await interaction.reply(toReplyOptions(buildSearchFailureMessage("nsfw_gate")));
        return;
      }

      try {
        await interaction.deferReply();

        const token = crypto.randomUUID();
        let session: SearchSession = {
          token,
          query,
          items: [],
          nextRawPage: 1,
          exhausted: false,
          displayOffset: 0,
          channelId: interaction.channelId,
          messageId: null,
        };

        session = await ensureBuffer(session, SEARCH_PAGE_SIZE, deps);
        deps.sessionCache.set(token, session);

        const reply = await interaction.editReply(
          toEditReplyOptions(buildSearchResultMessage(session)),
        );

        if (session.items.length === 0) {
          return;
        }

        session.messageId = reply.id;
        deps.sessionCache.set(token, session);
        scheduleIdleTimer(token, interaction.client);
      } catch (error) {
        deps.log?.error?.("Failed to resolve search", error);
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

      try {
        if (parsed.action === "next") {
          await interaction.deferUpdate();
          const updated = await goToNextPage(session, deps);
          deps.sessionCache.set(updated.token, updated);
          await interaction.editReply(toEditReplyOptions(buildSearchResultMessage(updated)));
          scheduleIdleTimer(updated.token, interaction.client);
        } else {
          const updated = goToPreviousPage(session);
          deps.sessionCache.set(updated.token, updated);
          await interaction.update(toUpdateOptions(buildSearchResultMessage(updated)));
          scheduleIdleTimer(updated.token, interaction.client);
        }
      } catch (error) {
        deps.log?.error?.("Failed to update search page", error);
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

async function goToNextPage(
  session: SearchSession,
  deps: SearchRuntimeDeps,
): Promise<SearchSession> {
  const targetCount = session.displayOffset + SEARCH_PAGE_SIZE * 2;
  const buffered = await ensureBuffer(session, targetCount, deps);

  return {
    ...buffered,
    displayOffset: Math.min(buffered.displayOffset + SEARCH_PAGE_SIZE, buffered.items.length),
  };
}

function goToPreviousPage(session: SearchSession): SearchSession {
  return { ...session, displayOffset: Math.max(0, session.displayOffset - SEARCH_PAGE_SIZE) };
}

async function ensureBuffer(
  session: SearchSession,
  targetCount: number,
  deps: SearchRuntimeDeps,
): Promise<SearchSession> {
  const fetcher = deps.resolveFetcher(session.query.target);
  const items = [...session.items];
  let nextRawPage = session.nextRawPage;
  let exhausted = session.exhausted;
  let fetchedThisStep = 0;

  while (items.length < targetCount && !exhausted && fetchedThisStep < MAX_RAW_PAGES_PER_STEP) {
    const page = await fetcher(session.query, nextRawPage);

    for (const item of page.items) {
      deps.circlePool?.record(item.store, item.makerId, item.makerName);
    }

    items.push(...applyClientSideFilters(page.items, session.query));
    nextRawPage += 1;
    exhausted = !page.hasNext;
    fetchedThisStep += 1;
  }

  return { ...session, items, nextRawPage, exhausted };
}

function applyClientSideFilters(items: SearchResultItem[], query: SearchQuery): SearchResultItem[] {
  return items.filter((item) => {
    if (
      query.priceMin !== undefined &&
      (item.priceValue === null || item.priceValue < query.priceMin)
    ) {
      return false;
    }

    if (
      query.priceMax !== undefined &&
      (item.priceValue === null || item.priceValue > query.priceMax)
    ) {
      return false;
    }

    return true;
  });
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

function toUpdateOptions(payload: DiscordReplyPayload): InteractionUpdateOptions {
  return {
    content: payload.content,
    embeds: payload.embeds,
    components: payload.components,
    files: payload.files,
    allowedMentions: payload.allowedMentions,
  };
}

function toEditOptions(payload: DiscordReplyPayload): MessageEditOptions {
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

function parseCustomId(customId: string): { token: string; action: "prev" | "next" } | null {
  const match = customId.match(/^search:(.+):(prev|next)$/);

  if (!match) {
    return null;
  }

  return { token: match[1], action: match[2] as "prev" | "next" };
}

let runtimeSearchRuntime: ReturnType<typeof createSearchRuntime> | null = null;

export function getRuntimeSearchRuntime() {
  runtimeSearchRuntime ??= createSearchRuntime({
    sessionCache: createSearchSessionCache(getEnv().SEARCH_SESSION_TTL_MS),
    resolveFetcher: resolveSearchFetcher,
    idleTimeoutMs: getEnv().SEARCH_SESSION_TTL_MS,
    circlePool: getSharedCirclePool(),
    log: console,
  });

  return runtimeSearchRuntime;
}

export type SearchRuntime = ReturnType<typeof createSearchRuntime>;
export type SearchReplyPayload = DiscordReplyPayload;
