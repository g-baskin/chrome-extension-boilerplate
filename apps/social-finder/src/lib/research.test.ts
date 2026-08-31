import { describe, expect, it } from "vitest";
import { analysisPrompt, searchIdeas } from "./research";
import type { AdLibraryRecord } from "./types";

const record: AdLibraryRecord = { schemaVersion: 1, key: "ad-library:1", libraryId: "1", advertiser: null, status: "active", startDate: null, runtimeDays: null, platforms: [], text: "Visible copy", destinationUrl: null, mediaUrls: [], multipleVersions: null, pageKey: "q", capturedAt: "2026-08-31T00:00:00.000Z", diagnostics: [] };

describe("local research helpers", () => {
  it("composes editable bounded ideas without a remote call", () => {
    expect(searchIdeas("running", "shoe")).toMatchObject({ keywords: ["running shoe", "running shoe benefits", "running shoe alternatives"] });
    expect(() => searchIdeas("", "shoe")).toThrow("niche");
  });

  it("labels unknown facts instead of inventing them", () => {
    const prompt = analysisPrompt(record);
    expect(prompt).toContain("Visible copy");
    expect(prompt).toContain("Unknown facts: advertiser, start date, runtime, platforms, destination, media, multiple-version state");
    expect(prompt).not.toContain("impressions");
  });
});
