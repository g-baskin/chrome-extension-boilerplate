import { redactJson, redactUrl } from "./api-traffic";
import { openTrafficDatabase, PROTOCOL_EVENTS_STORE } from "./traffic-database";
import { enforceTrafficRetention } from "./traffic-retention";
import type { CaptureJourney } from "./capture-journey";

export const MAX_PROTOCOL_PAYLOAD_BYTES = 256 * 1024;
export type ProtocolTransport = "graphql-http" | "websocket" | "sse" | "webtransport";
export type ProtocolDirection = "sent" | "received" | "none";

export type GraphqlOperation = {
  name: string | null;
  type: "query" | "mutation" | "subscription" | "unknown";
};

export type ProtocolEvent = {
  sequence?: number;
  sessionId: string;
  pageUrl: string;
  capture?: CaptureJourney;
  url: string;
  transport: ProtocolTransport;
  kind: "created" | "handshake" | "connected" | "frame" | "message" | "error" | "closed";
  direction: ProtocolDirection;
  timestamp: string;
  opcode?: number;
  eventName?: string;
  payload?: string;
  payloadBytes: number;
  truncated: boolean;
  binary: boolean;
  graphql?: GraphqlOperation;
};

export type ProtocolFilters = {
  pageHostname: string | null;
  transport: "" | ProtocolTransport;
  direction: "" | ProtocolDirection;
  port: string;
  operationName: string;
  text: string;
};

export function boundProtocolPayload(
  payload: string | undefined,
  opcode?: number
): Pick<ProtocolEvent, "payload" | "payloadBytes" | "truncated" | "binary"> {
  if (payload === undefined) {
    return { payloadBytes: 0, truncated: false, binary: opcode === 2 };
  }
  const bytes = new TextEncoder().encode(payload);
  const binary = opcode === 2;
  if (bytes.length <= MAX_PROTOCOL_PAYLOAD_BYTES) {
    return { payload: redactPayload(payload, binary), payloadBytes: bytes.length, truncated: false, binary };
  }
  const prefix = new TextDecoder().decode(bytes.slice(0, MAX_PROTOCOL_PAYLOAD_BYTES));
  return {
    payload: redactPayload(prefix, binary),
    payloadBytes: bytes.length,
    truncated: true,
    binary,
  };
}

function redactPayload(payload: string, binary: boolean): string {
  if (binary) return payload;
  try {
    return JSON.stringify(redactJson(JSON.parse(payload) as unknown));
  } catch {
    return payload;
  }
}

export function extractGraphqlOperation(input: unknown): GraphqlOperation | null {
  let value = input;
  if (typeof input === "string") {
    try {
      value = JSON.parse(input) as unknown;
    } catch {
      return parseGraphqlDocument(input);
    }
  }
  return extractGraphqlObject(value, 0);
}

function extractGraphqlObject(value: unknown, depth: number): GraphqlOperation | null {
  if (depth > 4 || !value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const operationName = typeof record.operationName === "string" ? record.operationName : null;
  const query = typeof record.query === "string" ? parseGraphqlDocument(record.query) : null;
  if (query || operationName) return { name: operationName ?? query?.name ?? null, type: query?.type ?? "unknown" };
  if (typeof record.type === "string" && record.type === "subscribe") {
    const nested = extractGraphqlObject(record.payload, depth + 1);
    return nested ?? { name: null, type: "subscription" };
  }
  return extractGraphqlObject(record.payload, depth + 1);
}

function parseGraphqlDocument(document: string): GraphqlOperation | null {
  const match = document.match(/\b(query|mutation|subscription)\b(?:\s+([_A-Za-z][_0-9A-Za-z]*))?/);
  if (!match) return null;
  return {
    type: match[1] as GraphqlOperation["type"],
    name: match[2] ?? null,
  };
}

export function createProtocolEvent(
  event: Omit<ProtocolEvent, "url" | "pageUrl" | "payload" | "payloadBytes" | "truncated" | "binary" | "graphql"> & {
    url: string;
    pageUrl: string;
    payload?: string;
  }
): ProtocolEvent {
  const bounded = boundProtocolPayload(event.payload, event.opcode);
  return {
    ...event,
    url: redactUrl(event.url),
    pageUrl: redactUrl(event.pageUrl),
    ...bounded,
    graphql: bounded.binary ? undefined : (extractGraphqlOperation(bounded.payload) ?? undefined),
  };
}

export async function saveProtocolEvent(event: ProtocolEvent): Promise<ProtocolEvent> {
  const database = await openTrafficDatabase();
  const saved = await new Promise<ProtocolEvent>((resolve, reject) => {
    const transaction = database.transaction(PROTOCOL_EVENTS_STORE, "readwrite");
    const request = transaction.objectStore(PROTOCOL_EVENTS_STORE).add(event);
    let sequence: number | null = null;
    request.onsuccess = () => { sequence = Number(request.result); };
    transaction.oncomplete = () => {
      database.close();
      if (sequence === null) reject(new Error("Protocol event was not assigned an ID"));
      else resolve({ ...event, sequence });
    };
    transaction.onerror = () => {
      database.close();
      reject(transaction.error ?? new Error("Could not save protocol event"));
    };
  });
  try {
    await enforceTrafficRetention();
  } catch (error) {
    console.warn("Protocol event was saved, but retention maintenance failed", error);
  }
  return saved;
}

export async function getProtocolEvents(
  beforeSequence: number | null,
  limit: number,
  filters: ProtocolFilters
): Promise<ProtocolEvent[]> {
  const database = await openTrafficDatabase();
  return new Promise((resolve, reject) => {
    const records: ProtocolEvent[] = [];
    const transaction = database.transaction(PROTOCOL_EVENTS_STORE, "readonly");
    const range = beforeSequence === null ? undefined : IDBKeyRange.upperBound(beforeSequence, true);
    const request = transaction.objectStore(PROTOCOL_EVENTS_STORE).openCursor(range, "prev");
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor || records.length >= limit) return;
      const event = cursor.value as ProtocolEvent;
      if (matchesProtocolEvent(event, filters)) records.push(event);
      cursor.continue();
    };
    request.onerror = () => reject(request.error ?? new Error("Could not read protocol events"));
    transaction.oncomplete = () => { database.close(); resolve(records); };
    transaction.onerror = () => { database.close(); reject(transaction.error ?? new Error("Could not read protocol events")); };
  });
}

export function getProtocolPort(rawUrl: string): string {
  try {
    const url = new URL(rawUrl);
    if (url.port) return url.port;
    return url.protocol === "https:" || url.protocol === "wss:"
      ? "443"
      : url.protocol === "http:" || url.protocol === "ws:"
        ? "80"
        : "";
  } catch {
    return "";
  }
}

export function matchesProtocolEvent(event: ProtocolEvent, filters: ProtocolFilters): boolean {
  const hostname = (raw: string): string => {
    try { return new URL(raw).hostname.toLowerCase(); } catch { return ""; }
  };
  const search = filters.text.toLowerCase();
  return (
    (filters.pageHostname === null || hostname(event.pageUrl) === filters.pageHostname) &&
    (!filters.transport || event.transport === filters.transport) &&
    (!filters.direction || event.direction === filters.direction) &&
    (!filters.port || getProtocolPort(event.url) === filters.port) &&
    (!filters.operationName || event.graphql?.name?.toLowerCase().includes(filters.operationName.toLowerCase()) === true) &&
    (!search || `${event.url} ${event.eventName ?? ""} ${event.payload ?? ""}`.toLowerCase().includes(search))
  );
}

export async function clearProtocolEventsForPage(pageHostname: string): Promise<void> {
  const database = await openTrafficDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(PROTOCOL_EVENTS_STORE, "readwrite");
    const request = transaction.objectStore(PROTOCOL_EVENTS_STORE).openCursor();
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) return;
      const event = cursor.value as ProtocolEvent;
      try {
        if (new URL(event.pageUrl).hostname.toLowerCase() === pageHostname.toLowerCase()) cursor.delete();
      } catch { /* Invalid stored URLs do not match. */ }
      cursor.continue();
    };
    transaction.oncomplete = () => { database.close(); resolve(); };
    transaction.onerror = () => { database.close(); reject(transaction.error); };
  });
}
