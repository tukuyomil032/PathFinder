import { describe, expect, it } from "vitest";
import {
  buildFailureMessage,
  buildPreviewMessage,
} from "../../../src/presentation/discord/build-preview-message";
import type { DLSiteWork } from "../../../src/domain/rj/types";
import type { APIEmbed, JSONEncodable } from "discord.js";

const sampleWork: DLSiteWork = {
  id: "RJ012345",
  title: "星巡りの耳かき",
  url: "https://example.com/RJ012345",
  makerName: "月明かりラボ",
  price: "1,320円",
  salePrice: "990円",
  ageCategory: "18禁",
  releaseDate: "2025年01月15日",
  rating: "4.8 / 5",
  thumbnailUrl: "https://example.com/thumb.jpg",
  tags: ["ASMR", "癒やし"],
  isAdult: true,
  author: "空音",
  scenario: "綾瀬ひかり",
  illustration: "青空しずく",
  voiceActors: ["高原鈴音"],
  fileFormat: "WAV",
  fileSize: "1.2GB",
};

describe("buildPreviewMessage", () => {
  it("builds a detailed embed in nsfw channels", () => {
    const payload = buildPreviewMessage(sampleWork, true);
    const embed = toJsonEmbed(payload.embeds?.[0]);

    expect(embed?.title).toBe("星巡りの耳かき");
    expect(embed?.thumbnail?.url).toBe("https://example.com/thumb.jpg");
    expect(embed?.description).toContain("タグ: ASMR, 癒やし");
  });

  it("suppresses adult details in non-nsfw channels", () => {
    const payload = buildPreviewMessage(sampleWork, false);
    const embed = toJsonEmbed(payload.embeds?.[0]);

    expect(embed?.description).toContain("成人向け作品");
    expect(embed?.fields).toHaveLength(2);
    expect(embed?.thumbnail).toBeUndefined();
  });
});

describe("buildFailureMessage", () => {
  it("builds a concise fallback reply", () => {
    expect(buildFailureMessage("RJ012345").content).toContain("RJ012345");
  });
});

function toJsonEmbed(embed: APIEmbed | JSONEncodable<APIEmbed> | undefined): APIEmbed | undefined {
  if (!embed) {
    return undefined;
  }

  return "toJSON" in embed ? embed.toJSON() : embed;
}
