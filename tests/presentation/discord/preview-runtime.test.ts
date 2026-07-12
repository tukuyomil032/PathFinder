import { describe, expect, it, vi } from "vitest";
import { createCirclePool } from "../../../src/domain/random/circle-pool";
import { createRjCache } from "../../../src/domain/rj/cache";
import type { FetchedWorkPage, WorkPreview, WorkReference } from "../../../src/domain/rj/types";
import {
  createPreviewRuntime,
  type PreviewRuntimeDeps,
} from "../../../src/presentation/discord/preview-runtime";

const reference: WorkReference = {
  store: "dlsite",
  id: "RJ012345",
  kind: "code",
  matchedText: "RJ012345",
};

const samplePage: FetchedWorkPage = {
  store: "dlsite",
  html: "<html></html>",
  fetchedUrl: "https://example.com/RJ012345",
  resolvedUrl: "https://example.com/RJ012345",
  pageKind: "work",
  status: 200,
};

const sampleWork: WorkPreview = {
  store: "dlsite",
  id: "RJ012345",
  title: "Sample",
  url: "https://example.com/RJ012345",
  makerName: "beebee工房",
  makerId: "RG70730",
  ageCategory: "18禁",
  isAdult: true,
  price: "1,100円",
  salePrice: null,
  releaseDate: null,
  rating: null,
  thumbnailUrl: null,
  tags: [],
  author: null,
  scenario: null,
  illustration: null,
  voiceActors: [],
  fileFormat: null,
  fileSize: null,
  parseCoverage: "full",
  serviceName: null,
  circleOrBrandLabel: "サークル",
  rawAttributes: {},
  parserName: "dlsite/default",
};

function createDeps(overrides: Partial<PreviewRuntimeDeps> = {}): PreviewRuntimeDeps {
  return {
    cache: createRjCache(60_000),
    fetchWorkPage: vi.fn().mockResolvedValue(samplePage),
    parseWork: vi.fn().mockReturnValue(sampleWork),
    buildPreviewMessage: vi.fn().mockReturnValue({ content: "preview" }),
    buildFailureMessage: vi.fn().mockReturnValue({ content: "failure" }),
    ...overrides,
  };
}

describe("createPreviewRuntime circlePool hook", () => {
  it("records the resolved work's maker into the circle pool when provided", async () => {
    const circlePool = createCirclePool();
    const runtime = createPreviewRuntime(createDeps({ circlePool }));

    await runtime.resolve(reference, true);

    expect(circlePool.pickRandom("dlsite", () => 0)).toEqual({
      makerId: "RG70730",
      makerName: "beebee工房",
    });
  });

  it("still resolves normally when circlePool is not provided", async () => {
    const runtime = createPreviewRuntime(createDeps());

    await expect(runtime.resolve(reference, true)).resolves.toEqual({ content: "preview" });
  });

  it("does not record anything when resolution fails", async () => {
    const circlePool = createCirclePool();
    const runtime = createPreviewRuntime(
      createDeps({
        circlePool,
        fetchWorkPage: vi.fn().mockRejectedValue(new Error("boom")),
      }),
    );

    await runtime.resolve(reference, true);

    expect(circlePool.pickRandom("dlsite")).toBeNull();
  });
});
