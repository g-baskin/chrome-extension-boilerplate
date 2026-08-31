import { describe, expect, it } from "vitest";
import { acceptsTabUpdate, isFinderSnapshot } from "./messages";

const snapshot = { schemaVersion: 1 as const, pageKey: "ad-library:q=nike", surface: "ad-library" as const, findings: [], adLibraryRecords: [], diagnostics: { candidates: 0, rejected: 0, detected: 0, renderFailures: 0 } };

describe("finder message boundary", () => {
  it("accepts only versioned bounded snapshots", () => {
    expect(isFinderSnapshot(snapshot)).toBe(true);
    expect(isFinderSnapshot({ ...snapshot, schemaVersion: 2 })).toBe(false);
    expect(isFinderSnapshot({ ...snapshot, findings: Array(101).fill({}) })).toBe(false);
    expect(isFinderSnapshot({ ...snapshot, findings: [{ key: "x", kind: "feed-sponsored", surface: "feed", title: "x", snippet: "x", url: "javascript:alert(1)", evidence: ["paid-label"] }] })).toBe(false);
    expect(isFinderSnapshot({ ...snapshot, adLibraryRecords: [{ schemaVersion: 1, key: "ad:1", libraryId: "1", advertiser: null, status: null, startDate: null, runtimeDays: null, platforms: [], text: "x", destinationUrl: "https://user:pass@example.com/", mediaUrls: [], multipleVersions: null, pageKey: "x", capturedAt: "2026-08-31T00:00:00.000Z", diagnostics: [] }] })).toBe(false);
    expect(isFinderSnapshot({ ...snapshot, diagnostics: { ...snapshot.diagnostics, candidates: -1 } })).toBe(false);
  });

  it("accepts push updates only from the active tab", () => {
    expect(acceptsTabUpdate(7, 7)).toBe(true);
    expect(acceptsTabUpdate(7, 8)).toBe(false);
    expect(acceptsTabUpdate(7, undefined)).toBe(false);
  });
});
