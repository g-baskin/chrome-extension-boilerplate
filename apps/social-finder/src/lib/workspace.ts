import type { AdLibraryRecord, AdPlatform, AdStatus, FinderSnapshot, Surface } from "./types";

export interface WorkspaceState { pageKey: string; records: AdLibraryRecord[]; collecting: boolean; cap: number; capReached: boolean }
export type SortMode = "first-seen" | "newest" | "oldest" | "longest" | "shortest" | "advertiser";
export interface WorkspaceFilters { status: AdStatus | "all"; minRuntime: number | null; maxRuntime: number | null; platform: AdPlatform | "all"; advertiser: string; hasMedia: "all" | "yes" | "no"; multipleVersions: "all" | "yes" | "no"; sort: SortMode }

export const DEFAULT_FILTERS: WorkspaceFilters = { status: "all", minRuntime: null, maxRuntime: null, platform: "all", advertiser: "", hasMedia: "all", multipleVersions: "all", sort: "first-seen" };
export function emptyWorkspace(pageKey: string, cap = 500): WorkspaceState { return { pageKey, records: [], collecting: false, cap: Math.max(1, Math.min(500, cap)), capReached: false }; }

function completeness(record: AdLibraryRecord): number {
  return [record.advertiser, record.status, record.startDate, record.destinationUrl, record.multipleVersions].filter((value) => value !== null).length + record.platforms.length + record.mediaUrls.length;
}

export function appendRecords(state: WorkspaceState, incoming: AdLibraryRecord[], pageKey = state.pageKey): WorkspaceState {
  if (pageKey !== state.pageKey) return emptyWorkspace(pageKey, state.cap);
  if (!state.collecting) return state;
  const unique = new Map(state.records.map((record) => [record.key, record]));
  for (const record of incoming) {
    if (record.pageKey !== pageKey) continue;
    const current = unique.get(record.key);
    if (!current || completeness(record) >= completeness(current)) unique.set(record.key, record);
    if (unique.size >= state.cap) break;
  }
  const records = [...unique.values()].slice(0, state.cap);
  const capReached = records.length >= state.cap;
  return { ...state, records, capReached, collecting: capReached ? false : state.collecting };
}

export async function collectVisibleAdsOnce(state: WorkspaceState, rescan: () => Promise<FinderSnapshot>): Promise<{ snapshot: FinderSnapshot; state: WorkspaceState }> {
  const snapshot = await rescan();
  const base = snapshot.pageKey === state.pageKey ? state : emptyWorkspace(snapshot.pageKey, state.cap);
  const collected = appendRecords({ ...base, collecting: true }, snapshot.adLibraryRecords, snapshot.pageKey);
  return { snapshot, state: { ...collected, collecting: false } };
}

export const COLLECT_VISIBLE_HELP = "Collects the cards currently rendered on this screen. It does not scroll or click.";
export function collectVisibleButtonState(surface: Surface | undefined, loading: boolean) {
  const eligible = surface === "ad-library";
  return { disabled: !eligible || loading, title: eligible ? "Collect only the Ad Library cards currently rendered on screen" : "Open a Meta Ad Library page first", help: COLLECT_VISIBLE_HELP };
}

function compareUnknownLast<T>(a: T | null, b: T | null, compare: (left: T, right: T) => number): number {
  if (a === null) return b === null ? 0 : 1;
  if (b === null) return -1;
  return compare(a, b);
}

export function applyWorkspaceView(records: AdLibraryRecord[], filters: WorkspaceFilters): AdLibraryRecord[] {
  const advertiser = filters.advertiser.trim().toLocaleLowerCase();
  const filtered = records.filter((record) =>
    (filters.status === "all" || record.status === filters.status)
    && (filters.minRuntime === null || (record.runtimeDays !== null && record.runtimeDays >= filters.minRuntime))
    && (filters.maxRuntime === null || (record.runtimeDays !== null && record.runtimeDays <= filters.maxRuntime))
    && (filters.platform === "all" || record.platforms.includes(filters.platform))
    && (!advertiser || record.advertiser?.toLocaleLowerCase().includes(advertiser))
    && (filters.hasMedia === "all" || (record.mediaUrls.length > 0) === (filters.hasMedia === "yes"))
    && (filters.multipleVersions === "all" || record.multipleVersions === (filters.multipleVersions === "yes")));
  return filtered.sort((a, b) => {
    if (filters.sort === "advertiser") return compareUnknownLast(a.advertiser, b.advertiser, (left, right) => left.localeCompare(right));
    if (filters.sort === "newest" || filters.sort === "oldest") return compareUnknownLast(a.startDate, b.startDate, (left, right) => (filters.sort === "newest" ? right.localeCompare(left) : left.localeCompare(right)));
    if (filters.sort === "longest" || filters.sort === "shortest") return compareUnknownLast(a.runtimeDays, b.runtimeDays, (left, right) => filters.sort === "longest" ? right - left : left - right);
    return a.capturedAt.localeCompare(b.capturedAt);
  });
}

export function workspaceSummary(records: AdLibraryRecord[], filtered: AdLibraryRecord[]) {
  return { visibleCollectedAds: records.length, filteredResults: filtered.length, uniqueAdvertisers: new Set(records.map(({ advertiser }) => advertiser?.toLocaleLowerCase()).filter(Boolean)).size };
}
