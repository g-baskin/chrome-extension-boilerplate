import { getLibraryIds, normalizeSignal } from "./detector";
import type { AdLibraryRecord, AdPlatform, AdStatus } from "./types";

const PLATFORM_LABELS: Array<[RegExp, AdPlatform]> = [
  [/\bfacebook\b/i, "facebook"], [/\binstagram\b/i, "instagram"], [/\bmessenger\b/i, "messenger"], [/\baudience network\b/i, "audience-network"],
];
const MONTHS: Record<string, number> = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };

function httpsUrl(raw: string): string | null {
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" || url.username || url.password || url.href.length > 2_048) return null;
    url.hash = "";
    return url.toString();
  } catch { return null; }
}

function visibleStartDate(text: string): string | null {
  const match = text.match(/(?:started running on|start date)\s+([A-Za-z]{3,9})\s+(\d{1,2}),\s*(\d{4})/i);
  if (!match) return null;
  const month = MONTHS[match[1]?.slice(0, 3).toLowerCase() ?? ""];
  if (month === undefined) return null;
  const day = Number(match[2]);
  const year = Number(match[3]);
  const date = new Date(Date.UTC(year, month, day));
  return date.getUTCFullYear() !== year || date.getUTCMonth() !== month || date.getUTCDate() !== day ? null : date.toISOString().slice(0, 10);
}

function runtimeDays(startDate: string | null, capturedAt: string): number | null {
  if (!startDate || !/^\d{4}-\d{2}-\d{2}T/.test(capturedAt)) return null;
  const elapsed = Date.parse(capturedAt) - Date.parse(`${startDate}T00:00:00.000Z`);
  return Number.isFinite(elapsed) && elapsed >= 0 ? Math.floor(elapsed / 86_400_000) : null;
}

export interface AdLibraryInput { text: string; links: string[]; media: string[]; pageKey: string; capturedAt: string }

export function parseAdLibraryRecord(input: AdLibraryInput): AdLibraryRecord | null {
  const text = normalizeSignal(input.text, 4_000);
  const libraryId = getLibraryIds(text)[0];
  if (!libraryId) return null;
  const advertiserMatch = text.match(/\bSee ad details\s+(.{1,160}?)\s+Sponsored\b/i);
  const advertiser = advertiserMatch?.[1] ? normalizeSignal(advertiserMatch[1], 160) || null : null;
  const status: AdStatus | null = /\binactive\b/i.test(text) ? "inactive" : /\bactive\b/i.test(text) ? "active" : null;
  const startDate = visibleStartDate(text);
  const platforms = PLATFORM_LABELS.filter(([pattern]) => pattern.test(text)).map(([, platform]) => platform);
  const links = input.links.map(httpsUrl).filter((value): value is string => Boolean(value));
  const destinationUrl = links.find((url) => !new URL(url).hostname.endsWith("facebook.com")) ?? null;
  const mediaUrls = [...new Set(input.media.map(httpsUrl).filter((value): value is string => Boolean(value)))].slice(0, 8);
  return {
    schemaVersion: 1, key: `ad-library:${libraryId}`, libraryId, advertiser, status, startDate,
    runtimeDays: runtimeDays(startDate, input.capturedAt), platforms, text, destinationUrl, mediaUrls,
    multipleVersions: /\bmultiple versions?\b/i.test(text) ? true : null,
    pageKey: normalizeSignal(input.pageKey, 1_000),
    capturedAt: /^\d{4}-\d{2}-\d{2}T/.test(input.capturedAt) ? input.capturedAt : new Date(0).toISOString(),
    diagnostics: [!advertiser ? "advertiser-unavailable" : "", !startDate ? "start-date-unavailable" : ""].filter(Boolean),
  };
}
