import { describe, expect, it } from "vitest";
import { classifyCandidate, dedupeFindings } from "./detector";
import type { CandidateSignals } from "./types";

const feed = (overrides: Partial<CandidateSignals> = {}): CandidateSignals => ({
  surface: "feed",
  labels: [],
  links: ["https://www.facebook.com/example/posts/123"],
  title: "Example advertiser",
  snippet: "A useful product",
  ...overrides,
});

const adLibrary = (overrides: Partial<CandidateSignals> = {}): CandidateSignals => ({
  surface: "ad-library",
  labels: ["Active"],
  links: [],
  title: "Nike",
  snippet: "​ Active Library ID: 1702938977100376 Started running on Apr 7, 2025 See ad details Nike Sponsored",
  ...overrides,
});

const marketplace = (overrides: Partial<CandidateSignals> = {}): CandidateSignals => ({
  surface: "marketplace",
  labels: [],
  links: ["https://www.facebook.com/marketplace/item/987654/?ref=browse_tab"],
  title: "Oak desk · $75",
  snippet: "Used oak desk in good condition",
  ...overrides,
});

describe("Social finding classification", () => {
  it("classifies Ad Library cards by their authoritative visible ID", () => {
    expect(classifyCandidate(adLibrary())).toMatchObject({
      key: "ad-library:1702938977100376",
      kind: "ad-library-ad",
      title: "Nike",
      url: "https://www.facebook.com/ads/library/?id=1702938977100376",
      evidence: ["library-id"],
    });
    expect(classifyCandidate(adLibrary({ snippet: "An active ad without an ID" }))).toBeNull();
  });

  it("requires an exact paid-placement label for Feed findings", () => {
    expect(classifyCandidate(feed())).toBeNull();
    expect(classifyCandidate(feed({ snippet: "A post discussing sponsored events" }))).toBeNull();
    expect(classifyCandidate(feed({ labels: [" Sponsored "] }))).toMatchObject({ kind: "feed-sponsored", evidence: ["paid-label"] });
  });

  it("recognizes maintained localized paid labels", () => {
    expect(classifyCandidate(feed({ labels: ["Patrocinado"] }))?.kind).toBe("feed-sponsored");
    expect(classifyCandidate(feed({ labels: ["Gesponsert"] }))?.kind).toBe("feed-sponsored");
  });

  it("classifies Marketplace listings and promoted listings separately", () => {
    expect(classifyCandidate(marketplace())).toMatchObject({ kind: "marketplace-listing", key: "marketplace:987654" });
    expect(classifyCandidate(marketplace({ labels: ["Promoted"] }))).toMatchObject({
      kind: "marketplace-sponsored",
      evidence: ["marketplace-item-link", "paid-label"],
    });
  });

  it("rejects Marketplace candidates without a canonical item link", () => {
    expect(classifyCandidate(marketplace({ links: ["https://example.com/marketplace/item/987654/"] }))).toBeNull();
  });

  it("deduplicates findings and enforces the result cap", () => {
    const first = classifyCandidate(marketplace());
    const second = classifyCandidate(marketplace({ title: "Duplicate card" }));
    const third = classifyCandidate(marketplace({ links: ["https://www.facebook.com/marketplace/item/222/"] }));
    expect(first && second && third ? dedupeFindings([first, second, third], 2).map(({ key }) => key) : []).toEqual([
      "marketplace:987654",
      "marketplace:222",
    ]);
  });
});
