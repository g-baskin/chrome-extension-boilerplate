import "fake-indexeddb/auto";
import { afterEach, describe, expect, it } from "vitest";
import type { ApiExchange } from "./api-traffic";
import { TRAFFIC_DATABASE_NAME } from "./traffic-database";
import {
  createRaceFlow,
  createRaceSnapshot,
  deleteRaceFlow,
  getRaceFlows,
  MAX_RACE_BODY_BYTES,
  MAX_RACE_STEPS,
  saveRaceFlow,
  validateRaceFlow,
} from "./race-flow";

const ORIGIN = "https://example.com";
function exchange(): ApiExchange {
  return {
    sequence: 7,
    pageUrl: `${ORIGIN}/account`,
    startedAt: "2026-08-28T00:00:00.000Z",
    durationMs: 1,
    request: {
      method: "POST",
      url: `${ORIGIN}/transfer`,
      mimeType: "application/json",
      headers: [
        { name: "authorization", value: "<redacted>" },
        { name: "Sec-Fetch-Site", value: "same-origin" },
        { name: "x-request-id", value: "123" },
      ],
      body: { kind: "json", value: { amount: 1 } },
    },
    response: { status: 200, statusText: "OK", mimeType: "application/json", headers: [], body: { kind: "json", value: {} } },
  };
}

function validFlow() {
  const flow = createRaceFlow("Transfer", "flow-1");
  flow.steps = [createRaceSnapshot(exchange(), ORIGIN)];
  flow.raceStepIndex = 0;
  return flow;
}

afterEach(async () => {
  await new Promise<void>((resolve) => {
    const request = indexedDB.deleteDatabase(TRAFFIC_DATABASE_NAME);
    request.onsuccess = () => resolve();
    request.onerror = () => resolve();
  });
});

describe("race flows", () => {
  it("sanitizes snapshots and accepts a valid same-origin flow", () => {
    const flow = validFlow();
    expect(flow.steps[0]?.headers).toEqual([{ name: "x-request-id", value: "123" }]);
    expect(() => validateRaceFlow(flow, ORIGIN, 2)).not.toThrow();
  });

  it("rejects cross-origin, unsupported, and redacted inputs", () => {
    const crossOrigin = validFlow();
    crossOrigin.steps[0] = { ...crossOrigin.steps[0]!, url: "https://other.example/transfer" };
    expect(() => validateRaceFlow(crossOrigin, ORIGIN, 2)).toThrow("match");
    const method = validFlow();
    method.steps[0] = { ...method.steps[0]!, method: "CONNECT" };
    expect(() => validateRaceFlow(method, ORIGIN, 2)).toThrow("unsupported");
    const redacted = validFlow();
    redacted.steps[0] = { ...redacted.steps[0]!, headers: [{ name: "x-value", value: "<redacted>" }] };
    expect(() => validateRaceFlow(redacted, ORIGIN, 2)).toThrow("Redacted");
  });

  it("rejects malformed bodies and bounds flow size and concurrency", () => {
    const malformed = exchange();
    malformed.request.body = { kind: "malformed-json", raw: "{", error: "bad" };
    expect(() => createRaceSnapshot(malformed, ORIGIN)).toThrow("Malformed");
    const oversized = validFlow();
    oversized.steps[0] = { ...oversized.steps[0]!, body: "x".repeat(MAX_RACE_BODY_BYTES + 1) };
    expect(() => validateRaceFlow(oversized, ORIGIN, 2)).toThrow("256 KiB");
    const tooMany = validFlow();
    tooMany.steps = Array.from({ length: MAX_RACE_STEPS + 1 }, () => tooMany.steps[0]!);
    expect(() => validateRaceFlow(tooMany, ORIGIN, 2)).toThrow("1–25");
    expect(() => validateRaceFlow(validFlow(), ORIGIN, 1)).toThrow("2 to 10");
    expect(() => validateRaceFlow(validFlow(), ORIGIN, 11)).toThrow("2 to 10");
  });

  it("persists and deletes saved flows", async () => {
    await saveRaceFlow(validFlow());
    expect(await getRaceFlows()).toHaveLength(1);
    await deleteRaceFlow("flow-1");
    expect(await getRaceFlows()).toEqual([]);
  });
});
