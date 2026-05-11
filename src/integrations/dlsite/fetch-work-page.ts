import { getEnv } from "../../config/env";
import { FetchWorkPageError } from "./errors";

export function buildWorkUrl(rjCode: string): string {
  return `https://www.dlsite.com/maniax/work/=/product_id/${rjCode.toUpperCase()}.html`;
}

type FetchLike = typeof fetch;

type FetchWorkPageOptions = {
  fetchImpl?: FetchLike;
  userAgent?: string;
};

export async function fetchWorkPage(
  rjCode: string,
  options: FetchWorkPageOptions = {},
): Promise<string> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const targetUrl = buildWorkUrl(rjCode);

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
      message: `Failed to fetch DLSite page for ${rjCode}`,
      rjCode,
      cause: error,
    });
  }

  if (!response.ok) {
    throw new FetchWorkPageError({
      code: "http_error",
      message: `Unexpected status ${response.status} for ${rjCode}`,
      rjCode,
      status: response.status,
    });
  }

  return response.text();
}
