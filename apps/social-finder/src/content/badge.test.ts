import { describe, expect, it } from "vitest";
import { badgeLabel } from "./badge";
import type { Finding } from "../lib/types";

const finding: Finding = { key: "ad-library:1", kind: "ad-library-ad", surface: "ad-library", title: "Nike", snippet: "Visible ad", url: "https://www.facebook.com/ads/library/?id=1", evidence: ["library-id"] };

describe("Ad Library badge label", () => {
  it("shows the computed running days directly in the card badge", () => {
    expect(badgeLabel(finding, 42)).toBe("Social Finder · Ad Library ad · Running 42 days");
    expect(badgeLabel(finding, 1)).toBe("Social Finder · Ad Library ad · Running 1 day");
  });

  it("preserves the existing label when runtime is unavailable", () => {
    expect(badgeLabel(finding, null)).toBe("Social Finder · Ad Library ad");
  });
});
