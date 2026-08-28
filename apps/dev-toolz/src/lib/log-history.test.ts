import "fake-indexeddb/auto";
import { afterEach, describe, expect, it } from "vitest";
import { saveApiExchange, type ApiExchange } from "./api-traffic";
import { queryLogHistory } from "./log-history";
import { saveProtocolEvent, type ProtocolEvent } from "./protocol-traffic";
import { TRAFFIC_DATABASE_NAME } from "./traffic-database";

function deleteDatabase(): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(TRAFFIC_DATABASE_NAME);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

afterEach(deleteDatabase);

const apiEvent: ApiExchange = {
  startedAt: "2026-08-28T12:00:00.000Z",
  durationMs: 120,
  pageUrl: "https://app.viralvue.com",
  resourceType: "fetch",
  initiator: { kind: "page", origin: "https://app.viralvue.com" },
  request: {
    method: "POST",
    url: "https://www.tiktok.com/api/events",
    mimeType: "application/json",
    headers: [],
    body: null,
  },
  response: {
    status: 200,
    statusText: "OK",
    mimeType: "application/json",
    headers: [],
    body: { kind: "json", value: { accepted: true } },
  },
};
const protocolEvent: ProtocolEvent = {
  sessionId: "session-1",
  pageUrl: "https://app.viralvue.com",
  url: "wss://stream.example.com/events",
  transport: "websocket",
  kind: "message",
  direction: "received",
  timestamp: "2026-08-28T12:01:00.000Z",
  eventName: "inventory.updated",
  payload: "{}",
  payloadBytes: 2,
  truncated: false,
  binary: false,
};

describe("queryLogHistory", () => {
  it("searches indexed API and Red Team history with the existing detection syntax", async () => {
    await saveApiExchange(apiEvent);
    await saveProtocolEvent(protocolEvent);

    const result = await queryLogHistory({
      rawQuery: "(host=*tiktok.com method=POST) OR transport=websocket",
      source: "",
      earliestTimestamp: Date.parse("2026-08-28T11:59:00.000Z"),
      latestTimestamp: Date.parse("2026-08-28T12:02:00.000Z"),
    });

    expect(result.error).toBeNull();
    expect(result.scanned).toBe(2);
    expect(result.matching).toBe(2);
    expect(result.records.map((record) => record.source)).toEqual(["red-team", "api"]);
    expect(result.records.find((record) => record.source === "api")?.fields["response.body.accepted"])
      .toEqual(["true"]);
  });

  it("uses the time index to exclude history outside the selected range", async () => {
    await saveApiExchange(apiEvent);
    await saveProtocolEvent(protocolEvent);

    const result = await queryLogHistory({
      rawQuery: "",
      source: "",
      earliestTimestamp: Date.parse("2026-08-28T12:00:30.000Z"),
      latestTimestamp: null,
    });

    expect(result.scanned).toBe(1);
    expect(result.records.map((record) => record.source)).toEqual(["red-team"]);
  });
});
