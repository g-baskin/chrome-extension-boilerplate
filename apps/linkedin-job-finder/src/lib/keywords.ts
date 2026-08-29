import type { KeywordSettings } from "./types";

export const MAX_KEYWORDS_PER_LIST = 50;
export const MAX_KEYWORD_LENGTH = 80;
export const EMPTY_KEYWORDS: KeywordSettings = { required: [], preferred: [], excluded: [] };

export function normalizeKeywordList(input: unknown): string[] {
  const values = (typeof input === "string" ? [input] : Array.isArray(input) ? input : [])
    .flatMap((value) => typeof value === "string" ? value.split(/[\n,]/) : [value]);
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values) {
    if (typeof value !== "string") continue;
    const keyword = value.trim().replace(/\s+/g, " ");
    const key = keyword.toLocaleLowerCase();
    if (!keyword || keyword.length > MAX_KEYWORD_LENGTH || seen.has(key)) continue;
    seen.add(key);
    result.push(keyword);
    if (result.length === MAX_KEYWORDS_PER_LIST) break;
  }
  return result;
}

export function normalizeKeywordSettings(input: unknown): KeywordSettings {
  const record = input && typeof input === "object" ? input as Record<string, unknown> : {};
  return {
    required: normalizeKeywordList(record.required),
    preferred: normalizeKeywordList(record.preferred),
    excluded: normalizeKeywordList(record.excluded),
  };
}
