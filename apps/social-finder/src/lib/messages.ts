import { decodeSavedRecords } from "./storage";
import type { FinderSnapshot, Finding } from "./types";

const FINDING_KINDS = new Set(["ad-library-ad", "feed-sponsored", "marketplace-listing", "marketplace-sponsored"]);
const SURFACES = new Set(["ad-library", "feed", "marketplace"]);
const EVIDENCE = new Set(["library-id", "paid-label", "marketplace-item-link"]);

function isSafeHttps(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 2_048) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password;
  } catch { return false; }
}

function isFinding(value: unknown): value is Finding {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<Finding>;
  return typeof item.key === "string" && item.key.length <= 100
    && FINDING_KINDS.has(item.kind ?? "")
    && SURFACES.has(item.surface ?? "")
    && typeof item.title === "string" && item.title.length <= 160
    && typeof item.snippet === "string" && item.snippet.length <= 240
    && (item.url === null || isSafeHttps(item.url))
    && Array.isArray(item.evidence) && item.evidence.length <= 3 && item.evidence.every((entry) => EVIDENCE.has(entry));
}

export function acceptsTabUpdate(activeTabId: number | undefined, senderTabId: number | undefined): boolean {
  return activeTabId !== undefined && senderTabId === activeTabId;
}

export function isFinderSnapshot(value: unknown): value is FinderSnapshot {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<FinderSnapshot>;
  const diagnostics = item.diagnostics;
  return item.schemaVersion === 1
    && typeof item.pageKey === "string" && item.pageKey.length <= 1_000
    && ["ad-library", "feed", "marketplace", "unsupported"].includes(item.surface ?? "")
    && Array.isArray(item.findings) && item.findings.length <= 100 && item.findings.every(isFinding)
    && Array.isArray(item.adLibraryRecords) && item.adLibraryRecords.length <= 200
    && decodeSavedRecords({ schemaVersion: 1, records: item.adLibraryRecords }).length === item.adLibraryRecords.length
    && Boolean(diagnostics)
    && [diagnostics?.candidates, diagnostics?.rejected, diagnostics?.detected, diagnostics?.renderFailures].every((count) => Number.isInteger(count) && Number(count) >= 0 && Number(count) <= 10_000);
}
