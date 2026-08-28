import { extractApiFields } from "./api-fields";
import type { ApiExchange } from "./api-traffic";
import { getProtocolPort, type ProtocolEvent } from "./protocol-traffic";

export const LOG_SEARCH_LIMITS = {
  queryCharacters: 2_000,
  valueCharacters: 500,
  searchableCharacters: 24_000,
  results: 500,
} as const;

export type LogSource = "api" | "red-team";
export type LogSourceFilter = "" | LogSource;
export type DetectionExpression =
  | { kind: "and"; left: DetectionExpression; right: DetectionExpression }
  | { kind: "or"; left: DetectionExpression; right: DetectionExpression }
  | { kind: "not"; expression: DetectionExpression }
  | { kind: "exists"; field: string }
  | {
      kind: "predicate";
      field: string | null;
      operator: "contains" | "equals" | "not-equals";
      value: string;
    };
export type LogRecord = {
  id: string;
  source: LogSource;
  timestamp: string;
  title: string;
  summary: string;
  fields: Record<string, string[]>;
  searchableText: string;
};
export type LogSearchResult = {
  records: LogRecord[];
  expression: DetectionExpression | null;
  error: string | null;
};

export function createApiLogRecord(exchange: ApiExchange): LogRecord {
  const fields = toFieldMap(extractApiFields(exchange).map(({ name, value }) => [name, value]));
  addField(fields, "source", "api");
  addField(fields, "method", exchange.request.method);
  addField(fields, "status", String(exchange.response.status));
  addField(fields, "host", hostname(exchange.request.url));
  addField(fields, "path", pathname(exchange.request.url));
  for (const [name, values] of Object.entries(fields)) {
    const prefix = name.startsWith("request.body.")
      ? "request.body."
      : name.startsWith("response.body.")
        ? "response.body."
        : "";
    if (prefix) for (const value of values) addField(fields, name.slice(prefix.length), value);
  }
  const title = `${exchange.request.method} ${exchange.request.url}`;
  const summary = `${exchange.response.status} ${exchange.response.statusText || "Response"} · ${exchange.response.mimeType || "unknown type"} · ${Math.round(exchange.durationMs)} ms`;
  return {
    id: `api-${exchange.sequence ?? `${exchange.startedAt}-${exchange.request.url}`}`,
    source: "api",
    timestamp: exchange.startedAt,
    title,
    summary,
    fields,
    searchableText: buildSearchableText(title, summary, fields),
  };
}

export function createApiMetadataLogRecord(exchange: ApiExchange): LogRecord {
  const fields = toFieldMap([
    ["source", "api"],
    ["method", exchange.request.method],
    ["status", String(exchange.response.status)],
    ["host", hostname(exchange.request.url)],
    ["path", pathname(exchange.request.url)],
    ["page.host", hostname(exchange.pageUrl ?? "")],
    ["request.method", exchange.request.method],
    ["response.status", String(exchange.response.status)],
    ["response.mime_type", exchange.response.mimeType ?? ""],
    ["resource_type", exchange.resourceType ?? ""],
    ["duration_ms", String(exchange.durationMs)],
    ["initiator.kind", exchange.initiator?.kind ?? "unknown"],
    ["capture.tab_id", exchange.capture?.tabId],
    ["capture.window_id", exchange.capture?.windowId],
    ["capture.opener_tab_id", exchange.capture?.openerTabId],
    ["capture.attached_at", exchange.capture?.attachedAt],
    ["capture.transition", exchange.capture?.transition],
    ["capture.previous_page_host", hostname(exchange.capture?.previousPageUrl ?? "")],
    [
      "capture.initial_requests_may_be_missing",
      exchange.capture?.mayHaveMissedInitialRequests,
    ],
  ]);
  const title = `${exchange.request.method} ${exchange.request.url}`;
  const summary = `${exchange.response.status} ${exchange.response.statusText || "Response"} · ${exchange.response.mimeType || "unknown type"} · ${Math.round(exchange.durationMs)} ms`;
  return {
    id: `api-${exchange.sequence ?? `${exchange.startedAt}-${exchange.request.url}`}`,
    source: "api",
    timestamp: exchange.startedAt,
    title,
    summary,
    fields,
    searchableText: buildSearchableText(title, summary, fields),
  };
}

const METADATA_FIELDS = new Set([
  "source", "method", "status", "scheme", "host", "port", "path", "page.host", "request.method",
  "response.status", "response.mime_type", "resource_type", "duration_ms", "initiator.kind",
  "transport", "kind", "direction", "session", "event", "graphql.operation", "graphql.type",
  "capture.tab_id", "capture.window_id", "capture.opener_tab_id", "capture.attached_at",
  "capture.transition", "capture.previous_page_host", "capture.initial_requests_may_be_missing",
]);

export function expressionRequiresExtractedFields(
  expression: DetectionExpression | null
): boolean {
  if (!expression) return false;
  if (expression.kind === "predicate") {
    return expression.field === null || !METADATA_FIELDS.has(expression.field);
  }
  if (expression.kind === "exists") return !METADATA_FIELDS.has(expression.field);
  if (expression.kind === "not") return expressionRequiresExtractedFields(expression.expression);
  return (
    expressionRequiresExtractedFields(expression.left) ||
    expressionRequiresExtractedFields(expression.right)
  );
}

export function createProtocolLogRecord(event: ProtocolEvent): LogRecord {
  const fields = toFieldMap([
    ["source", "red-team"],
    ["transport", event.transport],
    ["kind", event.kind],
    ["direction", event.direction],
    ["scheme", scheme(event.url)],
    ["host", hostname(event.url)],
    ["port", getProtocolPort(event.url)],
    ["path", pathname(event.url)],
    ["page.host", hostname(event.pageUrl)],
    ["session", event.sessionId],
    ["event", event.eventName ?? ""],
    ["graphql.operation", event.graphql?.name ?? ""],
    ["graphql.type", event.graphql?.type ?? ""],
    ["capture.tab_id", event.capture?.tabId],
    ["capture.window_id", event.capture?.windowId],
    ["capture.opener_tab_id", event.capture?.openerTabId],
    ["capture.attached_at", event.capture?.attachedAt],
    ["capture.transition", event.capture?.transition],
    ["capture.previous_page_host", hostname(event.capture?.previousPageUrl ?? "")],
    [
      "capture.initial_requests_may_be_missing",
      event.capture?.mayHaveMissedInitialRequests,
    ],
  ]);
  if (event.payload && event.payload.length <= LOG_SEARCH_LIMITS.searchableCharacters) {
    try {
      flattenJsonFields(JSON.parse(event.payload) as unknown, "payload", fields, 0);
      for (const [name, values] of Object.entries(fields)) {
        if (name.startsWith("payload.")) {
          for (const value of values) addField(fields, name.slice("payload.".length), value);
        }
      }
    } catch {
      // Non-JSON protocol payloads remain searchable as bounded free text.
    }
  }
  const title = `${event.transport} ${event.kind} ${event.url}`;
  const summary = [event.direction, event.eventName, event.graphql?.name, `${event.payloadBytes} bytes`]
    .filter(Boolean)
    .join(" · ");
  return {
    id: `red-team-${event.sequence ?? `${event.timestamp}-${event.sessionId}`}`,
    source: "red-team",
    timestamp: event.timestamp,
    title,
    summary,
    fields,
    searchableText: buildSearchableText(title, summary, fields, event.payload),
  };
}

export function searchLogs(
  records: LogRecord[],
  rawQuery: string,
  source: LogSourceFilter,
  earliestTimestamp: number | null,
  latestTimestamp: number | null = null
): LogSearchResult {
  const parsed = parseLogQuery(rawQuery);
  if (parsed.error) return { records: [], expression: null, error: parsed.error };
  const matches = records.filter((record) =>
    matchesLogRecord(record, parsed.expression, source, earliestTimestamp, latestTimestamp)
  );
  matches.sort((left, right) => Date.parse(right.timestamp) - Date.parse(left.timestamp));
  return {
    records: matches.slice(0, LOG_SEARCH_LIMITS.results),
    expression: parsed.expression,
    error: null,
  };
}

export function matchesLogRecord(
  record: LogRecord,
  expression: DetectionExpression | null,
  source: LogSourceFilter,
  earliestTimestamp: number | null,
  latestTimestamp: number | null = null
): boolean {
  const timestamp = Date.parse(record.timestamp);
  return (
    (!source || record.source === source) &&
    (earliestTimestamp === null || (Number.isFinite(timestamp) && timestamp >= earliestTimestamp)) &&
    (latestTimestamp === null || (Number.isFinite(timestamp) && timestamp <= latestTimestamp)) &&
    (!expression || matchesExpression(record, expression))
  );
}

type QueryToken =
  | { kind: "word" | "string"; value: string }
  | { kind: "equals" | "not-equals" | "left-paren" | "right-paren" };

export function parseLogQuery(
  rawQuery: string
): { expression: DetectionExpression | null; error: string | null } {
  if (rawQuery.length > LOG_SEARCH_LIMITS.queryCharacters) {
    return {
      expression: null,
      error: `Query must be ${LOG_SEARCH_LIMITS.queryCharacters.toLocaleString("en-US")} characters or fewer.`,
    };
  }
  const tokenized = tokenize(rawQuery);
  if (tokenized.error) return { expression: null, error: tokenized.error };
  try {
    return { expression: new DetectionParser(tokenized.tokens).parse(), error: null };
  } catch (error) {
    return { expression: null, error: error instanceof Error ? error.message : "Invalid detection expression." };
  }
}

class DetectionParser {
  private position = 0;

  constructor(private readonly tokens: QueryToken[]) {}

  parse(): DetectionExpression | null {
    if (this.tokens.length === 0) return null;
    const expression = this.parseOr();
    if (this.peek()) throw new Error(`Unexpected token: ${this.describe(this.peek())}.`);
    return expression;
  }

  private parseOr(): DetectionExpression {
    let expression = this.parseAnd();
    while (this.consumeKeyword("OR")) {
      expression = { kind: "or", left: expression, right: this.parseAnd() };
    }
    return expression;
  }

  private parseAnd(): DetectionExpression {
    let expression = this.parseUnary();
    while (true) {
      if (this.consumeKeyword("AND")) {
        expression = { kind: "and", left: expression, right: this.parseUnary() };
      } else if (this.startsExpression(this.peek())) {
        expression = { kind: "and", left: expression, right: this.parseUnary() };
      } else {
        return expression;
      }
    }
  }

  private parseUnary(): DetectionExpression {
    if (this.consumeKeyword("NOT")) return { kind: "not", expression: this.parseUnary() };
    return this.parsePrimary();
  }

  private parsePrimary(): DetectionExpression {
    if (this.consume("left-paren")) {
      const expression = this.parseOr();
      if (!this.consume("right-paren")) throw new Error("Close the parenthesized expression with ).");
      return expression;
    }
    if (this.consumeKeyword("EXISTS")) {
      if (!this.consume("left-paren")) throw new Error("Expected ( after EXISTS.");
      const field = this.consumeValue("Expected a field name inside EXISTS(...).");
      if (!this.consume("right-paren")) throw new Error("Close the EXISTS check with ).");
      return { kind: "exists", field: field.toLowerCase() };
    }
    const first = this.peek();
    if (!first || (first.kind !== "word" && first.kind !== "string")) {
      throw new Error(`Expected a search predicate${first ? ` before ${this.describe(first)}` : ""}.`);
    }
    if (first.kind === "word" && ["AND", "OR", "CONTAINS"].includes(first.value.toUpperCase())) {
      throw new Error(`Expected a search predicate before ${first.value.toUpperCase()}.`);
    }
    this.position += 1;
    if (first.kind === "word" && (this.consume("equals") || this.consume("not-equals"))) {
      const operator = this.tokens[this.position - 1]?.kind === "not-equals" ? "not-equals" : "equals";
      return {
        kind: "predicate",
        field: first.value.toLowerCase(),
        operator,
        value: this.consumeValue(`Expected a value after ${first.value}${operator === "equals" ? "=" : "!="}.`),
      };
    }
    if (first.kind === "word" && this.consumeKeyword("CONTAINS")) {
      return {
        kind: "predicate",
        field: first.value.toLowerCase(),
        operator: "contains",
        value: this.consumeValue(`Expected a value after ${first.value} CONTAINS.`),
      };
    }
    return { kind: "predicate", field: null, operator: "contains", value: first.value };
  }

  private consumeValue(message: string): string {
    const token = this.peek();
    if (!token || (token.kind !== "word" && token.kind !== "string") || token.value.length === 0) {
      throw new Error(message);
    }
    this.position += 1;
    return token.value;
  }

  private consume(kind: QueryToken["kind"]): boolean {
    if (this.peek()?.kind !== kind) return false;
    this.position += 1;
    return true;
  }

  private consumeKeyword(keyword: string): boolean {
    const token = this.peek();
    if (token?.kind !== "word" || token.value.toUpperCase() !== keyword) return false;
    this.position += 1;
    return true;
  }

  private startsExpression(token: QueryToken | undefined): boolean {
    if (!token) return false;
    if (token.kind === "string" || token.kind === "left-paren") return true;
    if (token.kind !== "word") return false;
    return token.value.toUpperCase() !== "OR" && token.value.toUpperCase() !== "AND";
  }

  private peek(): QueryToken | undefined {
    return this.tokens[this.position];
  }

  private describe(token: QueryToken | undefined): string {
    if (!token) return "end of query";
    return "value" in token ? token.value : token.kind;
  }
}

function matchesExpression(record: LogRecord, expression: DetectionExpression): boolean {
  if (expression.kind === "and") {
    return matchesExpression(record, expression.left) && matchesExpression(record, expression.right);
  }
  if (expression.kind === "or") {
    return matchesExpression(record, expression.left) || matchesExpression(record, expression.right);
  }
  if (expression.kind === "not") return !matchesExpression(record, expression.expression);
  if (expression.kind === "exists") return (record.fields[expression.field] ?? []).length > 0;
  const expected = expression.value.toLowerCase();
  if (expression.field === null) return record.searchableText.includes(expected);
  const values = record.fields[expression.field] ?? [];
  if (expression.operator === "contains") {
    return values.some((value) => value.toLowerCase().includes(expected));
  }
  if (expected === "*") return expression.operator === "not-equals" ? values.length === 0 : values.length > 0;
  const equals = values.some((value) => wildcardEquals(value.toLowerCase(), expected));
  return expression.operator === "not-equals" ? values.length > 0 && !equals : equals;
}

function wildcardEquals(value: string, pattern: string): boolean {
  if (!pattern.includes("*")) return value === pattern;
  const parts = pattern.split("*");
  let cursor = 0;
  for (let index = 0; index < parts.length; index += 1) {
    const part = parts[index] ?? "";
    if (!part) continue;
    const match = value.indexOf(part, cursor);
    if (match < 0 || (index === 0 && !pattern.startsWith("*") && match !== 0)) return false;
    cursor = match + part.length;
  }
  const last = parts[parts.length - 1] ?? "";
  return pattern.endsWith("*") || !last || value.endsWith(last);
}

function tokenize(input: string): { tokens: QueryToken[]; error: string | null } {
  const tokens: QueryToken[] = [];
  let position = 0;
  while (position < input.length) {
    const character = input[position] ?? "";
    if (/\s/.test(character)) {
      position += 1;
      continue;
    }
    if (character === "(") {
      tokens.push({ kind: "left-paren" });
      position += 1;
      continue;
    }
    if (character === ")") {
      tokens.push({ kind: "right-paren" });
      position += 1;
      continue;
    }
    if (character === "=" || (character === "!" && input[position + 1] === "=")) {
      tokens.push({ kind: character === "=" ? "equals" : "not-equals" });
      position += character === "=" ? 1 : 2;
      continue;
    }
    if (character === '"' || character === "'") {
      const quote = character;
      let value = "";
      position += 1;
      while (position < input.length && input[position] !== quote) {
        if (input[position] === "\\" && input[position + 1] === quote) position += 1;
        value += input[position] ?? "";
        position += 1;
      }
      if (input[position] !== quote) return { tokens: [], error: "Close the quoted search phrase." };
      if (value.length > LOG_SEARCH_LIMITS.valueCharacters) {
        return { tokens: [], error: `Values must be ${LOG_SEARCH_LIMITS.valueCharacters} characters or fewer.` };
      }
      tokens.push({ kind: "string", value });
      position += 1;
      continue;
    }
    if (/[<>|&;,{}[\]\\]/.test(character)) {
      return { tokens: [], error: `Unsupported character: ${character}.` };
    }
    const start = position;
    while (position < input.length && !/[\s()=!<>|&;,{}[\]\\]/.test(input[position] ?? "")) position += 1;
    if (start === position) return { tokens: [], error: `Unexpected character: ${character}.` };
    const value = input.slice(start, position);
    if (value.length > LOG_SEARCH_LIMITS.valueCharacters) {
      return { tokens: [], error: `Values must be ${LOG_SEARCH_LIMITS.valueCharacters} characters or fewer.` };
    }
    tokens.push({ kind: "word", value });
  }
  return { tokens, error: null };
}

function flattenJsonFields(
  value: unknown,
  path: string,
  fields: Record<string, string[]>,
  depth: number
): void {
  if (Object.keys(fields).length >= 100 || depth > 6) return;
  if (value === null || typeof value !== "object") {
    addField(fields, path, String(value));
    return;
  }
  if (Array.isArray(value)) {
    if (value.length === 0) addField(fields, path, "[]");
    else for (const item of value.slice(0, 20)) flattenJsonFields(item, `${path}[]`, fields, depth + 1);
    return;
  }
  const entries = Object.entries(value);
  if (entries.length === 0) addField(fields, path, "{}");
  else for (const [name, child] of entries) flattenJsonFields(child, `${path}.${name}`, fields, depth + 1);
}

function toFieldMap(entries: Array<[string, unknown]>): Record<string, string[]> {
  const fields: Record<string, string[]> = {};
  for (const [name, value] of entries) {
    if (!name || value === undefined || value === null || value === "") continue;
    addField(fields, name.toLowerCase(), String(value).slice(0, LOG_SEARCH_LIMITS.valueCharacters));
  }
  return fields;
}

function addField(fields: Record<string, string[]>, name: string, value: string): void {
  const boundedValue = value.slice(0, LOG_SEARCH_LIMITS.valueCharacters);
  const values = fields[name] ?? [];
  if (!values.includes(boundedValue) && values.length < 20) values.push(boundedValue);
  fields[name] = values;
}

function buildSearchableText(
  title: string,
  summary: string,
  fields: Record<string, string[]>,
  payload = ""
): string {
  return `${title} ${summary} ${Object.entries(fields).flatMap(([name, values]) => values.map((value) => `${name} ${value}`)).join(" ")} ${payload}`
    .slice(0, LOG_SEARCH_LIMITS.searchableCharacters)
    .toLowerCase();
}

function scheme(rawUrl: string): string {
  try { return new URL(rawUrl).protocol.slice(0, -1); } catch { return ""; }
}

function hostname(rawUrl: string): string {
  try { return new URL(rawUrl).hostname; } catch { return ""; }
}

function pathname(rawUrl: string): string {
  try { return new URL(rawUrl).pathname; } catch { return ""; }
}
