import { getApiTrafficBySequence } from "@/lib/api-traffic";
import { getApiTrafficPauseStatus } from "@/lib/api-traffic-pause";
import { createRaceSnapshot, validateRaceFlow, type RaceFlow, type RaceRequestSnapshot } from "@/lib/race-flow";
import { defaultSettings, getStorage } from "@/lib/storage";
import { isSiteAllowed } from "@/lib/site-access";

export const RACE_TIMEOUT_MS = 15_000;
export const MAX_RACE_RESPONSE_BYTES = 1024 * 1024;

export type RaceRunRequest = {
  tabId: number;
  runId: string;
  expectedPageUrl: string;
  flow: RaceFlow;
  concurrency: number;
};

export type RaceOutcome = {
  stepIndex: number;
  attempt: number;
  status: number;
  durationMs: number;
  responseBytes: number;
  preview: string;
  truncated: boolean;
  error?: string;
};

export type RaceRunResult = {
  runId: string;
  state: "succeeded" | "partial" | "cancelled" | "failed";
  outcomes: RaceOutcome[];
  error?: string;
};

type PageRunInput = {
  runId: string;
  expectedPageUrl: string;
  steps: RaceRequestSnapshot[];
  raceStepIndex: number;
  concurrency: number;
  timeoutMs: number;
  maxResponseBytes: number;
};

type RaceTransport = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
type RaceWindow = Window & typeof globalThis & { __devToolzRaceControllers?: Map<string, AbortController> };

const activeRuns = new Map<number, string>();

export async function runRaceFlow(request: RaceRunRequest): Promise<RaceRunResult> {
  if (!request || !Number.isInteger(request.tabId) || typeof request.runId !== "string" || !request.runId) {
    throw new Error("Race request is malformed.");
  }
  if (activeRuns.has(request.tabId)) throw new Error("A race is already running in this tab.");
  const tab = await chrome.tabs.get(request.tabId);
  const pageUrl = assertExpectedPage(tab.url, request.expectedPageUrl);
  const origin = new URL(pageUrl).origin;
  await validateRacePermission(pageUrl);
  validateRaceFlow(request.flow, origin, request.concurrency);
  await validateCapturedSteps(request.flow, origin);

  const currentTab = await chrome.tabs.get(request.tabId);
  assertExpectedPage(currentTab.url, request.expectedPageUrl);
  await validateRacePermission(currentTab.url ?? "");

  activeRuns.set(request.tabId, request.runId);
  try {
    const [injection] = await chrome.scripting.executeScript({
      target: { tabId: request.tabId },
      world: "ISOLATED",
      func: executeRaceInPage,
      args: [{
        runId: request.runId,
        expectedPageUrl: request.expectedPageUrl,
        steps: request.flow.steps,
        raceStepIndex: request.flow.raceStepIndex,
        concurrency: request.concurrency,
        timeoutMs: RACE_TIMEOUT_MS,
        maxResponseBytes: MAX_RACE_RESPONSE_BYTES,
      } satisfies PageRunInput],
    });
    if (!injection?.result) throw new Error("The page did not return race results.");
    return injection.result as RaceRunResult;
  } finally {
    if (activeRuns.get(request.tabId) === request.runId) activeRuns.delete(request.tabId);
  }
}

export async function cancelRaceFlow(tabId: number, runId: string): Promise<{ cancelled: boolean }> {
  if (activeRuns.get(tabId) !== runId) return { cancelled: false };
  await chrome.scripting.executeScript({
    target: { tabId },
    world: "ISOLATED",
    func: (id: string) => {
      const target = window as RaceWindow;
      const controller = target.__devToolzRaceControllers?.get(id);
      controller?.abort("cancelled");
      return Boolean(controller);
    },
    args: [runId],
  });
  return { cancelled: true };
}

async function validateRacePermission(pageUrl: string): Promise<void> {
  const [storedSettings, pause] = await Promise.all([
    getStorage("settings"),
    getApiTrafficPauseStatus(pageUrl),
  ]);
  const settings = { ...defaultSettings, ...storedSettings };
  if (!settings.enabled || pause.paused || !isSiteAllowed(pageUrl, {
    mode: settings.siteAccessMode,
    sites: settings.siteAccessSites,
  })) throw new Error("Capture settings do not permit this page.");
}

async function validateCapturedSteps(flow: RaceFlow, origin: string): Promise<void> {
  for (const step of flow.steps) {
    const exchange = await getApiTrafficBySequence(step.exchangeSequence);
    if (!exchange) throw new Error("A race step no longer exists in captured traffic.");
    const expected = createRaceSnapshot(exchange, origin);
    if (JSON.stringify(expected) !== JSON.stringify(step)) throw new Error("A race step changed after capture.");
  }
}

export function assertExpectedPage(actualUrl: string | undefined, expectedUrl: string): string {
  if (!actualUrl || actualUrl !== expectedUrl) throw new Error("The inspected tab navigated. Review the flow again.");
  const url = new URL(actualUrl);
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("Race Lab requires an HTTP(S) page.");
  return actualUrl;
}

export async function executeRaceInPage(
  input: PageRunInput,
  transport: RaceTransport = fetch,
  externalSignal?: AbortSignal
): Promise<RaceRunResult> {
  const outcomes: RaceOutcome[] = [];
  if (typeof location !== "undefined" && location.href !== input.expectedPageUrl) {
    return { runId: input.runId, state: "failed", outcomes, error: "The inspected tab navigated before dispatch." };
  }
  const rootController = new AbortController();
  const target = globalThis as RaceWindow;
  const controllers = target.__devToolzRaceControllers ??= new Map<string, AbortController>();
  controllers.set(input.runId, rootController);
  const cancel = () => rootController.abort("cancelled");
  externalSignal?.addEventListener("abort", cancel, { once: true });

  const runRequest = async (step: RaceRequestSnapshot, stepIndex: number, attempt: number): Promise<RaceOutcome> => {
    const controller = new AbortController();
    const abort = () => controller.abort(rootController.signal.reason);
    rootController.signal.addEventListener("abort", abort, { once: true });
    const timeout = globalThis.setTimeout(() => controller.abort("timeout"), input.timeoutMs);
    const startedAt = performance.now();
    try {
      const response = await transport(step.url, {
        method: step.method,
        headers: Object.fromEntries(step.headers.map(({ name, value }) => [name, value])),
        body: step.body,
        credentials: "include",
        redirect: "manual",
        signal: controller.signal,
      });
      if (response.type === "opaqueredirect" || (response.status >= 300 && response.status < 400)) {
        throw new Error("Redirect blocked");
      }
      const reader = response.body?.getReader();
      const chunks: Uint8Array[] = [];
      let responseBytes = 0;
      let capturedBytes = 0;
      let truncated = false;
      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          responseBytes += value.byteLength;
          if (capturedBytes < input.maxResponseBytes) {
            const remaining = input.maxResponseBytes - capturedBytes;
            const chunk = value.slice(0, remaining);
            chunks.push(chunk);
            capturedBytes += chunk.byteLength;
          }
          if (responseBytes > input.maxResponseBytes) {
            truncated = true;
            await reader.cancel();
            break;
          }
        }
      }
      const bytes = new Uint8Array(capturedBytes);
      let offset = 0;
      for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
      return {
        stepIndex, attempt, status: response.status,
        durationMs: performance.now() - startedAt,
        responseBytes, preview: new TextDecoder().decode(bytes), truncated,
      };
    } catch (error) {
      const reason = controller.signal.aborted
        ? (rootController.signal.aborted ? "Cancelled" : "Timed out")
        : error instanceof Error ? error.message : "Request failed";
      return {
        stepIndex, attempt, status: 0,
        durationMs: performance.now() - startedAt,
        responseBytes: 0, preview: "", truncated: false, error: reason,
      };
    } finally {
      globalThis.clearTimeout(timeout);
      rootController.signal.removeEventListener("abort", abort);
    }
  };

  try {
    for (let index = 0; index < input.steps.length; index += 1) {
      if (index === input.raceStepIndex) continue;
      const step = input.steps[index];
      if (!step) throw new Error("Setup step is missing");
      const outcome = await runRequest(step, index, 0);
      outcomes.push(outcome);
      if (outcome.error) return { runId: input.runId, state: rootController.signal.aborted ? "cancelled" : "failed", outcomes, error: outcome.error };
    }
    const raceStep = input.steps[input.raceStepIndex];
    if (!raceStep) throw new Error("Race step is missing");
    const burst = await Promise.all(Array.from({ length: input.concurrency }, (_, attempt) =>
      runRequest(raceStep, input.raceStepIndex, attempt)
    ));
    outcomes.push(...burst);
    const failures = burst.filter((outcome) => outcome.error).length;
    return {
      runId: input.runId,
      state: rootController.signal.aborted ? "cancelled" : failures === 0 ? "succeeded" : failures === burst.length ? "failed" : "partial",
      outcomes,
    };
  } catch (error) {
    return { runId: input.runId, state: "failed", outcomes, error: error instanceof Error ? error.message : "Race failed" };
  } finally {
    externalSignal?.removeEventListener("abort", cancel);
    controllers.delete(input.runId);
  }
}
