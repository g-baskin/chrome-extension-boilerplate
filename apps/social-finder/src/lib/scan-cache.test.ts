import { describe, expect, it, vi } from "vitest";
import { createWeakExtractorCache, respondToFinderRequest } from "./scan-cache";
import type { FinderSnapshot } from "./types";

const snapshot: FinderSnapshot = { schemaVersion: 1, pageKey: "ad-library:q=nike", surface: "ad-library", findings: [], adLibraryRecords: [], diagnostics: { candidates: 0, rejected: 0, detected: 0, renderFailures: 0 } };

describe("scan cache", () => {
  it("reuses extraction for an unchanged connected card", () => {
    const cache = createWeakExtractorCache<object, string, string>();
    const card = {};
    const extract = vi.fn(() => "signals");
    expect(cache.get(card, "fingerprint-1", extract)).toBe("signals");
    expect(cache.get(card, "fingerprint-1", extract)).toBe("signals");
    expect(extract).toHaveBeenCalledTimes(1);
  });

  it("reduces five unchanged 200-card passes from 1,000 extractions to 200", () => {
    const cache = createWeakExtractorCache<object, string, number>();
    const cards = Array.from({ length: 200 }, () => ({}));
    const extract = vi.fn(() => 1);
    for (let pass = 0; pass < 5; pass += 1) for (const card of cards) cache.get(card, "stable", extract);
    expect(extract).toHaveBeenCalledTimes(200);
  });

  it("refreshes extraction after the card fingerprint changes", () => {
    const cache = createWeakExtractorCache<object, string, number>();
    const card = {};
    const extract = vi.fn().mockReturnValueOnce(1).mockReturnValueOnce(2);
    expect(cache.get(card, "before", extract)).toBe(1);
    expect(cache.get(card, "after", extract)).toBe(2);
    expect(extract).toHaveBeenCalledTimes(2);
  });

  it("serves GET from the cached snapshot and reserves work for RESCAN", () => {
    const rescan = vi.fn(() => ({ ...snapshot, pageKey: "rescanned" }));
    expect(respondToFinderRequest({ schemaVersion: 1, type: "GET_SOCIAL_FINDINGS" }, snapshot, rescan)).toBe(snapshot);
    expect(rescan).not.toHaveBeenCalled();
    expect(respondToFinderRequest({ schemaVersion: 1, type: "GET_SOCIAL_FINDINGS" }, snapshot, rescan, true).pageKey).toBe("rescanned");
    expect(respondToFinderRequest({ schemaVersion: 1, type: "RESCAN_SOCIAL_FINDINGS" }, snapshot, rescan).pageKey).toBe("rescanned");
    expect(rescan).toHaveBeenCalledTimes(2);
  });
});
