import { describe, expect, it } from "vitest";
import { parseAdLibraryRecord } from "./ad-library";

const text = "Active Library ID: 1702938977100376 Started running on Apr 7, 2025 Platforms Facebook Instagram Multiple versions See ad details Nike Sponsored Build better shoes. Shop now";

describe("Ad Library visible record parser", () => {
  it("parses bounded visible facts without guessing", () => {
    expect(parseAdLibraryRecord({ text, links: ["https://nike.example/shoes"], media: ["https://cdn.example/ad.jpg"], pageKey: "ad-library:q=nike", capturedAt: "2026-08-31T00:00:00.000Z" })).toMatchObject({
      libraryId: "1702938977100376",
      advertiser: "Nike",
      status: "active",
      startDate: "2025-04-07",
      runtimeDays: 511,
      platforms: ["facebook", "instagram"],
      multipleVersions: true,
      destinationUrl: "https://nike.example/shoes",
      mediaUrls: ["https://cdn.example/ad.jpg"],
      pageKey: "ad-library:q=nike",
    });
  });

  it("fails closed and bounds hostile values", () => {
    const record = parseAdLibraryRecord({ text: `Library ID: 12345 ${"x".repeat(20_000)}`, links: ["javascript:alert(1)"], media: Array(20).fill("http://bad.example/a") , pageKey: "x".repeat(2_000), capturedAt: "bad" });
    expect(record).toMatchObject({ advertiser: null, status: null, startDate: null, runtimeDays: null, destinationUrl: null, mediaUrls: [] });
    expect(record?.text.length).toBeLessThanOrEqual(4_000);
    expect(record?.pageKey.length).toBeLessThanOrEqual(1_000);
  });

  it("requires a visible Library ID", () => {
    expect(parseAdLibraryRecord({ text: "Active ad", links: [], media: [], pageKey: "q", capturedAt: "2026-08-31T00:00:00.000Z" })).toBeNull();
  });
});
