import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  type MessageActionRowComponentBuilder,
  type MessageCreateOptions,
} from "discord.js";
import type { SearchSession } from "../../domain/search/session-cache";
import type { SearchResultItem } from "../../domain/search/types";

export type DiscordReplyPayload = MessageCreateOptions;
export type SearchFailureKind = "empty" | "session_expired" | "nsfw_gate" | "generic";

export const SEARCH_PAGE_SIZE = 10;

const FAILURE_MESSAGES: Record<SearchFailureKind, string> = {
  empty: "該当する作品が見つかりませんでした。",
  session_expired: "検索セッションが失効しました。もう一度 /search を実行してください。",
  nsfw_gate: "この検索対象は成人向け前提のため、NSFWチャンネルで実行してください。",
  generic: "検索中にエラーが発生しました。時間をおいてからもう一度試してください。",
};

export function buildSearchResultMessage(session: SearchSession): DiscordReplyPayload {
  const pageItems = currentPageItems(session);

  if (pageItems.length === 0) {
    return buildSearchFailureMessage("empty");
  }

  return {
    allowedMentions: { repliedUser: false },
    embeds: pageItems.map(buildItemEmbed),
    components: [buildPaginationRow(session, false)],
  };
}

export function buildDisabledSearchMessage(session: SearchSession): DiscordReplyPayload {
  const pageItems = currentPageItems(session);

  return {
    embeds: pageItems.map(buildItemEmbed),
    components: [buildPaginationRow(session, true)],
  };
}

export function buildSearchFailureMessage(kind: SearchFailureKind): DiscordReplyPayload {
  return {
    allowedMentions: { repliedUser: false },
    content: FAILURE_MESSAGES[kind],
  };
}

export function hasPreviousPage(session: SearchSession): boolean {
  return session.displayOffset > 0;
}

export function hasNextPage(session: SearchSession): boolean {
  return session.displayOffset + SEARCH_PAGE_SIZE < session.items.length || !session.exhausted;
}

function currentPageItems(session: SearchSession): SearchResultItem[] {
  return session.items.slice(session.displayOffset, session.displayOffset + SEARCH_PAGE_SIZE);
}

function buildPaginationRow(
  session: SearchSession,
  forceDisabled: boolean,
): ActionRowBuilder<MessageActionRowComponentBuilder> {
  return new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`search:${session.token}:prev`)
      .setLabel("← 前へ")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(forceDisabled || !hasPreviousPage(session)),
    new ButtonBuilder()
      .setCustomId(`search:${session.token}:next`)
      .setLabel("次へ →")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(forceDisabled || !hasNextPage(session)),
  );
}

function buildItemEmbed(item: SearchResultItem): EmbedBuilder {
  const descriptionLines = [
    item.price ? `価格: ${item.price}円` : null,
    item.makerName ? `サークル: ${item.makerName}` : null,
  ].filter((line): line is string => line !== null);

  const embed = new EmbedBuilder().setTitle(item.title).setURL(item.url);

  if (descriptionLines.length > 0) {
    embed.setDescription(descriptionLines.join("\n"));
  }

  if (item.thumbnailUrl) {
    embed.setThumbnail(item.thumbnailUrl);
  }

  return embed;
}
