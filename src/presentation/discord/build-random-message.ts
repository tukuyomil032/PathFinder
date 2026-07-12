import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  MessageFlags,
  SectionBuilder,
  SeparatorBuilder,
  TextDisplayBuilder,
  ThumbnailBuilder,
  type MessageActionRowComponentBuilder,
  type MessageCreateOptions,
} from "discord.js";
import type { RandomResolvedWork, RandomSession } from "../../domain/random/random-session-cache";
import { isDmmFamilyStore, type WorkPreview } from "../../domain/rj/types";
import { shouldSuppress } from "./build-preview-message";

export type ComponentsV2Payload = MessageCreateOptions;

/**
 * /randomの複数件結果メッセージ（Components V2）。まとめブロック（全件、サムネイルなし）
 * → 区切り → 現在ページの詳細ブロック（Section+Thumbnail、1件のみ）→ ページングボタン、
 * という構成をContainerBuilder1個に積む。IsComponentsV2フラグは一度付与すると解除できない
 * ため、通常表示・disabled表示（アイドルタイムアウト）の両方で必ず付与する。
 */
export function buildRandomResultMessage(
  session: RandomSession,
  allowAdultDetails: boolean,
): ComponentsV2Payload {
  return buildContainerMessage(session, allowAdultDetails, false);
}

export function buildDisabledRandomMessage(
  session: RandomSession,
  allowAdultDetails: boolean,
): ComponentsV2Payload {
  return buildContainerMessage(session, allowAdultDetails, true);
}

function buildContainerMessage(
  session: RandomSession,
  allowAdultDetails: boolean,
  disabled: boolean,
): ComponentsV2Payload {
  const container = new ContainerBuilder();

  for (const result of session.results) {
    container.addTextDisplayComponents((text) =>
      text.setContent(buildSummaryLine(result, allowAdultDetails)),
    );
  }

  container.addSeparatorComponents((separator) => separator.setDivider(true));

  const current = session.results[session.currentIndex];

  if (current) {
    container.addTextDisplayComponents((text) =>
      text.setContent(`**${session.currentIndex + 1} / ${session.results.length}件目**`),
    );
    addDetailComponents(container, current, allowAdultDetails);
  }

  container.addSeparatorComponents((separator) => separator.setDivider(true));
  container.addActionRowComponents(buildPaginationRow(session, disabled));

  return {
    components: [container],
    flags: MessageFlags.IsComponentsV2,
    allowedMentions: { repliedUser: false },
  };
}

/**
 * まとめブロックの1行分。サムネイルは載せない（詳細ブロック側でのみ表示、ユーザー指示）。
 * 非NSFWチャンネルでの成人向け作品はタイトル・URLのみに抑制する
 * （build-preview-message.tsのshouldSuppressと同じ判断基準）。
 */
function buildSummaryLine(result: RandomResolvedWork, allowAdultDetails: boolean): string {
  const { work } = result;
  const titleLine = `**[${work.title}](${work.url})**`;

  if (shouldSuppress(work, allowAdultDetails)) {
    return `${titleLine}\n（このチャンネルでは成人向け作品の詳細を省略しています）`;
  }

  const metaParts = [
    `${work.circleOrBrandLabel ?? "サークル"}: ${work.makerName ?? "不明"}`,
    work.price ? `価格: ${formatPrice(work)}` : null,
  ].filter((part): part is string => part !== null);

  const detailParts = [
    work.releaseDate ? `発売日: ${work.releaseDate}` : null,
    work.rating ? `評価: ${work.rating}` : null,
  ].filter((part): part is string => part !== null);

  const creditLine = buildCreditLine(work);

  return [titleLine, metaParts.join(" ・ "), detailParts.join(" ・ "), creditLine]
    .filter((line): line is string => !!line)
    .join("\n");
}

/**
 * 現在ページの詳細ブロック。サムネイルがあればSectionBuilder+ThumbnailBuilderで表示し、
 * 無い場合はSection（accessory必須）を使わずTextDisplayのみにフォールバックする。
 */
function addDetailComponents(
  container: ContainerBuilder,
  result: RandomResolvedWork,
  allowAdultDetails: boolean,
): void {
  const { work } = result;

  if (shouldSuppress(work, allowAdultDetails)) {
    container.addTextDisplayComponents((text) =>
      text.setContent(
        `**[${work.title}](${work.url})**\n成人向け作品のため、このチャンネルでは詳細を省略しています。`,
      ),
    );
    return;
  }

  const textBlocks = buildDetailTextBlocks(work);

  if (work.thumbnailUrl) {
    container.addSectionComponents((section) => {
      for (const block of textBlocks) {
        section.addTextDisplayComponents((text) => text.setContent(block));
      }

      return section.setThumbnailAccessory((thumbnail) =>
        thumbnail.setURL(work.thumbnailUrl as string),
      );
    });
    return;
  }

  for (const block of textBlocks) {
    container.addTextDisplayComponents((text) => text.setContent(block));
  }
}

/**
 * 詳細ブロックのテキスト内容を最大3ブロックに詰める（Sectionの3TextDisplay上限に合わせる）。
 */
function buildDetailTextBlocks(work: WorkPreview): string[] {
  const partialNote =
    isDmmFamilyStore(work.store) && work.parseCoverage === "partial"
      ? "（一部の情報のみ取得できました）"
      : "";

  const headLine = `**[${work.title}](${work.url})**${partialNote}`;
  const priceLine = `${work.circleOrBrandLabel ?? "サークル"}: ${work.makerName ?? "不明"}\n価格: ${formatPrice(work)}`;
  const block1 = [headLine, priceLine].join("\n");

  const block2Lines = [
    work.releaseDate ? `発売日: ${work.releaseDate}` : null,
    work.rating ? `評価: ${work.rating}` : null,
    buildCreditLine(work),
  ].filter((line): line is string => line !== null);

  const block3Lines = [
    work.tags.length > 0 ? `タグ: ${work.tags.join(", ")}` : null,
    work.fileFormat ? `形式: ${work.fileFormat}` : null,
    work.fileSize ? `容量: ${work.fileSize}` : null,
  ].filter((line): line is string => line !== null);

  const blocks = [block1];

  if (block2Lines.length > 0) {
    blocks.push(block2Lines.join("\n"));
  }

  if (block3Lines.length > 0) {
    blocks.push(block3Lines.join("\n"));
  }

  return blocks;
}

function buildCreditLine(work: WorkPreview): string | null {
  if (work.voiceActors.length > 0) {
    return `声優: ${work.voiceActors.join(", ")}`;
  }

  if (work.author) {
    return `著者: ${work.author}`;
  }

  return null;
}

function formatPrice(work: WorkPreview): string {
  return work.salePrice ? `${work.price}（セール: ${work.salePrice}）` : (work.price ?? "不明");
}

function buildPaginationRow(
  session: RandomSession,
  forceDisabled: boolean,
): ActionRowBuilder<MessageActionRowComponentBuilder> {
  const hasPrevious = session.currentIndex > 0;
  const hasNext = session.currentIndex < session.results.length - 1;

  return new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`random:${session.token}:prev`)
      .setLabel("← 前へ")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(forceDisabled || !hasPrevious),
    new ButtonBuilder()
      .setCustomId(`random:${session.token}:next`)
      .setLabel("次へ →")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(forceDisabled || !hasNext),
  );
}
