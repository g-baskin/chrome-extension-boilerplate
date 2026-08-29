import type { OpenApiDocument } from "./api-spec";
import {
  MAX_PURPLE_FLOW_STEPS,
  validatePurpleFlow,
  type ExpectedStatusClass,
  type PurpleFlow,
  type PurpleStep,
  type PurpleStepExpectation,
} from "./purple-flow";

export const MAX_ARAZZO_IMPORT_BYTES = 1024 * 1024;
const MAX_ARAZZO_DEPTH = 40;
const MAX_ARAZZO_NODES = 20_000;
const MAX_ARAZZO_STRING = 8192;
const HTTP_METHODS = new Set(["get", "put", "post", "delete", "options", "head", "patch"]);
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const SOURCE_NAME = /^[A-Za-z0-9_-]+$/;
const SENSITIVE_NAME = /(authorization|cookie|password|passwd|secret|token|api[_-]?key|session|access[_-]?token|refresh[_-]?token|id[_-]?token|private[_-]?key|client[_-]?secret|bearer|jwt|assertion|credential)/i;
const EPHEMERAL_NAME = /^(?:traceparent|tracestate|x-(?:request|correlation|trace)-id|request-id|correlation-id|nonce)$/i;

type JsonRecord = Record<string, unknown>;
type Scalar = string | number | boolean;

/** Metadata for the OpenAPI document already held locally by the caller. No URL is fetched. */
export type LocalOpenApiBaseline = Readonly<{
  sourceId: string;
  name: string;
  /** A safe relative name used only to identify the already-loaded description. */
  url: string;
  document: OpenApiDocument;
  /** Required when the OpenAPI document does not provide one absolute HTTP(S) server URL. */
  origin?: string;
}>;

export type ArazzoDocument = Readonly<{
  arazzo: "1.1.0";
  info: Readonly<{ title: string; version: string }>;
  sourceDescriptions: ReadonlyArray<Readonly<{ name: string; url: string; type: "openapi" }>>;
  workflows: ReadonlyArray<JsonRecord>;
}>;

type ResolvedOperation = {
  operationId: string | null;
  operationPath: string;
  pathTemplate: string;
  method: string;
};

/** Parse a deliberately bounded, executable subset of Arazzo 1.1 JSON. */
export function parseArazzo(text: string, baseline: LocalOpenApiBaseline): PurpleFlow[] {
  assertBaselineMetadata(baseline);
  if (new TextEncoder().encode(text).length > MAX_ARAZZO_IMPORT_BYTES) throw new Error("Arazzo file must be 1 MiB or smaller.");
  let parsed: unknown;
  try { parsed = JSON.parse(text) as unknown; } catch { throw new Error("Arazzo file must contain valid JSON; YAML is not supported."); }
  inspectJson(parsed);
  const root = record(parsed, "Arazzo document must be a JSON object.");
  exactKeys(root, ["arazzo", "info", "sourceDescriptions", "workflows"], "Arazzo document contains unsupported root features.");
  if (root.arazzo !== "1.1.0") throw new Error(`Unsupported Arazzo version: ${typeof root.arazzo === "string" ? root.arazzo : "missing"}; only 1.1.0 is supported.`);
  parseInfo(root.info);
  parseSource(root.sourceDescriptions, baseline);
  if (!Array.isArray(root.workflows) || root.workflows.length === 0) throw new Error("Arazzo document must contain at least one workflow.");
  if (root.workflows.length > MAX_PURPLE_FLOW_STEPS) throw new Error(`Arazzo document exceeds ${MAX_PURPLE_FLOW_STEPS} workflows.`);
  let totalSteps = 0;
  const workflowIds = new Set<string>();
  const flows = root.workflows.map((candidate) => {
    const workflow = parseWorkflow(candidate, baseline);
    totalSteps += workflow.steps.length;
    if (totalSteps > MAX_PURPLE_FLOW_STEPS) throw new Error(`Arazzo document exceeds ${MAX_PURPLE_FLOW_STEPS} total steps.`);
    if (workflowIds.has(workflow.id)) throw new Error("Arazzo workflowId values must be unique.");
    workflowIds.add(workflow.id);
    return workflow;
  });
  return flows;
}

export const importArazzo = parseArazzo;

/** Create an Arazzo 1.1 object. Request bodies and identity/browser-controlled values are never exported. */
export function toArazzoDocument(flows: readonly PurpleFlow[], baseline: LocalOpenApiBaseline): ArazzoDocument {
  assertBaselineMetadata(baseline);
  if (flows.length === 0) throw new Error("At least one Purple flow is required for Arazzo export.");
  if (flows.length > MAX_PURPLE_FLOW_STEPS) throw new Error(`Arazzo export exceeds ${MAX_PURPLE_FLOW_STEPS} workflows.`);
  let totalSteps = 0;
  const workflowIds = new Set<string>();
  const workflows = flows.map((flow) => {
    validatePurpleFlow(flow);
    totalSteps += flow.steps.length;
    if (totalSteps > MAX_PURPLE_FLOW_STEPS) throw new Error(`Arazzo export exceeds ${MAX_PURPLE_FLOW_STEPS} total steps.`);
    const workflowId = uniqueExportId(flow.id, workflowIds, "workflow");
    const steps = flow.steps.map((step, index) => exportStep(step, flow, baseline, index));
    return { workflowId, summary: flow.name, steps };
  });
  return {
    arazzo: "1.1.0",
    info: { title: flows.length === 1 ? flows[0]!.name : "Dev Toolz Purple Flows", version: "1.0.0" },
    sourceDescriptions: [{ name: baseline.name, url: baseline.url, type: "openapi" }],
    workflows,
  };
}

export function serializeArazzo(flows: readonly PurpleFlow[], baseline: LocalOpenApiBaseline): string {
  const text = JSON.stringify(toArazzoDocument(flows, baseline));
  if (new TextEncoder().encode(text).length > MAX_ARAZZO_IMPORT_BYTES) throw new Error("Arazzo export exceeds 1 MiB.");
  return text;
}

export const exportArazzo = serializeArazzo;

function parseWorkflow(value: unknown, baseline: LocalOpenApiBaseline): PurpleFlow {
  const workflow = record(value, "Arazzo workflow is malformed.");
  exactKeys(workflow, ["workflowId", "summary", "description", "inputs", "steps"], "Arazzo workflow contains unsupported features.", true);
  const workflowId = id(workflow.workflowId, "Arazzo workflowId is malformed.");
  if (workflow.inputs !== undefined) throw new Error("Arazzo workflow input schemas are unsupported; use safe literal step parameters.");
  if (!Array.isArray(workflow.steps) || workflow.steps.length === 0 || workflow.steps.length > MAX_PURPLE_FLOW_STEPS) {
    throw new Error(`Arazzo workflows require 1–${MAX_PURPLE_FLOW_STEPS} steps.`);
  }
  const origin = resolveOrigin(baseline);
  const stepIds = new Set<string>();
  const steps = workflow.steps.map((candidate, index) => {
    const step = parseStep(candidate, baseline, origin, index, stepIds);
    if (stepIds.has(step.id)) throw new Error("Arazzo stepId values must be unique within a workflow.");
    stepIds.add(step.id);
    return step;
  });
  const now = new Date().toISOString();
  const flow: PurpleFlow = {
    id: workflowId,
    name: boundedOptional(workflow.summary, 80) ?? boundedOptional(workflow.description, 80) ?? workflowId,
    origin,
    source: "arazzo",
    steps,
    expectedControls: [],
    attackAnnotations: [],
    createdAt: now,
    updatedAt: now,
  };
  validatePurpleFlow(flow);
  return flow;
}

function parseStep(value: unknown, baseline: LocalOpenApiBaseline, origin: string, index: number, priorStepIds: Set<string>): PurpleStep {
  const step = record(value, "Arazzo step is malformed.");
  exactKeys(step, ["stepId", "description", "operationId", "operationPath", "parameters", "successCriteria", "dependsOn", "x-dev-toolz-expectation"], "Arazzo step contains unsupported features.", true);
  const stepId = id(step.stepId, "Arazzo stepId is malformed.");
  if ((step.operationId === undefined) === (step.operationPath === undefined)) throw new Error(`Arazzo step ${stepId} requires exactly one operationId or operationPath.`);
  const operation = step.operationId !== undefined
    ? resolveOperationId(step.operationId, baseline)
    : resolveOperationPath(step.operationPath, baseline);
  parseDependencies(step.dependsOn, priorStepIds, stepId);
  const parameters = parseParameters(step.parameters, stepId);
  const requestUrl = buildOperationUrl(origin, operation.pathTemplate, parameters, baseline);
  const headers = parameters.filter((parameter) => parameter.in === "header").map(({ name, value }) => ({ name, value: String(value) }));
  const expectation = parseExpectation(step.successCriteria, step["x-dev-toolz-expectation"], stepId);
  const result: PurpleStep = {
    id: stepId,
    name: boundedOptional(step.description, 80) ?? stepId,
    capturedRequest: {
      exchangeSequence: index + 1,
      capturedPageUrl: `${origin}/`,
      method: operation.method.toUpperCase(),
      url: requestUrl,
      headers,
      body: null,
      mimeType: null,
    },
    openApiOperation: {
      sourceId: baseline.sourceId,
      operationId: operation.operationId,
      operationPath: operation.operationId === null ? operation.operationPath : null,
    },
    expectation,
  };
  return result;
}

function exportStep(step: PurpleStep, flow: PurpleFlow, baseline: LocalOpenApiBaseline, index: number): JsonRecord {
  if (!step.openApiOperation || step.openApiOperation.sourceId !== baseline.sourceId) throw new Error(`Purple flow step ${step.id} is not mapped to the selected local OpenAPI baseline.`);
  const operation = step.openApiOperation.operationId !== null
    ? resolveOperationId(step.openApiOperation.operationId, baseline)
    : resolveOperationPath(`{$sourceDescriptions.${baseline.name}.url}${step.openApiOperation.operationPath}`, baseline);
  const actual = new URL(step.capturedRequest.url);
  if (actual.origin !== flow.origin) throw new Error(`Purple flow step ${step.id} has an unsafe cross-origin URL.`);
  if (step.capturedRequest.method.toLowerCase() !== operation.method.toLowerCase()) throw new Error(`Purple flow step ${step.id} method does not match its OpenAPI operation.`);
  const parameters: Array<{ name: string; in: string; value: Scalar }> = [];
  const templateSegments = operationRequestPath(flow.origin, baseline, operation.pathTemplate).split("/");
  const actualSegments = actual.pathname.split("/");
  if (templateSegments.length !== actualSegments.length) throw new Error(`Purple flow step ${step.id} URL does not match its OpenAPI operation path.`);
  templateSegments.forEach((segment, position) => {
    const match = /^\{([^{}]+)\}$/.exec(segment);
    if (match) parameters.push({ name: match[1]!, in: "path", value: decodeURIComponent(actualSegments[position] ?? "") });
    else if (segment !== actualSegments[position]) throw new Error(`Purple flow step ${step.id} URL does not match its OpenAPI operation path.`);
  });
  for (const [name, value] of actual.searchParams) parameters.push({ name, in: "query", value });
  for (const header of step.capturedRequest.headers) {
    if (!EPHEMERAL_NAME.test(header.name)) parameters.push({ name: header.name, in: "header", value: header.value });
  }
  const exported: JsonRecord = {
    stepId: step.id,
    description: step.name,
    ...(step.openApiOperation.operationId !== null
      ? { operationId: `$sourceDescriptions.${baseline.name}.${step.openApiOperation.operationId}` }
      : { operationPath: `{$sourceDescriptions.${baseline.name}.url}${step.openApiOperation.operationPath}` }),
    ...(parameters.length ? { parameters } : {}),
    ...exportCriteria(step.expectation),
    ...(index > 0 ? { dependsOn: [flow.steps[index - 1]!.id] } : {}),
    "x-dev-toolz-expectation": {
      prevention: step.expectation.prevention,
      detectionQuery: step.expectation.detectionQuery,
    },
  };
  return exported;
}

function exportCriteria(expectation: PurpleStepExpectation): JsonRecord {
  if (expectation.expectedStatus !== null) return { successCriteria: [{ condition: `$statusCode == ${expectation.expectedStatus}` }] };
  if (expectation.expectedStatusClass !== null) {
    const start = Number(expectation.expectedStatusClass[0]) * 100;
    return { successCriteria: [{ condition: `$statusCode >= ${start} && $statusCode < ${start + 100}` }] };
  }
  return {};
}

function parseExpectation(criteriaValue: unknown, extensionValue: unknown, stepId: string): PurpleStepExpectation {
  let expectedStatus: number | null = null;
  let expectedStatusClass: ExpectedStatusClass | null = null;
  if (criteriaValue !== undefined) {
    if (!Array.isArray(criteriaValue) || criteriaValue.length !== 1) throw new Error(`Arazzo step ${stepId} has unsupported successCriteria; one status criterion is supported.`);
    const criterion = record(criteriaValue[0], `Arazzo step ${stepId} success criterion is malformed.`);
    exactKeys(criterion, ["condition", "type"], `Arazzo step ${stepId} success criterion contains unsupported features.`, true);
    if (criterion.type !== undefined && criterion.type !== "simple") throw new Error(`Arazzo step ${stepId} supports only simple status criteria.`);
    if (typeof criterion.condition !== "string") throw new Error(`Arazzo step ${stepId} success criterion is malformed.`);
    let match = /^\$statusCode\s*==\s*([1-5]\d\d)$/.exec(criterion.condition);
    if (match) expectedStatus = Number(match[1]);
    else {
      match = /^\$statusCode\s*>=\s*([1-5]00)\s*&&\s*\$statusCode\s*<\s*([2-6]00)$/.exec(criterion.condition);
      if (!match || Number(match[2]) !== Number(match[1]) + 100) throw new Error(`Arazzo step ${stepId} success criterion must assert one HTTP status or status class.`);
      expectedStatusClass = `${match[1]![0]}xx` as ExpectedStatusClass;
    }
  }
  let prevention: PurpleStepExpectation["prevention"] = "observe-only";
  let detectionQuery: string | null = null;
  if (extensionValue !== undefined) {
    const extension = record(extensionValue, `Arazzo step ${stepId} Dev Toolz expectation is malformed.`);
    exactKeys(extension, ["prevention", "detectionQuery"], `Arazzo step ${stepId} Dev Toolz expectation contains unsupported features.`);
    if (!(extension.prevention === "allowed" || extension.prevention === "blocked" || extension.prevention === "observe-only")) throw new Error(`Arazzo step ${stepId} prevention expectation is malformed.`);
    if (extension.detectionQuery !== null && typeof extension.detectionQuery !== "string") throw new Error(`Arazzo step ${stepId} detection expectation is malformed.`);
    prevention = extension.prevention;
    detectionQuery = extension.detectionQuery as string | null;
  }
  return { prevention, detectionQuery, expectedStatus, expectedStatusClass };
}

type ParsedParameter = { name: string; in: "path" | "query" | "header"; value: Scalar };
function parseParameters(value: unknown, stepId: string): ParsedParameter[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 100) throw new Error(`Arazzo step ${stepId} parameters are malformed.`);
  const seen = new Set<string>();
  return value.map((candidate) => {
    const parameter = record(candidate, `Arazzo step ${stepId} parameter is malformed.`);
    exactKeys(parameter, ["name", "in", "value"], `Arazzo step ${stepId} parameter contains unsupported features.`);
    if (typeof parameter.name !== "string" || parameter.name.length === 0 || parameter.name.length > 256) throw new Error(`Arazzo step ${stepId} parameter name is malformed.`);
    if (!(parameter.in === "path" || parameter.in === "query" || parameter.in === "header")) throw new Error(`Arazzo step ${stepId} parameter location is unsupported.`);
    if (typeof parameter.value !== "string" && typeof parameter.value !== "number" && typeof parameter.value !== "boolean") throw new Error(`Arazzo step ${stepId} parameter values must be literal strings, numbers, or booleans.`);
    if (typeof parameter.value === "string" && (parameter.value.startsWith("$") || parameter.value.length > MAX_ARAZZO_STRING)) throw new Error(`Arazzo step ${stepId} dynamic or excessive parameter values are unsupported.`);
    if (SENSITIVE_NAME.test(parameter.name) || EPHEMERAL_NAME.test(parameter.name)) throw new Error(`Arazzo step ${stepId} contains a credential or ephemeral identity parameter.`);
    const key = `${parameter.in}\0${parameter.name.toLowerCase()}`;
    if (seen.has(key)) throw new Error(`Arazzo step ${stepId} contains duplicate parameters.`);
    seen.add(key);
    return { name: parameter.name, in: parameter.in, value: parameter.value };
  });
}

function buildOperationUrl(origin: string, pathTemplate: string, parameters: ParsedParameter[], baseline: LocalOpenApiBaseline): string {
  let path = operationRequestPath(origin, baseline, pathTemplate);
  for (const parameter of parameters.filter((item) => item.in === "path")) {
    const marker = `{${parameter.name}}`;
    if (!path.includes(marker)) throw new Error(`Arazzo path parameter ${parameter.name} does not resolve against the OpenAPI operation.`);
    path = path.split(marker).join(encodeURIComponent(String(parameter.value)));
  }
  if (/\{[^{}]+\}/.test(path)) throw new Error("Arazzo operation has unresolved path parameters.");
  const url = new URL(path, `${origin}/`);
  for (const parameter of parameters.filter((item) => item.in === "query")) url.searchParams.append(parameter.name, String(parameter.value));
  return url.href;
}

function resolveOperationId(value: unknown, baseline: LocalOpenApiBaseline): ResolvedOperation {
  if (typeof value !== "string" || value.length > 256) throw new Error("Arazzo operationId is malformed.");
  const prefix = `$sourceDescriptions.${baseline.name}.`;
  const operationId = value.startsWith("$sourceDescriptions.") ? (value.startsWith(prefix) ? value.slice(prefix.length) : "") : value;
  if (!operationId) throw new Error("Arazzo operationId references an unknown or external source description.");
  const matches: ResolvedOperation[] = [];
  for (const [path, item] of Object.entries(baseline.document.paths)) {
    if (!isRecord(item)) continue;
    for (const [method, candidate] of Object.entries(item)) {
      if (HTTP_METHODS.has(method.toLowerCase()) && isRecord(candidate) && candidate.operationId === operationId) {
        rejectOperationRefs(candidate);
        matches.push({ operationId, operationPath: operationPointer(path, method), pathTemplate: path, method });
      }
    }
  }
  if (matches.length !== 1) throw new Error(matches.length ? `OpenAPI operationId ${operationId} is not unique.` : `OpenAPI operationId ${operationId} could not be resolved locally.`);
  return matches[0]!;
}

function resolveOperationPath(value: unknown, baseline: LocalOpenApiBaseline): ResolvedOperation {
  if (typeof value !== "string" || value.length > 1024) throw new Error("Arazzo operationPath is malformed.");
  const prefix = `{$sourceDescriptions.${baseline.name}.url}`;
  if (!value.startsWith(prefix)) throw new Error("Arazzo operationPath must reference the loaded local OpenAPI source description.");
  const pointer = value.slice(prefix.length);
  const match = /^#\/paths\/([^/]+)\/([A-Za-z]+)$/.exec(pointer);
  if (!match) throw new Error("Arazzo operationPath must use a local JSON Pointer to an OpenAPI operation.");
  const path = decodePointer(match[1]!);
  const method = match[2]!.toLowerCase();
  if (!HTTP_METHODS.has(method)) throw new Error("Arazzo operationPath uses an unsupported HTTP method.");
  const pathItem = baseline.document.paths[path];
  const operation = isRecord(pathItem) ? pathItem[method] : undefined;
  if (!isRecord(operation)) throw new Error(`OpenAPI operationPath ${pointer} could not be resolved locally.`);
  rejectOperationRefs(operation);
  return { operationId: null, operationPath: pointer, pathTemplate: path, method };
}

function operationPointer(path: string, method: string): string {
  return `#/paths/${path.replace(/~/g, "~0").replace(/\//g, "~1")}/${method.toLowerCase()}`;
}
function decodePointer(value: string): string {
  if (/~(?![01])/u.test(value)) throw new Error("Arazzo operationPath contains an invalid JSON Pointer escape.");
  return value.replace(/~1/g, "/").replace(/~0/g, "~");
}

function rejectOperationRefs(operation: JsonRecord): void {
  const pending: unknown[] = [operation];
  while (pending.length) {
    const value = pending.pop();
    if (!value || typeof value !== "object") continue;
    if (Array.isArray(value)) { pending.push(...value); continue; }
    for (const [key, child] of Object.entries(value as JsonRecord)) {
      if (key === "$ref") throw new Error("Referenced OpenAPI operation uses $ref; references are not followed.");
      pending.push(child);
    }
  }
}

function parseDependencies(value: unknown, prior: Set<string>, stepId: string): void {
  if (value === undefined) return;
  const orderedPrior = [...prior];
  const previousStepId = orderedPrior[orderedPrior.length - 1];
  if (!Array.isArray(value) || value.length !== 1 || value[0] !== previousStepId) {
    throw new Error(`Arazzo step ${stepId} dependencies are unsupported; only the immediately preceding ordered step may be referenced.`);
  }
}

function parseInfo(value: unknown): void {
  const info = record(value, "Arazzo info object is malformed.");
  exactKeys(info, ["title", "summary", "description", "version"], "Arazzo info object contains unsupported features.", true);
  if (typeof info.title !== "string" || !info.title.trim() || typeof info.version !== "string" || !info.version.trim()) throw new Error("Arazzo info requires bounded title and version strings.");
}
function parseSource(value: unknown, baseline: LocalOpenApiBaseline): void {
  if (!Array.isArray(value) || value.length !== 1) throw new Error("Arazzo import supports exactly one loaded local OpenAPI source description.");
  const source = record(value[0], "Arazzo source description is malformed.");
  exactKeys(source, ["name", "url", "type"], "Arazzo source description contains unsupported features.");
  if (source.name !== baseline.name || source.url !== baseline.url) throw new Error("Arazzo source description does not reference the currently loaded local OpenAPI baseline.");
  if (source.type !== "openapi") throw new Error("Arazzo source description type must be openapi.");
}

function assertBaselineMetadata(baseline: LocalOpenApiBaseline): void {
  if (!SAFE_ID.test(baseline.sourceId) || !SOURCE_NAME.test(baseline.name) || baseline.name.length > 128) throw new Error("Local OpenAPI baseline metadata is malformed.");
  if (!isSafeRelativeReference(baseline.url)) throw new Error("Local OpenAPI baseline URL must be a safe relative reference.");
  if (!isRecord(baseline.document) || !isRecord(baseline.document.paths) || typeof baseline.document.openapi !== "string" || !baseline.document.openapi.startsWith("3.")) throw new Error("A valid loaded OpenAPI 3.x baseline is required.");
}
function isSafeRelativeReference(value: string): boolean {
  if (!value || value.length > 1024 || value.startsWith("/") || value.startsWith("//") || value.includes("\\") || /[?#]/.test(value)) return false;
  try {
    const decoded = decodeURIComponent(value);
    if (decoded.split("/").some((part) => part === ".." || part === "")) return false;
    const url = new URL(value, "https://local.invalid/");
    return url.origin === "https://local.invalid" && !url.username && !url.password;
  } catch { return false; }
}
function operationRequestPath(origin: string, baseline: LocalOpenApiBaseline, operationPath: string): string {
  const servers = Array.isArray(baseline.document.servers) ? baseline.document.servers : [];
  const serverUrl = isRecord(servers[0]) && typeof servers[0].url === "string" ? servers[0].url : "/";
  let server: URL;
  try { server = new URL(serverUrl, `${origin}/`); } catch { throw new Error("The loaded OpenAPI baseline server URL is unsafe."); }
  if (/[{}]/.test(server.pathname) || server.search || server.hash) throw new Error("OpenAPI server variables, queries, and fragments are unsupported for Arazzo conversion.");
  const prefix = server.pathname === "/" ? "" : server.pathname.replace(/\/$/, "");
  return `${prefix}/${operationPath.replace(/^\//, "")}`;
}

function resolveOrigin(baseline: LocalOpenApiBaseline): string {
  const configured = baseline.origin;
  const servers = Array.isArray(baseline.document.servers) ? baseline.document.servers : [];
  const serverUrl = isRecord(servers[0]) && typeof servers[0].url === "string" ? servers[0].url : undefined;
  const candidate = configured ?? (serverUrl && /^https?:\/\//i.test(serverUrl) ? serverUrl : undefined);
  if (!candidate) throw new Error("The loaded OpenAPI baseline requires a safe local origin for Arazzo import.");
  let origin: URL;
  try { origin = new URL(candidate); } catch { throw new Error("The loaded OpenAPI baseline origin is unsafe."); }
  if (!/^https?:$/.test(origin.protocol) || origin.username || origin.password || origin.href !== `${origin.origin}/`) throw new Error("The loaded OpenAPI baseline origin must be an HTTP(S) origin without credentials or a path.");
  if (serverUrl) {
    let server: URL;
    try { server = new URL(serverUrl, `${origin.origin}/`); } catch { throw new Error("The loaded OpenAPI baseline server URL is unsafe."); }
    if (!/^https?:$/.test(server.protocol) || server.username || server.password || server.origin !== origin.origin) throw new Error("The loaded OpenAPI baseline server URL must be same-origin and credential-free.");
    if (/[{}]/.test(server.pathname) || server.search || server.hash) throw new Error("OpenAPI server variables, queries, and fragments are unsupported for Arazzo conversion.");
  }
  return origin.origin;
}

function inspectJson(root: unknown): void {
  const pending: Array<{ value: unknown; depth: number }> = [{ value: root, depth: 0 }];
  let nodes = 0;
  while (pending.length) {
    const { value, depth } = pending.pop()!;
    nodes += 1;
    if (nodes > MAX_ARAZZO_NODES) throw new Error("Arazzo file contains excessive structure.");
    if (depth > MAX_ARAZZO_DEPTH) throw new Error("Arazzo file exceeds the maximum nesting depth.");
    if (typeof value === "string" && value.length > MAX_ARAZZO_STRING) throw new Error("Arazzo file contains an excessive string.");
    if (!value || typeof value !== "object") continue;
    if (Array.isArray(value)) for (const child of value) pending.push({ value: child, depth: depth + 1 });
    else for (const [key, child] of Object.entries(value as JsonRecord)) {
      if (key === "$ref") throw new Error("Arazzo $ref values are unsupported; external and reusable references are never followed.");
      pending.push({ value: child, depth: depth + 1 });
    }
  }
}
function record(value: unknown, message: string): JsonRecord {
  if (!isRecord(value) || Object.getPrototypeOf(value) !== Object.prototype) throw new Error(message);
  return value;
}
function isRecord(value: unknown): value is JsonRecord { return !!value && typeof value === "object" && !Array.isArray(value); }
function exactKeys(recordValue: JsonRecord, allowed: string[], message: string, optional = false): void {
  const keys = Object.keys(recordValue);
  if (keys.some((key) => !allowed.includes(key)) || (!optional && allowed.some((key) => !keys.includes(key)))) throw new Error(message);
}
function id(value: unknown, message: string): string {
  if (typeof value !== "string" || !SAFE_ID.test(value)) throw new Error(message);
  return value;
}
function boundedOptional(value: unknown, maximum: number): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string" || !value.trim() || value.length > maximum) throw new Error(`Arazzo descriptive strings must be 1–${maximum} characters.`);
  return value.trim();
}
function uniqueExportId(preferred: string, used: Set<string>, prefix: string): string {
  const base = SAFE_ID.test(preferred) ? preferred : `${prefix}-${preferred.replace(/[^A-Za-z0-9._:-]/g, "-").slice(0, 100)}`;
  let candidate = base;
  let suffix = 2;
  while (used.has(candidate)) candidate = `${base.slice(0, 120)}-${suffix++}`;
  used.add(candidate);
  return candidate;
}
