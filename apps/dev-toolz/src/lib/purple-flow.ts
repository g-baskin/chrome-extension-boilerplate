import { REDACTED, type ApiHeader } from "./api-traffic";
import { LOG_SEARCH_LIMITS, parseLogQuery } from "./log-search";

export const MAX_PURPLE_FLOW_STEPS = 25;
export const MAX_PURPLE_REQUEST_BODY_BYTES = 256 * 1024;
export const MAX_PURPLE_FLOW_BODY_BYTES = 1024 * 1024;
export const MAX_PURPLE_FLOW_ANNOTATIONS = 100;
export const MAX_PURPLE_EXPECTED_CONTROLS = 100;

const ALLOWED_METHODS = new Set(["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"]);
const FORBIDDEN_HEADER = /^(authorization|cookie|proxy-authorization|host|origin|referer|content-length|sec-)/i;
const SENSITIVE_NAME = /(authorization|cookie|password|passwd|secret|token|api[_-]?key|session|access[_-]?token|refresh[_-]?token|id[_-]?token|private[_-]?key|client[_-]?secret|bearer|jwt|assertion|credential)/i;
const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const HEADER_SCHEME_PATTERN = /^[!#$%&'*+.^_`|~0-9A-Za-z-]{1,32}$/;

export type PurpleFlowSource = "capture" | "manual" | "arazzo";
export type PreventionExpectation = "allowed" | "blocked" | "observe-only";
export type ExpectedStatusClass = "1xx" | "2xx" | "3xx" | "4xx" | "5xx";

export type CapturedRequestSnapshot = Readonly<{
  exchangeSequence: number;
  capturedPageUrl: string;
  method: string;
  url: string;
  headers: ReadonlyArray<Readonly<ApiHeader>>;
  body: string | null;
  mimeType: string | null;
}>;

export type LocalOpenApiOperationReference = Readonly<{
  sourceId: string;
  operationId: string | null;
  operationPath: string | null;
}>;

export type PurpleStepExpectation = {
  prevention: PreventionExpectation;
  detectionQuery: string | null;
  expectedStatus: number | null;
  expectedStatusClass: ExpectedStatusClass | null;
};

export type PurpleStep = {
  id: string;
  name: string;
  readonly capturedRequest: CapturedRequestSnapshot;
  openApiOperation: LocalOpenApiOperationReference | null;
  expectation: PurpleStepExpectation;
};

/** Kept as a compatibility name for callers created with the initial store. */
export type PurpleFlowStep = PurpleStep;

export type PurpleExpectedControl = {
  id: string;
  name: string;
  description: string;
  stepIds: string[];
};

export type PurpleAttackAnnotation = {
  id: string;
  stepId: string;
  tacticId: string;
  tacticName: string;
  techniqueId: string;
  techniqueName: string;
};

export type IdentityProfile = {
  id: string;
  displayName: string;
  mode: "browser" | "anonymous" | "authorization-header";
  authorizationScheme: string | null;
};

export type PurpleScore = {
  met: number;
  total: number;
};

export type PurpleRunStepOutcome = {
  stepId: string;
  preventionOutcome: "prevented" | "allowed" | "inconclusive";
  detectionOutcome: "detected" | "missed" | "inconclusive";
  status: number | null;
  /** Bounded response metadata for comparisons; response bodies are never returned. */
  responseLength: number | null;
  responseSha256: string | null;
  responseTruncated: boolean;
  evidenceSequenceIds: number[];
  error: string | null;
};

export type PurpleRun = {
  id: string;
  flowId: string;
  flowName: string;
  origin: string;
  identityDisplayName: string;
  startedAt: string;
  completedAt: string;
  status: "completed" | "cancelled" | "failed" | "inconclusive";
  steps: PurpleRunStepOutcome[];
  preventionScore: PurpleScore;
  detectionScore: PurpleScore;
};

export type PurpleFlow = {
  id: string;
  name: string;
  origin: string;
  source: PurpleFlowSource;
  steps: PurpleStep[];
  expectedControls: PurpleExpectedControl[];
  attackAnnotations: PurpleAttackAnnotation[];
  createdAt: string;
  updatedAt: string;
};

export function createPurpleFlow(name: string, origin: string, id: string = crypto.randomUUID()): PurpleFlow {
  const safeOrigin = parseHttpUrl(origin, "Purple flows require a valid HTTP(S) origin.").origin;
  const now = new Date().toISOString();
  return {
    id,
    name: sanitizeName(name, "Untitled flow"),
    origin: safeOrigin,
    source: "capture",
    steps: [],
    expectedControls: [],
    attackAnnotations: [],
    createdAt: now,
    updatedAt: now,
  };
}

export function validateIdentityProfile(value: unknown): asserts value is IdentityProfile {
  const profile = requireRecord(value, "Identity profile is malformed.");
  requireExactKeys(profile, ["id", "displayName", "mode", "authorizationScheme"], "Identity profile is malformed.");
  requireId(profile.id, "Identity profile ID is malformed.");
  requireBoundedString(profile.displayName, 1, 80, "Identity profile display name is malformed.");
  if (!(profile.mode === "browser" || profile.mode === "anonymous" || profile.mode === "authorization-header")) {
    throw new Error("Identity profile mode is malformed.");
  }
  if (profile.mode === "authorization-header") {
    if (typeof profile.authorizationScheme !== "string" || !HEADER_SCHEME_PATTERN.test(profile.authorizationScheme)) {
      throw new Error("Authorization header identities require scheme metadata only.");
    }
  } else if (profile.authorizationScheme !== null) {
    throw new Error("Only Authorization header identities may include scheme metadata.");
  }
}

export function validatePurpleFlow(value: unknown): asserts value is PurpleFlow {
  const flow = requireRecord(value, "Purple flow is malformed.");
  requireExactKeys(flow, ["id", "name", "origin", "source", "steps", "expectedControls", "attackAnnotations", "createdAt", "updatedAt"], "Purple flow is malformed.");
  requireId(flow.id, "Purple flow ID is malformed.");
  requireBoundedString(flow.name, 1, 80, "Purple flow name is malformed.");
  if (!(flow.source === "capture" || flow.source === "manual" || flow.source === "arazzo")) throw new Error("Purple flow source is malformed.");
  const originUrl = parseHttpUrl(flow.origin, "Purple flow origin is malformed.");
  if (originUrl.href !== `${originUrl.origin}/`) throw new Error("Purple flow origin must not include a path, query, or fragment.");
  requireTimestamp(flow.createdAt, "Purple flow creation time is malformed.");
  requireTimestamp(flow.updatedAt, "Purple flow update time is malformed.");
  if (!Array.isArray(flow.steps) || flow.steps.length === 0 || flow.steps.length > MAX_PURPLE_FLOW_STEPS) {
    throw new Error(`Purple flows require 1–${MAX_PURPLE_FLOW_STEPS} steps.`);
  }

  const stepIds = new Set<string>();
  let totalBodyBytes = 0;
  for (const candidate of flow.steps) {
    const step = requireRecord(candidate, "Purple flow step is malformed.");
    requireExactKeys(step, ["id", "name", "capturedRequest", "openApiOperation", "expectation"], "Purple flow step is malformed.");
    requireId(step.id, "Purple flow step ID is malformed.");
    if (stepIds.has(step.id as string)) throw new Error("Purple flow step IDs must be unique.");
    stepIds.add(step.id as string);
    requireBoundedString(step.name, 1, 80, "Purple flow step name is malformed.");

    const request = requireRecord(step.capturedRequest, "Purple flow captured request is malformed.");
    requireExactKeys(request, ["exchangeSequence", "capturedPageUrl", "method", "url", "headers", "body", "mimeType"], "Purple flow captured request is malformed.");
    if (!Number.isSafeInteger(request.exchangeSequence) || (request.exchangeSequence as number) <= 0) throw new Error("Purple flow step capture is malformed.");
    if (typeof request.method !== "string" || !ALLOWED_METHODS.has(request.method)) throw new Error("Purple flow step method is unsupported.");
    const pageUrl = parseHttpUrl(request.capturedPageUrl, "Purple flow captured page URL is malformed.");
    const requestUrl = parseHttpUrl(request.url, "Purple flow request URL is malformed.");
    if (pageUrl.origin !== originUrl.origin || requestUrl.origin !== originUrl.origin) throw new Error("Purple flow steps must remain same-origin.");
    rejectSensitiveUrl(pageUrl);
    rejectSensitiveUrl(requestUrl);
    if (containsRedaction(pageUrl.href) || containsRedaction(requestUrl.href)) throw new Error("Redacted URLs cannot be stored in a Purple flow.");
    if (!Array.isArray(request.headers) || request.headers.length > 100) throw new Error("Purple flow request headers are malformed.");
    for (const candidateHeader of request.headers) {
      const header = requireRecord(candidateHeader, "Purple flow request header is malformed.");
      requireExactKeys(header, ["name", "value"], "Purple flow request header is malformed.");
      requireBoundedString(header.name, 1, 256, "Purple flow request header is malformed.");
      requireBoundedString(header.value, 0, 8192, "Purple flow request header is malformed.");
      if (FORBIDDEN_HEADER.test((header.name as string).trim()) || SENSITIVE_NAME.test(header.name as string)) throw new Error("Identity and browser-controlled headers cannot be stored in a Purple flow.");
      if (containsRedaction(header.value as string)) throw new Error("Redacted header values cannot be stored in a Purple flow.");
    }
    if (request.body !== null) {
      if (typeof request.body !== "string") throw new Error("Purple flow request body is malformed.");
      if (request.method === "GET" || request.method === "HEAD") throw new Error("GET and HEAD Purple flow steps cannot contain a body.");
      const bodyBytes = new TextEncoder().encode(request.body).length;
      if (bodyBytes > MAX_PURPLE_REQUEST_BODY_BYTES) throw new Error("Purple flow request body exceeds 256 KiB.");
      if (containsRedaction(request.body)) throw new Error("Redacted body values cannot be stored in a Purple flow.");
      rejectSensitiveBody(request.body, request.mimeType);
      totalBodyBytes += bodyBytes;
    }
    if (request.mimeType !== null) requireBoundedString(request.mimeType, 0, 256, "Purple flow MIME type is malformed.");

    validateOpenApiOperation(step.openApiOperation);
    const expectation = requireRecord(step.expectation, "Purple flow expectation is malformed.");
    requireExactKeys(expectation, ["prevention", "detectionQuery", "expectedStatus", "expectedStatusClass"], "Purple flow expectation is malformed.");
    if (!(expectation.prevention === "allowed" || expectation.prevention === "blocked" || expectation.prevention === "observe-only")) throw new Error("Purple flow prevention expectation is malformed.");
    if (expectation.detectionQuery !== null) {
      requireBoundedString(expectation.detectionQuery, 1, LOG_SEARCH_LIMITS.queryCharacters, "Purple flow detection query is malformed.");
      const parsed = parseLogQuery(expectation.detectionQuery as string);
      if (parsed.error || parsed.expression === null) throw new Error(`Purple flow detection query is malformed${parsed.error ? `: ${parsed.error}` : "."}`);
    }
    if (expectation.expectedStatus !== null && (!Number.isInteger(expectation.expectedStatus) || (expectation.expectedStatus as number) < 100 || (expectation.expectedStatus as number) > 599)) throw new Error("Purple flow expected status is malformed.");
    if (expectation.expectedStatusClass !== null && !(typeof expectation.expectedStatusClass === "string" && /^[1-5]xx$/.test(expectation.expectedStatusClass))) throw new Error("Purple flow expected status class is malformed.");
    if (expectation.expectedStatus !== null && expectation.expectedStatusClass !== null) throw new Error("Purple flow steps may expect an exact status or a status class, not both.");
  }
  if (totalBodyBytes > MAX_PURPLE_FLOW_BODY_BYTES) throw new Error("Purple flow request bodies exceed 1 MiB.");
  validateExpectedControls(flow.expectedControls, stepIds);
  validateAttackAnnotations(flow.attackAnnotations, stepIds);
}

export function sanitizePurpleFlowName(name: string): string {
  return sanitizeName(name, "Untitled flow");
}

function validateOpenApiOperation(value: unknown): void {
  if (value === null) return;
  const operation = requireRecord(value, "Purple flow OpenAPI operation reference is malformed.");
  requireExactKeys(operation, ["sourceId", "operationId", "operationPath"], "Purple flow OpenAPI operation reference is malformed.");
  requireId(operation.sourceId, "Purple flow OpenAPI source ID is malformed.");
  if (operation.operationId !== null) requireBoundedString(operation.operationId, 1, 256, "Purple flow OpenAPI operation ID is malformed.");
  if (operation.operationPath !== null) {
    requireBoundedString(operation.operationPath, 1, 1024, "Purple flow OpenAPI operation path is malformed.");
    if (!(operation.operationPath as string).startsWith("#/paths/")) throw new Error("Purple flow OpenAPI operation references must be local.");
  }
  if ((operation.operationId === null) === (operation.operationPath === null)) throw new Error("Purple flow OpenAPI references require exactly one operation ID or local operation path.");
}

function validateExpectedControls(value: unknown, stepIds: Set<string>): void {
  if (!Array.isArray(value) || value.length > MAX_PURPLE_EXPECTED_CONTROLS) throw new Error("Purple flow expected controls are malformed.");
  const ids = new Set<string>();
  for (const candidate of value) {
    const control = requireRecord(candidate, "Purple flow expected control is malformed.");
    requireExactKeys(control, ["id", "name", "description", "stepIds"], "Purple flow expected control is malformed.");
    requireId(control.id, "Purple flow expected control ID is malformed.");
    if (ids.has(control.id as string)) throw new Error("Purple flow expected control IDs must be unique.");
    ids.add(control.id as string);
    requireBoundedString(control.name, 1, 120, "Purple flow expected control name is malformed.");
    requireBoundedString(control.description, 0, 1000, "Purple flow expected control description is malformed.");
    requireStepReferences(control.stepIds, stepIds, "Purple flow expected control step references are malformed.");
  }
}

function validateAttackAnnotations(value: unknown, stepIds: Set<string>): void {
  if (!Array.isArray(value) || value.length > MAX_PURPLE_FLOW_ANNOTATIONS) throw new Error("Purple flow ATT&CK annotations are malformed.");
  const ids = new Set<string>();
  for (const candidate of value) {
    const annotation = requireRecord(candidate, "Purple flow ATT&CK annotation is malformed.");
    requireExactKeys(annotation, ["id", "stepId", "tacticId", "tacticName", "techniqueId", "techniqueName"], "Purple flow ATT&CK annotation is malformed.");
    requireId(annotation.id, "Purple flow ATT&CK annotation ID is malformed.");
    if (ids.has(annotation.id as string)) throw new Error("Purple flow ATT&CK annotation IDs must be unique.");
    ids.add(annotation.id as string);
    requireId(annotation.stepId, "Purple flow ATT&CK annotation step is malformed.");
    if (!stepIds.has(annotation.stepId as string)) throw new Error("Purple flow ATT&CK annotation references an unknown step.");
    requireBoundedString(annotation.tacticId, 1, 40, "Purple flow ATT&CK tactic ID is malformed.");
    requireBoundedString(annotation.tacticName, 1, 120, "Purple flow ATT&CK tactic name is malformed.");
    requireBoundedString(annotation.techniqueId, 1, 40, "Purple flow ATT&CK technique ID is malformed.");
    requireBoundedString(annotation.techniqueName, 1, 120, "Purple flow ATT&CK technique name is malformed.");
  }
}

function requireStepReferences(value: unknown, stepIds: Set<string>, message: string): void {
  if (!Array.isArray(value) || value.length > MAX_PURPLE_FLOW_STEPS) throw new Error(message);
  const references = new Set<string>();
  for (const stepId of value) {
    requireId(stepId, message);
    if (references.has(stepId) || !stepIds.has(stepId)) throw new Error(message);
    references.add(stepId);
  }
}

function rejectSensitiveUrl(url: URL): void {
  for (const name of url.searchParams.keys()) {
    if (SENSITIVE_NAME.test(name)) throw new Error("Identity secrets cannot be stored in a Purple flow URL.");
  }
}

function rejectSensitiveBody(body: string, mimeType: unknown): void {
  const normalizedMimeType = typeof mimeType === "string" ? mimeType.toLowerCase() : "";
  try {
    if (normalizedMimeType.includes("json")) {
      rejectSensitiveObject(JSON.parse(body) as unknown);
    } else if (normalizedMimeType.includes("application/x-www-form-urlencoded")) {
      for (const name of new URLSearchParams(body).keys()) if (SENSITIVE_NAME.test(name)) throw new Error("Identity secrets cannot be stored in a Purple flow body.");
    }
  } catch (error) {
    if (!(error instanceof SyntaxError)) throw error;
    // Malformed request payloads are valid immutable captures; only parsed fields can be inspected.
  }
}

function rejectSensitiveObject(root: unknown): void {
  const pending: Array<{ value: unknown; depth: number }> = [{ value: root, depth: 0 }];
  let visited = 0;
  while (pending.length > 0) {
    const { value, depth } = pending.pop()!;
    if (value === null || typeof value !== "object") continue;
    visited += 1;
    if (depth > 50 || visited > 10_000) throw new Error("Purple flow request body nesting is malformed.");
    if (Array.isArray(value)) {
      for (const item of value) pending.push({ value: item, depth: depth + 1 });
      continue;
    }
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      if (SENSITIVE_NAME.test(key)) throw new Error("Identity secrets cannot be stored in a Purple flow body.");
      pending.push({ value: child, depth: depth + 1 });
    }
  }
}

function requireRecord(value: unknown, message: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) throw new Error(message);
  return value as Record<string, unknown>;
}

function requireExactKeys(record: Record<string, unknown>, keys: string[], message: string): void {
  const actual = Object.keys(record);
  if (actual.length !== keys.length || actual.some((key) => !keys.includes(key))) throw new Error(message);
}

function requireId(value: unknown, message: string): asserts value is string {
  if (typeof value !== "string" || !ID_PATTERN.test(value)) throw new Error(message);
}

function requireBoundedString(value: unknown, minimum: number, maximum: number, message: string): asserts value is string {
  if (typeof value !== "string" || value.length < minimum || value.length > maximum || value.trim().length < minimum) throw new Error(message);
}

function requireTimestamp(value: unknown, message: string): asserts value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T/.test(value) || !Number.isFinite(Date.parse(value))) throw new Error(message);
}

function parseHttpUrl(value: unknown, message: string): URL {
  if (typeof value !== "string" || value.length > 8192) throw new Error(message);
  let url: URL;
  try { url = new URL(value); } catch { throw new Error(message); }
  if ((url.protocol !== "http:" && url.protocol !== "https:") || url.username || url.password) throw new Error(message);
  return url;
}

function containsRedaction(value: string): boolean {
  let decoded = value;
  try { decoded = decodeURIComponent(value); } catch { /* use the original value */ }
  return decoded.toLowerCase().includes(REDACTED);
}

function sanitizeName(value: string, fallback: string): string {
  if (typeof value !== "string") return fallback;
  return value.trim().slice(0, 80) || fallback;
}
