import { describe, expect, it } from "vitest";
import type { ApiExchange } from "./api-traffic";
import type { ProtocolEvent } from "./protocol-traffic";
import {
  createApiLogRecord,
  createApiMetadataLogRecord,
  createProtocolLogRecord,
  expressionRequiresExtractedFields,
  LOG_SEARCH_LIMITS,
  parseLogQuery,
  searchLogs,
} from "./log-search";

const apiExchange: ApiExchange = {
  sequence: 7,
  startedAt: "2026-08-28T03:45:47.000Z",
  durationMs: 368,
  pageUrl: "https://app.viralvue.com",
  initiator: { kind: "page", origin: "https://app.viralvue.com" },
  resourceType: "XHR",
  request: {
    method: "GET",
    url: "https://api-iris.viralvue.com/data/amazon/reports?region=us",
    mimeType: null,
    headers: [],
    body: null,
  },
  response: {
    status: 200,
    statusText: "OK",
    mimeType: "application/json",
    headers: [],
    body: { kind: "json", value: { region: "us", summaries: [] } },
  },
};

const protocolEvent: ProtocolEvent = {
  sequence: 9,
  sessionId: "session-1",
  pageUrl: "https://app.viralvue.com",
  capture: {
    tabId: 11,
    windowId: 2,
    openerTabId: 10,
    pageUrl: "https://app.viralvue.com",
    attachedAt: "2026-08-28T03:46:00.000Z",
    previousTabId: 10,
    previousPageUrl: "https://origin.example/path",
    transition: "new-window",
    mayHaveMissedInitialRequests: true,
  },
  url: "wss://api.viralvue.com/graphql",
  transport: "websocket",
  kind: "message",
  direction: "received",
  timestamp: "2026-08-28T03:46:47.000Z",
  eventName: "inventory.updated",
  payload: "{\"region\":\"us\"}",
  payloadBytes: 15,
  truncated: false,
  binary: false,
  graphql: { name: "InventoryUpdated", type: "subscription" },
};

describe("log search", () => {
  it("creates bounded searchable records for API and red-team data", () => {
    const api = createApiLogRecord(apiExchange);
    const protocol = createProtocolLogRecord(protocolEvent);
    expect(api).toMatchObject({ source: "api", id: "api-7" });
    expect(api.fields.region).toEqual(["us"]);
    expect(api.fields["response.body.summaries"]).toEqual(["[]"]);
    expect(protocol).toMatchObject({ source: "red-team", id: "red-team-9" });
    expect(protocol.fields.transport).toEqual(["websocket"]);
    expect(protocol.fields["capture.transition"]).toEqual(["new-window"]);
    expect(protocol.fields["capture.previous_page_host"]).toEqual(["origin.example"]);
  });

  it("parses Boolean detection expressions with standard precedence", () => {
    expect(parseLogQuery('status=500 OR kind=error AND NOT host="trusted.example"')).toEqual({
      expression: {
        kind: "or",
        left: { kind: "predicate", field: "status", operator: "equals", value: "500" },
        right: {
          kind: "and",
          left: { kind: "predicate", field: "kind", operator: "equals", value: "error" },
          right: {
            kind: "not",
            expression: { kind: "predicate", field: "host", operator: "equals", value: "trusted.example" },
          },
        },
      },
      error: null,
    });
  });

  it("uses metadata-only records for common indexed fields", () => {
    const metadata = createApiMetadataLogRecord(apiExchange);
    expect(metadata.fields.host).toEqual(["api-iris.viralvue.com"]);
    expect(metadata.fields["response.body.region"]).toBeUndefined();
    expect(expressionRequiresExtractedFields(parseLogQuery("host=*viralvue.com method=GET").expression))
      .toBe(false);
    expect(expressionRequiresExtractedFields(parseLogQuery("region=us").expression)).toBe(true);
    expect(expressionRequiresExtractedFields(parseLogQuery("inventory").expression)).toBe(true);
  });

  it("parses grouping, existence, quoted values, escaped quotes, and implicit AND", () => {
    expect(parseLogQuery('(source=api OR source=red-team) EXISTS(region)')).toEqual({
      expression: {
        kind: "and",
        left: {
          kind: "or",
          left: { kind: "predicate", field: "source", operator: "equals", value: "api" },
          right: { kind: "predicate", field: "source", operator: "equals", value: "red-team" },
        },
        right: { kind: "exists", field: "region" },
      },
      error: null,
    });
    expect(parseLogQuery('PaTh contains "say \\"hello\\""').expression).toEqual({
      kind: "predicate",
      field: "path",
      operator: "contains",
      value: 'say "hello"',
    });
    expect(parseLogQuery('inventory "updated event" status=200 method!=POST').error).toBeNull();
  });

  it("keeps empty and legacy searches compatible", () => {
    expect(parseLogQuery("")).toEqual({ expression: null, error: null });
    expect(parseLogQuery('"monthly report"').expression).toEqual({
      kind: "predicate",
      field: null,
      operator: "contains",
      value: "monthly report",
    });
    expect(parseLogQuery("transport=*").error).toBeNull();
  });

  it("rejects malformed, unsupported, and oversized queries", () => {
    const invalidQueries = [
      '"unfinished',
      "status=",
      'status=""',
      "EXISTS",
      "EXISTS region",
      "EXISTS()",
      "(status=500",
      "status=500)",
      "AND status=500",
      "status=500 OR",
      "status>499",
      `field=${"x".repeat(LOG_SEARCH_LIMITS.valueCharacters + 1)}`,
      "x".repeat(LOG_SEARCH_LIMITS.queryCharacters + 1),
    ];
    for (const query of invalidQueries) {
      const parsed = parseLogQuery(query);
      expect(parsed.expression, query).toBeNull();
      expect(parsed.error, query).not.toBeNull();
    }
    expect(searchLogs([createApiLogRecord(apiExchange)], "status>499", "", null)).toMatchObject({
      records: [],
      expression: null,
    });
  });

  it("filters both sources by Boolean fields, text, source, and time", () => {
    const records = [createApiLogRecord(apiExchange), createProtocolLogRecord(protocolEvent)];
    expect(searchLogs(records, "REGION=us", "", null).records).toHaveLength(2);
    expect(searchLogs(records, "source=api OR transport=websocket", "", null).records)
      .toHaveLength(2);
    expect(searchLogs(records, "NOT source=red-team", "", null).records).toEqual([records[0]]);
    expect(searchLogs(records, "EXISTS(region)", "", null).records).toHaveLength(2);
    expect(searchLogs(records, "path CONTAINS amazon", "", null).records).toEqual([records[0]]);
    expect(searchLogs(records, "transport=websocket inventory", "red-team", null).records)
      .toEqual([records[1]]);
    expect(searchLogs(records, "transport=*", "", null).records).toEqual([records[1]]);
    expect(searchLogs(records, "path=/data/*/reports", "api", null).records).toEqual([records[0]]);
    expect(searchLogs(records, "method!=POST", "api", Date.parse("2026-08-28T03:45:00Z")).records)
      .toEqual([records[0]]);
    expect(searchLogs(records, "", "", Date.parse("2026-08-28T03:46:00Z")).records)
      .toEqual([records[1]]);
    expect(searchLogs(
      records,
      "",
      "",
      Date.parse("2026-08-28T03:45:00Z"),
      Date.parse("2026-08-28T03:46:00Z")
    ).records).toEqual([records[0]]);
  });

  it("caps returned results", () => {
    const record = createApiLogRecord(apiExchange);
    const records = Array.from({ length: LOG_SEARCH_LIMITS.results + 1 }, (_, index) => ({
      ...record,
      id: `api-${index}`,
    }));
    expect(searchLogs(records, "", "", null).records).toHaveLength(LOG_SEARCH_LIMITS.results);
  });
});
