import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { parseDmmWork, ParseDmmWorkError } from "../../../src/integrations/dmm/parse-work";
import type { FetchedWorkPage, WorkReference } from "../../../src/domain/rj/types";

function readFixture(fileName: string): string {
  return readFileSync(resolve(process.cwd(), "tests/fixtures", fileName), "utf8");
}

function createPage(
  store: FetchedWorkPage["store"],
  fileName: string,
  resolvedUrl: string,
): FetchedWorkPage {
  return {
    store,
    html: readFixture(fileName),
    fetchedUrl: resolvedUrl,
    resolvedUrl,
    pageKind: "work",
    status: 200,
  };
}

function createReference(
  store: WorkReference["store"],
  id: string,
  sourceUrl?: string,
): WorkReference {
  return {
    store,
    id,
    kind: sourceUrl ? "url" : "code",
    sourceUrl,
    matchedText: sourceUrl ?? id,
  };
}

describe("parseDmmWork", () => {
  it("fully parses FANZA同人 fixture html", () => {
    const result = parseDmmWork(
      createPage(
        "fanza_doujin",
        "dmm-fanza-doujin-work.html",
        "https://www.dmm.co.jp/dc/doujin/-/detail/=/cid=d_743581/",
      ),
      createReference(
        "fanza_doujin",
        "d_743581",
        "https://www.dmm.co.jp/dc/doujin/-/detail/=/cid=d_743581/",
      ),
    );

    expect(result).toMatchObject({
      store: "fanza_doujin",
      id: "d_743581",
      title: "田舎妹と無知の誘惑2",
      url: "https://www.dmm.co.jp/dc/doujin/-/detail/=/cid=d_743581/",
      makerName: "みずのウロ",
      makerId: "206191",
      price: "792円",
      ageCategory: "成人向け",
      releaseDate: "2026/05/03",
      serviceName: "FANZA同人",
    });
  });

  it("parses DMM TV metadata", () => {
    const result = parseDmmWork(
      createPage("dmm_tv_av", "dmm-tv-work.html", "https://tv.dmm.co.jp/detail/?content=midv00018"),
      createReference("dmm_tv_av", "midv00018", "https://tv.dmm.co.jp/detail/?content=midv00018"),
    );

    expect(result).toMatchObject({
      store: "dmm_tv_av",
      id: "midv00018",
      title: "深夜便の恋人",
      url: "https://tv.dmm.co.jp/detail/?content=midv00018",
      makerName: "ミッドナイトレーベル",
      price: "500円",
      thumbnailUrl: "https://pics.dmm.co.jp/digital/video/midv00018/midv00018pl.jpg",
      serviceName: "DMM TV",
      author: "恋渕ももな",
      makerId: null,
    });
  });

  it("parses FANZA PCゲーム metadata", () => {
    const result = parseDmmWork(
      createPage(
        "fanza_pcgame",
        "dmm-pcgame-work.html",
        "https://dlsoft.dmm.co.jp/detail/spal_0201/",
      ),
      createReference("fanza_pcgame", "spal_0201", "https://dlsoft.dmm.co.jp/detail/spal_0201/"),
    );

    expect(result).toMatchObject({
      store: "fanza_pcgame",
      id: "spal_0201",
      title: "アージュメモリアルバンドル",
      makerName: "アージュ",
      price: "10,780円",
      fileFormat: "Windows 10 / 11",
      serviceName: "FANZA PCゲーム",
    });
  });

  it("parses FANZA BOOKS metadata", () => {
    const result = parseDmmWork(
      createPage(
        "fanza_books",
        "dmm-books-work.html",
        "https://book.dmm.co.jp/product/6214499/b915awnmg03757/",
      ),
      createReference(
        "fanza_books",
        "b915awnmg03757",
        "https://book.dmm.co.jp/product/6214499/b915awnmg03757/",
      ),
    );

    expect(result).toMatchObject({
      store: "fanza_books",
      id: "b915awnmg03757",
      title: "COMIC ゼロス #108",
      makerName: "鳥居ヨシツナ",
      author: "鳥居ヨシツナ",
      scenario: "COMIC X-EROS",
      price: "880円",
      fileFormat: "fxlepub",
      serviceName: "FANZA BOOKS",
    });
  });

  it("throws when mandatory DMM metadata is missing", () => {
    expect(() =>
      parseDmmWork(
        createPage(
          "fanza_doujin",
          "fanza-dc-doujin-broken.html",
          "https://www.dmm.co.jp/dc/doujin/-/detail/=/cid=d_000000/",
        ),
        createReference("fanza_doujin", "d_000000"),
      ),
    ).toThrowError(ParseDmmWorkError);
  });
});
