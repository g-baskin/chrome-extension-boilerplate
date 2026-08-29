import {
  API_TRAFFIC_STORE,
  openTrafficDatabase,
  PROTOCOL_EVENTS_STORE,
} from "./traffic-database";
import { enforceTrafficRetention } from "./traffic-retention";
import type { CaptureJourney } from "./capture-journey";

export type ApiHeader = { name: string; value: string };
export type MediaKind =
  | "manifest"
  | "video"
  | "audio"
  | "segment"
  | "subtitle"
  | "key";
export type MediaRole = "direct" | "stream";
export type ApiBody =
  | { kind: "json"; value: unknown }
  | { kind: "malformed-json"; raw: string; error: string }
  | { kind: "text"; raw: string };

export type ApiNetworkInfo = {
  protocol: string;
  connectionId?: string;
  connectionSetup: "observed" | "reused-or-unavailable";
  dnsMs?: number;
  connectMs?: number;
  tlsMs?: number;
  sendMs?: number;
  waitMs?: number;
  receiveMs?: number;
};
export type ApiTrafficFilters = {
  pageHostname: string | null;
  analysis:
    | ""
    | "target"
    | "focus"
    | "discovery"
    | "writes"
    | "failures"
    | "videos"
    | "direct-videos"
    | "stream-manifests"
    | "streaming-videos";
  domain: string;
  attribution:
    | ""
    | "unknown"
    | "unknown-source"
    | "unknown-destination"
    | "no-response"
    | "page-initiated"
    | "extension-initiated"
    | "unknown-initiator";
  method: string;
  status: "" | "failed" | "2xx" | "3xx" | "4xx" | "5xx";
  mimeType: string;
};

export type ApiExchange = {
  sequence?: number;
  pageUrl?: string;
  capture?: CaptureJourney;
  resourceType?: string;
  transferSize?: number;
  network?: ApiNetworkInfo;
  startedAt: string;
  durationMs: number;
  initiator?: {
    kind: "page" | "extension" | "unknown";
    origin: string | null;
  };
  request: {
    method: string;
    url: string;
    mimeType: string | null;
    headers: ApiHeader[];
    body: ApiBody | null;
  };
  response: {
    status: number;
    statusText: string;
    mimeType: string;
    headers: ApiHeader[];
    body: ApiBody;
  };
};

const STORE_NAME = API_TRAFFIC_STORE;
export const REDACTED = "<redacted>";
const SENSITIVE_NAME_REGEX =
  /(authorization|cookie|password|passwd|secret|token|api[_-]?key|session|ctk|sentry_key|access[_-]?token|refresh[_-]?token|id[_-]?token|private[_-]?key|client[_-]?secret|bearer|x[_-]?auth|x[_-]?api|x[_-]?session|jwt|assertion|credential)/i;
const SENSITIVE_QUERY_NAME_REGEX =
  /^(authorization|cookie|password|passwd|secret|token|api[_-]?key|session|ctk|sentry_key|access[_-]?token|refresh[_-]?token|id[_-]?token|private[_-]?key|client[_-]?secret|signature|sig|policy|key[_-]?pair[_-]?id|x-amz-(credential|signature|security-token)|x-goog-(credential|signature))$/i;
export const MEDIA_BODY_OMITTED = "<media body omitted; metadata only>";

export function detectMediaKind(
  resourceType: string | undefined,
  mimeType: string,
  rawUrl: string
): MediaKind | null {
  const normalizedMimeType = mimeType.toLowerCase();
  const normalizedResourceType = resourceType?.toLowerCase();
  if (normalizedResourceType === "preflight") return null;
  const hasMediaContext =
    normalizedResourceType === "media" ||
    normalizedMimeType.startsWith("video/") ||
    normalizedMimeType.startsWith("audio/");
  let pathname = "";
  let protocol = "";
  try {
    const url = new URL(rawUrl);
    pathname = url.pathname.toLowerCase();
    protocol = url.protocol;
  } catch {
    pathname = rawUrl.toLowerCase().split(/[?#]/, 1)[0] ?? "";
  }
  if (protocol === "blob:" || protocol === "data:") return null;

  if (
    normalizedMimeType.includes("mpegurl") ||
    normalizedMimeType.includes("dash+xml") ||
    normalizedMimeType.includes("vnd.ms-sstr+xml") ||
    /\.(?:m3u8?|mpd)$/.test(pathname) ||
    pathname.endsWith(".ism/manifest")
  ) {
    return "manifest";
  }
  if (
    /\.key$/.test(pathname) &&
    (hasMediaContext || normalizedMimeType.includes("application/octet-stream"))
  ) {
    return "key";
  }
  if (
    normalizedMimeType.includes("text/vtt") ||
    normalizedMimeType.includes("ttml+xml") ||
    /\.(?:vtt|srt|ttml|dfxp)$/.test(pathname) ||
    pathname.includes("/timedtext")
  ) {
    return "subtitle";
  }
  if (
    (/\.ts$/.test(pathname) && hasMediaContext) ||
    /\.(?:m2ts|m4s|cmfv|cmfa|fmp4)$/.test(pathname) ||
    pathname.includes("/fragments(") ||
    pathname.includes("/qualitylevels(")
  ) {
    return "segment";
  }
  if (
    normalizedMimeType.startsWith("video/") ||
    /\.(?:mp4|webm|mov|m4v|ogv|mkv|avi|flv|wmv|3gp)$/.test(pathname)
  ) {
    return "video";
  }
  if (
    normalizedMimeType.startsWith("audio/") ||
    /\.(?:mp3|m4a|aac|ogg|oga|wav|flac|opus)$/.test(pathname)
  ) {
    return "audio";
  }
  return normalizedResourceType === "media" ? "video" : null;
}

export function getMediaRole(mediaKind: MediaKind | null): MediaRole | null {
  if (mediaKind === "video" || mediaKind === "audio") return "direct";
  return mediaKind ? "stream" : null;
}

export function createApiBody(
  raw: string,
  mimeType: string,
  redactionEnabled = true
): ApiBody {
  try {
    const value = JSON.parse(raw) as unknown;
    return { kind: "json", value: redactionEnabled ? redactJson(value) : value };
  } catch (error: unknown) {
    return mimeType.toLowerCase().includes("json")
      ? {
          kind: "malformed-json",
          raw,
          error: error instanceof Error ? error.message : "Invalid JSON",
        }
      : { kind: "text", raw };
  }
}

export function createRequestBody(
  raw: string,
  mimeType: string,
  redactionEnabled = true
): ApiBody {
  const normalizedMimeType = mimeType.toLowerCase();
  if (normalizedMimeType.includes("application/x-www-form-urlencoded")) {
    return createFormBody(Array.from(new URLSearchParams(raw).entries()), redactionEnabled);
  }
  if (normalizedMimeType.includes("multipart/form-data")) {
    return redactionEnabled
      ? { kind: "text", raw: "<multipart body omitted to protect uploaded files and secrets>" }
      : { kind: "text", raw };
  }
  return createApiBody(raw, mimeType, redactionEnabled);
}

export function createFormBody(
  params: Array<[string, string]>,
  redactionEnabled = true
): ApiBody {
  return {
    kind: "json",
    value: params.map(([name, value]) => ({
      name,
      value: redactionEnabled && SENSITIVE_NAME_REGEX.test(name) ? REDACTED : value,
    })),
  };
}

export function redactHeaders(headers: ApiHeader[], redactionEnabled = true): ApiHeader[] {
  if (!redactionEnabled) return headers.map(({ name, value }) => ({ name, value }));
  return headers.map(({ name, value }) => ({
    name,
    value: SENSITIVE_NAME_REGEX.test(name) ? REDACTED : value,
  }));
}

export function redactUrl(rawUrl: string, redactionEnabled = true): string {
  if (!redactionEnabled) return rawUrl;
  try {
    const url = new URL(rawUrl);
    for (const name of url.searchParams.keys()) {
      if (SENSITIVE_NAME_REGEX.test(name) || SENSITIVE_QUERY_NAME_REGEX.test(name)) {
        url.searchParams.set(name, REDACTED);
      }
    }
    return url.toString();
  } catch {
    return rawUrl;
  }
}

export function redactJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactJson);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, child]) => [
      key,
      SENSITIVE_NAME_REGEX.test(key) ? REDACTED : redactJson(child),
    ])
  );
}

export async function saveApiExchange(exchange: ApiExchange): Promise<ApiExchange> {
  const database = await openTrafficDatabase();
  const saved = await new Promise<ApiExchange>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, "readwrite");
    const request = transaction.objectStore(STORE_NAME).add(exchange);
    let sequence: number | null = null;
    request.onsuccess = () => {
      sequence = Number(request.result);
    };
    transaction.oncomplete = () => {
      database.close();
      if (sequence === null) reject(new Error("API traffic was not assigned an ID"));
      else resolve({ ...exchange, sequence });
    };
    transaction.onerror = () => {
      database.close();
      reject(transaction.error ?? new Error("Could not save API traffic"));
    };
  });
  try {
    await enforceTrafficRetention();
  } catch (error) {
    console.warn("API traffic was saved, but retention maintenance failed", error);
  }
  return saved;
}

export async function getApiTrafficPage(
  beforeSequence: number | null,
  limit: number,
  filters: ApiTrafficFilters
): Promise<ApiExchange[]> {
  const database = await openTrafficDatabase();
  return new Promise((resolve, reject) => {
    const records: ApiExchange[] = [];
    const transaction = database.transaction(STORE_NAME, "readonly");
    const range = beforeSequence === null ? undefined : IDBKeyRange.upperBound(beforeSequence, true);
    const request = transaction.objectStore(STORE_NAME).openCursor(range, "prev");
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor || records.length >= limit) {
        resolve(records);
        return;
      }
      const exchange = cursor.value as ApiExchange;
      if (matchesApiTraffic(exchange, filters)) records.push(exchange);
      cursor.continue();
    };
    request.onerror = () => reject(request.error ?? new Error("Could not read API traffic"));
    transaction.oncomplete = () => database.close();
    transaction.onerror = () => database.close();
  });
}

export function matchesApiTraffic(
  exchange: ApiExchange,
  filters: ApiTrafficFilters
): boolean {
  const pageMatches =
    filters.pageHostname === null ||
    (filters.pageHostname !== "" && getHostname(exchange.pageUrl) === filters.pageHostname);
  const methodMatches = !filters.method || exchange.request.method === filters.method;
  const mimeFilter = filters.mimeType.toLowerCase();
  const mimeMatches =
    !mimeFilter ||
    exchange.response.mimeType.toLowerCase().includes(mimeFilter) ||
    exchange.request.mimeType?.toLowerCase().includes(mimeFilter) === true;
  const sourceHostname = getHostname(exchange.pageUrl);
  const requestHostname = getHostname(exchange.request.url);
  const domainMatches = matchesApiDomain(requestHostname, filters.domain);
  const noResponse = exchange.response.status === 0;
  const initiatorKind = exchange.initiator?.kind ?? "unknown";
  const isUnknown = !sourceHostname || !requestHostname;
  const isCrossDomain =
    Boolean(sourceHostname) &&
    Boolean(requestHostname) &&
    !sharesSite(sourceHostname, requestHostname);
  const isWrite = ["POST", "PUT", "PATCH", "DELETE"].includes(exchange.request.method);
  const isFailure = noResponse || exchange.response.status >= 400;
  const isDiscovery = isCrossDomain || isUnknown || initiatorKind === "extension";
  const responseMimeType = exchange.response.mimeType.toLowerCase();
  const mediaKind = detectMediaKind(
    exchange.resourceType,
    exchange.response.mimeType,
    exchange.request.url
  );
  const mediaRole = getMediaRole(mediaKind);
  const isStaticAsset =
    responseMimeType.startsWith("text/css") ||
    responseMimeType.startsWith("image/") ||
    responseMimeType.startsWith("font/") ||
    responseMimeType.includes("font") ||
    responseMimeType.startsWith("audio/") ||
    responseMimeType.startsWith("video/");
  const isExtensionTraffic =
    initiatorKind === "extension" ||
    getProtocol(exchange.request.url) === "chrome-extension:" ||
    exchange.request.headers.some((header) =>
      ["extension-major", "extension-version"].includes(header.name.toLowerCase())
    );
  const isTargetSignal =
    !isStaticAsset && !isExtensionTraffic && !isSentryTelemetry(exchange.request.url);
  const analysisMatches =
    !filters.analysis ||
    (filters.analysis === "target" && isTargetSignal) ||
    (filters.analysis === "focus" && (isWrite || isFailure || isDiscovery)) ||
    (filters.analysis === "discovery" && isDiscovery) ||
    (filters.analysis === "writes" && isWrite) ||
    (filters.analysis === "failures" && isFailure) ||
    (filters.analysis === "videos" && mediaKind !== null) ||
    (filters.analysis === "direct-videos" && mediaRole === "direct") ||
    (filters.analysis === "stream-manifests" && mediaKind === "manifest") ||
    (filters.analysis === "streaming-videos" && mediaRole === "stream");
  const attributionMatches =
    !filters.attribution ||
    (filters.attribution === "unknown" &&
      (!sourceHostname || !requestHostname || noResponse || initiatorKind === "unknown")) ||
    (filters.attribution === "unknown-source" && !sourceHostname) ||
    (filters.attribution === "unknown-destination" && !requestHostname) ||
    (filters.attribution === "no-response" && noResponse) ||
    (filters.attribution === "page-initiated" && initiatorKind === "page") ||
    (filters.attribution === "extension-initiated" && initiatorKind === "extension") ||
    (filters.attribution === "unknown-initiator" && initiatorKind === "unknown");
  const status = exchange.response.status;
  const statusMatches =
    !filters.status ||
    (filters.status === "failed" && status === 0) ||
    (filters.status === "2xx" && status >= 200 && status < 300) ||
    (filters.status === "3xx" && status >= 300 && status < 400) ||
    (filters.status === "4xx" && status >= 400 && status < 500) ||
    (filters.status === "5xx" && status >= 500 && status < 600);
  return (
    pageMatches &&
    analysisMatches &&
    methodMatches &&
    mimeMatches &&
    domainMatches &&
    attributionMatches &&
    statusMatches
  );
}

export function matchesApiDomain(hostname: string, filter: string): boolean {
  const pattern = filter.trim().toLowerCase();
  if (!pattern) return true;
  if (!pattern.includes("*")) return hostname.includes(pattern);
  const segments = pattern.split("*");
  let cursor = 0;
  for (const [index, segment] of segments.entries()) {
    if (!segment) continue;
    const matchAt = hostname.indexOf(segment, cursor);
    if (matchAt === -1 || (index === 0 && matchAt !== 0)) return false;
    cursor = matchAt + segment.length;
  }
  const last = segments[segments.length - 1] ?? "";
  return pattern.endsWith("*") || hostname.endsWith(last);
}

function getHostname(rawUrl: string | undefined): string {
  if (!rawUrl) return "";
  try {
    return new URL(rawUrl).hostname.toLowerCase();
  } catch {
    return "";
  }
}

export function sharesSite(leftHostname: string, rightHostname: string): boolean {
  const left = leftHostname.toLowerCase();
  const right = rightHostname.toLowerCase();
  if (left === right) return true;
  if (isIpAddress(left) || isIpAddress(right)) return false;
  // simplification: handles common country-code suffixes; use a Public Suffix List for full coverage.
  return siteSuffix(left) === siteSuffix(right);
}

function siteSuffix(hostname: string): string {
  const labels = hostname.split(".");
  const secondLevel = labels[labels.length - 2];
  const countryCodeSuffix =
    labels[labels.length - 1]?.length === 2 &&
    secondLevel !== undefined &&
    ["ac", "co", "com", "edu", "gov", "net", "org"].includes(secondLevel);
  return labels.slice(countryCodeSuffix ? -3 : -2).join(".");
}

function isIpAddress(hostname: string): boolean {
  return hostname.includes(":") || /^\d{1,3}(?:\.\d{1,3}){3}$/.test(hostname);
}

function getProtocol(rawUrl: string): string {
  try {
    return new URL(rawUrl).protocol;
  } catch {
    return "";
  }
}

function isSentryTelemetry(rawUrl: string): boolean {
  try {
    const url = new URL(rawUrl);
    const sentryIngestHost =
      url.hostname === "ingest.sentry.io" || url.hostname.endsWith(".ingest.sentry.io");
    return sentryIngestHost && url.pathname.includes("/envelope/");
  } catch {
    return false;
  }
}

export async function getAllApiTraffic(): Promise<ApiExchange[]> {
  const database = await openTrafficDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, "readonly");
    const request = transaction.objectStore(STORE_NAME).getAll();
    request.onsuccess = () => resolve((request.result as ApiExchange[]).reverse());
    request.onerror = () => reject(request.error ?? new Error("Could not export API traffic"));
    transaction.oncomplete = () => database.close();
    transaction.onerror = () => database.close();
  });
}

export async function getApiTrafficBySequence(sequence: number): Promise<ApiExchange | undefined> {
  const database = await openTrafficDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, "readonly");
    const request = transaction.objectStore(STORE_NAME).get(sequence);
    request.onsuccess = () => resolve(request.result as ApiExchange | undefined);
    request.onerror = () => reject(request.error ?? new Error("Could not read captured exchange"));
    transaction.oncomplete = () => database.close();
  });
}

export async function countApiTraffic(): Promise<number> {
  const database = await openTrafficDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, "readonly");
    const request = transaction.objectStore(STORE_NAME).count();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Could not count API traffic"));
    transaction.oncomplete = () => database.close();
    transaction.onerror = () => database.close();
  });
}

export async function countApiTrafficForPage(pageHostname: string): Promise<number> {
  const normalizedHostname = pageHostname.toLowerCase();
  const database = await openTrafficDatabase();
  return new Promise((resolve, reject) => {
    let count = 0;
    const transaction = database.transaction(STORE_NAME, "readonly");
    const request = transaction.objectStore(STORE_NAME).openCursor();
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) return;
      const exchange = cursor.value as ApiExchange;
      if (getHostname(exchange.pageUrl) === normalizedHostname) count += 1;
      cursor.continue();
    };
    transaction.oncomplete = () => {
      database.close();
      resolve(count);
    };
    transaction.onerror = () => {
      database.close();
      reject(transaction.error ?? new Error("Could not count site API traffic"));
    };
  });
}

export async function clearApiTrafficForPage(pageHostname: string): Promise<void> {
  const normalizedHostname = pageHostname.toLowerCase();
  const database = await openTrafficDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(
      [STORE_NAME, PROTOCOL_EVENTS_STORE],
      "readwrite"
    );
    const request = transaction.objectStore(STORE_NAME).openCursor();
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) return;
      const exchange = cursor.value as ApiExchange;
      if (getHostname(exchange.pageUrl) === normalizedHostname) cursor.delete();
      cursor.continue();
    };
    const protocolRequest = transaction.objectStore(PROTOCOL_EVENTS_STORE).openCursor();
    protocolRequest.onsuccess = () => {
      const cursor = protocolRequest.result;
      if (!cursor) return;
      const event = cursor.value as { pageUrl?: string };
      if (getHostname(event.pageUrl) === normalizedHostname) cursor.delete();
      cursor.continue();
    };
    transaction.oncomplete = () => {
      database.close();
      resolve();
    };
    transaction.onerror = () => {
      database.close();
      reject(transaction.error ?? new Error("Could not clear site API traffic"));
    };
  });
}

export async function clearApiTraffic(): Promise<void> {
  const database = await openTrafficDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(
      [STORE_NAME, PROTOCOL_EVENTS_STORE],
      "readwrite"
    );
    transaction.objectStore(STORE_NAME).clear();
    transaction.objectStore(PROTOCOL_EVENTS_STORE).clear();
    transaction.oncomplete = () => {
      database.close();
      resolve();
    };
    transaction.onerror = () => {
      database.close();
      reject(transaction.error ?? new Error("Could not clear API traffic"));
    };
  });
}

function normalizeHarTiming(value: number | undefined): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : undefined;
}

export function normalizeHttpVersion(value: unknown): string {
  return typeof value === "string" && value.trim() ? value.slice(0, 20) : "unknown";
}

export function saveHarEntry(
  entry: chrome.devtools.network.Request,
  pageUrl: string,
  redactionEnabled = true
): Promise<ApiExchange> {
  const mimeType = entry.response.content.mimeType;
  const resourceType =
    typeof entry._resourceType === "string" ? entry._resourceType : undefined;
  const mediaKind = detectMediaKind(resourceType, mimeType, entry.request.url);
  const chromeTransferSize = (entry.response as unknown as Record<string, unknown>)[
    "_transferSize"
  ];
  const transferSize =
    typeof chromeTransferSize === "number" && chromeTransferSize >= 0
      ? chromeTransferSize
      : entry.response.bodySize >= 0
        ? entry.response.bodySize
        : undefined;

  return new Promise((resolve, reject) => {
    const saveContent = (content: string, encoding: string): void => {
      const postData = entry.request.postData;
      let requestBody: ApiBody | null = null;
      if (!mediaKind && postData && "text" in postData && typeof postData.text === "string") {
        requestBody = createRequestBody(postData.text, postData.mimeType, redactionEnabled);
      } else if (
        !mediaKind &&
        postData &&
        "params" in postData &&
        Array.isArray(postData.params)
      ) {
        requestBody = createFormBody(
          postData.params.map((param) => [param.name, param.value ?? ""]),
          redactionEnabled
        );
      }
      const exchange: ApiExchange = {
        pageUrl: redactUrl(pageUrl, redactionEnabled),
        resourceType,
        transferSize,
        network: {
          protocol: normalizeHttpVersion(entry.response.httpVersion),
          connectionId: entry.connection?.slice(0, 100),
          connectionSetup: normalizeHarTiming(entry.timings.connect) === undefined
            ? "reused-or-unavailable"
            : "observed",
          dnsMs: normalizeHarTiming(entry.timings.dns),
          connectMs: normalizeHarTiming(entry.timings.connect),
          tlsMs: normalizeHarTiming(entry.timings.ssl),
          sendMs: normalizeHarTiming(entry.timings.send),
          waitMs: normalizeHarTiming(entry.timings.wait),
          receiveMs: normalizeHarTiming(entry.timings.receive),
        },
        startedAt: entry.startedDateTime,
        initiator: { kind: "unknown", origin: null },
        durationMs: entry.time,
        request: {
          method: entry.request.method,
          url: redactUrl(entry.request.url, redactionEnabled),
          mimeType: postData?.mimeType ?? null,
          headers: redactHeaders(entry.request.headers, redactionEnabled),
          body: requestBody,
        },
        response: {
          status: entry.response.status,
          statusText: entry.response.statusText,
          mimeType,
          headers: redactHeaders(entry.response.headers, redactionEnabled),
          body: mediaKind
            ? { kind: "text", raw: MEDIA_BODY_OMITTED }
            : createApiBody(decodeContent(content, encoding), mimeType, redactionEnabled),
        },
      };
      void saveApiExchange(exchange).then(resolve, reject);
    };

    try {
      if (mediaKind) saveContent("", "");
      else entry.getContent(saveContent);
    } catch (error: unknown) {
      reject(error);
    }
  });
}

function decodeContent(content: string, encoding: string): string {
  if (encoding !== "base64") return content;
  try {
    const bytes = Uint8Array.from(atob(content), (character) => character.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  } catch {
    return content;
  }
}

