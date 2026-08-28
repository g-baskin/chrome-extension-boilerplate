import {
  createApiBody,
  createRequestBody,
  detectMediaKind,
  MEDIA_BODY_OMITTED,
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
  initiator: NonNullable<ApiExchange["initiator"]>;
  request: ApiExchange["request"];
  response: Omit<ApiExchange["response"], "body"> | null;
};

const pendingRequests = new Map<string, PendingRequest>();
const capturedTabUrls = new Map<number, string>();
let captureOperation: Promise<void> = Promise.resolve();

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

export function captureTab(
  tabId: number,
  url: string,
  isCurrent: () => boolean = () => true
): Promise<void> {
  return enqueueCaptureOperation(() => captureTabNow(tabId, url, isCurrent));
}

async function captureTabNow(
  tabId: number,
  url: string,
  isCurrent: () => boolean
): Promise<void> {
  const stored = await chrome.storage.session.get(ATTACHED_TAB_KEY);
  if (!isCurrent()) return;

  const previousTabId = stored[ATTACHED_TAB_KEY];
  const inspectable = isInspectableUrl(url);
  if (typeof previousTabId === "number" && previousTabId === tabId) {
    if (!inspectable || !isCurrent()) {
      await chrome.debugger.detach({ tabId }).catch(() => undefined);
      await chrome.storage.session.remove(ATTACHED_TAB_KEY);
    }
    return;
  }

  if (typeof previousTabId === "number") {
    await chrome.debugger.detach({ tabId: previousTabId }).catch(() => undefined);
    await chrome.storage.session.remove(ATTACHED_TAB_KEY);
  }
  if (!inspectable || !isCurrent()) return;

  await chrome.debugger.attach({ tabId }, PROTOCOL_VERSION);
  if (!isCurrent()) {
    await chrome.debugger.detach({ tabId }).catch(() => undefined);
    return;
  }

  capturedTabUrls.set(tabId, url);
  await chrome.storage.session.set({ [ATTACHED_TAB_KEY]: tabId });
  if (!isCurrent()) {
    await chrome.debugger.detach({ tabId }).catch(() => undefined);
    await chrome.storage.session.remove(ATTACHED_TAB_KEY);
    return;
  }

  try {
    await chrome.debugger.sendCommand({ tabId }, "Network.enable", {
      maxTotalBufferSize: 100_000_000,
      maxResourceBufferSize: 50_000_000,
      maxPostDataSize: 10_000_000,
      enableDurableMessages: true,
    });
    if (!isCurrent()) {
      await chrome.debugger.detach({ tabId }).catch(() => undefined);
      await chrome.storage.session.remove(ATTACHED_TAB_KEY);
    }
  } catch (error: unknown) {
    await chrome.debugger.detach({ tabId }).catch(() => undefined);
    await chrome.storage.session.remove(ATTACHED_TAB_KEY);
    throw error;
  }
}

export function stopApiTrafficCapture(): Promise<void> {
  return enqueueCaptureOperation(stopApiTrafficCaptureNow);
}

async function stopApiTrafficCaptureNow(): Promise<void> {
  const stored = await chrome.storage.session.get(ATTACHED_TAB_KEY);
  const tabId = stored[ATTACHED_TAB_KEY];
  if (typeof tabId === "number") {
    await chrome.debugger.detach({ tabId }).catch(() => undefined);
  }
  await chrome.storage.session.remove(ATTACHED_TAB_KEY);
  pendingRequests.clear();
  capturedTabUrls.clear();
}

function enqueueCaptureOperation(operation: () => Promise<void>): Promise<void> {
  const nextOperation = captureOperation.then(operation, operation);
  captureOperation = nextOperation.catch(() => undefined);
  return nextOperation;
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
      initiator: readInitiator(params.initiator),
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
    const mediaKind = detectMediaKind(
      pending.resourceType,
      pending.response?.mimeType ?? "",
      pending.request.url
    );
    if (mediaKind) pending.request.body = null;
    else await refreshRequestBody(pending);
    const body: ApiBody = mediaKind
      ? { kind: "text", raw: MEDIA_BODY_OMITTED }
      : await getResponseBody(tabId, requestId, pending.response?.mimeType ?? "");
    const finishedTimestamp = readNumber(params, "timestamp") ?? pending.startedTimestamp;
    const transferSize = readNumber(params, "encodedDataLength");
    await persistExchange(pending, body, finishedTimestamp, transferSize);
    return;
  }

  if (method === "Network.loadingFailed") {
    pendingRequests.delete(key);
    if (!shouldCapture(pending)) return;
    const errorText = readString(params, "errorText") ?? "Request failed";
    const mediaKind = detectMediaKind(pending.resourceType, "", pending.request.url);
    if (mediaKind) pending.request.body = null;
    pending.response = {
      status: 0,
      statusText: errorText,
      mimeType: "",
      headers: [],
    };
    const finishedTimestamp = readNumber(params, "timestamp") ?? pending.startedTimestamp;
    await persistExchange(
      pending,
      { kind: "text", raw: mediaKind ? MEDIA_BODY_OMITTED : "" },
      finishedTimestamp
    );
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
  finishedTimestamp: number,
  transferSize?: number
): Promise<void> {
  const response = pending.response ?? {
    status: 0,
    statusText: "No response",
    mimeType: "",
    headers: [],
  };
  const saved = await saveApiExchange({
    pageUrl: redactUrl(pending.pageUrl),
    resourceType: pending.resourceType,
    transferSize,
    startedAt: pending.startedAt,
    durationMs: Math.max(0, finishedTimestamp - pending.startedTimestamp) * 1000,
    initiator: pending.initiator,
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
    mimeType.includes("+json") ||
    detectMediaKind(pending.resourceType, mimeType, pending.request.url) !== null
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

function readInitiator(value: unknown): NonNullable<ApiExchange["initiator"]> {
  const initiator = asRecord(value);
  const urls = readInitiatorUrls(initiator);
  const extensionUrl = urls.find((url) => url.startsWith("chrome-extension://"));
  if (extensionUrl) return { kind: "extension", origin: readOrigin(extensionUrl) };

  const pageUrl = urls.find((url) => url.startsWith("http://") || url.startsWith("https://"));
  if (pageUrl || readString(initiator, "type") === "parser") {
    return { kind: "page", origin: pageUrl ? readOrigin(pageUrl) : null };
  }
  return { kind: "unknown", origin: null };
}

function readInitiatorUrls(initiator: Record<string, unknown>): string[] {
  const urls: string[] = [];
  const directUrl = readString(initiator, "url");
  if (directUrl) urls.push(directUrl);

  let stack = asRecord(initiator.stack);
  for (let depth = 0; depth < 20 && Object.keys(stack).length > 0; depth += 1) {
    const frames = Array.isArray(stack.callFrames) ? stack.callFrames : [];
    for (const frame of frames) {
      const url = readString(asRecord(frame), "url");
      if (url) urls.push(url);
    }
    stack = asRecord(stack.parent);
  }
  return urls;
}

function readOrigin(rawUrl: string): string | null {
  try {
    return new URL(rawUrl).origin;
  } catch {
    return null;
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
