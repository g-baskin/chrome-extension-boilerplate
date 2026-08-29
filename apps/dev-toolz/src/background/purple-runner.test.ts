import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PurpleFlow } from "../lib/purple-flow";

const mocks = vi.hoisted(() => ({
  getExchange: vi.fn(),
  getPause: vi.fn(),
  getStorage: vi.fn(),
  query: vi.fn(),
  snapshot: vi.fn(),
}));

vi.mock("@/lib/api-traffic", () => ({ REDACTED: "[REDACTED]", getApiTrafficBySequence: mocks.getExchange }));
vi.mock("@/lib/api-traffic-pause", () => ({ getApiTrafficPauseStatus: mocks.getPause }));
vi.mock("@/lib/log-history-client", () => ({ queryLogHistoryOffThread: mocks.query }));
vi.mock("@/lib/race-flow", () => ({ createRaceSnapshot: mocks.snapshot }));
vi.mock("@/lib/storage", () => ({
  defaultSettings: { enabled: true, redactionEnabled: true, siteAccessMode: "all", siteAccessSites: [] },
  getStorage: mocks.getStorage,
}));

import {
  cancelPurpleFlow,
  executePurpleStepInPage,
  MAX_PURPLE_RESPONSE_BYTES,
  runPurpleFlow,
  scoreStep,
} from "./purple-runner";

const PAGE = "https://example.com/page";

function flow(url = "https://example.com/api"): PurpleFlow {
  return {
    id: "flow-1", name: "Proof", origin: "https://example.com", source: "capture",
    createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z",
    expectedControls: [], attackAnnotations: [],
    steps: [{
      id: "step-1", name: "Request",
      capturedRequest: { exchangeSequence: 1, capturedPageUrl: PAGE, method: "POST", url, headers: [{ name: "content-type", value: "application/json" }], body: "{}", mimeType: "application/json" },
      openApiOperation: null,
      expectation: { prevention: "allowed", detectionQuery: null, expectedStatus: 200, expectedStatusClass: null },
    }],
  };
}

function request(overrides = {}) {
  return {
    tabId: 7, runId: "run-1", expectedPageUrl: PAGE, flow: flow(),
    identity: { id: "browser", displayName: "Browser", mode: "browser" as const, authorizationScheme: null },
    ...overrides,
  };
}

function pageInput(overrides = {}) {
  return {
    runId: "run-1", expectedPageUrl: PAGE, request: flow().steps[0]!.capturedRequest,
    credentials: "include" as const, timeoutMs: 1_000, maxResponseBytes: MAX_PURPLE_RESPONSE_BYTES,
    ...overrides,
  };
}

beforeEach(() => {
  mocks.getStorage.mockResolvedValue({ enabled: true, siteAccessMode: "all", siteAccessSites: [] });
  mocks.getPause.mockResolvedValue({ paused: false });
  mocks.getExchange.mockResolvedValue({ sequence: 1, pageUrl: PAGE });
  mocks.snapshot.mockImplementation(() => flow().steps[0]!.capturedRequest);
  mocks.query.mockResolvedValue({ records: [], matching: 0, scanned: 0, error: null, expression: null });
  const tabs = { get: vi.fn().mockResolvedValue({ url: PAGE }) };
  const scripting = { executeScript: vi.fn(async ({ func, args }) => [{ result: await func(args[0], async () => new Response("not retained", { status: 200 })) }]) };
  vi.stubGlobal("chrome", { tabs, scripting });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  delete (globalThis as { __devToolzPurpleControllers?: unknown }).__devToolzPurpleControllers;
});

describe("Purple runner fail-closed boundaries", () => {
  it("runs a reviewed same-origin capture and scores prevention separately", async () => {
    const result = await runPurpleFlow(request());
    expect(result.status).toBe("completed");
    expect(result.steps[0]).toMatchObject({ preventionOutcome: "allowed", detectionOutcome: "inconclusive", status: 200 });
    expect(result.preventionScore).toEqual({ met: 1, total: 1 });
    expect(result.detectionScore).toEqual({ met: 0, total: 0 });
    expect(JSON.stringify(result)).not.toContain("not retained");
  });

  it("dispatches a same-origin journey sequentially", async () => {
    const journey = flow();
    journey.steps.push({
      ...journey.steps[0]!,
      id: "step-2",
      capturedRequest: { ...journey.steps[0]!.capturedRequest, exchangeSequence: 2, url: "https://example.com/second" },
    });
    mocks.getExchange.mockImplementation(async (sequence) => ({ sequence, pageUrl: PAGE }));
    mocks.snapshot.mockImplementation((exchange) => journey.steps.find((step) => step.capturedRequest.exchangeSequence === exchange.sequence)!.capturedRequest);
    const urls: string[] = [];
    vi.mocked(chrome.scripting.executeScript).mockImplementation(async (injection) => {
      if (!("func" in injection)) throw new Error("Expected a script injection");
      const { func } = injection;
      const args = "args" in injection ? injection.args : undefined;
      return [{ result: await func(args?.[0], async (url: RequestInfo | URL) => {
        urls.push(String(url));
        return new Response("", { status: 200 });
      }) }];
    });
    await runPurpleFlow(request({ flow: journey }));
    expect(urls).toEqual(["https://example.com/api", "https://example.com/second"]);
  });

  it("links matching detection evidence and keeps missing evidence inconclusive", async () => {
    const proof = flow();
    proof.steps[0]!.expectation.detectionQuery = "status=200";
    mocks.query.mockResolvedValueOnce({ records: [{ id: "api-42" }], matching: 1, scanned: 1, error: null, expression: {} });
    const detected = await runPurpleFlow(request({ flow: proof }));
    expect(detected.steps[0]).toMatchObject({ detectionOutcome: "detected", evidenceSequenceIds: [42] });
    expect(detected.detectionScore).toEqual({ met: 1, total: 1 });

    mocks.query.mockResolvedValueOnce({ records: [], matching: 0, scanned: 0, error: null, expression: {} });
    const missing = await runPurpleFlow(request({ runId: "run-2", flow: proof }));
    expect(missing).toMatchObject({ status: "inconclusive", steps: [{ detectionOutcome: "inconclusive", evidenceSequenceIds: [] }] });
  });

  it("rejects cross-origin flows and makes stale captures inconclusive before dispatch", async () => {
    await expect(runPurpleFlow(request({ flow: flow("https://evil.example/api") }))).rejects.toThrow("same-origin");
    mocks.snapshot.mockReturnValue({ ...flow().steps[0]!.capturedRequest, method: "GET" });
    const stale = await runPurpleFlow(request({ runId: "run-2" }));
    expect(stale).toMatchObject({ status: "inconclusive", steps: [{ preventionOutcome: "inconclusive", error: "A Purple step changed after capture." }] });
    expect(chrome.scripting.executeScript).not.toHaveBeenCalled();
  });

  it("refuses a capture from another page on the same origin", async () => {
    mocks.getExchange.mockResolvedValue({ sequence: 1, pageUrl: "https://example.com/other" });
    const result = await runPurpleFlow(request());
    expect(result).toMatchObject({
      status: "inconclusive",
      steps: [{ preventionOutcome: "inconclusive", error: "A Purple step no longer belongs to the exact inspected page." }],
    });
    expect(chrome.scripting.executeScript).not.toHaveBeenCalled();
  });

  it("fails closed when legacy capture evidence has no page URL", async () => {
    mocks.getExchange.mockResolvedValue({ sequence: 1 });
    const result = await runPurpleFlow(request());
    expect(result).toMatchObject({
      status: "inconclusive",
      steps: [{ preventionOutcome: "inconclusive", error: "A Purple step is missing exact-page capture evidence." }],
    });
    expect(mocks.snapshot).not.toHaveBeenCalled();
    expect(chrome.scripting.executeScript).not.toHaveBeenCalled();
  });

  it("rechecks enabled, pause, site access and exact navigation", async () => {
    mocks.getStorage.mockResolvedValue({ enabled: false, siteAccessMode: "all", siteAccessSites: [] });
    await expect(runPurpleFlow(request())).rejects.toThrow("do not permit");
    mocks.getStorage.mockResolvedValue({ enabled: true, siteAccessMode: "all", siteAccessSites: [] });
    mocks.getPause.mockResolvedValueOnce({ paused: true });
    await expect(runPurpleFlow(request({ runId: "run-2" }))).rejects.toThrow("do not permit");
    mocks.getStorage.mockResolvedValue({ enabled: true, siteAccessMode: "deny", siteAccessSites: ["example.com"] });
    await expect(runPurpleFlow(request({ runId: "run-3" }))).rejects.toThrow("do not permit");
    mocks.getStorage.mockResolvedValue({ enabled: true, siteAccessMode: "all", siteAccessSites: [] });
    vi.mocked(chrome.tabs.get).mockResolvedValueOnce({ url: "https://example.com/other" } as chrome.tabs.Tab);
    const navigated = await runPurpleFlow(request({ runId: "run-4" }));
    expect(navigated).toMatchObject({ status: "inconclusive", steps: [{ preventionOutcome: "inconclusive" }] });
    vi.mocked(chrome.tabs.get).mockResolvedValueOnce({ url: "https://other.example/page" } as chrome.tabs.Tab);
    await expect(runPurpleFlow(request({ runId: "run-5" }))).rejects.toThrow("changed origin");
  });

  it("uses a per-tab concurrency lock", async () => {
    let release!: () => void;
    vi.mocked(chrome.scripting.executeScript).mockImplementationOnce(() => new Promise((resolve) => { release = () => resolve([{ result: { status: 200, responseBytes: 0, responseSha256: "a".repeat(64), truncated: false, error: null } }]); }));
    const first = runPurpleFlow(request());
    await vi.waitFor(() => expect(chrome.scripting.executeScript).toHaveBeenCalled());
    await expect(runPurpleFlow(request({ runId: "run-2" }))).rejects.toThrow("already active");
    release();
    await first;
  });

  it("cancels the active request without releasing its lock early", async () => {
    vi.stubGlobal("window", globalThis);
    const transport = vi.fn((_url: RequestInfo | URL, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
    }));
    vi.mocked(chrome.scripting.executeScript).mockImplementation(async (injection) => {
      if (!("func" in injection)) throw new Error("Expected a script injection");
      const { func } = injection;
      const args = "args" in injection ? injection.args : undefined;
      const argument = args?.[0];
      return [{ result: argument && typeof argument === "object" && "request" in argument
        ? await func(argument, transport)
        : await func(argument) }];
    });
    const running = runPurpleFlow(request());
    await vi.waitFor(() => expect(transport).toHaveBeenCalledOnce());
    const cancelling = cancelPurpleFlow(7, "run-1");
    await expect(runPurpleFlow(request({ runId: "run-2" }))).rejects.toThrow("already active");
    expect(await cancelling).toEqual({ cancelled: true });
    expect((await running).status).toBe("cancelled");
    expect((globalThis as { __devToolzPurpleControllers?: Map<string, unknown> }).__devToolzPurpleControllers?.size).toBe(0);
  });

  it("maps browser, anonymous, and named identities without persisting malformed header values", async () => {
    const dispatches: Array<{ credentials?: RequestCredentials; authorizationHeader?: string }> = [];
    vi.mocked(chrome.scripting.executeScript).mockImplementation(async (injection) => {
      if (!("args" in injection)) throw new Error("Expected script arguments");
      const argument = injection.args?.[0] as { credentials?: RequestCredentials; authorizationHeader?: string };
      dispatches.push(argument);
      return [{ result: { status: 200, responseBytes: 0, responseSha256: "a".repeat(64), truncated: false, error: null } }];
    });
    await runPurpleFlow(request());
    await runPurpleFlow(request({ runId: "run-2", identity: { id: "anonymous", displayName: "Anonymous", mode: "anonymous", authorizationScheme: null } }));
    await runPurpleFlow(request({
      runId: "run-3",
      identity: { id: "analyst", displayName: "Analyst", mode: "authorization-header", authorizationScheme: "Bearer" },
      authorizationHeader: "Bearer ephemeral-value",
    }));
    expect(dispatches).toEqual([
      expect.objectContaining({ credentials: "include" }),
      expect.objectContaining({ credentials: "omit" }),
      expect.objectContaining({ credentials: "include", authorizationHeader: "Bearer ephemeral-value" }),
    ]);
    await expect(runPurpleFlow(request({
      runId: "bad",
      identity: { id: "analyst", displayName: "Analyst", mode: "authorization-header", authorizationScheme: "Bearer" },
      authorizationHeader: "Bearer good\r\nX-Evil: injected",
    }))).rejects.toThrow("Authorization value is malformed");
    expect(JSON.stringify(dispatches)).not.toContain("X-Evil");
  });

  it("passes an ephemeral Authorization value only into fetch and never returns or logs it", async () => {
    const secret = "Bearer hostile-secret";
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const transport = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      expect(new Headers(init?.headers).get("authorization")).toBe(secret);
      return new Response("secret response body", { status: 200 });
    });
    const result = await executePurpleStepInPage(pageInput({ authorizationHeader: secret }), transport);
    expect(transport).toHaveBeenCalledOnce();
    expect(result).toMatchObject({ responseBytes: 20, truncated: false });
    expect(result.responseSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(result)).not.toContain(secret);
    expect(JSON.stringify(result)).not.toContain("secret response body");
    expect(log).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
  });

  it("makes timeout, cancellation, redirects, and navigation inconclusive", async () => {
    vi.useFakeTimers();
    const hanging = vi.fn((_url: RequestInfo | URL, init?: RequestInit) => new Promise<Response>((_resolve, reject) => init?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")))));
    const timed = executePurpleStepInPage(pageInput({ timeoutMs: 25 }), hanging);
    await vi.advanceTimersByTimeAsync(25);
    expect((await timed).error).toBe("timeout");

    const external = new AbortController();
    const cancelled = executePurpleStepInPage(pageInput(), hanging, external.signal);
    external.abort();
    expect((await cancelled).error).toBe("cancelled");
    expect((await executePurpleStepInPage(pageInput(), async () => new Response("", { status: 302 }))).error).toBe("redirect");

    vi.stubGlobal("location", { href: "https://example.com/other" });
    expect((await executePurpleStepInPage(pageInput(), async () => new Response())).error).toBe("navigation");
    expect(scoreStep(flow().steps[0]!, { status: null, responseBytes: 0, responseSha256: null, truncated: false, error: "navigation" }).preventionOutcome).toBe("inconclusive");
  });

  it("bounds response processing without exposing body content", async () => {
    const result = await executePurpleStepInPage(pageInput({ maxResponseBytes: 8 }), async () => new Response("0123456789"));
    expect(result).toMatchObject({ status: 200, truncated: true, responseBytes: 8, responseSha256: null });
    expect(result).not.toHaveProperty("body");
    expect(result).not.toHaveProperty("preview");
  });
});
