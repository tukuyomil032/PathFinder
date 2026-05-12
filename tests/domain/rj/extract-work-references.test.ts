import { describe, expect, it } from "vitest";
import { extractWorkReferences } from "../../../src/domain/rj/extract-work-references";

describe("extractWorkReferences", () => {
  it("extracts DLSite bare ids across supported prefixes", () => {
    expect(extractWorkReferences("check RJ012345 BJ02519460 VJ01004728 please")).toEqual([
      {
        store: "dlsite",
        id: "RJ012345",
        kind: "code",
        matchedText: "RJ012345",
      },
      {
        store: "dlsite",
        id: "BJ02519460",
        kind: "code",
        matchedText: "BJ02519460",
      },
      {
        store: "dlsite",
        id: "VJ01004728",
        kind: "code",
        matchedText: "VJ01004728",
      },
    ]);
  });

  it("extracts DLSite URLs without re-extracting product ids inside them", () => {
    expect(
      extractWorkReferences(
        [
          "https://www.dlsite.com/books/work/=/product_id/BJ02519460.html",
          "https://www.dlsite.com/pro/work/=/product_id/VJ01004728.html",
        ].join(" "),
      ),
    ).toEqual([
      {
        store: "dlsite",
        id: "BJ02519460",
        kind: "url",
        sourceUrl: "https://www.dlsite.com/books/work/=/product_id/BJ02519460.html",
        matchedText: "https://www.dlsite.com/books/work/=/product_id/BJ02519460.html",
      },
      {
        store: "dlsite",
        id: "VJ01004728",
        kind: "url",
        sourceUrl: "https://www.dlsite.com/pro/work/=/product_id/VJ01004728.html",
        matchedText: "https://www.dlsite.com/pro/work/=/product_id/VJ01004728.html",
      },
    ]);
  });

  it("extracts DMM family URLs by service", () => {
    expect(
      extractWorkReferences(
        [
          "https://www.dmm.co.jp/dc/doujin/-/detail/=/cid=d_756160/?utm_source=test",
          "https://tv.dmm.co.jp/vod/?content=midv00018&utm_campaign=test",
          "https://dlsoft.dmm.co.jp/detail/spal_0201/",
          "https://book.dmm.co.jp/product/6214499/b915awnmg03757/",
        ].join(" "),
      ),
    ).toEqual([
      {
        store: "fanza_doujin",
        id: "d_756160",
        kind: "url",
        sourceUrl: "https://www.dmm.co.jp/dc/doujin/-/detail/=/cid=d_756160/?utm_source=test",
        matchedText: "https://www.dmm.co.jp/dc/doujin/-/detail/=/cid=d_756160/?utm_source=test",
      },
      {
        store: "dmm_tv_av",
        id: "midv00018",
        kind: "url",
        sourceUrl: "https://tv.dmm.co.jp/vod/?content=midv00018&utm_campaign=test",
        matchedText: "https://tv.dmm.co.jp/vod/?content=midv00018&utm_campaign=test",
      },
      {
        store: "fanza_pcgame",
        id: "spal_0201",
        kind: "url",
        sourceUrl: "https://dlsoft.dmm.co.jp/detail/spal_0201/",
        matchedText: "https://dlsoft.dmm.co.jp/detail/spal_0201/",
      },
      {
        store: "fanza_books",
        id: "b915awnmg03757",
        kind: "url",
        sourceUrl: "https://book.dmm.co.jp/product/6214499/b915awnmg03757/",
        matchedText: "https://book.dmm.co.jp/product/6214499/b915awnmg03757/",
      },
    ]);
  });

  it("extracts bare DMM family ids without overlapping URL text", () => {
    expect(
      extractWorkReferences(
        "d_756160 spal_0201 b915awnmg03757 mide00924 https://tv.dmm.co.jp/detail/?content=mide00924",
      ),
    ).toEqual([
      {
        store: "fanza_doujin",
        id: "d_756160",
        kind: "code",
        matchedText: "d_756160",
      },
      {
        store: "fanza_pcgame",
        id: "spal_0201",
        kind: "code",
        matchedText: "spal_0201",
      },
      {
        store: "fanza_books",
        id: "b915awnmg03757",
        kind: "code",
        matchedText: "b915awnmg03757",
      },
      {
        store: "dmm_tv_av",
        id: "mide00924",
        kind: "code",
        matchedText: "mide00924",
      },
      {
        store: "dmm_tv_av",
        id: "mide00924",
        kind: "url",
        sourceUrl: "https://tv.dmm.co.jp/detail/?content=mide00924",
        matchedText: "https://tv.dmm.co.jp/detail/?content=mide00924",
      },
    ]);
  });

  it("normalizes FANZA同人 bare ids without underscores", () => {
    expect(extractWorkReferences("check d756160 please")).toEqual([
      {
        store: "fanza_doujin",
        id: "d_756160",
        kind: "code",
        matchedText: "d756160",
      },
    ]);
  });

  it("extracts explicit FANZA prefixes without double-detecting bare ids", () => {
    expect(extractWorkReferences("av:mide00924 game:spal_0201 book:b915awnmg04288")).toEqual([
      {
        store: "dmm_tv_av",
        id: "mide00924",
        kind: "code",
        matchedText: "av:mide00924",
      },
      {
        store: "fanza_pcgame",
        id: "spal_0201",
        kind: "code",
        matchedText: "game:spal_0201",
      },
      {
        store: "fanza_books",
        id: "b915awnmg04288",
        kind: "code",
        matchedText: "book:b915awnmg04288",
      },
    ]);
  });

  it("returns references in message order across stores", () => {
    expect(extractWorkReferences("spal_0201 BJ02519460 d_100000 VJ01004728")).toEqual([
      {
        store: "fanza_pcgame",
        id: "spal_0201",
        kind: "code",
        matchedText: "spal_0201",
      },
      {
        store: "dlsite",
        id: "BJ02519460",
        kind: "code",
        matchedText: "BJ02519460",
      },
      {
        store: "fanza_doujin",
        id: "d_100000",
        kind: "code",
        matchedText: "d_100000",
      },
      {
        store: "dlsite",
        id: "VJ01004728",
        kind: "code",
        matchedText: "VJ01004728",
      },
    ]);
  });

  it("preserves message order across URL, bare, and explicit FANZA inputs", () => {
    expect(
      extractWorkReferences(
        "book:b915awnmg04288 https://tv.dmm.co.jp/detail/?content=mide00924 d123456 game:spal_0201",
      ),
    ).toEqual([
      {
        store: "fanza_books",
        id: "b915awnmg04288",
        kind: "code",
        matchedText: "book:b915awnmg04288",
      },
      {
        store: "dmm_tv_av",
        id: "mide00924",
        kind: "url",
        sourceUrl: "https://tv.dmm.co.jp/detail/?content=mide00924",
        matchedText: "https://tv.dmm.co.jp/detail/?content=mide00924",
      },
      {
        store: "fanza_doujin",
        id: "d_123456",
        kind: "code",
        matchedText: "d123456",
      },
      {
        store: "fanza_pcgame",
        id: "spal_0201",
        kind: "code",
        matchedText: "game:spal_0201",
      },
    ]);
  });
});
