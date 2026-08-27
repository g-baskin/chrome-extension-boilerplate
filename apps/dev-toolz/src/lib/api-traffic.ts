export type ApiHeader = { name: string; value: string };
export type ApiBody =
  | { kind: "json"; value: unknown }
  | { kind: "malformed-json"; raw: string; error: string }
  | { kind: "text"; raw: string };

export type ApiTrafficFilters = {
  pageHostname: string | null;
  domain: string;
  method: string;
  status: "" | "failed" | "2xx" | "3xx" | "4xx" | "5xx";
  mimeType: string;
};

export type ApiExchange = {
  sequence?: number;
  pageUrl?: string;
  startedAt: string;
  durationMs: number;
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

const DATABASE_NAME = "dev-toolz";
const STORE_NAME = "api-traffic";
const REDACTED = "<redacted>";
const SENSITIVE_NAME_REGEX =
  /(authorization|cookie|password|passwd|secret|token|api[_-]?key|session|ctk|sentry_key)/i;

export function createApiBody(raw: string, mimeType: string): ApiBody {
  try {
    return { kind: "json", value: redactJson(JSON.parse(raw) as unknown) };
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

export function createRequestBody(raw: string, mimeType: string): ApiBody {
  const normalizedMimeType = mimeType.toLowerCase();
  if (normalizedMimeType.includes("application/x-www-form-urlencoded")) {
    return createFormBody(Array.from(new URLSearchParams(raw).entries()));
  }
  if (normalizedMimeType.includes("multipart/form-data")) {
    return { kind: "text", raw: "<multipart body omitted to protect uploaded files and secrets>" };
  }
  return createApiBody(raw, mimeType);
}

export function createFormBody(params: Array<[string, string]>): ApiBody {
  return {
    kind: "json",
    value: params.map(([name, value]) => ({
      name,
      value: SENSITIVE_NAME_REGEX.test(name) ? REDACTED : value,
    })),
  };
}

export function redactHeaders(headers: ApiHeader[]): ApiHeader[] {
  return headers.map(({ name, value }) => ({
    name,
    value: SENSITIVE_NAME_REGEX.test(name) ? REDACTED : value,
  }));
}

export function redactUrl(rawUrl: string): string {
  try {
    const url = new URL(rawUrl);
    for (const name of url.searchParams.keys()) {
      if (SENSITIVE_NAME_REGEX.test(name)) url.searchParams.set(name, REDACTED);
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
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
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
}

export async function getApiTrafficPage(
  beforeSequence: number | null,
  limit: number,
  filters: ApiTrafficFilters
): Promise<ApiExchange[]> {
  const database = await openDatabase();
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
  const requestHostname = getHostname(exchange.request.url);
  const domainMatches =
    !filters.domain || requestHostname.includes(filters.domain.toLowerCase());
  const status = exchange.response.status;
  const statusMatches =
    !filters.status ||
    (filters.status === "failed" && status === 0) ||
    (filters.status === "2xx" && status >= 200 && status < 300) ||
    (filters.status === "3xx" && status >= 300 && status < 400) ||
    (filters.status === "4xx" && status >= 400 && status < 500) ||
    (filters.status === "5xx" && status >= 500 && status < 600);
  return pageMatches && methodMatches && mimeMatches && domainMatches && statusMatches;
}

function getHostname(rawUrl: string | undefined): string {
  if (!rawUrl) return "";
  try {
    return new URL(rawUrl).hostname.toLowerCase();
  } catch {
    return "";
  }
}

export async function getAllApiTraffic(): Promise<ApiExchange[]> {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, "readonly");
    const request = transaction.objectStore(STORE_NAME).getAll();
    request.onsuccess = () => resolve((request.result as ApiExchange[]).reverse());
    request.onerror = () => reject(request.error ?? new Error("Could not export API traffic"));
    transaction.oncomplete = () => database.close();
    transaction.onerror = () => database.close();
  });
}

export async function countApiTraffic(): Promise<number> {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, "readonly");
    const request = transaction.objectStore(STORE_NAME).count();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Could not count API traffic"));
    transaction.oncomplete = () => database.close();
    transaction.onerror = () => database.close();
  });
}

export async function clearApiTraffic(): Promise<void> {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).clear();
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

export function saveHarEntry(
  entry: chrome.devtools.network.Request,
  pageUrl: string
): Promise<ApiExchange> {
  return new Promise((resolve, reject) => {
    try {
      entry.getContent((content, encoding) => {
        const mimeType = entry.response.content.mimeType;
        const postData = entry.request.postData;
        let requestBody: ApiBody | null = null;
        if (postData && "text" in postData && typeof postData.text === "string") {
          requestBody = createRequestBody(postData.text, postData.mimeType);
        } else if (postData && "params" in postData) {
          requestBody = createFormBody(
            postData.params.map((param) => [param.name, param.value ?? ""])
          );
        }
        const exchange: ApiExchange = {
          pageUrl: redactUrl(pageUrl),
          startedAt: entry.startedDateTime,
          durationMs: entry.time,
          request: {
            method: entry.request.method,
            url: redactUrl(entry.request.url),
            mimeType: postData?.mimeType ?? null,
            headers: redactHeaders(entry.request.headers),
            body: requestBody,
          },
          response: {
            status: entry.response.status,
            statusText: entry.response.statusText,
            mimeType,
            headers: redactHeaders(entry.response.headers),
            body: createApiBody(decodeContent(content, encoding), mimeType),
          },
        };
        void saveApiExchange(exchange).then(resolve, reject);
      });
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

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) {
        request.result.createObjectStore(STORE_NAME, {
          keyPath: "sequence",
          autoIncrement: true,
        });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Could not open traffic database"));
  });
}
