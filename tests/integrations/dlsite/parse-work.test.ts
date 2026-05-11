import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { ParseWorkError } from "../../../src/integrations/dlsite/errors";
import { parseWork } from "../../../src/integrations/dlsite/parse-work";

function readFixture(fileName: string): string {
  return readFileSync(resolve(process.cwd(), "tests/fixtures", fileName), "utf8");
}

describe("parseWork", () => {
  it("extracts required and optional fields from fixture html", () => {
    const html = readFixture("dlsite-work.html");
    const work = parseWork(html, "RJ012345");

    expect(work).toMatchObject({
      id: "RJ012345",
      title: "星巡りの耳かき",
      url: "https://www.dlsite.com/maniax/work/=/product_id/RJ012345.html",
      makerName: "月明かりラボ",
      price: "1,320円",
      salePrice: "990円",
      ageCategory: "18禁",
      releaseDate: "2025年01月15日",
      rating: "4.8 / 5",
      thumbnailUrl:
        "https://img.dlsite.jp/modpub/images2/work/doujin/RJ012350/RJ012345_img_main.jpg",
      tags: ["ASMR", "癒やし"],
      isAdult: true,
      author: "空音",
      scenario: "綾瀬ひかり",
      illustration: "青空しずく",
      fileFormat: "WAV / MP3",
      fileSize: "1.2GB",
    });
    expect(work.voiceActors).toEqual(["高原鈴音", "雨宮ひなた"]);
  });

  it("allows optional fields to be missing", () => {
    const html = readFixture("dlsite-work-optional-missing.html");
    const work = parseWork(html, "RJ999999");

    expect(work.title).toBe("静かな森のささやき");
    expect(work.voiceActors).toEqual([]);
    expect(work.fileFormat).toBeNull();
    expect(work.isAdult).toBe(false);
  });

  it("throws when required fields are missing", () => {
    const html = readFixture("dlsite-work-broken.html");

    expect(() => parseWork(html, "RJ000000")).toThrowError(ParseWorkError);
  });
});
