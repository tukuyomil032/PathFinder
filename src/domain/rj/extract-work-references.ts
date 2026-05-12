import type { WorkReference } from "./types";
import {
  extractDlsiteReferenceFromUrl,
  isDlsiteWorkId,
} from "../../integrations/dlsite/fetch-work-page";
import {
  extractDmmReferenceFromUrl,
  isDmmTvContentId,
  isFanzaBooksProductCode,
  isFanzaPcGameSlug,
} from "../../integrations/dmm/fetch-work-page";

const DLSITE_CODE_PATTERN = /\b((?:rj|bj|vj)\d{6,8})\b/gi;
const URL_PATTERN = /https?:\/\/[^\s]+/gi;
const FANZA_DOUJIN_PATTERN = /\b(d_\d{3,})\b/gi;
const FANZA_PCGAME_PATTERN = /\b([a-z][a-z0-9]{1,}_[0-9]{3,})\b/gi;
const FANZA_BOOKS_PATTERN = /\b(b\d{3,}[a-z]{2,}[a-z0-9]*\d{3,})\b/gi;
const DMM_TV_PATTERNS = [
  /\b([a-z]{3,8}\d{4,6})\b/gi,
  /\b(\d[a-z]{3,8}\d{4,6})\b/gi,
  /\b([a-z]_\d[a-z0-9]{5,})\b/gi,
] as const;

type IndexedReference = WorkReference & { index: number };

export function extractWorkReferences(message: string): WorkReference[] {
  const matches: IndexedReference[] = [];

  for (const match of message.matchAll(URL_PATTERN)) {
    const rawUrl = trimTrailingPunctuation(match[0]);
    const index = match.index;

    if (index === undefined) {
      continue;
    }

    const reference = extractDlsiteReferenceFromUrl(rawUrl) ?? extractDmmReferenceFromUrl(rawUrl);

    if (!reference) {
      continue;
    }

    matches.push({
      ...reference,
      matchedText: rawUrl,
      index,
    });
  }

  pushBareMatches(message, matches, DLSITE_CODE_PATTERN, (raw) =>
    isDlsiteWorkId(raw)
      ? {
          store: "dlsite",
          id: raw.toUpperCase(),
          kind: "code",
          matchedText: raw,
        }
      : null,
  );

  pushBareMatches(message, matches, FANZA_DOUJIN_PATTERN, (raw) => ({
    store: "fanza_doujin",
    id: raw.toLowerCase(),
    kind: "code",
    matchedText: raw,
  }));

  pushBareMatches(message, matches, FANZA_PCGAME_PATTERN, (raw) => {
    const normalized = raw.toLowerCase();
    return isFanzaPcGameSlug(normalized)
      ? {
          store: "fanza_pcgame",
          id: normalized,
          kind: "code",
          matchedText: raw,
        }
      : null;
  });

  pushBareMatches(message, matches, FANZA_BOOKS_PATTERN, (raw) => {
    const normalized = raw.toLowerCase();
    return isFanzaBooksProductCode(normalized)
      ? {
          store: "fanza_books",
          id: normalized,
          kind: "code",
          matchedText: raw,
        }
      : null;
  });

  for (const pattern of DMM_TV_PATTERNS) {
    pushBareMatches(message, matches, pattern, (raw) => {
      const normalized = raw.toLowerCase();
      return isDmmTvContentId(normalized)
        ? {
            store: "dmm_tv_av",
            id: normalized,
            kind: "code",
            matchedText: raw,
          }
        : null;
    });
  }

  return matches
    .sort((left, right) => left.index - right.index)
    .map(({ index: _index, ...reference }) => reference);
}

function pushBareMatches(
  message: string,
  matches: IndexedReference[],
  pattern: RegExp,
  buildReference: (raw: string) => Omit<IndexedReference, "index"> | null,
): void {
  for (const match of message.matchAll(pattern)) {
    const raw = match[0];
    const index = match.index;

    if (index === undefined || hasOverlap(index, raw.length, matches)) {
      continue;
    }

    const reference = buildReference(raw);

    if (!reference) {
      continue;
    }

    matches.push({
      ...reference,
      index,
    });
  }
}

function hasOverlap(index: number, length: number, matches: IndexedReference[]): boolean {
  return matches.some((match) => {
    const sourceLength = match.sourceUrl?.length ?? match.matchedText.length;
    const start = match.index;
    const end = start + sourceLength;
    return index < end && index + length > start;
  });
}

function trimTrailingPunctuation(value: string): string {
  return value.replace(/[)>.,!?]+$/g, "");
}
