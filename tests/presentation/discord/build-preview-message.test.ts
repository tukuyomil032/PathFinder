import { describe, expect, it } from "vitest";
import {
  buildFailureMessage,
  buildPreviewMessage,
} from "../../../src/presentation/discord/build-preview-message";
import type { WorkPreview } from "../../../src/domain/rj/types";
import type { APIEmbed, JSONEncodable } from "discord.js";

const sampleWork: WorkPreview = {
  store: "dlsite",
  id: "RJ012345",
  title: "星巡りの耳かき",
  url: "https://example.com/RJ012345",
  makerName: "月明かりラボ",
  makerId: null,
  ageCategory: "18禁",
  isAdult: true,
  price: "1,320円",
  salePrice: "990円",
  releaseDate: "2025年01月15日",
  rating: "4.8 / 5",
  thumbnailUrl: "https://example.com/thumb.jpg",
  tags: ["ASMR", "癒やし"],
  author: "空音",
  scenario: "綾瀬ひかり",
  illustration: "青空しずく",
  voiceActors: ["高原鈴音"],
  fileFormat: "WAV",
  fileSize: "1.2GB",
  parseCoverage: "full",
  serviceName: null,
  circleOrBrandLabel: "サークル",
  rawAttributes: {},
  parserName: "dlsite/default",
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

  it("always suppresses DMM family details in non-nsfw channels", () => {
    const payload = buildPreviewMessage(
      {
        ...sampleWork,
        store: "fanza_doujin",
        id: "d_123456",
        url: "https://www.dmm.co.jp/dc/doujin/-/detail/=/cid=d_123456/",
      },
      false,
    );
    const embed = toJsonEmbed(payload.embeds?.[0]);

    expect(embed?.description).toContain("成人向け作品");
    expect(embed?.fields?.[0]?.value).toBe("d_123456");
  });

  it("renders partial DMM previews safely in nsfw channels", () => {
    const payload = buildPreviewMessage(
      {
        ...sampleWork,
        store: "dmm_tv_av",
        id: "midv00018",
        parseCoverage: "partial",
        thumbnailUrl: null,
      },
      true,
    );
    const embed = toJsonEmbed(payload.embeds?.[0]);

    expect(embed?.description).toContain("一部の情報のみ取得できました。");
    expect(embed?.thumbnail).toBeUndefined();
  });
});

describe("buildFailureMessage", () => {
  it("builds a concise fallback reply", () => {
    expect(buildFailureMessage("RJ012345").content).toContain("RJ012345");
    expect(buildFailureMessage("RJ012345").content).toContain("av:mide00924");
  });

  it("builds a FANZA URL guidance reply", () => {
    const message = buildFailureMessage("d_743581", "fanza_url_required").content;

    expect(message).toContain("URL付きで送信してください");
    expect(message).toContain("game:spal_0201");
    expect(message).toContain("book:b915awnmg04288");
  });
});

function toJsonEmbed(embed: APIEmbed | JSONEncodable<APIEmbed> | undefined): APIEmbed | undefined {
  if (!embed) {
    return undefined;
  }

  return "toJSON" in embed ? embed.toJSON() : embed;
}
