import { describe, expect, it } from "vitest";
import type { ApiExchange } from "./api-traffic";
import {
  buildInferredConnectionChain,
  matchesConnectionChainFilter,
} from "./api-connection-chain";

function exchange(overrides: Partial<ApiExchange> = {}): ApiExchange {
  return {
    startedAt: "2026-08-28T00:00:00.000Z",
    durationMs: 42,
    initiator: { kind: "page", origin: "https://app.example.com" },
    request: { method: "GET", url: "https://api.example.com/data", mimeType: null, headers: [], body: null },
    response: {
      status: 200,
      statusText: "OK",
      mimeType: "application/json",
      headers: [],
      body: { kind: "json", value: {} },
    },
    ...overrides,
  };
}

describe("inferred connection chains", () => {
  it("shows the inferred TCP three-way handshake when HAR observed connection setup", () => {
    const chain = buildInferredConnectionChain(exchange({ network: {
      protocol: "HTTP/2",
      connectionSetup: "observed",
      dnsMs: 4,
      connectMs: 18,
      tlsMs: 11,
      sendMs: 1,
      waitMs: 20,
      receiveMs: 3,
    } }));
    expect(chain.steps.map((step) => step.label)).toEqual([
      "DNS lookup", "SYN", "SYN-ACK", "ACK", "TLS negotiation", "GET request", "200 response",
    ]);
    expect(chain.steps[3]?.detail).toBe("18 ms total connection setup");
    expect(chain.disclaimer).toContain("does not expose");
  });

  it("does not invent a handshake for a reused connection", () => {
    const chain = buildInferredConnectionChain(exchange({ network: {
      protocol: "HTTP/2",
      connectionSetup: "reused-or-unavailable",
      sendMs: 1,
      waitMs: 20,
      receiveMs: 3,
    } }));
    expect(chain.steps[0]).toMatchObject({ label: "Existing connection" });
    expect(chain.steps.some((step) => step.label === "SYN")).toBe(false);
  });

  it("uses QUIC stages instead of TCP flags for HTTP/3", () => {
    const chain = buildInferredConnectionChain(exchange({ network: {
      protocol: "h3",
      connectionSetup: "observed",
      connectMs: 9,
    } }));
    expect(chain.steps.map((step) => step.label)).toContain("QUIC + TLS handshake");
    expect(chain.steps.some((step) => step.label === "SYN")).toBe(false);
  });

  it("filters TCP, QUIC, and reused connection chains", () => {
    const tcp = exchange({ network: { protocol: "HTTP/2", connectionSetup: "observed" } });
    const quic = exchange({ network: { protocol: "h3", connectionSetup: "observed" } });
    const reused = exchange({ network: { protocol: "HTTP/2", connectionSetup: "reused-or-unavailable" } });
    expect(matchesConnectionChainFilter(tcp, "tcp-handshake")).toBe(true);
    expect(matchesConnectionChainFilter(tcp, "quic-handshake")).toBe(false);
    expect(matchesConnectionChainFilter(quic, "quic-handshake")).toBe(true);
    expect(matchesConnectionChainFilter(reused, "reused")).toBe(true);
    expect(matchesConnectionChainFilter(exchange(), "reused")).toBe(true);
  });

  it("keeps old captures readable without network timing data", () => {
    const chain = buildInferredConnectionChain(exchange());
    expect(chain.protocol).toBe("Protocol unavailable");
    expect(chain.steps.map((step) => step.label)).toEqual([
      "Existing connection", "GET request", "200 response",
    ]);
  });
});
