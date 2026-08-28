import type { ApiBody, ApiExchange } from "./api-traffic";

export const API_FIELD_LIMITS = {
  inputCharacters: 100_000,
  depth: 8,
  fields: 200,
  valuesPerField: 20,
  displayedValueLength: 500,
} as const;

export type ApiFieldSource = "metadata" | "url" | "request-body" | "response-body";

export type ApiField = {
  name: string;
  value: string;
  source: ApiFieldSource;
};

export type ApiFieldSummary = {
  name: string;
  source: ApiFieldSource;
  eventCount: number;
  coveragePercentage: number;
  distinctValueCount: number;
  topValues: Array<{ value: string; count: number }>;
};

export type ApiFieldQuery = { name: string; value: string };

const TEXT_PAIR_REGEX = /(?:^|[\s,;])([A-Za-z_][A-Za-z0-9_.-]{0,63})=("[^"]*"|'[^']*'|[^\s,;]+)/g;
const MAX_FIELD_NAME_LENGTH = 200;

export function extractApiFields(exchange: ApiExchange): ApiField[] {
  const fields: ApiField[] = [];
  const counts = new Map<string, number>();
  const add = (name: string, value: unknown, source: ApiFieldSource): boolean => {
    const normalizedName = name.slice(0, MAX_FIELD_NAME_LENGTH);
    if (!normalizedName) return true;
    const count = counts.get(normalizedName) ?? 0;
    if (count >= API_FIELD_LIMITS.valuesPerField) return true;
    if (fields.length >= API_FIELD_LIMITS.fields) return false;
    counts.set(normalizedName, count + 1);
    fields.push({ name: normalizedName, value: displayValue(value), source });
    return true;
  };

  add("request.method", exchange.request.method, "metadata");
  add("response.status", exchange.response.status, "metadata");
  add("response.mime_type", exchange.response.mimeType, "metadata");
  if (exchange.resourceType) add("resource_type", exchange.resourceType, "metadata");
  add("duration_ms", exchange.durationMs, "metadata");
  const pageHost = parseHost(exchange.pageUrl);
  if (pageHost) add("page.host", pageHost, "metadata");
  add("initiator.kind", exchange.initiator?.kind ?? "unknown", "metadata");

  if (exchange.request.url.length <= API_FIELD_LIMITS.inputCharacters) {
    try {
      const url = new URL(exchange.request.url);
      add("url.scheme", url.protocol.replace(/:$/, ""), "url");
      add("url.host", url.hostname, "url");
      if (url.port) add("url.port", url.port, "url");
      add("url.path", url.pathname, "url");
      for (const [name, value] of url.searchParams) {
        if (!add(`url.query.${name}`, value, "url")) break;
      }
    } catch {
      // Malformed stored URLs remain available in the raw request view.
    }
  }

  extractBody(exchange.request.body, "request.body", "request-body", add);
  extractBody(exchange.response.body, "response.body", "response-body", add);
  return fields;
}

export function parseApiFieldQuery(query: string): ApiFieldQuery | null {
  const separator = query.indexOf("=");
  if (separator < 1) return null;
  const name = query.slice(0, separator).trim();
  const value = query.slice(separator + 1).trim();
  return name && value ? { name, value } : null;
}

export function matchesApiFieldQuery(exchange: ApiExchange, query: ApiFieldQuery): boolean {
  return extractApiFields(exchange).some((field) => {
    const bodyPrefix = field.source === "request-body"
      ? "request.body."
      : field.source === "response-body"
        ? "response.body."
        : "";
    const jsonName = bodyPrefix && field.name.startsWith(bodyPrefix)
      ? field.name.slice(bodyPrefix.length)
      : "";
    return (field.name === query.name || jsonName === query.name) && field.value === query.value;
  });
}

export function summarizeApiFields(exchanges: ApiExchange[]): ApiFieldSummary[] {
  type MutableSummary = {
    source: ApiFieldSource;
    events: number;
    values: Map<string, number>;
  };
  const summaries = new Map<string, MutableSummary>();

  // simplification: scans loaded results only; index fields in IndexedDB if traffic volume makes this slow.
  for (const exchange of exchanges) {
    const eventFields = new Map<string, { source: ApiFieldSource; values: Set<string> }>();
    for (const field of extractApiFields(exchange)) {
      const entry = eventFields.get(field.name) ?? { source: field.source, values: new Set<string>() };
      entry.values.add(field.value);
      eventFields.set(field.name, entry);
    }
    for (const [name, eventField] of eventFields) {
      const summary = summaries.get(name) ?? {
        source: eventField.source,
        events: 0,
        values: new Map<string, number>(),
      };
      summary.events += 1;
      for (const value of eventField.values) {
        summary.values.set(value, (summary.values.get(value) ?? 0) + 1);
      }
      summaries.set(name, summary);
    }
  }

  return [...summaries].map(([name, summary]) => ({
    name,
    source: summary.source,
    eventCount: summary.events,
    coveragePercentage: exchanges.length ? Math.round((summary.events / exchanges.length) * 100) : 0,
    distinctValueCount: summary.values.size,
    topValues: [...summary.values]
      .sort(([leftValue, leftCount], [rightValue, rightCount]) =>
        rightCount - leftCount || leftValue.localeCompare(rightValue)
      )
      .slice(0, API_FIELD_LIMITS.valuesPerField)
      .map(([value, count]) => ({ value, count })),
  }));
}

function extractBody(
  body: ApiBody | null,
  prefix: string,
  source: ApiFieldSource,
  add: (name: string, value: unknown, source: ApiFieldSource) => boolean
): void {
  if (!body) return;
  if (body.kind === "json") {
    if (isFormEntries(body.value)) {
      for (const entry of body.value) {
        if (!add(`${prefix}.${entry.name}`, entry.value, source)) return;
      }
      return;
    }
    flattenJson(body.value, prefix, source, add, 0, new WeakSet<object>());
    return;
  }
  extractTextPairs(body.raw.slice(0, API_FIELD_LIMITS.inputCharacters), prefix, source, add);
}

function flattenJson(
  value: unknown,
  path: string,
  source: ApiFieldSource,
  add: (name: string, value: unknown, source: ApiFieldSource) => boolean,
  depth: number,
  seen: WeakSet<object>
): boolean {
  if (value === null || typeof value !== "object") return add(path, value, source);
  if (depth >= API_FIELD_LIMITS.depth || seen.has(value)) return true;
  seen.add(value);
  if (Array.isArray(value)) {
    if (value.length === 0) return add(path, "[]", source);
    for (const item of value) {
      if (!flattenJson(item, `${path}[]`, source, add, depth + 1, seen)) return false;
    }
    return true;
  }
  const entries = Object.entries(value);
  if (entries.length === 0) return add(path, "{}", source);
  for (const [name, child] of entries) {
    if (!flattenJson(child, `${path}.${name}`, source, add, depth + 1, seen)) return false;
  }
  return true;
}

function extractTextPairs(
  text: string,
  prefix: string,
  source: ApiFieldSource,
  add: (name: string, value: unknown, source: ApiFieldSource) => boolean
): void {
  TEXT_PAIR_REGEX.lastIndex = 0;
  for (const match of text.matchAll(TEXT_PAIR_REGEX)) {
    const name = match[1];
    const rawValue = match[2];
    if (!name || rawValue === undefined) continue;
    const quoted = (rawValue.startsWith('"') && rawValue.endsWith('"')) ||
      (rawValue.startsWith("'") && rawValue.endsWith("'"));
    if (!add(`${prefix}.${name}`, quoted ? rawValue.slice(1, -1) : rawValue, source)) return;
  }
}

function isFormEntries(value: unknown): value is Array<{ name: string; value: unknown }> {
  return Array.isArray(value) && value.length > 0 && value.every(
    (entry) => entry !== null && typeof entry === "object" &&
      typeof (entry as { name?: unknown }).name === "string" &&
      Object.prototype.hasOwnProperty.call(entry, "value")
  );
}

function displayValue(value: unknown): string {
  let text: string;
  if (value === null) text = "null";
  else if (typeof value === "string") text = value;
  else if (["number", "boolean", "bigint"].includes(typeof value)) text = String(value);
  else text = "";
  return text.slice(0, API_FIELD_LIMITS.displayedValueLength);
}

function parseHost(rawUrl: string | undefined): string {
  if (!rawUrl) return "";
  try {
    return new URL(rawUrl).hostname;
  } catch {
    return "";
  }
}
