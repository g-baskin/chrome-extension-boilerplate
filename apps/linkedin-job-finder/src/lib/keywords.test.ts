import { describe, expect, it } from "vitest";
import { MAX_KEYWORD_LENGTH, MAX_KEYWORDS_PER_LIST, normalizeKeywordList, normalizeKeywordSettings } from "./keywords";

describe("keyword normalization", () => {
  it("splits, trims, deduplicates case-insensitively, and preserves first spelling", () => {
    expect(normalizeKeywordList(" React,typescript\n react , Node.js ")).toEqual(["React", "typescript", "Node.js"]);
  });

  it("rejects malformed and oversized entries and caps each list", () => {
    expect(normalizeKeywordList(null)).toEqual([]);
    expect(normalizeKeywordList(["x".repeat(MAX_KEYWORD_LENGTH + 1), 3, "ok, another"])).toEqual(["ok", "another"]);
    expect(normalizeKeywordList(Array.from({ length: 80 }, (_, index) => `term ${index}`))).toHaveLength(MAX_KEYWORDS_PER_LIST);
  });

  it("normalizes malformed settings", () => {
    expect(normalizeKeywordSettings({ required: "React, React", preferred: 3, excluded: ["agency"], excludeClearanceRequired: true }))
      .toEqual({ required: ["React"], preferred: [], excluded: ["agency"], excludeClearanceRequired: true });
    expect(normalizeKeywordSettings({ excludeClearanceRequired: "yes" })).toMatchObject({ excludeClearanceRequired: false });
    expect(normalizeKeywordSettings({ excludeActiveClearance: true })).toMatchObject({ excludeClearanceRequired: true });
  });
});
