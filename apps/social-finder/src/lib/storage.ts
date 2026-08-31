import type { AdLibraryRecord } from "./types";
import { DEFAULT_FILTERS } from "./workspace";
import type { WorkspaceFilters } from "./workspace";

const SAVED_KEY = "socialFinder.v1.savedAds";
const PREFERENCES_KEY = "socialFinder.v1.preferences";
export function socialFinderStorageKeys(): string[] { return [SAVED_KEY, PREFERENCES_KEY]; }

function safeHttps(value: unknown): boolean {
  if (value === null) return true;
  if (typeof value !== "string" || value.length > 2_048) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password;
  } catch { return false; }
}

function isRecord(value: unknown): value is AdLibraryRecord {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<AdLibraryRecord>;
  return item.schemaVersion === 1 && typeof item.key === "string" && item.key.length <= 100
    && typeof item.libraryId === "string" && /^\d{1,30}$/.test(item.libraryId)
    && (item.advertiser === null || (typeof item.advertiser === "string" && item.advertiser.length <= 160))
    && (item.status === null || item.status === "active" || item.status === "inactive")
    && typeof item.text === "string" && item.text.length <= 4_000
    && safeHttps(item.destinationUrl)
    && Array.isArray(item.mediaUrls) && item.mediaUrls.length <= 8 && item.mediaUrls.every(safeHttps)
    && Array.isArray(item.platforms) && item.platforms.length <= 4 && item.platforms.every((platform) => ["facebook", "instagram", "messenger", "audience-network"].includes(platform))
    && (item.startDate === null || (typeof item.startDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(item.startDate)))
    && (item.runtimeDays === null || (Number.isInteger(item.runtimeDays) && Number(item.runtimeDays) >= 0 && Number(item.runtimeDays) <= 100_000))
    && (item.multipleVersions === null || typeof item.multipleVersions === "boolean")
    && typeof item.pageKey === "string" && item.pageKey.length <= 1_000
    && typeof item.capturedAt === "string" && item.capturedAt.length <= 40
    && Array.isArray(item.diagnostics) && item.diagnostics.length <= 20 && item.diagnostics.every((entry) => typeof entry === "string" && entry.length <= 100);
}

export function decodeSavedRecords(value: unknown): AdLibraryRecord[] {
  if (!value || typeof value !== "object") return [];
  const item = value as { schemaVersion?: unknown; records?: unknown };
  return item.schemaVersion === 1 && Array.isArray(item.records) && item.records.length <= 500 && item.records.every(isRecord) ? item.records : [];
}

export async function loadSavedRecords(): Promise<AdLibraryRecord[]> {
  const stored = await chrome.storage.local.get(SAVED_KEY);
  return decodeSavedRecords(stored[SAVED_KEY]);
}

export async function saveRecords(records: AdLibraryRecord[]): Promise<void> {
  if (records.length > 500 || !records.every(isRecord)) throw new Error("Saved ads must contain at most 500 valid records.");
  await chrome.storage.local.set({ [SAVED_KEY]: { schemaVersion: 1, records } });
}

export interface Preferences { filters: WorkspaceFilters; density: "compact" | "comfortable"; collectionCap: number; diagnosticsExpanded: boolean }
export const DEFAULT_PREFERENCES: Preferences = { filters: DEFAULT_FILTERS, density: "compact", collectionCap: 500, diagnosticsExpanded: false };

function validFilters(value: unknown): value is WorkspaceFilters {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<WorkspaceFilters>;
  return ["all", "active", "inactive"].includes(item.status ?? "")
    && [item.minRuntime, item.maxRuntime].every((number) => number === null || (Number.isInteger(number) && Number(number) >= 0 && Number(number) <= 10_000))
    && ["all", "facebook", "instagram", "messenger", "audience-network"].includes(item.platform ?? "")
    && typeof item.advertiser === "string" && item.advertiser.length <= 200
    && ["all", "yes", "no"].includes(item.hasMedia ?? "") && ["all", "yes", "no"].includes(item.multipleVersions ?? "")
    && ["first-seen", "newest", "oldest", "longest", "shortest", "advertiser"].includes(item.sort ?? "");
}

export function decodePreferences(value: unknown): Preferences {
  if (!value || typeof value !== "object") return DEFAULT_PREFERENCES;
  const item = value as Partial<Preferences> & { schemaVersion?: unknown };
  return item.schemaVersion === 1 && (item.density === "compact" || item.density === "comfortable") && Number.isInteger(item.collectionCap) && Number(item.collectionCap) >= 1 && Number(item.collectionCap) <= 500 && typeof item.diagnosticsExpanded === "boolean" && validFilters(item.filters) ? { filters: item.filters, density: item.density, collectionCap: Number(item.collectionCap), diagnosticsExpanded: item.diagnosticsExpanded } : DEFAULT_PREFERENCES;
}

export async function loadPreferences(): Promise<Preferences> { const stored = await chrome.storage.local.get(PREFERENCES_KEY); return decodePreferences(stored[PREFERENCES_KEY]); }
export async function savePreferences(preferences: Preferences): Promise<void> {
  const decoded = decodePreferences({ schemaVersion: 1, ...preferences });
  if (decoded === DEFAULT_PREFERENCES && preferences !== DEFAULT_PREFERENCES) throw new Error("Invalid preferences.");
  await chrome.storage.local.set({ [PREFERENCES_KEY]: { schemaVersion: 1, ...decoded } });
}
export async function clearSocialFinderStorage(): Promise<void> { await chrome.storage.local.remove(socialFinderStorageKeys()); }
export { PREFERENCES_KEY };
