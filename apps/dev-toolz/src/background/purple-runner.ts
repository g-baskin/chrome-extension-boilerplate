import { getApiTrafficBySequence } from "@/lib/api-traffic";
import { getApiTrafficPauseStatus } from "@/lib/api-traffic-pause";
import { queryLogHistoryOffThread } from "@/lib/log-history-client";
import {
  validateIdentityProfile,
  validatePurpleFlow,
  type CapturedRequestSnapshot,
  type IdentityProfile,
  type PurpleFlow,
  type PurpleRun,
  type PurpleRunStepOutcome,
  type PurpleStep,
} from "@/lib/purple-flow";
import { createRaceSnapshot } from "@/lib/race-flow";
import { isSiteAllowed } from "@/lib/site-access";
import { defaultSettings, getStorage } from "@/lib/storage";

export const PURPLE_STEP_TIMEOUT_MS = 15_000;
export const MAX_PURPLE_RESPONSE_BYTES = 1024 * 1024;

type PurpleRunRequest = {
  tabId: number;
  runId: string;
  expectedPageUrl: string;
  flow: PurpleFlow;
  identity: IdentityProfile;
  /** Ephemeral complete Authorization value. It is forwarded only to fetch. */
  authorizationHeader?: string;
};

type PageStepInput = {
  runId: string;
  expectedPageUrl: string;
  request: CapturedRequestSnapshot;
  credentials: RequestCredentials;
  authorizationHeader?: string;
  timeoutMs: number;
  maxResponseBytes: number;
};

type PageStepResult = {
  status: number | null;
  responseBytes: number;
  responseSha256: string | null;
  truncated: boolean;
  error: "cancelled" | "timeout" | "redirect" | "navigation" | "network" | null;
};

type PurpleWindow = Window & typeof globalThis & {
  __devToolzPurpleControllers?: Map<string, AbortController>;
};

type PurpleTransport = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

const activeRuns = new Map<number, { runId: string; cancelled: boolean; controller: AbortController }>();

class InconclusiveExecutionError extends Error {}

export async function runPurpleFlow(request: PurpleRunRequest): Promise<PurpleRun> {
  validateRequest(request);
  if (activeRuns.has(request.tabId)) throw new Error("A Purple proof run is already active in this tab.");
  const activeRun = { runId: request.runId, cancelled: false, controller: new AbortController() };
  activeRuns.set(request.tabId, activeRun);
  const startedAt = new Date().toISOString();
  const outcomes: PurpleRunStepOutcome[] = [];

  try {
    const expectedPage = parseExpectedPage(request.expectedPageUrl);
    const origin = expectedPage.origin;
    validatePurpleFlow(request.flow);
    if (request.flow.origin !== origin) throw new Error("Purple flow origin no longer matches the inspected page.");

    for (const step of request.flow.steps) {
      if (activeRun.cancelled) {
        outcomes.push(inconclusive(step, "Run cancelled."));
        break;
      }

      // These checks intentionally happen again immediately before every dispatch.
      try {
        await validateCurrentPage(request.tabId, request.expectedPageUrl);
        await validateCapturedStep(step, origin);
      } catch (error) {
        if (!(error instanceof InconclusiveExecutionError)) throw error;
        outcomes.push(inconclusive(step, error.message));
        break;
      }

      const [injection] = await chrome.scripting.executeScript({
        target: { tabId: request.tabId },
        world: "ISOLATED",
        func: executePurpleStepInPage,
        args: [{
          runId: request.runId,
          expectedPageUrl: request.expectedPageUrl,
          request: step.capturedRequest,
          credentials: request.identity.mode === "anonymous" ? "omit" : "include",
          ...(request.authorizationHeader === undefined ? {} : { authorizationHeader: request.authorizationHeader }),
          timeoutMs: PURPLE_STEP_TIMEOUT_MS,
          maxResponseBytes: MAX_PURPLE_RESPONSE_BYTES,
        } satisfies PageStepInput],
      });
      const result = injection?.result as PageStepResult | undefined;
      if (!result) {
        outcomes.push(inconclusive(step, "No execution result was returned."));
        break;
      }
      outcomes.push(scoreStep(step, result));
      if (result.error) break;
    }

    for (const step of request.flow.steps.slice(outcomes.length)) {
      outcomes.push(inconclusive(step, "Step was not dispatched."));
    }
    await scoreDetections(request.flow.steps, outcomes, Date.parse(startedAt), Date.now(), activeRun.controller.signal);

    const cancelled = activeRun.cancelled || outcomes.some((outcome) => outcome.error === "Run cancelled.");
    const inconclusiveRun = outcomes.some((outcome, index) =>
      outcome.preventionOutcome === "inconclusive" ||
      (Boolean(request.flow.steps[index]?.expectation.detectionQuery) && outcome.detectionOutcome === "inconclusive")
    );
    return {
      id: request.runId,
      flowId: request.flow.id,
      flowName: request.flow.name,
      origin,
      identityDisplayName: request.identity.displayName,
      startedAt,
      completedAt: new Date().toISOString(),
      status: cancelled ? "cancelled" : inconclusiveRun ? "inconclusive" : "completed",
      steps: outcomes,
      preventionScore: preventionScore(request.flow.steps, outcomes),
      detectionScore: detectionScore(request.flow.steps, outcomes),
    };
  } finally {
    // Do not retain the request or its optional secret in module state.
    if (activeRuns.get(request.tabId) === activeRun) activeRuns.delete(request.tabId);
  }
}

export async function cancelPurpleFlow(tabId: number, runId: string): Promise<{ cancelled: boolean }> {
  const activeRun = activeRuns.get(tabId);
  if (!Number.isInteger(tabId) || typeof runId !== "string" || activeRun?.runId !== runId) {
    return { cancelled: false };
  }
  activeRun.cancelled = true;
  activeRun.controller.abort("cancelled");
  // The run keeps its lock until the aborted page execution has actually exited.
  await chrome.scripting.executeScript({
    target: { tabId },
    world: "ISOLATED",
    func: (id: string) => {
      const target = window as PurpleWindow;
      const controller = target.__devToolzPurpleControllers?.get(id);
      controller?.abort("cancelled");
      return Boolean(controller);
    },
    args: [runId],
  }).catch(() => undefined);
  return { cancelled: true };
}

function validateRequest(request: PurpleRunRequest): void {
  if (!request || !Number.isInteger(request.tabId) || request.tabId < 0 || typeof request.runId !== "string" || !request.runId || request.runId.length > 128 || typeof request.expectedPageUrl !== "string") {
    throw new Error("Purple proof request is malformed.");
  }
  parseExpectedPage(request.expectedPageUrl);
  validateIdentityProfile(request.identity);
  if (request.identity.mode === "authorization-header") {
    if (!isValidAuthorizationValue(request.authorizationHeader, request.identity.authorizationScheme)) {
      throw new Error("Authorization value is malformed.");
    }
  } else if (request.authorizationHeader !== undefined) {
    throw new Error("Only an Authorization header identity may supply a value.");
  }
}

function isValidAuthorizationValue(value: unknown, scheme: string | null): value is string {
  if (typeof value !== "string" || typeof scheme !== "string" || value.length === 0 || value.length > 8192 || /[\r\n\0]/.test(value)) return false;
  if (value.slice(0, scheme.length).toLowerCase() !== scheme.toLowerCase() || value[scheme.length] !== " " || value.length === scheme.length + 1) return false;
  try {
    const headers = new Headers({ Authorization: value });
    return headers.get("Authorization") === value;
  } catch {
    return false;
  }
}

function parseExpectedPage(rawUrl: string): URL {
  let url: URL;
  try { url = new URL(rawUrl); } catch { throw new Error("Purple proof runs require an HTTP(S) page."); }
  if ((url.protocol !== "http:" && url.protocol !== "https:") || url.username || url.password) {
    throw new Error("Purple proof runs require an HTTP(S) page.");
  }
  return url;
}

async function validateCurrentPage(tabId: number, expectedPageUrl: string): Promise<void> {
  const tab = await chrome.tabs.get(tabId);
  if (!tab.url) throw new Error("The inspected tab is unavailable.");
  const expected = parseExpectedPage(expectedPageUrl);
  const current = parseExpectedPage(tab.url);
  if (current.origin !== expected.origin) throw new Error("The inspected tab changed origin. Review the Purple flow again.");
  if (tab.url !== expectedPageUrl) throw new InconclusiveExecutionError("The inspected tab navigated before dispatch.");
  await validatePermission(tab.url);
}

async function validatePermission(pageUrl: string): Promise<void> {
  const [storedSettings, pause] = await Promise.all([getStorage("settings"), getApiTrafficPauseStatus(pageUrl)]);
  const settings = { ...defaultSettings, ...storedSettings };
  if (!settings.enabled || pause.paused || !isSiteAllowed(pageUrl, { mode: settings.siteAccessMode, sites: settings.siteAccessSites })) {
    throw new Error("Capture settings do not permit this page.");
  }
}

async function validateCapturedStep(step: PurpleStep, origin: string): Promise<void> {
  const exchange = await getApiTrafficBySequence(step.capturedRequest.exchangeSequence);
  if (!exchange) throw new InconclusiveExecutionError("A Purple step no longer exists in captured traffic.");
  if (exchange.pageUrl === null || exchange.pageUrl === undefined) {
    throw new InconclusiveExecutionError("A Purple step is missing exact-page capture evidence.");
  }
  if (exchange.pageUrl !== step.capturedRequest.capturedPageUrl) {
    throw new InconclusiveExecutionError("A Purple step no longer belongs to the exact inspected page.");
  }
  const expected = createRaceSnapshot(exchange, origin);
  if (!sameSnapshot(expected, step.capturedRequest)) {
    throw new InconclusiveExecutionError("A Purple step changed after capture.");
  }
}

function sameSnapshot(left: CapturedRequestSnapshot, right: CapturedRequestSnapshot): boolean {
  return left.exchangeSequence === right.exchangeSequence &&
    left.capturedPageUrl === right.capturedPageUrl &&
    left.method === right.method &&
    left.url === right.url &&
    left.body === right.body &&
    left.mimeType === right.mimeType &&
    left.headers.length === right.headers.length &&
    left.headers.every((header, index) =>
      header.name === right.headers[index]?.name && header.value === right.headers[index]?.value
    );
}

function inconclusive(step: PurpleStep, error: string): PurpleRunStepOutcome {
  return {
    stepId: step.id, preventionOutcome: "inconclusive", detectionOutcome: "inconclusive", status: null,
    responseLength: null, responseSha256: null, responseTruncated: false, evidenceSequenceIds: [], error,
  };
}

export function scoreStep(step: PurpleStep, result: PageStepResult): PurpleRunStepOutcome {
  if (result.error || result.status === null) {
    const messages: Record<Exclude<PageStepResult["error"], null>, string> = {
      cancelled: "Run cancelled.", timeout: "Step timed out.", redirect: "Redirect refused.",
      navigation: "The inspected tab navigated before dispatch.", network: "Request failed.",
    };
    return inconclusive(step, result.error ? messages[result.error] : "Request produced no status.");
  }
  const expectation = step.expectation;
  const statusMatches = expectation.expectedStatus !== null
    ? result.status === expectation.expectedStatus
    : expectation.expectedStatusClass !== null
      ? Math.floor(result.status / 100) === Number(expectation.expectedStatusClass[0])
      : true;
  let preventionOutcome: PurpleRunStepOutcome["preventionOutcome"];
  if (!statusMatches) preventionOutcome = "inconclusive";
  else if (expectation.prevention === "blocked") preventionOutcome = expectation.expectedStatus === null && expectation.expectedStatusClass === null
    ? (result.status === 401 || result.status === 403 ? "prevented" : "allowed")
    : "prevented";
  else preventionOutcome = result.status === 401 || result.status === 403 ? "prevented" : "allowed";
  return {
    stepId: step.id, preventionOutcome, detectionOutcome: "inconclusive", status: result.status,
    responseLength: result.responseBytes, responseSha256: result.responseSha256, responseTruncated: result.truncated,
    evidenceSequenceIds: [], error: null,
  };
}

async function scoreDetections(steps: PurpleStep[], outcomes: PurpleRunStepOutcome[], earliest: number, latest: number, signal: AbortSignal): Promise<void> {
  await Promise.all(steps.map(async (step, index) => {
    const outcome = outcomes[index];
    if (!outcome || !step.expectation.detectionQuery || outcome.error) return;
    try {
      const result = await queryLogHistoryOffThread({ rawQuery: step.expectation.detectionQuery, source: "", earliestTimestamp: earliest, latestTimestamp: latest }, signal);
      if (result.error) return;
      outcome.evidenceSequenceIds = result.records.map(({ id }) => /^(?:api|red-team)-(\d+)$/.exec(id)?.[1]).filter((value): value is string => value !== undefined).map(Number);
      outcome.detectionOutcome = result.matching > 0 ? "detected" : result.scanned > 0 ? "missed" : "inconclusive";
    } catch {
      // Search/capture unavailability is missing evidence, never a false miss or pass.
    }
  }));
}

function preventionScore(steps: PurpleStep[], outcomes: PurpleRunStepOutcome[]) {
  let met = 0; let total = 0;
  steps.forEach((step, index) => {
    if (step.expectation.prevention === "observe-only") return;
    total += 1;
    const expected = step.expectation.prevention === "blocked" ? "prevented" : "allowed";
    if (outcomes[index]?.preventionOutcome === expected) met += 1;
  });
  return { met, total };
}

function detectionScore(steps: PurpleStep[], outcomes: PurpleRunStepOutcome[]) {
  let met = 0; let total = 0;
  steps.forEach((step, index) => {
    if (!step.expectation.detectionQuery) return;
    total += 1;
    if (outcomes[index]?.detectionOutcome === "detected") met += 1;
  });
  return { met, total };
}

export async function executePurpleStepInPage(input: PageStepInput, transport: PurpleTransport = fetch, externalSignal?: AbortSignal): Promise<PageStepResult> {
  const empty = (error: PageStepResult["error"]): PageStepResult => ({ status: null, responseBytes: 0, responseSha256: null, truncated: false, error });
  if (typeof location !== "undefined" && location.href !== input.expectedPageUrl) return empty("navigation");
  const controller = new AbortController();
  const target = globalThis as PurpleWindow;
  const controllers = target.__devToolzPurpleControllers ??= new Map<string, AbortController>();
  controllers.set(input.runId, controller);
  const cancel = () => controller.abort("cancelled");
  externalSignal?.addEventListener("abort", cancel, { once: true });
  const timeout = globalThis.setTimeout(() => controller.abort("timeout"), input.timeoutMs);
  let headers: Headers | undefined;
  try {
    headers = new Headers(input.request.headers.map(({ name, value }) => [name, value]));
    if (input.authorizationHeader !== undefined) headers.set("Authorization", input.authorizationHeader);
    const response = await transport(input.request.url, {
      method: input.request.method, headers, body: input.request.body, credentials: input.credentials,
      redirect: "manual", signal: controller.signal,
    });
    if (response.type === "opaqueredirect" || (response.status >= 300 && response.status < 400)) return empty("redirect");
    const reader = response.body?.getReader();
    let responseBytes = 0;
    let truncated = false;
    const chunks: Uint8Array[] = [];
    if (reader) while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const remaining = input.maxResponseBytes - responseBytes;
      if (value.byteLength > remaining) {
        responseBytes = input.maxResponseBytes;
        truncated = true;
        await reader.cancel();
        break;
      }
      responseBytes += value.byteLength;
      chunks.push(value);
    }
    if (truncated) return { status: response.status, responseBytes, responseSha256: null, truncated, error: null };
    if (controller.signal.aborted) throw new DOMException("Aborted", "AbortError");
    const bytes = new Uint8Array(responseBytes);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    const responseSha256 = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
    return { status: response.status, responseBytes, responseSha256, truncated: false, error: null };
  } catch {
    return empty(controller.signal.aborted ? (controller.signal.reason === "timeout" ? "timeout" : "cancelled") : "network");
  } finally {
    headers?.delete("Authorization");
    globalThis.clearTimeout(timeout);
    externalSignal?.removeEventListener("abort", cancel);
    controllers.delete(input.runId);
  }
}
