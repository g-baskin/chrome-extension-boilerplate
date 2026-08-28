import { describe, expect, it } from "vitest";
import {
  boundProtocolPayload,
  createProtocolEvent,
  extractGraphqlOperation,
  getProtocolPort,
  MAX_PROTOCOL_PAYLOAD_BYTES,
  matchesProtocolEvent,
} from "./protocol-traffic";

describe("protocol traffic", () => {
  it("extracts GraphQL HTTP and graphql-transport-ws operations", () => {
    expect(extractGraphqlOperation({ query: "mutation SaveUser { saveUser { id } }" })).toEqual({
      name: "SaveUser",
      type: "mutation",
    });
    expect(extractGraphqlOperation(JSON.stringify({
      id: "1",
      type: "subscribe",
      payload: { operationName: "Updates", query: "subscription Updates { updates }" },
    }))).toEqual({ name: "Updates", type: "subscription" });
  });

  it("tolerates malformed and non-GraphQL payloads", () => {
    expect(extractGraphqlOperation("{not json")).toBeNull();
    expect(extractGraphqlOperation({ payload: { payload: { payload: { payload: { payload: { query: "query TooDeep { x }" } } } } } })).toBeNull();
  });

  it("labels binary frames without decoding them", () => {
    expect(boundProtocolPayload("AAEC", 2)).toMatchObject({
      payload: "AAEC",
      binary: true,
      truncated: false,
    });
  });

  it("truncates only payloads above 256 KiB", () => {
    const exact = "x".repeat(MAX_PROTOCOL_PAYLOAD_BYTES);
    expect(boundProtocolPayload(exact).truncated).toBe(false);
    const oversized = boundProtocolPayload(`${exact}x`);
    expect(oversized.truncated).toBe(true);
    expect(new TextEncoder().encode(oversized.payload).length).toBe(MAX_PROTOCOL_PAYLOAD_BYTES);
    expect(oversized.payloadBytes).toBe(MAX_PROTOCOL_PAYLOAD_BYTES + 1);
  });

  it("redacts JSON payloads and filters direction, port, and session text", () => {
    const event = createProtocolEvent({
      sessionId: "socket-1",
      pageUrl: "https://example.com/page",
      url: "wss://example.com:8443/graphql?token=[REDACTED]",
      transport: "websocket",
      kind: "frame",
      direction: "sent",
      timestamp: "2026-08-28T00:00:00.000Z",
      opcode: 1,
      payload: JSON.stringify({ operationName: "Viewer", query: "query Viewer { viewer }", token: "secret" }),
    });
    expect(event.url).not.toContain("secret");
    expect(event.payload).not.toContain("secret");
    expect(getProtocolPort(event.url)).toBe("8443");
    expect(getProtocolPort("wss://example.com/graphql")).toBe("443");
    expect(matchesProtocolEvent(event, {
      pageHostname: "example.com",
      transport: "websocket",
      direction: "sent",
      port: "8443",
      operationName: "view",
      text: "graphql",
    })).toBe(true);
  });
});
