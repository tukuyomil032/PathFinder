import { EmbedBuilder, type APIEmbedField, type MessageCreateOptions } from "discord.js";
import type { DLSiteWork } from "../../domain/rj/types";

export type DiscordReplyPayload = MessageCreateOptions;

const FAILURE_MESSAGE = "作品情報を取得できませんでした。時間をおいてからもう一度試してください。";

export function buildPreviewMessage(work: DLSiteWork, channelIsNsfw: boolean): DiscordReplyPayload {
  if (!channelIsNsfw && work.isAdult) {
    const embed = new EmbedBuilder()
      .setTitle(work.title)
      .setURL(work.url)
      .setDescription("成人向け作品のため、このチャンネルでは詳細を省略しています。")
      .addFields(
        { name: "作品ID", value: work.id, inline: true },
        { name: "サークル", value: work.makerName ?? "不明", inline: true },
      );

    return {
      allowedMentions: { repliedUser: false },
      embeds: [embed],
    };
  }

  const fields: APIEmbedField[] = [
    { name: "作品ID", value: work.id, inline: true },
    { name: "サークル", value: work.makerName ?? "不明", inline: true },
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

  if (work.voiceActors && work.voiceActors.length > 0) {
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

export function buildFailureMessage(rjCode?: string): DiscordReplyPayload {
  return {
    allowedMentions: { repliedUser: false },
    content: rjCode ? `${rjCode}: ${FAILURE_MESSAGE}` : FAILURE_MESSAGE,
  };
}
