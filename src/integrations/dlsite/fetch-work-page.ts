import type { WorkReference } from "../../domain/rj/types";
import { getEnv } from "../../config/env";
import { FetchWorkPageError } from "./errors";

const DLSITE_HOST = "www.dlsite.com";
const DLSITE_WORK_ID_PATTERN = /^(RJ|BJ|VJ)\d{6,8}$/i;

export function isDlsiteWorkId(value: string): boolean {
  return DLSITE_WORK_ID_PATTERN.test(value);
}

export function buildWorkUrl(reference: WorkReference | string): string {
  const workId = typeof reference === "string" ? reference : reference.id;
  const normalizedId = workId.toUpperCase();

  return `https://${DLSITE_HOST}/${resolveSurface(normalizedId)}/work/=/product_id/${normalizedId}.html`;
}

export function extractDlsiteReferenceFromUrl(rawUrl: string): WorkReference | null {
  let parsedUrl: URL;

  try {
    parsedUrl = new URL(rawUrl);
  } catch {
    return null;
  }

  if (parsedUrl.hostname !== DLSITE_HOST) {
    return null;
  }

  const match = parsedUrl.pathname.match(
    /^\/(maniax|books|pro)\/work\/=\/product_id\/((?:RJ|BJ|VJ)\d{6,8})\.html$/i,
  );

  if (!match) {
    return null;
  }

  const surface = match[1].toLowerCase();
  const workId = match[2].toUpperCase();

  if (surface !== resolveSurface(workId)) {
    return null;
  }

  return isDlsiteWorkId(workId)
    ? {
        store: "dlsite",
        id: workId,
        kind: "url",
        sourceUrl: rawUrl,
        matchedText: rawUrl,
      }
    : null;
}

type FetchLike = typeof fetch;

type FetchWorkPageOptions = {
  fetchImpl?: FetchLike;
  userAgent?: string;
};

export async function fetchWorkPage(
  reference: WorkReference | string,
  options: FetchWorkPageOptions = {},
): Promise<string> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const workId = typeof reference === "string" ? reference : reference.id;
  const targetUrl = buildWorkUrl(reference);

  let response: Response;

  try {
    response = await fetchImpl(targetUrl, {
      headers: {
        "user-agent": options.userAgent ?? getEnv().DLSITE_USER_AGENT,
      },
    });
  } catch (error) {
    throw new FetchWorkPageError({
      code: "network_error",
      message: `Failed to fetch DLSite page for ${workId}`,
      rjCode: workId,
      cause: error,
    });
  }

  if (!response.ok) {
    throw new FetchWorkPageError({
      code: "http_error",
      message: `Unexpected status ${response.status} for ${workId}`,
      rjCode: workId,
      status: response.status,
    });
  }

  return response.text();
}

function resolveSurface(workId: string): "maniax" | "books" | "pro" {
  if (workId.startsWith("BJ")) {
    return "books";
  }

  if (workId.startsWith("VJ")) {
    return "pro";
  }

  return "maniax";
}
