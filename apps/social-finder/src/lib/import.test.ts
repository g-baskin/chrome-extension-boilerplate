import { describe, expect, it } from "vitest";
import { mergeImportedRecords, parseSocialFinderImport } from "./import";
import type { AdLibraryRecord } from "./types";

const record: AdLibraryRecord = { schemaVersion: 1, key: "ad-library:1", libraryId: "1", advertiser: "Nike", status: "active", startDate: null, runtimeDays: null, platforms: [], text: "Ad", destinationUrl: null, mediaUrls: [], multipleVersions: null, pageKey: "q", capturedAt: "2026-08-31T00:00:00.000Z", diagnostics: [] };

describe("Social Finder import", () => {
  it("validates own versioned JSON and previews duplicates", () => {
    expect(parseSocialFinderImport(JSON.stringify({ schemaVersion: 1, records: [record] }), [record])).toMatchObject({ records: [record], duplicates: 1, newRecords: 0 });
  });

  it("merges new records without replacing an existing duplicate", () => {
    const imported = { ...record, advertiser: "Imported replacement" };
    expect(mergeImportedRecords([record], [imported, { ...record, key: "ad-library:2", libraryId: "2" }])).toEqual([record, { ...record, key: "ad-library:2", libraryId: "2" }]);
  });

  it("rejects corrupt, unsupported, or oversized input", () => {
    expect(() => parseSocialFinderImport("{", [])).toThrow("valid JSON");
    expect(() => parseSocialFinderImport(JSON.stringify({ schemaVersion: 2, records: [] }), [])).toThrow("versioned");
    expect(() => parseSocialFinderImport("x".repeat(5_000_001), [])).toThrow("5 MB");
  });
});
