export class FetchWorkPageError extends Error {
  readonly code: "http_error" | "network_error";
  readonly status: number | null;
  readonly rjCode: string;

  constructor(params: {
    code: "http_error" | "network_error";
    message: string;
    rjCode: string;
    status?: number | null;
    cause?: unknown;
  }) {
    super(params.message, { cause: params.cause });
    this.name = "FetchWorkPageError";
    this.code = params.code;
    this.rjCode = params.rjCode;
    this.status = params.status ?? null;
  }
}

export class ParseWorkError extends Error {
  readonly rjCode: string;

  constructor(message: string, rjCode: string) {
    super(message);
    this.name = "ParseWorkError";
    this.rjCode = rjCode;
  }
}

export class FetchSearchPageError extends Error {
  readonly code: "http_error" | "network_error" | "unexpected_page";
  readonly status: number | null;

  constructor(params: {
    code: "http_error" | "network_error" | "unexpected_page";
    message: string;
    status?: number | null;
    cause?: unknown;
  }) {
    super(params.message, { cause: params.cause });
    this.name = "FetchSearchPageError";
    this.code = params.code;
    this.status = params.status ?? null;
  }
}
