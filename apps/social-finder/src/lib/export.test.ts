import { describe, expect, it } from "vitest";
import { recordsToCsv, recordsToJson } from "./export";
import type { AdLibraryRecord } from "./types";

const record: AdLibraryRecord = { schemaVersion: 1, key: "ad-library:1", libraryId: "1", advertiser: "=cmd", status: "active", startDate: null, runtimeDays: null, platforms: ["facebook"], text: "+SUM(A1)", destinationUrl: null, mediaUrls: [], multipleVersions: null, pageKey: "q", capturedAt: "2026-08-31T00:00:00.000Z", diagnostics: [] };

describe("safe exports", () => {
  it("neutralizes spreadsheet formulas and uses deterministic columns", () => {
    const csv = recordsToCsv([record]);
    expect(csv.startsWith("libraryId,advertiser,status,startDate,runtimeDays,platforms,text,destinationUrl,mediaUrls,multipleVersions,capturedAt\r\n")).toBe(true);
    expect(csv).toContain("'=cmd");
    expect(csv).toContain("'+SUM(A1)");
  });

  it("emits bounded versioned JSON", () => {
    expect(JSON.parse(recordsToJson([record]))).toMatchObject({ schemaVersion: 1, records: [{ libraryId: "1" }] });
    expect(() => recordsToJson(Array(501).fill(record))).toThrow("500");
  });
});
