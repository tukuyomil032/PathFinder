import { extractWorkReferences } from "./extract-work-references";

// Backward-compatible wrapper: now returns all supported DLSite ids, not only RJ codes.
export function extractRjCodes(message: string): string[] {
  return extractWorkReferences(message)
    .filter((reference) => reference.store === "dlsite")
    .map((reference) => reference.id);
}
