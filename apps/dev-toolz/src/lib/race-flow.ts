import { REDACTED, type ApiExchange, type ApiHeader } from "./api-traffic";
import { openTrafficDatabase, RACE_FLOWS_STORE } from "./traffic-database";

export const MAX_RACE_STEPS = 25;
export const MAX_RACE_BODY_BYTES = 256 * 1024;
export const MAX_RACE_TOTAL_BODY_BYTES = 1024 * 1024;
export const MAX_RACE_CONCURRENCY = 10;
export const MIN_RACE_CONCURRENCY = 2;
const ALLOWED_METHODS = new Set(["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"]);
const FORBIDDEN_HEADER = /^(authorization|cookie|proxy-authorization|host|origin|referer|content-length|sec-)/i;

export type RaceRequestSnapshot = {
  exchangeSequence: number;
  capturedPageUrl: string;
  method: string;
  url: string;
  headers: ApiHeader[];
  body: string | null;
  mimeType: string | null;
};

export type RaceFlow = {
  id: string;
  name: string;
  steps: RaceRequestSnapshot[];
  raceStepIndex: number;
  createdAt: string;
  updatedAt: string;
};

export function createRaceFlow(name: string, id: string = crypto.randomUUID()): RaceFlow {
  const now = new Date().toISOString();
  return { id, name: sanitizeFlowName(name), steps: [], raceStepIndex: -1, createdAt: now, updatedAt: now };
}

export function createRaceSnapshot(exchange: ApiExchange, currentOrigin: string): RaceRequestSnapshot {
  if (!Number.isInteger(exchange.sequence) || (exchange.sequence ?? 0) <= 0) throw new Error("Captured request is missing its storage ID.");
  const url = parseReplayUrl(exchange.request.url);
  const capturedPageUrl = parseInspectedPageUrl(exchange.pageUrl ?? "", currentOrigin).href;
  if (!ALLOWED_METHODS.has(exchange.request.method.toUpperCase())) throw new Error("This request method cannot be replayed.");
  if (decodeURIComponentSafe(url.href).includes(REDACTED)) throw new Error("Requests with redacted URL values cannot be replayed.");
  const body = serializeBody(exchange);
  const headers = exchange.request.headers.filter(({ name, value }) =>
    !FORBIDDEN_HEADER.test(name.trim()) && !value.toLowerCase().includes(REDACTED)
  );
  return {
    exchangeSequence: exchange.sequence as number,
    capturedPageUrl,
    method: exchange.request.method.toUpperCase(),
    url: url.href,
    headers,
    body,
    mimeType: exchange.request.mimeType,
  };
}

function serializeBody(exchange: ApiExchange): string | null {
  const body = exchange.request.body;
  if (!body) return null;
  if (body.kind === "malformed-json") throw new Error("Malformed request bodies cannot be replayed.");
  const serialized = body.kind === "json" ? JSON.stringify(body.value) : body.raw;
  if (new TextEncoder().encode(serialized).length > MAX_RACE_BODY_BYTES) throw new Error("Request body exceeds the 256 KiB replay limit.");
  if (serialized.toLowerCase().includes(REDACTED)) throw new Error("Requests with redacted body values cannot be replayed.");
  return serialized;
}

export function validateRaceFlow(flow: RaceFlow, currentOrigin: string, concurrency: number): void {
  if (!Number.isInteger(concurrency) || concurrency < MIN_RACE_CONCURRENCY || concurrency > MAX_RACE_CONCURRENCY) {
    throw new Error("Concurrency must be an integer from 2 to 10.");
  }
  if (!flow || typeof flow !== "object" || !Array.isArray(flow.steps)) throw new Error("Race flow is malformed.");
  if (flow.steps.length === 0 || flow.steps.length > MAX_RACE_STEPS) throw new Error(`Race flows require 1–${MAX_RACE_STEPS} steps.`);
  if (!Number.isInteger(flow.raceStepIndex) || flow.raceStepIndex < 0 || flow.raceStepIndex >= flow.steps.length) {
    throw new Error("Choose exactly one synchronized race step.");
  }
  let totalBodyBytes = 0;
  for (const step of flow.steps) {
    if (!Number.isInteger(step.exchangeSequence) || step.exchangeSequence <= 0) throw new Error("Every step must reference a captured request.");
    if (!ALLOWED_METHODS.has(step.method)) throw new Error("A step uses an unsupported method.");
    const url = parseReplayUrl(step.url);
    parseInspectedPageUrl(step.capturedPageUrl, currentOrigin);
    if (decodeURIComponentSafe(url.href).includes(REDACTED)) throw new Error("Redacted URL values cannot be replayed.");
    for (const header of step.headers) {
      if (!header || typeof header.name !== "string" || typeof header.value !== "string") throw new Error("A request header is malformed.");
      if (FORBIDDEN_HEADER.test(header.name.trim())) throw new Error("Sensitive request headers cannot be replayed.");
      if (header.value.toLowerCase().includes(REDACTED)) throw new Error("Redacted header values cannot be replayed.");
    }
    if (step.body !== null) {
      if (step.method === "GET" || step.method === "HEAD") throw new Error("GET and HEAD race steps cannot contain a body.");
      if (typeof step.body !== "string") throw new Error("Request bodies must be text.");
      const size = new TextEncoder().encode(step.body).length;
      if (size > MAX_RACE_BODY_BYTES) throw new Error("A request body exceeds the 256 KiB replay limit.");
      if (step.body.toLowerCase().includes(REDACTED)) throw new Error("Redacted body values cannot be replayed.");
      totalBodyBytes += size;
    }
  }
  if (totalBodyBytes > MAX_RACE_TOTAL_BODY_BYTES) throw new Error("Flow bodies exceed the 1 MiB total limit.");
}

function parseReplayUrl(rawUrl: string): URL {
  let url: URL;
  try { url = new URL(rawUrl); } catch { throw new Error("Race requests require valid URLs."); }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Race requests require HTTP(S) URLs.");
  }
  return url;
}

function parseInspectedPageUrl(rawUrl: string, currentOrigin: string): URL {
  const url = parseReplayUrl(rawUrl);
  if (url.origin !== currentOrigin) {
    throw new Error("Race steps must come from the inspected page.");
  }
  return url;
}

function sanitizeFlowName(name: string): string {
  const value = name.trim().slice(0, 80);
  return value || "Untitled flow";
}

function decodeURIComponentSafe(value: string): string {
  try { return decodeURIComponent(value).toLowerCase(); } catch { return value.toLowerCase(); }
}

export async function saveRaceFlow(flow: RaceFlow): Promise<RaceFlow> {
  const saved = { ...flow, name: sanitizeFlowName(flow.name), updatedAt: new Date().toISOString() };
  const database = await openTrafficDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(RACE_FLOWS_STORE, "readwrite");
    transaction.objectStore(RACE_FLOWS_STORE).put(saved);
    transaction.oncomplete = () => { database.close(); resolve(); };
    transaction.onerror = () => { database.close(); reject(transaction.error ?? new Error("Could not save race flow")); };
  });
  return saved;
}

export async function getRaceFlows(): Promise<RaceFlow[]> {
  const database = await openTrafficDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(RACE_FLOWS_STORE, "readonly");
    const request = transaction.objectStore(RACE_FLOWS_STORE).getAll();
    request.onsuccess = () => resolve((request.result as RaceFlow[]).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)));
    request.onerror = () => reject(request.error ?? new Error("Could not load race flows"));
    transaction.oncomplete = () => database.close();
  });
}

export async function deleteRaceFlow(id: string): Promise<void> {
  const database = await openTrafficDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(RACE_FLOWS_STORE, "readwrite");
    transaction.objectStore(RACE_FLOWS_STORE).delete(id);
    transaction.oncomplete = () => { database.close(); resolve(); };
    transaction.onerror = () => { database.close(); reject(transaction.error ?? new Error("Could not delete race flow")); };
  });
}
