import { EmbedBuilder, type APIEmbedField, type MessageCreateOptions } from "discord.js";
import { isDmmFamilyStore, type WorkPreview } from "../../domain/rj/types";

export type DiscordReplyPayload = MessageCreateOptions;
export type FailureMessageKind = "generic" | "fanza_url_required";

const FANZA_INPUT_EXAMPLES =
  "FANZA例: d123456 / av:mide00924 / game:spal_0201 / book:b915awnmg04288";
const FAILURE_MESSAGE = `作品情報を取得できませんでした。時間をおいてからもう一度試してください。\n${FANZA_INPUT_EXAMPLES}`;
const FANZA_URL_REQUIRED_MESSAGE = `この作品はURL付きで送信してください。\n${FANZA_INPUT_EXAMPLES}`;

export function buildPreviewMessage(
  work: WorkPreview,
  channelIsNsfw: boolean,
): DiscordReplyPayload {
  if (shouldSuppress(work, channelIsNsfw)) {
    return buildMinimalPreview(work, !channelIsNsfw && work.isAdult);
  }

  if (isDmmFamilyStore(work.store) && work.parseCoverage === "partial") {
    return buildPartialPreview(work);
  }

  const fields: APIEmbedField[] = [
    { name: "作品ID", value: work.id, inline: true },
    {
      name: work.circleOrBrandLabel ?? "サークル",
      value: work.makerName ?? "不明",
      inline: true,
    },
    { name: "年齢指定", value: work.ageCategory ?? "不明", inline: true },
  ];

  if (work.price) {
    fields.push({ name: "価格", value: work.price, inline: true });
  }

  if (work.salePrice) {
    fields.push({ name: "セール価格", value: work.salePrice, inline: true });
  }

  if (work.releaseDate) {
    fields.push({ name: "販売日", value: work.releaseDate, inline: true });
  }

  if (work.rating) {
    fields.push({ name: "評価", value: work.rating, inline: true });
  }

  if (work.voiceActors.length > 0) {
    fields.push({ name: "声優", value: work.voiceActors.join(", ") });
  }

  const detailLines = [
    work.author ? `作者: ${work.author}` : null,
    work.scenario ? `シナリオ: ${work.scenario}` : null,
    work.illustration ? `イラスト: ${work.illustration}` : null,
    work.fileFormat ? `形式: ${work.fileFormat}` : null,
    work.fileSize ? `容量: ${work.fileSize}` : null,
    work.tags.length > 0 ? `タグ: ${work.tags.join(", ")}` : null,
  ].filter((line): line is string => line !== null);

  const embed = new EmbedBuilder().setTitle(work.title).setURL(work.url).addFields(fields);

  if (work.thumbnailUrl) {
    embed.setThumbnail(work.thumbnailUrl);
  }

  if (detailLines.length > 0) {
    embed.setDescription(detailLines.join("\n"));
  }

  return {
    allowedMentions: { repliedUser: false },
    embeds: [embed],
  };
}

export function buildFailureMessage(
  workId?: string,
  kind: FailureMessageKind = "generic",
): DiscordReplyPayload {
  const message = kind === "fanza_url_required" ? FANZA_URL_REQUIRED_MESSAGE : FAILURE_MESSAGE;

  return {
    allowedMentions: { repliedUser: false },
    content: workId ? `${workId}: ${message}` : message,
  };
}

function shouldSuppress(work: WorkPreview, channelIsNsfw: boolean): boolean {
  if (isDmmFamilyStore(work.store)) {
    return !channelIsNsfw;
  }

  return !channelIsNsfw && work.isAdult;
}

function buildMinimalPreview(work: WorkPreview, adultSuppressed: boolean): DiscordReplyPayload {
  const embed = new EmbedBuilder()
    .setTitle(work.title)
    .setURL(work.url)
    .setDescription(
      adultSuppressed
        ? "成人向け作品のため、このチャンネルでは詳細を省略しています。"
        : "このチャンネルでは最小情報のみ表示しています。",
    )
    .addFields(
      { name: "作品ID", value: work.id, inline: true },
      {
        name: work.circleOrBrandLabel ?? "サークル",
        value: work.makerName ?? "不明",
        inline: true,
      },
    );

  return {
    allowedMentions: { repliedUser: false },
    embeds: [embed],
  };
}

function buildPartialPreview(work: WorkPreview): DiscordReplyPayload {
  const fields: APIEmbedField[] = [{ name: "作品ID", value: work.id, inline: true }];

  if (work.makerName) {
    fields.push({
      name: work.circleOrBrandLabel ?? "ブランド",
      value: work.makerName,
      inline: true,
    });
  }

  if (work.price) {
    fields.push({ name: "価格", value: work.price, inline: true });
  }

  const descriptionLines = [
    "一部の情報のみ取得できました。",
    work.ageCategory ? `年齢指定: ${work.ageCategory}` : null,
    work.releaseDate ? `販売日: ${work.releaseDate}` : null,
    work.tags.length > 0 ? `タグ: ${work.tags.join(", ")}` : null,
  ].filter((line): line is string => line !== null);

  const embed = new EmbedBuilder()
    .setTitle(work.title)
    .setURL(work.url)
    .setDescription(descriptionLines.join("\n"))
    .addFields(fields);

  if (work.thumbnailUrl) {
    embed.setThumbnail(work.thumbnailUrl);
  }

  return {
    allowedMentions: { repliedUser: false },
    embeds: [embed],
  };
}
