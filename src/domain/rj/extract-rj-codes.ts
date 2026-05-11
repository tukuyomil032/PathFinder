const RJ_CODE_PATTERN = /\b(rj\d{6,8})\b/gi;

export function extractRjCodes(message: string): string[] {
  const matches = message.match(RJ_CODE_PATTERN);

  if (!matches) {
    return [];
  }

  return matches.map((code) => code.toUpperCase());
}
