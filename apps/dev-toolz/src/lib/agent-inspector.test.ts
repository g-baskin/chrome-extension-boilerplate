import { describe, expect, it, vi } from "vitest";
import type { ApiExchange } from "./api-traffic";
import type { AgentProtocolInspection } from "./agent-protocol";
import type { ProtocolEvent } from "./protocol-traffic";
import { scanAgentTraffic } from "./agent-inspector";

const inspection = (label: string): AgentProtocolInspection => ({
  protocols: ["mcp"],
  timeline: [{ protocol: "mcp", kind: "lifecycle", label, evidence: { source: "request", timestamp: "2026-08-28T00:00:00.000Z", path: "request" } }],
  capabilities: [],
  signals: [],
});

describe("Agent Inspector scan", () => {
  it("paginates bounded history and stops once the visible result cap is full", async () => {
    const apiPages = [
      [{ sequence: 6 }, { sequence: 5 }],
      [{ sequence: 4 }, { sequence: 3 }],
    ] as ApiExchange[][];
    const getApiPage = vi.fn(async () => apiPages.shift() ?? []);
    const getProtocolPage = vi.fn(async () => [] as ProtocolEvent[]);

    const result = await scanAgentTraffic(
      { pageHostname: null, pageSize: 2, resultLimit: 3 },
      {
        getApiPage,
        getProtocolPage,
        inspectExchange: (exchange) => inspection(String(exchange.sequence)),
        inspectEvent: () => null,
      }
    );

    expect(result.inspections).toHaveLength(1);
    expect(result.inspections[0]?.timeline).toHaveLength(3);
    expect(result.scannedApi).toBe(4);
    expect(getApiPage).toHaveBeenCalledTimes(2);
    expect(getProtocolPage).toHaveBeenCalledOnce();
  });

  it("bounds automatic scans by record count", async () => {
    const records = [6, 5, 4, 3, 2, 1].map((sequence) => ({ sequence })) as ApiExchange[];
    const getApiPage = vi.fn(async (before: number | null, limit: number) => {
      const eligible = before === null ? records : records.filter(({ sequence }) => (sequence ?? 0) < before);
      return eligible.slice(0, limit);
    });

    const result = await scanAgentTraffic(
      { pageHostname: null, pageSize: 2, resultLimit: 10, recordLimit: 3 },
      {
        getApiPage,
        getProtocolPage: vi.fn(async () => [] as ProtocolEvent[]),
        inspectExchange: (exchange) => inspection(String(exchange.sequence)),
        inspectEvent: () => null,
      }
    );

    expect(result.scannedApi).toBe(3);
    expect(result.apiRecordLimitReached).toBe(true);
    expect(result.inspections[0]?.timeline).toHaveLength(3);
    expect(getApiPage.mock.calls.map(([, limit]) => limit)).toEqual([2, 1]);
  });

  it("scans protocol pages when API results leave capacity", async () => {
    const getApiPage = vi.fn(async () => [] as ApiExchange[]);
    const protocolPages = [[{ sequence: 2 }, { sequence: 1 }], []] as ProtocolEvent[][];
    const getProtocolPage = vi.fn(async () => protocolPages.shift() ?? []);

    const result = await scanAgentTraffic(
      { pageHostname: "example.test", pageSize: 2, resultLimit: 5 },
      {
        getApiPage,
        getProtocolPage,
        inspectExchange: () => null,
        inspectEvent: (event) => inspection(String(event.sequence)),
      }
    );

    expect(result.inspections).toHaveLength(1);
    expect(result.inspections[0]?.timeline).toHaveLength(2);
    expect(result.apiRecordLimitReached).toBe(false);
    expect(result.protocolRecordLimitReached).toBe(false);
    expect(result.scannedProtocol).toBe(2);
    expect(getProtocolPage).toHaveBeenCalledTimes(2);
  });
});
