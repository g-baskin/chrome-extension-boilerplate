import { describe, expect, it, vi } from "vitest";
import { appendRecords, applyWorkspaceView, collectVisibleAdsOnce, collectVisibleButtonState, emptyWorkspace, workspaceSummary } from "./workspace";
import type { AdLibraryRecord, FinderSnapshot, Surface } from "./types";

const record = (id: string, overrides: Partial<AdLibraryRecord> = {}): AdLibraryRecord => ({ schemaVersion: 1, key: `ad-library:${id}`, libraryId: id, advertiser: "Nike", status: "active", startDate: "2026-08-01", runtimeDays: 30, platforms: ["facebook"], text: `Ad ${id}`, destinationUrl: null, mediaUrls: [], multipleVersions: null, pageKey: "nike", capturedAt: "2026-08-31T00:00:00.000Z", diagnostics: [], ...overrides });

describe("workspace reducer", () => {
  it("appends only while collecting and keeps the newest more complete duplicate", () => {
    const stopped = emptyWorkspace("nike", 3);
    expect(appendRecords(stopped, [record("1")]).records).toHaveLength(0);
    const active = { ...stopped, collecting: true };
    const first = appendRecords(active, [record("1", { advertiser: null })]);
    const second = appendRecords(first, [record("1"), record("2")]);
    expect(second.records.map(({ libraryId }) => libraryId)).toEqual(["1", "2"]);
    expect(second.records[0]?.advertiser).toBe("Nike");
  });

  it("stops visibly at its cap and resets on page change", () => {
    const full = appendRecords({ ...emptyWorkspace("nike", 2), collecting: true }, [record("1"), record("2"), record("3")]);
    expect(full).toMatchObject({ collecting: false, capReached: true });
    expect(appendRecords(full, [record("4")], "adidas")).toMatchObject({ pageKey: "adidas", records: [], collecting: false });
  });

  it("filters, sorts unknowns last, and reports honest counts", () => {
    const records = [record("1", { advertiser: "Zulu", runtimeDays: 10 }), record("2", { advertiser: "Alpha", runtimeDays: 50, platforms: ["instagram"], multipleVersions: true }), record("3", { advertiser: null, runtimeDays: null })];
    const filtered = applyWorkspaceView(records, { status: "active", minRuntime: 20, maxRuntime: null, platform: "all", advertiser: "", hasMedia: "all", multipleVersions: "all", sort: "advertiser" });
    expect(filtered.map(({ libraryId }) => libraryId)).toEqual(["2"]);
    expect(workspaceSummary(records, filtered)).toEqual({ visibleCollectedAds: 3, filteredResults: 1, uniqueAdvertisers: 2 });
  });

  it("collects one rescan exactly once without scrolling or clicking", async () => {
    const scroll = vi.fn();
    const click = vi.fn();
    vi.stubGlobal("scrollTo", scroll);
    vi.stubGlobal("document", { documentElement: { scrollTo: scroll, click }, body: { scrollTo: scroll, click }, querySelector: vi.fn(() => ({ click })) });
    const snapshot: FinderSnapshot = { schemaVersion: 1, pageKey: "nike", surface: "ad-library", findings: [], adLibraryRecords: [record("1"), record("2")], diagnostics: { candidates: 2, rejected: 0, detected: 2, renderFailures: 0 } };
    const rescan = vi.fn(async () => snapshot);
    try {
      const result = await collectVisibleAdsOnce(emptyWorkspace("nike"), rescan);
      expect(rescan).toHaveBeenCalledTimes(1);
      expect(result.state).toMatchObject({ collecting: false, records: snapshot.adLibraryRecords });
      expect(scroll).not.toHaveBeenCalled();
      expect(click).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("disables collection outside Ad Library and explains how to enable it", () => {
    for (const surface of [undefined, "feed", "marketplace", "unsupported"] satisfies Array<Surface | undefined>) {
      expect(collectVisibleButtonState(surface, false)).toEqual({ disabled: true, title: "Open a Meta Ad Library page first", help: "Collects the cards currently rendered on this screen. It does not scroll or click." });
    }
    expect(collectVisibleButtonState("ad-library", false)).toMatchObject({ disabled: false, title: "Collect only the Ad Library cards currently rendered on screen" });
    expect(collectVisibleButtonState("ad-library", true).disabled).toBe(true);
  });
});
