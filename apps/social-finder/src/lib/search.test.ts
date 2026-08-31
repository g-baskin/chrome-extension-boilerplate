import { describe, expect, it } from "vitest";
import { buildAdLibrarySearchUrl } from "./search";

describe("Ad Library search builder", () => {
  it("builds a public search URL from validated controls", () => {
    expect(buildAdLibrarySearchUrl({ keyword: " running shoes ", country: "US", adType: "all", activeStatus: "active" })).toBe("https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=US&q=running+shoes&search_type=keyword_unordered");
  });

  it("rejects missing, oversized, or invalid controls", () => {
    expect(() => buildAdLibrarySearchUrl({ keyword: "", country: "US", adType: "all", activeStatus: "all" })).toThrow("keyword");
    expect(() => buildAdLibrarySearchUrl({ keyword: "x".repeat(201), country: "US", adType: "all", activeStatus: "all" })).toThrow("keyword");
    expect(() => buildAdLibrarySearchUrl({ keyword: "shoes", country: "USA", adType: "all", activeStatus: "all" })).toThrow("country");
  });
});
