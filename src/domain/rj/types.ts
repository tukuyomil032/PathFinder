export type WorkStore = "dlsite" | "fanza_doujin" | "dmm_tv_av" | "fanza_pcgame" | "fanza_books";
export type DLSiteSurface = "maniax" | "books" | "pro";

export type WorkPageKind = "work" | "age_check" | "not_found" | "unknown";

export type ParseCoverage = "full" | "partial";
export type WorkReferenceKind = "code" | "url";

export type WorkReference = {
  store: WorkStore;
  id: string;
  kind: WorkReferenceKind;
  sourceUrl?: string;
  matchedText: string;
};

export type FetchedWorkPage = {
  store: WorkStore;
  html: string;
  fetchedUrl: string;
  resolvedUrl: string;
  pageKind: WorkPageKind;
  status: number;
};

export type WorkPreview = {
  store: WorkStore;
  id: string;
  title: string;
  url: string;
  makerName: string | null;
  ageCategory: string | null;
  isAdult: boolean;
  price: string | null;
  salePrice: string | null;
  releaseDate: string | null;
  rating: string | null;
  thumbnailUrl: string | null;
  tags: string[];
  author: string | null;
  scenario: string | null;
  illustration: string | null;
  voiceActors: string[];
  fileFormat: string | null;
  fileSize: string | null;
  parseCoverage: ParseCoverage;
  serviceName: string | null;
  circleOrBrandLabel: string | null;
  rawAttributes: Record<string, string | string[]>;
  parserName: string;
};

export type DLSiteWork = WorkPreview;

export function isDmmFamilyStore(store: WorkStore): boolean {
  return store !== "dlsite";
}
