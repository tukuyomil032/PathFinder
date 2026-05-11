import { describe, expect, it } from "vitest";
import { extractRjCodes } from "../../../src/domain/rj/extract-rj-codes";

describe("extractRjCodes", () => {
  it("extracts a single RJ code", () => {
    expect(extractRjCodes("check RJ012345 please")).toEqual(["RJ012345"]);
  });

  it("normalizes lowercase matches", () => {
    expect(extractRjCodes("rj123456 is here")).toEqual(["RJ123456"]);
  });

  it("returns matches in message order", () => {
    expect(extractRjCodes("rj123456 and RJ654321")).toEqual(["RJ123456", "RJ654321"]);
  });

  it("returns an empty list when no RJ code exists", () => {
    expect(extractRjCodes("hello world")).toEqual([]);
  });
});
