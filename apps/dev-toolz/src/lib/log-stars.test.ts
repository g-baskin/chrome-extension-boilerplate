import { afterEach, describe, expect, it, vi } from "vitest";
import { loadStarredLogEventIds, persistStarredLogEventIds } from "./log-stars";
import { searchLogs, type LogRecord } from "./log-search";

describe("Log Search event stars", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("persists starred API and Red Team results through extension storage", async () => {
    const storage: Record<string, unknown> = {};
    vi.stubGlobal("chrome", {
      runtime: { lastError: undefined },
      storage: {
        local: {
          get: (key: string, callback: (result: Record<string, unknown>) => void) => {
            callback({ [key]: storage[key] });
          },
          set: (values: Record<string, unknown>, callback: () => void) => {
            Object.assign(storage, values);
            callback();
          },
        },
      },
    });
    const records: LogRecord[] = [
      {
        id: "api-42",
        source: "api",
        timestamp: "2026-08-28T12:00:00.000Z",
        title: "GET https://api.example.com/events",
        summary: "200 OK",
        searchableText: "api event",
        fields: { source: ["api"] },
      },
      {
        id: "red-team-84",
        source: "red-team",
        timestamp: "2026-08-28T12:01:00.000Z",
        title: "received inventory.updated",
        summary: "WebSocket message",
        searchableText: "red team event",
        fields: { source: ["red-team"] },
      },
    ];

    const logSearchResults = searchLogs(records, "", "", null).records;
    const starred = await loadStarredLogEventIds();
    for (const record of logSearchResults) starred.add(record.id);

    expect(await persistStarredLogEventIds(starred)).toBe(true);
    expect([...await loadStarredLogEventIds()].sort()).toEqual(["api-42", "red-team-84"]);
    expect(storage.starredLogEvents).toEqual(["red-team-84", "api-42"]);
  });
});
