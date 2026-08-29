import type { ApiBody, ApiExchange } from "./api-traffic";
import { REDACTED } from "./api-traffic";
import type { ProtocolEvent } from "./protocol-traffic";

/** Parser limits are deliberately lower than the capture limits. Inspection is local and best-effort. */
export const AGENT_PROTOCOL_LIMITS = {
  bytes: 256 * 1024,
  depth: 12,
  nodes: 4_000,
  string: 8_192,
  events: 100,
  argumentBytes: 32 * 1024,
} as const;

export type AgentProtocol = "mcp" | "a2a";
export type AgentEvidence = {
  source: "request" | "response" | "sse";
  sequence?: number;
  timestamp: string;
  path: string;
};
export type AgentTimelineEntry = {
  protocol: AgentProtocol;
  kind: "lifecycle" | "capability" | "tool-call" | "message" | "task" | "artifact" | "status" | "error";
  label: string;
  id?: string;
  state?: string;
  detail?: string;
  evidence: AgentEvidence;
};
export type AgentCapability = { protocol: AgentProtocol; name: string; triggeringField: string; evidence: AgentEvidence };
export type AgentSignal = {
  protocol: AgentProtocol;
  kind: "credential" | "write" | "network" | "file" | "oversized-arguments" | "tool-result-error";
  label: string;
  triggeringField: string;
  value?: string;
  evidence: AgentEvidence;
};
export type AgentProtocolInspection = {
  protocols: AgentProtocol[];
  timeline: AgentTimelineEntry[];
  capabilities: AgentCapability[];
  signals: AgentSignal[];
};

type RecordValue = Record<string, unknown>;
const JSON_TYPES = ["application/json", "application/json-rpc", "application/a2a+json"];
const MCP_METHODS = new Set([
  "initialize", "tools/list", "tools/call", "resources/list", "resources/read",
  "resources/templates/list",
  "prompts/list", "prompts/get", "notifications/resources/list_changed",
  "notifications/resources/updated", "notifications/tools/list_changed", "notifications/prompts/list_changed",
]);
const A2A_METHODS = new Set([
  "SendMessage", "SendStreamingMessage", "GetTask", "ListTasks", "CancelTask", "SubscribeToTask",
  "CreateTaskPushNotificationConfig", "GetTaskPushNotificationConfig", "ListTaskPushNotificationConfigs",
  "DeleteTaskPushNotificationConfig", "GetExtendedAgentCard",
]);
const SECRET_KEY = /(authorization|cookie|password|passwd|secret|token|api[_-]?key|session|access[_-]?token|refresh[_-]?token|private[_-]?key|client[_-]?secret|credential|assertion|signature)/i;
const SECRET_VALUE = /(?:bearer|basic)\s+\S+|eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]+|\b(?:sk|pk|api)[_-][A-Za-z0-9_-]{12,}/i;
const WORD_SIGNALS: Array<[AgentSignal["kind"], RegExp]> = [
  ["write", /\b(write|delete|remove|modify|update|overwrite|create)\b/i],
  ["network", /\b(fetch|download|upload|http|network|request|connect|socket)\b/i],
  ["file", /\b(file|filename|filesystem|directory|folder|filepath|path)\b/i],
];

function record(value: unknown): RecordValue | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as RecordValue : null;
}
function text(value: unknown): string | undefined {
  return typeof value === "string" ? value.slice(0, AGENT_PROTOCOL_LIMITS.string) : undefined;
}
function jsonType(mime: string | null | undefined): boolean {
  const type = ((mime ?? "").split(";", 1)[0] ?? "").trim().toLowerCase();
  return JSON_TYPES.includes(type) || type.endsWith("+json");
}
function sseType(mime: string | null | undefined): boolean {
  return ((mime ?? "").split(";", 1)[0] ?? "").trim().toLowerCase() === "text/event-stream";
}
function bytes(value: string): number { return new TextEncoder().encode(value).length; }
function ownValue(value: unknown, key: string): unknown {
  if (!value || typeof value !== "object") return undefined;
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  return descriptor && "value" in descriptor ? descriptor.value : undefined;
}
function boundedJsonSize(value: unknown): number {
  let size = 0; let nodes = 0;
  const visit = (input: unknown, depth: number): void => {
    if (++nodes > AGENT_PROTOCOL_LIMITS.nodes || depth > AGENT_PROTOCOL_LIMITS.depth || size > AGENT_PROTOCOL_LIMITS.argumentBytes) return;
    if (typeof input === "string") { size += bytes(input) + 2; return; }
    if (input === null || typeof input === "number" || typeof input === "boolean") { size += String(input).length; return; }
    if (!input || typeof input !== "object") return;
    for (const [key, descriptor] of Object.entries(Object.getOwnPropertyDescriptors(input))) if ("value" in descriptor) {
      size += bytes(key) + 3; visit(descriptor.value, depth + 1);
    }
  };
  visit(value, 0); return size;
}

/** Makes a bounded, redacted copy. It never reads getters through serialization or resolves references. */
export function sanitizeAgentValue(value: unknown): unknown | null {
  let nodes = 0;
  let totalBytes = 0;
  const visit = (input: unknown, depth: number, key = ""): unknown => {
    if (++nodes > AGENT_PROTOCOL_LIMITS.nodes || depth > AGENT_PROTOCOL_LIMITS.depth) throw new Error("limit");
    totalBytes += bytes(key);
    if (totalBytes > AGENT_PROTOCOL_LIMITS.bytes) throw new Error("limit");
    if (SECRET_KEY.test(key)) return REDACTED;
    if (typeof input === "string") {
      totalBytes += bytes(input);
      if (totalBytes > AGENT_PROTOCOL_LIMITS.bytes) throw new Error("limit");
      if (SECRET_VALUE.test(input)) return REDACTED;
      return input.slice(0, AGENT_PROTOCOL_LIMITS.string);
    }
    if (input === null || typeof input === "boolean" || typeof input === "number") return input;
    if (typeof input !== "object") return null;
    const descriptors = Object.getOwnPropertyDescriptors(input);
    if (Array.isArray(input)) {
      const output: unknown[] = [];
      for (let index = 0; index < input.length; index += 1) {
        const descriptor = descriptors[String(index)];
        if (descriptor && "value" in descriptor) output.push(visit(descriptor.value, depth + 1));
      }
      return output;
    }
    const output: RecordValue = {};
    for (const [childKey, descriptor] of Object.entries(descriptors)) {
      if ("value" in descriptor) output[childKey] = visit(descriptor.value, depth + 1, childKey);
    }
    return output;
  };
  try { return visit(value, 0); } catch { return null; }
}

function bodyValue(body: ApiBody | null, mime: string | null | undefined): unknown | null {
  if (!body) return null;
  if (body.kind === "json") return sanitizeAgentValue(body.value);
  if (body.kind !== "text" || !jsonType(mime) || bytes(body.raw) > AGENT_PROTOCOL_LIMITS.bytes) return null;
  try { return sanitizeAgentValue(JSON.parse(body.raw) as unknown); } catch { return null; }
}

function parseSse(raw: string): unknown[] {
  if (bytes(raw) > AGENT_PROTOCOL_LIMITS.bytes) return [];
  const output: unknown[] = [];
  let data: string[] = [];
  const flush = (): void => {
    if (!data.length || output.length >= AGENT_PROTOCOL_LIMITS.events) { data = []; return; }
    const joined = data.join("\n"); data = [];
    if (bytes(joined) > AGENT_PROTOCOL_LIMITS.bytes) return;
    try { const safe = sanitizeAgentValue(JSON.parse(joined) as unknown); if (safe !== null) output.push(safe); } catch { /* malformed SSE data is ordinary traffic */ }
  };
  for (const line of raw.split(/\r?\n/)) {
    if (line === "") flush();
    else if (line.startsWith("data:")) data.push(line.slice(5).replace(/^ /, ""));
  }
  flush();
  return output;
}

function evidence(exchange: ApiExchange, source: AgentEvidence["source"], path: string): AgentEvidence {
  return { source, sequence: exchange.sequence, timestamp: exchange.startedAt, path };
}
function endpointKind(rawUrl: string, method: string): "card" | "message" | "task" | "a2a" | null {
  let path: string;
  try { path = new URL(rawUrl).pathname; } catch { return null; }
  if (method === "GET" && (path === "/.well-known/agent-card.json" || path.endsWith("/extendedAgentCard"))) return "card";
  if (method === "POST" && /\/message:(?:send|stream)$/.test(path)) return "message";
  if ((method === "GET" && /\/tasks(?:\/[^/]+(?::subscribe)?)?$/.test(path)) ||
      (method === "POST" && /\/tasks\/[^/]+:(?:cancel|subscribe)$/.test(path))) return "task";
  if (/\/tasks\/[^/]+\/pushNotificationConfigs(?:\/[^/]+)?$/.test(path) && ["GET", "POST", "DELETE"].includes(method)) return "a2a";
  return null;
}

function isA2aShape(value: unknown, endpoint: "card" | "message" | "task" | "a2a"): boolean {
  const obj = record(value); if (!obj) return false;
  if (endpoint === "card") return typeof obj.name === "string" && typeof obj.version === "string" && !!record(obj.capabilities) && Array.isArray(obj.skills);
  if (endpoint === "message") {
    const message = record(obj.message) ?? obj;
    return typeof message.messageId === "string" || typeof message.message_id === "string" ||
      (typeof obj.id === "string" && !!record(obj.status));
  }
  if (endpoint === "task") {
    if (Array.isArray(obj.tasks)) return true;
    return typeof obj.id === "string" && !!record(obj.status);
  }
  return typeof obj.id === "string" || typeof obj.taskId === "string" || typeof obj.task_id === "string";
}

function addSignal(out: AgentProtocolInspection, protocol: AgentProtocol, kind: AgentSignal["kind"], field: string, ev: AgentEvidence, value?: string): void {
  if (out.signals.length >= AGENT_PROTOCOL_LIMITS.events || out.signals.some((item) => item.kind === kind && item.triggeringField === field && item.evidence.source === ev.source)) return;
  out.signals.push({ protocol, kind, label: kind === "tool-result-error" ? "Tool result reports an error" : `${kind} heuristic`, triggeringField: field, value, evidence: { ...ev, path: field } });
}
function scanSignals(value: unknown, base: string, protocol: AgentProtocol, ev: AgentEvidence, out: AgentProtocolInspection, depth = 0): void {
  if (depth > AGENT_PROTOCOL_LIMITS.depth || out.signals.length >= AGENT_PROTOCOL_LIMITS.events) return;
  if (Array.isArray(value)) { value.forEach((child, i) => scanSignals(child, `${base}[${i}]`, protocol, ev, out, depth + 1)); return; }
  const obj = record(value); if (!obj) return;
  for (const [key, child] of Object.entries(obj)) {
    const field = `${base}.${key}`;
    if (SECRET_KEY.test(key) || (typeof child === "string" && SECRET_VALUE.test(child))) addSignal(out, protocol, "credential", field, ev, REDACTED);
    if (typeof child === "string") {
      const words = child.replace(/[_./:-]+/g, " ");
      for (const [kind, regex] of WORD_SIGNALS) if (regex.test(words)) addSignal(out, protocol, kind, field, ev);
    }
    scanSignals(child, field, protocol, ev, out, depth + 1);
  }
}

function addEntities(value: unknown, protocol: AgentProtocol, ev: AgentEvidence, out: AgentProtocolInspection, base: string): void {
  const obj = record(value); if (!obj || out.timeline.length >= AGENT_PROTOCOL_LIMITS.events) return;
  const task = record(obj.task) ?? (obj.id && obj.status ? obj : null);
  const statusEvent = record(obj.statusUpdate) ?? (obj.status && (obj.taskId || obj.task_id) ? obj : null);
  const artifactEvent = record(obj.artifactUpdate) ?? (obj.artifact && (obj.taskId || obj.task_id) ? obj : null);
  const message = record(obj.message) ?? (obj.parts && (obj.messageId || obj.message_id) ? obj : null);
  if (task) {
    const status = record(task.status); const state = text(status?.state);
    out.timeline.push({ protocol, kind: "task", label: "Task", id: text(task.id), state, evidence: { ...ev, path: `${base}${task === obj ? "" : ".task"}` } });
  } else if (statusEvent) {
    const status = record(statusEvent.status);
    out.timeline.push({ protocol, kind: "status", label: "Task status update", id: text(statusEvent.taskId ?? statusEvent.task_id), state: text(status?.state), evidence: { ...ev, path: base } });
  } else if (artifactEvent) {
    const artifact = record(artifactEvent.artifact);
    out.timeline.push({ protocol, kind: "artifact", label: text(artifact?.name) ?? "Artifact update", id: text(artifact?.artifactId ?? artifact?.artifact_id), evidence: { ...ev, path: `${base}.artifact` } });
  } else if (message) {
    out.timeline.push({ protocol, kind: "message", label: "Message", id: text(message.messageId ?? message.message_id), detail: text(message.role), evidence: { ...ev, path: `${base}${message === obj ? "" : ".message"}` } });
  }
  if (Array.isArray(obj.artifacts)) obj.artifacts.slice(0, AGENT_PROTOCOL_LIMITS.events).forEach((item, i) => {
    const artifact = record(item); if (artifact) out.timeline.push({ protocol, kind: "artifact", label: text(artifact.name) ?? "Artifact", id: text(artifact.artifactId ?? artifact.artifact_id), evidence: { ...ev, path: `${base}.artifacts[${i}]` } });
  });
  if (Array.isArray(obj.tasks)) obj.tasks.slice(0, AGENT_PROTOCOL_LIMITS.events).forEach((item, i) => {
    addEntities(item, protocol, ev, out, `${base}.tasks[${i}]`);
  });
}

function inspectMcp(method: string, request: RecordValue, response: unknown, reqEv: AgentEvidence, resEv: AgentEvidence, out: AgentProtocolInspection, originalArgumentBytes?: number): void {
  if (!MCP_METHODS.has(method)) return;
  if (!out.protocols.includes("mcp")) out.protocols.push("mcp");
  out.timeline.push({ protocol: "mcp", kind: method === "tools/call" ? "tool-call" : "lifecycle", label: method, id: text(request.id), detail: method === "tools/call" ? text(record(request.params)?.name) : undefined, evidence: { ...reqEv, path: "request" } });
  const params = record(request.params);
  if (method === "tools/call" && params) {
    const args = params.arguments;
    const size = originalArgumentBytes ?? boundedJsonSize(args);
    if (size > AGENT_PROTOCOL_LIMITS.argumentBytes) addSignal(out, "mcp", "oversized-arguments", "request.params.arguments", reqEv, `more than ${AGENT_PROTOCOL_LIMITS.argumentBytes} bytes`);
  }
  const result = record(record(response)?.result);
  if (method === "initialize" && result) {
    const caps = record(result.capabilities);
    if (caps) for (const name of Object.keys(caps)) out.capabilities.push({ protocol: "mcp", name, triggeringField: `response.result.capabilities.${name}`, evidence: { ...resEv, path: `response.result.capabilities.${name}` } });
  }
  const listedField = method === "tools/list" ? "tools" : method === "resources/list" ? "resources" : method === "prompts/list" ? "prompts" : null;
  const listed = listedField ? result?.[listedField] : null;
  if (listedField && Array.isArray(listed)) listed.forEach((item, i) => {
    const entry = record(item); const name = text(entry?.name ?? entry?.uri);
    if (name) out.capabilities.push({ protocol: "mcp", name, triggeringField: `response.result.${listedField}[${i}].${entry?.name ? "name" : "uri"}`, evidence: { ...resEv, path: `response.result.${listedField}[${i}]` } });
  });
  if (method === "tools/call" && (result?.isError === true || record(response)?.error)) addSignal(out, "mcp", "tool-result-error", record(response)?.error ? "response.error" : "response.result.isError", resEv, "true");
  if (record(response)?.error) out.timeline.push({ protocol: "mcp", kind: "error", label: text(record(record(response)?.error)?.message) ?? "JSON-RPC error", evidence: { ...resEv, path: "response.error" } });
  scanSignals(request, "request", "mcp", reqEv, out); if (response) scanSignals(response, "response", "mcp", resEv, out);
}

function inspectA2a(value: unknown, ev: AgentEvidence, out: AgentProtocolInspection, base: string): void {
  if (!out.protocols.includes("a2a")) out.protocols.push("a2a");
  const obj = record(value); if (!obj) return;
  const card = obj.name && obj.version && (obj.capabilities || obj.skills) ? obj : null;
  if (card) {
    out.timeline.push({ protocol: "a2a", kind: "lifecycle", label: `Agent Card: ${text(card.name) ?? "agent"}`, evidence: { ...ev, path: base } });
    const capabilities = record(card.capabilities);
    if (capabilities) for (const [name, enabled] of Object.entries(capabilities)) if (enabled === true || Array.isArray(enabled)) out.capabilities.push({ protocol: "a2a", name, triggeringField: `${base}.capabilities.${name}`, evidence: { ...ev, path: `${base}.capabilities.${name}` } });
    if (Array.isArray(card.skills)) card.skills.forEach((skill, i) => { const name = text(record(skill)?.name); if (name) out.capabilities.push({ protocol: "a2a", name, triggeringField: `${base}.skills[${i}].name`, evidence: { ...ev, path: `${base}.skills[${i}].name` } }); });
  }
  addEntities(obj.result ?? obj, "a2a", ev, out, obj.result ? `${base}.result` : base);
  const params = record(obj.params);
  if (params) addEntities(params, "a2a", ev, out, `${base}.params`);
  if (obj.error) out.timeline.push({ protocol: "a2a", kind: "error", label: text(record(obj.error)?.message) ?? "A2A error", evidence: { ...ev, path: `${base}.error` } });
  scanSignals(obj, base, "a2a", ev, out);
}

function boundedInspection(out: AgentProtocolInspection): AgentProtocolInspection {
  return {
    protocols: out.protocols,
    timeline: out.timeline.slice(0, AGENT_PROTOCOL_LIMITS.events),
    capabilities: out.capabilities.slice(0, AGENT_PROTOCOL_LIMITS.events),
    signals: out.signals.slice(0, AGENT_PROTOCOL_LIMITS.events),
  };
}

/** Passively inspects one already-captured exchange. Unknown JSON-RPC returns null. */
export function inspectAgentProtocol(exchange: ApiExchange): AgentProtocolInspection | null {
  const method = exchange.request.method.toUpperCase();
  if (!["GET", "POST", "DELETE"].includes(method)) return null;
  const requestMime = exchange.request.mimeType;
  const responseMime = exchange.response.mimeType;
  const request = jsonType(requestMime) ? bodyValue(exchange.request.body, requestMime) : null;
  const response = jsonType(responseMime) ? bodyValue(exchange.response.body, responseMime) : null;
  const reqEv = evidence(exchange, "request", "request"); const resEv = evidence(exchange, "response", "response");
  const streamedItems = sseType(responseMime) && exchange.response.body.kind === "text"
    ? parseSse(exchange.response.body.raw)
    : [];
  const out: AgentProtocolInspection = { protocols: [], timeline: [], capabilities: [], signals: [] };
  const reqObj = record(request); const rpcMethod = text(reqObj?.method);
  if (method === "POST" && reqObj?.jsonrpc === "2.0" && rpcMethod && MCP_METHODS.has(rpcMethod)) {
    const rawRequest = exchange.request.body?.kind === "json" ? exchange.request.body.value : undefined;
    const rawArguments = ownValue(ownValue(rawRequest, "params"), "arguments");
    inspectMcp(rpcMethod, reqObj, response, reqEv, resEv, out, rawArguments === undefined ? undefined : boundedJsonSize(rawArguments));
  }
  else if (method === "POST" && reqObj?.jsonrpc === "2.0" && rpcMethod && A2A_METHODS.has(rpcMethod)) {
    inspectA2a(request, reqEv, out, "request"); if (response) inspectA2a(response, resEv, out, "response");
  } else {
    const endpoint = endpointKind(exchange.request.url, method);
    if (!endpoint) return null;
    // Endpoint alone is insufficient for a card/message POST; require a recognizable safe JSON object.
    const requestMatches = isA2aShape(request, endpoint);
    const responseMatches = isA2aShape(response, endpoint);
    const streamMatches = streamedItems.some(isA2aEvent);
    if (!requestMatches && !responseMatches && !streamMatches) return null;
    if (streamMatches) out.protocols.push("a2a");
    if (requestMatches) inspectA2a(request, reqEv, out, "request");
    if (responseMatches) inspectA2a(response, resEv, out, "response");
  }
  if (streamedItems.length) {
    for (const [index, item] of streamedItems.entries()) {
      const sseEv = evidence(exchange, "sse", `response.sse[${index}]`);
      if (out.protocols.includes("a2a") && isA2aEvent(item)) inspectA2a(item, sseEv, out, `response.sse[${index}]`);
      else if (out.protocols.includes("mcp") && rpcMethod && reqObj) {
        const streamed: AgentProtocolInspection = { protocols: [], timeline: [], capabilities: [], signals: [] };
        inspectMcp(rpcMethod, reqObj, item, reqEv, sseEv, streamed);
        out.capabilities.push(...streamed.capabilities);
        out.signals.push(...streamed.signals.filter((signal) => signal.evidence.source !== "request"));
        out.timeline.push(...streamed.timeline.filter((entry) => entry.kind === "error"));
      }
    }
  }
  return out.protocols.length ? boundedInspection(out) : null;
}

function isA2aEvent(value: unknown): boolean {
  const obj = record(value); if (!obj) return false;
  if (obj.result) return isA2aEvent(obj.result);
  return (typeof obj.name === "string" && typeof obj.version === "string" && !!obj.capabilities) ||
    (!!obj.status && (typeof obj.id === "string" || typeof obj.taskId === "string" || typeof obj.task_id === "string")) ||
    (!!obj.artifact && (typeof obj.taskId === "string" || typeof obj.task_id === "string")) ||
    !!obj.statusUpdate || !!obj.artifactUpdate || !!obj.message ||
    (Array.isArray(obj.parts) && (typeof obj.messageId === "string" || typeof obj.message_id === "string"));
}

/** Inspects a captured text SSE message without treating binary/protocol frames as agent traffic. */
export function inspectAgentSseEvent(event: ProtocolEvent, protocolHint: AgentProtocol): AgentProtocolInspection | null {
  if (event.transport !== "sse" || event.binary || event.truncated || !event.payload || bytes(event.payload) > AGENT_PROTOCOL_LIMITS.bytes) return null;
  const parsed = parseSse(event.payload);
  if (!parsed.length) { try { const safe = sanitizeAgentValue(JSON.parse(event.payload) as unknown); if (safe !== null) parsed.push(safe); } catch { return null; } }
  const out: AgentProtocolInspection = { protocols: [], timeline: [], capabilities: [], signals: [] };
  const ev: AgentEvidence = { source: "sse", sequence: event.sequence, timestamp: event.timestamp, path: "payload" };
  if (protocolHint === "a2a") parsed.forEach((item, i) => { if (isA2aEvent(item)) inspectA2a(item, { ...ev, path: `payload[${i}]` }, out, `payload[${i}]`); });
  else for (const [i, item] of parsed.entries()) {
    const obj = record(item); const method = text(obj?.method);
    if (obj?.jsonrpc === "2.0" && method && MCP_METHODS.has(method)) inspectMcp(method, obj, null, { ...ev, path: `payload[${i}]` }, ev, out);
  }
  return out.protocols.length ? boundedInspection(out) : null;
}

