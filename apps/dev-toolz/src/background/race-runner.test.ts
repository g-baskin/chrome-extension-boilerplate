import { afterEach, describe, expect, it, vi } from "vitest";
import type { RaceRequestSnapshot } from "../lib/race-flow";
import {
  assertExpectedPage,
  executeRaceInPage,
  MAX_RACE_RESPONSE_BYTES,
} from "./race-runner";

function step(path: string): RaceRequestSnapshot {
  return {
    exchangeSequence: path.length,
    capturedPageUrl: "https://example.com/page",
    method: "POST",
    url: `https://example.com${path}`,
    headers: [{ name: "content-type", value: "application/json" }],
    body: "{}",
    mimeType: "application/json",
  };
}

function input(overrides = {}) {
  return {
    runId: "run-1",
    expectedPageUrl: "https://example.com/page",
    steps: [step("/setup"), step("/race")],
    raceStepIndex: 1,
    concurrency: 2,
    timeoutMs: 1_000,
    maxResponseBytes: MAX_RACE_RESPONSE_BYTES,
    ...overrides,
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

afterEach(() => {
  vi.useRealTimers();
  delete (globalThis as { __devToolzRaceControllers?: unknown }).__devToolzRaceControllers;
});

describe("Race runner", () => {
  it("finishes setup in order and starts the whole burst before either resolves", async () => {
    const calls: string[] = [];
    const burst = [deferred<Response>(), deferred<Response>()];
    let burstIndex = 0;
    const transport = vi.fn(async (url: RequestInfo | URL) => {
      calls.push(String(url));
      if (String(url).endsWith("/setup") || String(url).endsWith("/after")) return new Response("setup", { status: 200 });
      return burst[burstIndex++]!.promise;
    });
    const running = executeRaceInPage(input({
      steps: [step("/setup"), step("/race"), step("/after")],
      raceStepIndex: 1,
    }), transport);
    await vi.waitFor(() => expect(transport).toHaveBeenCalledTimes(4));
    expect(calls).toEqual([
      "https://example.com/setup",
      "https://example.com/after",
      "https://example.com/race",
      "https://example.com/race",
    ]);
    burst[1]!.resolve(new Response("second", { status: 201 }));
    burst[0]!.resolve(new Response("first", { status: 200 }));
    const result = await running;
    expect(result.state).toBe("succeeded");
    expect(result.outcomes.map((outcome) => outcome.attempt)).toEqual([0, 0, 0, 1]);
    expect(result.outcomes.map((outcome) => outcome.status)).toEqual([200, 200, 200, 201]);
  });

  it("cancels outstanding requests", async () => {
    const external = new AbortController();
    const transport = vi.fn((_url: RequestInfo | URL, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
    }));
    const running = executeRaceInPage(input({ steps: [step("/race")], raceStepIndex: 0 }), transport, external.signal);
    await vi.waitFor(() => expect(transport).toHaveBeenCalledTimes(2));
    external.abort();
    const result = await running;
    expect(result.state).toBe("cancelled");
    expect(result.outcomes.every((outcome) => outcome.error === "Cancelled")).toBe(true);
  });

  it("times out without wall-clock delay", async () => {
    vi.useFakeTimers();
    const transport = vi.fn((_url: RequestInfo | URL, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
    }));
    const running = executeRaceInPage(input({ steps: [step("/race")], raceStepIndex: 0, timeoutMs: 25 }), transport);
    await vi.advanceTimersByTimeAsync(25);
    const result = await running;
    expect(result.state).toBe("failed");
    expect(result.outcomes.every((outcome) => outcome.error === "Timed out")).toBe(true);
  });

  it("preserves sibling results when one request fails", async () => {
    let call = 0;
    const transport = vi.fn(async () => {
      call += 1;
      if (call === 1) throw new Error("network down");
      return new Response("ok", { status: 200 });
    });
    const result = await executeRaceInPage(input({ steps: [step("/race")], raceStepIndex: 0 }), transport);
    expect(result.state).toBe("partial");
    expect(result.outcomes).toHaveLength(2);
    expect(result.outcomes[0]?.error).toBe("network down");
    expect(result.outcomes[1]?.status).toBe(200);
  });

  it("blocks redirects and bounds response previews", async () => {
    const redirect = await executeRaceInPage(input({ steps: [step("/race")], raceStepIndex: 0 }), async () => new Response("", { status: 302 }));
    expect(redirect.state).toBe("failed");
    expect(redirect.outcomes[0]?.error).toBe("Redirect blocked");

    const oversized = "x".repeat(MAX_RACE_RESPONSE_BYTES + 1);
    const bounded = await executeRaceInPage(input({ steps: [step("/race")], raceStepIndex: 0, concurrency: 2 }), async () => new Response(oversized));
    expect(bounded.outcomes[0]).toMatchObject({ truncated: true, responseBytes: MAX_RACE_RESPONSE_BYTES + 1 });
    expect(new TextEncoder().encode(bounded.outcomes[0]?.preview).length).toBe(MAX_RACE_RESPONSE_BYTES);
  });

  it("rejects stale navigation and reports top-level execution failure", async () => {
    expect(() => assertExpectedPage("https://example.com/next", "https://example.com/page")).toThrow("navigated");
    const result = await executeRaceInPage(input({ steps: [], raceStepIndex: 0 }), async () => new Response("ok"));
    expect(result.state).toBe("failed");
    expect(result.error).toBe("Race step is missing");
  });
});
