import {
  createApiBody,
  createRequestBody,
  redactHeaders,
  redactUrl,
  saveApiExchange,
  type ApiBody,
  type ApiExchange,
  type ApiHeader,
} from "@/lib/api-traffic";

const PROTOCOL_VERSION = "1.3";
const ATTACHED_TAB_KEY = "apiTrafficAttachedTab";
const API_RESOURCE_TYPES = new Set(["Fetch", "XHR"]);

type PendingRequest = {
  tabId: number;
  pageUrl: string;
  requestId: string;
  resourceType: string;
  startedAt: string;
  startedTimestamp: number;
  request: ApiExchange["request"];
  response: Omit<ApiExchange["response"], "body"> | null;
};

const pendingRequests = new Map<string, PendingRequest>();
const capturedTabUrls = new Map<number, string>();

chrome.debugger.onEvent.addListener((source, method, params) => {
  if (source.tabId === undefined || !params) return;
  void handleDebuggerEvent(source.tabId, method, params).catch((error: unknown) => {
    console.error("[API Traffic] Capture failed", {
      method,
      error: error instanceof Error ? error.message : "Unknown error",
    });
  });
});

chrome.debugger.onDetach.addListener((source) => {
  if (source.tabId === undefined) return;
  for (const [key, pending] of pendingRequests) {
    if (pending.tabId === source.tabId) pendingRequests.delete(key);
  }
  capturedTabUrls.delete(source.tabId);
  void chrome.storage.session.get(ATTACHED_TAB_KEY).then((stored) => {
    if (stored[ATTACHED_TAB_KEY] === source.tabId) {
      return chrome.storage.session.remove(ATTACHED_TAB_KEY);
    }
  });
});

export async function captureActiveTab(): Promise<void> {
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if (tab?.id === undefined) return;
  await captureTab(tab.id, tab.url ?? "");
}

export async function captureTab(tabId: number, url: string): Promise<void> {
  capturedTabUrls.set(tabId, url);
  const stored = await chrome.storage.session.get(ATTACHED_TAB_KEY);
  const previousTabId = stored[ATTACHED_TAB_KEY];
  const inspectable = isInspectableUrl(url);
  if (typeof previousTabId === "number" && previousTabId === tabId) {
    if (!inspectable) {
      await chrome.debugger.detach({ tabId }).catch(() => undefined);
      await chrome.storage.session.remove(ATTACHED_TAB_KEY);
    }
    return;
  }

  if (typeof previousTabId === "number") {
    await chrome.debugger.detach({ tabId: previousTabId }).catch(() => undefined);
    await chrome.storage.session.remove(ATTACHED_TAB_KEY);
  }
  if (!inspectable) return;

  await chrome.debugger.attach({ tabId }, PROTOCOL_VERSION);
  try {
    await chrome.debugger.sendCommand({ tabId }, "Network.enable", {
      maxTotalBufferSize: 100_000_000,
      maxResourceBufferSize: 50_000_000,
      maxPostDataSize: 10_000_000,
      enableDurableMessages: true,
    });
    await chrome.storage.session.set({ [ATTACHED_TAB_KEY]: tabId });
  } catch (error: unknown) {
    await chrome.debugger.detach({ tabId }).catch(() => undefined);
    throw error;
  }
}

export async function stopApiTrafficCapture(): Promise<void> {
  const stored = await chrome.storage.session.get(ATTACHED_TAB_KEY);
  const tabId = stored[ATTACHED_TAB_KEY];
  if (typeof tabId === "number") {
    await chrome.debugger.detach({ tabId }).catch(() => undefined);
  }
  await chrome.storage.session.remove(ATTACHED_TAB_KEY);
  pendingRequests.clear();
  capturedTabUrls.clear();
}

async function handleDebuggerEvent(
  tabId: number,
  method: string,
  rawParams: object
): Promise<void> {
  const params = asRecord(rawParams);
  const requestId = readString(params, "requestId");
  if (!requestId) return;
  const key = `${tabId}:${requestId}`;

  if (method === "Network.requestWillBeSent") {
    const request = asRecord(params.request);
    const timestamp = readNumber(params, "timestamp") ?? 0;
    const wallTime = readNumber(params, "wallTime");
    const headers = toHeaders(asRecord(request.headers));
    pendingRequests.set(key, {
      tabId,
      pageUrl: capturedTabUrls.get(tabId) ?? "",
      requestId,
      resourceType: readString(params, "type") ?? "Other",
      startedAt: wallTime ? new Date(wallTime * 1000).toISOString() : new Date().toISOString(),
      startedTimestamp: timestamp,
      request: {
        method: readString(request, "method") ?? "GET",
        url: redactUrl(readString(request, "url") ?? ""),
        mimeType: findHeader(headers, "content-type"),
        headers: redactHeaders(headers),
        body: createOptionalBody(readString(request, "postData"), findHeader(headers, "content-type")),
      },
      response: null,
    });
    return;
  }

  const pending = pendingRequests.get(key);
  if (!pending) return;

  if (method === "Network.responseReceived") {
    const response = asRecord(params.response);
    pending.response = {
      status: readNumber(response, "status") ?? 0,
      statusText: readString(response, "statusText") ?? "",
      mimeType: readString(response, "mimeType") ?? "",
      headers: redactHeaders(toHeaders(asRecord(response.headers))),
    };
    return;
  }

  if (method === "Network.loadingFinished") {
    pendingRequests.delete(key);
    if (!shouldCapture(pending)) return;
    await refreshRequestBody(pending);
    const body = await getResponseBody(tabId, requestId, pending.response?.mimeType ?? "");
    const finishedTimestamp = readNumber(params, "timestamp") ?? pending.startedTimestamp;
    await persistExchange(pending, body, finishedTimestamp);
    return;
  }

  if (method === "Network.loadingFailed") {
    pendingRequests.delete(key);
    if (!API_RESOURCE_TYPES.has(pending.resourceType)) return;
    const errorText = readString(params, "errorText") ?? "Request failed";
    pending.response = {
      status: 0,
      statusText: errorText,
      mimeType: "",
      headers: [],
    };
    const finishedTimestamp = readNumber(params, "timestamp") ?? pending.startedTimestamp;
    await persistExchange(pending, { kind: "text", raw: "" }, finishedTimestamp);
  }
}

async function refreshRequestBody(pending: PendingRequest): Promise<void> {
  if (pending.request.method === "GET" || pending.request.method === "HEAD") return;
  try {
    const result = await chrome.debugger.sendCommand(
      { tabId: pending.tabId },
      "Network.getRequestPostData",
      { requestId: pending.requestId }
    );
    const postData = readString(asRecord(result), "postData");
    if (postData !== undefined) {
      pending.request.body = createRequestBody(postData, pending.request.mimeType ?? "");
    }
  } catch {
    // Some request types do not expose post data through CDP.
  }
}

async function getResponseBody(
  tabId: number,
  requestId: string,
  mimeType: string
): Promise<ApiBody> {
  try {
    const result = await chrome.debugger.sendCommand(
      { tabId },
      "Network.getResponseBody",
      { requestId }
    );
    const response = asRecord(result);
    const raw = readString(response, "body") ?? "";
    const decoded = response.base64Encoded === true ? decodeBase64(raw) : raw;
    return createApiBody(decoded, mimeType);
  } catch {
    return { kind: "text", raw: "Response body unavailable" };
  }
}

async function persistExchange(
  pending: PendingRequest,
  body: ApiBody,
  finishedTimestamp: number
): Promise<void> {
  const response = pending.response ?? {
    status: 0,
    statusText: "No response",
    mimeType: "",
    headers: [],
  };
  const saved = await saveApiExchange({
    pageUrl: redactUrl(pending.pageUrl),
    startedAt: pending.startedAt,
    durationMs: Math.max(0, finishedTimestamp - pending.startedTimestamp) * 1000,
    request: pending.request,
    response: { ...response, body },
  });
  await chrome.runtime.sendMessage({ type: "API_TRAFFIC_CAPTURED", payload: saved }).catch(() => undefined);
}

function shouldCapture(pending: PendingRequest): boolean {
  const mimeType = pending.response?.mimeType.toLowerCase() ?? "";
  return (
    API_RESOURCE_TYPES.has(pending.resourceType) ||
    mimeType.includes("application/json") ||
    mimeType.includes("+json")
  );
}

function createOptionalBody(raw: string | undefined, mimeType: string | null): ApiBody | null {
  return raw === undefined ? null : createRequestBody(raw, mimeType ?? "");
}

function toHeaders(rawHeaders: Record<string, unknown>): ApiHeader[] {
  return Object.entries(rawHeaders)
    .filter((entry): entry is [string, string] => typeof entry[1] === "string")
    .map(([name, value]) => ({ name, value }));
}

function findHeader(headers: ApiHeader[], name: string): string | null {
  return headers.find((header) => header.name.toLowerCase() === name)?.value ?? null;
}

function decodeBase64(value: string): string {
  try {
    const bytes = Uint8Array.from(atob(value), (character) => character.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  } catch {
    return value;
  }
}

function isInspectableUrl(url: string): boolean {
  return url.startsWith("http://") || url.startsWith("https://");
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function readString(record: Record<string, unknown>, key: string): string | undefined {
  return typeof record[key] === "string" ? record[key] : undefined;
}

function readNumber(record: Record<string, unknown>, key: string): number | undefined {
  return typeof record[key] === "number" ? record[key] : undefined;
}
