import { canonicalMarketplaceItemUrl } from "./facebook-url";
import type { CandidateSignals, Finding } from "./types";

const PAID_LABELS = new Set([
  "sponsored",
  "promoted",
  "gesponsert",
  "patrocinado",
  "sponsorisé",
  "sponsorisée",
]);

export function normalizeSignal(value: string, max = 240): string {
  return value.replace(/[\u200B-\u200D\uFEFF]/g, "").replace(/\s+/g, " ").trim().slice(0, max);
}

export function getLibraryIds(value: string): string[] {
  return [...value.matchAll(/(?:library id|id de la biblioteca|identificação da biblioteca)\s*:\s*(\d{5,30})/gi)]
    .map((match) => match[1])
    .filter((id): id is string => Boolean(id));
}

function hasPaidLabel(labels: string[]): boolean {
  return labels.some((label) => PAID_LABELS.has(normalizeSignal(label, 50).toLocaleLowerCase()));
}

function stableKey(parts: string[]): string {
  let hash = 0x811c9dc5;
  for (const character of parts.join("\u001f")) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}

export function classifyCandidate(signals: CandidateSignals): Finding | null {
  const paid = hasPaidLabel(signals.labels);
  const marketplaceUrl = signals.links.map(canonicalMarketplaceItemUrl).find(Boolean) ?? null;
  const title = normalizeSignal(signals.title, 160) || "Untitled result";
  const snippet = normalizeSignal(signals.snippet);

  if (signals.surface === "ad-library") {
    const libraryId = getLibraryIds(snippet)[0] ?? null;
    if (!libraryId) return null;
    const advertiser = snippet.match(/\bSee ad details\s+(.{1,120}?)\s+Sponsored\b/i)?.[1];
    return {
      key: `ad-library:${libraryId}`,
      kind: "ad-library-ad",
      surface: "ad-library",
      title: normalizeSignal(advertiser ?? title, 160),
      snippet,
      url: `https://www.facebook.com/ads/library/?id=${libraryId}`,
      evidence: ["library-id"],
    };
  }

  if (signals.surface === "feed") {
    if (!paid) return null;
    return {
      key: `feed:${stableKey([title, snippet, signals.links[0] ?? ""])}`,
      kind: "feed-sponsored",
      surface: "feed",
      title,
      snippet,
      url: signals.links[0] ?? null,
      evidence: ["paid-label"],
    };
  }

  if (!marketplaceUrl) return null;
  const id = marketplaceUrl.match(/\/item\/(\d+)\//)?.[1] ?? stableKey([marketplaceUrl]);
  return {
    key: `marketplace:${id}`,
    kind: paid ? "marketplace-sponsored" : "marketplace-listing",
    surface: "marketplace",
    title,
    snippet,
    url: marketplaceUrl,
    evidence: paid ? ["marketplace-item-link", "paid-label"] : ["marketplace-item-link"],
  };
}

export function dedupeFindings(findings: Finding[], max = 100): Finding[] {
  const unique = new Map<string, Finding>();
  for (const finding of findings) {
    if (!unique.has(finding.key)) unique.set(finding.key, finding);
    if (unique.size === max) break;
  }
  return [...unique.values()];
}
