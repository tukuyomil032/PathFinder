import type { FetchedWorkPage, WorkPreview, WorkReference } from "./types";
import {
  buildWorkUrl as buildDlsiteWorkUrl,
  fetchWorkPage as fetchDlsiteWorkPage,
} from "../../integrations/dlsite/fetch-work-page";
import { parseWork as parseDlsiteWork } from "../../integrations/dlsite/parse-work";
import {
  fetchDmmWorkPage,
  normalizeDmmId,
  probeDmmWorkPage,
} from "../../integrations/dmm/fetch-work-page";
import { parseDmmWork } from "../../integrations/dmm/parse-work";

export class WorkPreviewResolutionError extends Error {
  readonly code: "fanza_url_required";
  readonly workId: string;

  constructor(code: "fanza_url_required", workId: string) {
    super(`Unable to resolve work preview for ${workId} without a URL`);
    this.name = "WorkPreviewResolutionError";
    this.code = code;
    this.workId = workId;
  }
}

export function resolveStoreFetcher(
  reference: WorkReference,
): (reference: WorkReference) => Promise<FetchedWorkPage> {
  return reference.store === "dlsite" ? fetchDlsitePage : fetchDmmPage;
}

export function resolveStoreParser(
  reference: WorkReference,
): (page: FetchedWorkPage, reference: WorkReference) => WorkPreview {
  return reference.store === "dlsite" ? parseDlsitePage : parseDmmPage;
}

export async function fetchWorkPage(reference: WorkReference): Promise<FetchedWorkPage> {
  return resolveStoreFetcher(reference)(reference);
}

export function parseWork(page: FetchedWorkPage, reference: WorkReference): WorkPreview {
  return resolveStoreParser(reference)(page, reference);
}

async function fetchDlsitePage(reference: WorkReference): Promise<FetchedWorkPage> {
  const html = await fetchDlsiteWorkPage(reference);
  const resolvedUrl = buildDlsiteWorkUrl(reference.id);
  const fetchedUrl = reference.sourceUrl ?? resolvedUrl;

  return {
    store: "dlsite",
    html,
    fetchedUrl,
    resolvedUrl,
    pageKind: "work",
    status: 200,
  };
}

function parseDlsitePage(page: FetchedWorkPage, reference: WorkReference): WorkPreview {
  return parseDlsiteWork(page.html, reference);
}

async function fetchDmmPage(reference: WorkReference): Promise<FetchedWorkPage> {
  if (reference.kind === "url") {
    return fetchDmmWorkPage(reference);
  }

  const resolved = await probeDmmWorkPage(reference);

  if (!resolved) {
    if (reference.store === "fanza_doujin") {
      throw new WorkPreviewResolutionError(
        "fanza_url_required",
        normalizeDmmId("fanza_doujin", reference.id),
      );
    }

    return fetchDmmWorkPage(reference);
  }

  return resolved;
}

function parseDmmPage(page: FetchedWorkPage, reference: WorkReference): WorkPreview {
  return parseDmmWork(page, reference);
}
