import { describe, expect, it } from "vitest";
import { DEFAULT_PREFERENCES, decodePreferences, decodeSavedRecords, socialFinderStorageKeys } from "./storage";
import type { AdLibraryRecord } from "./types";

const record: AdLibraryRecord = { schemaVersion: 1, key: "ad-library:1", libraryId: "1", advertiser: "Nike", status: "active", startDate: null, runtimeDays: null, platforms: [], text: "Ad", destinationUrl: null, mediaUrls: [], multipleVersions: null, pageKey: "q", capturedAt: "2026-08-31T00:00:00.000Z", diagnostics: [] };

describe("saved-record storage boundary", () => {
  it("accepts only bounded versioned records", () => {
    expect(decodeSavedRecords({ schemaVersion: 1, records: [record] })).toEqual([record]);
    expect(decodeSavedRecords({ schemaVersion: 2, records: [record] })).toEqual([]);
    expect(decodeSavedRecords({ schemaVersion: 1, records: Array(501).fill(record) })).toEqual([]);
    expect(decodeSavedRecords({ schemaVersion: 1, records: [{ ...record, destinationUrl: "javascript:bad" }] })).toEqual([]);
    expect(decodeSavedRecords({ schemaVersion: 1, records: [{ ...record, destinationUrl: "https://user:pass@example.com/" }] })).toEqual([]);
    expect(decodeSavedRecords({ schemaVersion: 1, records: [{ ...record, platforms: ["unknown"] }] })).toEqual([]);
    expect(decodeSavedRecords({ schemaVersion: 1, records: [{ ...record, diagnostics: [42] }] })).toEqual([]);
  });

  it("rejects malformed nested preferences", () => {
    expect(decodePreferences({ schemaVersion: 1, density: "compact", collectionCap: 500, diagnosticsExpanded: false, filters: { status: "evil" } })).toBe(DEFAULT_PREFERENCES);
  });

  it("exposes only Social Finder versioned keys for clearing", () => {
    expect(socialFinderStorageKeys()).toEqual(["socialFinder.v1.savedAds", "socialFinder.v1.preferences"]);
  });
});
