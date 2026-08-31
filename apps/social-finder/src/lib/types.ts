export type Surface = "ad-library" | "feed" | "marketplace" | "unsupported";
export type FindingKind = "ad-library-ad" | "feed-sponsored" | "marketplace-listing" | "marketplace-sponsored";
export type Evidence = "library-id" | "paid-label" | "marketplace-item-link";
export type AdStatus = "active" | "inactive";
export type AdPlatform = "facebook" | "instagram" | "messenger" | "audience-network";

export interface CandidateSignals {
  surface: Exclude<Surface, "unsupported">;
  labels: string[];
  links: string[];
  media?: string[];
  title: string;
  snippet: string;
  fullText?: string;
}

export interface Finding {
  key: string;
  kind: FindingKind;
  surface: Exclude<Surface, "unsupported">;
  title: string;
  snippet: string;
  url: string | null;
  evidence: Evidence[];
}

export interface AdLibraryRecord {
  schemaVersion: 1;
  key: string;
  libraryId: string;
  advertiser: string | null;
  status: AdStatus | null;
  startDate: string | null;
  runtimeDays: number | null;
  platforms: AdPlatform[];
  text: string;
  destinationUrl: string | null;
  mediaUrls: string[];
  multipleVersions: boolean | null;
  pageKey: string;
  capturedAt: string;
  diagnostics: string[];
}

export interface Diagnostics {
  candidates: number;
  rejected: number;
  detected: number;
  renderFailures: number;
}

export interface FinderSnapshot {
  schemaVersion: 1;
  pageKey: string;
  surface: Surface;
  findings: Finding[];
  adLibraryRecords: AdLibraryRecord[];
  diagnostics: Diagnostics;
}

export type FinderRequest = { schemaVersion: 1; type: "GET_SOCIAL_FINDINGS" | "RESCAN_SOCIAL_FINDINGS" };
export type FinderUpdate = { schemaVersion: 1; type: "SOCIAL_FINDINGS_UPDATED"; snapshot: FinderSnapshot };
