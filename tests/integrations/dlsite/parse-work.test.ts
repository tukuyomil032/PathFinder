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
      serviceName: "DLSite 同人",
      circleOrBrandLabel: "サークル",
      parserName: "dlsite/maniax",
    });
    expect(work.voiceActors).toEqual(["高原鈴音", "雨宮ひなた"]);
    expect(work.rawAttributes).toEqual({ surface: "maniax" });
  });

  it("allows optional fields to be missing", () => {
    const html = readFixture("dlsite-work-optional-missing.html");
    const work = parseWork(html, "RJ999999");

    expect(work.title).toBe("静かな森のささやき");
    expect(work.voiceActors).toEqual([]);
    expect(work.fileFormat).toBeNull();
    expect(work.isAdult).toBe(false);
  });

  it("parses books fixtures with author-priority metadata", () => {
    const html = readFixture("dlsite-books-work.html");
    const work = parseWork(html, "BJ02519460");

    expect(work).toMatchObject({
      id: "BJ02519460",
      title: "夜更かし読書会",
      url: "https://www.dlsite.com/books/work/=/product_id/BJ02519460.html",
      makerName: "朝霧栞",
      ageCategory: "全年齢",
      price: "880円",
      thumbnailUrl: "https://img.dlsite.jp/books/BJ02519460_main.jpg",
      serviceName: "DLSite Books",
      circleOrBrandLabel: "著者",
      parserName: "dlsite/books",
    });
    expect(work.rawAttributes).toEqual({ surface: "books" });
  });

  it("parses pro fixtures with brand metadata", () => {
    const html = readFixture("dlsite-pro-work.html");
    const work = parseWork(html, "VJ01004728");

    expect(work).toMatchObject({
      id: "VJ01004728",
      title: "空色ステップ",
      url: "https://www.dlsite.com/pro/work/=/product_id/VJ01004728.html",
      makerName: "Lune Palette",
      ageCategory: "18禁",
      price: "7,920円",
      thumbnailUrl: "https://img.dlsite.jp/pro/VJ01004728_main.jpg",
      serviceName: "DLSite 美少女ゲーム",
      circleOrBrandLabel: "ブランド",
      parserName: "dlsite/pro",
    });
    expect(work.rawAttributes).toEqual({ surface: "pro" });
  });

  it("throws when required fields are missing", () => {
    const html = readFixture("dlsite-work-broken.html");

    expect(() => parseWork(html, "RJ000000")).toThrowError(ParseWorkError);
  });
});
