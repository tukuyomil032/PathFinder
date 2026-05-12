export class FetchFanzaPageError extends Error {
  readonly code: "http_error" | "network_error" | "unexpected_page";
  readonly status: number | null;
  readonly cid: string;

  constructor(params: {
    code: "http_error" | "network_error" | "unexpected_page";
    message: string;
    cid: string;
    status?: number | null;
    cause?: unknown;
  }) {
    super(params.message, { cause: params.cause });
    this.name = "FetchFanzaPageError";
    this.code = params.code;
    this.cid = params.cid;
    this.status = params.status ?? null;
  }
}

export class ParseFanzaWorkError extends Error {
  readonly cid: string;

  constructor(message: string, cid: string) {
    super(message);
    this.name = "ParseFanzaWorkError";
    this.cid = cid;
  }
}
