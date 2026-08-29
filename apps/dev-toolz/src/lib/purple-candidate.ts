import { normalizeObservedRoute } from "./api-spec";
import type { ApiBody, ApiExchange } from "./api-traffic";
import {
  MAX_PURPLE_FLOW_STEPS,
  MAX_PURPLE_REQUEST_BODY_BYTES,
  type PurpleFlow,
  type PurpleStep,
} from "./purple-flow";

const MAX_MATCH_FLOWS = 1_000;
const MAX_CANDIDATE_MATCHES = 100;
const MAX_SHAPE_NODES = 2_000;
const MAX_SHAPE_DEPTH = 20;

export type PurpleCandidateMatch = Readonly<{
  flowId: string;
  flowName: string;
  stepIndex: number;
  step: PurpleStep;
}>;

export type PurpleCandidateMatcher = (exchange: ApiExchange) => PurpleCandidateMatch[];

export function createPurpleCandidateMatcher(flows: readonly PurpleFlow[]): PurpleCandidateMatcher {
  if (flows.length > MAX_MATCH_FLOWS) return () => [];
  const index = new Map<string, PurpleCandidateMatch[]>();
  for (const flow of flows) {
    if (flow.steps.length > MAX_PURPLE_FLOW_STEPS) continue;
    for (const [stepIndex, step] of flow.steps.entries()) {
      const original = createRequestShape(
        step.capturedRequest.method,
        step.capturedRequest.url,
        step.capturedRequest.mimeType,
        step.capturedRequest.body,
        step.capturedRequest.capturedPageUrl
      );
      if (!original || flow.origin !== original.origin) continue;
      const match = { flowId: flow.id, flowName: flow.name, stepIndex, step };
      const key = requestShapeKey(original);
      const existing = index.get(key);
      if (existing) existing.push(match);
      else index.set(key, [match]);
    }
  }
  return (exchange) => {
    if (!Number.isSafeInteger(exchange.sequence) || (exchange.sequence ?? 0) <= 0) return [];
    const candidate = createRequestShape(
      exchange.request.method,
      exchange.request.url,
      exchange.request.mimeType,
      exchange.request.body,
      exchange.pageUrl
    );
    if (!candidate) return [];
    const matches: PurpleCandidateMatch[] = [];
    for (const match of index.get(requestShapeKey(candidate)) ?? []) {
      if (match.step.capturedRequest.exchangeSequence === exchange.sequence) continue;
      matches.push(match);
      if (matches.length === MAX_CANDIDATE_MATCHES) break;
    }
    return matches;
  };
}

export function findPurpleCandidateMatches(
  exchange: ApiExchange,
  flows: readonly PurpleFlow[]
): PurpleCandidateMatch[] {
  return createPurpleCandidateMatcher(flows)(exchange);
}

type RequestShape = Readonly<{
  origin: string;
  method: string;
  path: string;
  queryNames: string;
  body: string;
}>;

function createRequestShape(
  method: string,
  rawUrl: string,
  mimeType: string | null,
  body: ApiBody | string | null,
  capturedPageUrl: string | undefined
): RequestShape | null {
  if (!capturedPageUrl) return null;
  let url: URL;
  let pageUrl: URL;
  try {
    url = new URL(rawUrl);
    pageUrl = new URL(capturedPageUrl);
  } catch {
    return null;
  }
  if ((url.protocol !== "http:" && url.protocol !== "https:") ||
      (pageUrl.protocol !== "http:" && pageUrl.protocol !== "https:") ||
      pageUrl.origin !== url.origin) return null;
  const route = normalizeObservedRoute(url.href);
  const bodyShape = createBodyShape(body, mimeType);
  if (bodyShape === null) return null;
  return {
    origin: url.origin,
    method: method.toUpperCase(),
    path: route.path,
    queryNames: JSON.stringify([...url.searchParams.keys()].sort()),
    body: bodyShape,
  };
}

function createBodyShape(body: ApiBody | string | null, mimeType: string | null): string | null {
  if (body === null) return "none";
  if (typeof body !== "string") {
    if (body.kind === "malformed-json") return null;
    if (body.kind === "json") {
      let serialized: string | undefined;
      try {
        serialized = JSON.stringify(body.value);
      } catch {
        return null;
      }
      if (serialized === undefined || bodyExceedsLimit(serialized)) return null;
      return createJsonShape(body.value);
    }
    if (bodyExceedsLimit(body.raw)) return null;
    return createTextShape(body.raw, mimeType);
  }
  if (bodyExceedsLimit(body)) return null;
  if (isJsonMimeType(mimeType)) {
    try {
      return createJsonShape(JSON.parse(body));
    } catch {
      return null;
    }
  }
  return createTextShape(body, mimeType);
}

function bodyExceedsLimit(body: string): boolean {
  return new TextEncoder().encode(body).length > MAX_PURPLE_REQUEST_BODY_BYTES;
}

function createTextShape(raw: string, mimeType: string | null): string | null {
  const normalizedMimeType = mimeType?.split(";", 1)[0]?.trim().toLowerCase() ?? "";
  if (normalizedMimeType === "application/x-www-form-urlencoded") {
    try {
      return `form:${JSON.stringify([...new URLSearchParams(raw).keys()].sort())}`;
    } catch {
      return null;
    }
  }
  return `opaque:${normalizedMimeType}:${raw}`;
}

function createJsonShape(value: unknown): string | null {
  const budget = { nodes: 0 };
  return visitJsonShape(value, 0, budget);
}

function visitJsonShape(value: unknown, depth: number, budget: { nodes: number }): string | null {
  budget.nodes += 1;
  if (budget.nodes > MAX_SHAPE_NODES || depth > MAX_SHAPE_DEPTH) return null;
  if (value === null) return "null";
  if (Array.isArray(value)) {
    const members = new Set<string>();
    for (const item of value) {
      const shape = visitJsonShape(item, depth + 1, budget);
      if (shape === null) return null;
      members.add(shape);
    }
    return `[${[...members].sort().join(",")}]`;
  }
  if (typeof value === "object") {
    const fields: string[] = [];
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      const shape = visitJsonShape((value as Record<string, unknown>)[key], depth + 1, budget);
      if (shape === null) return null;
      fields.push(`${JSON.stringify(key)}:${shape}`);
    }
    return `{${fields.join(",")}}`;
  }
  return typeof value;
}

function isJsonMimeType(mimeType: string | null): boolean {
  const normalized = mimeType?.split(";", 1)[0]?.trim().toLowerCase() ?? "";
  return normalized === "application/json" || normalized.endsWith("+json");
}

function requestShapeKey(shape: RequestShape): string {
  return JSON.stringify([shape.origin, shape.method, shape.path, shape.queryNames, shape.body]);
}
