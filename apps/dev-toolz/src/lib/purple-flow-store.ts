import {
  sanitizePurpleFlowName,
  validatePurpleFlow,
  type PurpleFlow,
  type PurpleRun,
} from "./purple-flow";
import { openTrafficDatabase, PURPLE_FLOWS_STORE, PURPLE_RUNS_STORE } from "./traffic-database";

export const MAX_PURPLE_RUN_SUMMARIES = 100;
export const MAX_PURPLE_RUN_STEPS = 25;

/** Stored Purple runs are intentionally compact summaries. */
export type PurpleRunSummary = PurpleRun;

export async function savePurpleFlow(flow: PurpleFlow): Promise<PurpleFlow> {
  validatePurpleFlow(flow);
  const saved: PurpleFlow = {
    ...flow,
    name: sanitizePurpleFlowName(flow.name),
    updatedAt: new Date().toISOString(),
  };
  validatePurpleFlow(saved);
  await putRecord(PURPLE_FLOWS_STORE, saved, "Could not save Purple flow");
  return saved;
}

export async function getPurpleFlow(id: string): Promise<PurpleFlow | undefined> {
  requireStorageId(id);
  const database = await openTrafficDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(PURPLE_FLOWS_STORE, "readonly");
    const request = transaction.objectStore(PURPLE_FLOWS_STORE).get(id);
    request.onsuccess = () => {
      try {
        if (request.result === undefined) return resolve(undefined);
        validatePurpleFlow(request.result);
        resolve(request.result as PurpleFlow);
      } catch (error) { reject(error); }
    };
    request.onerror = () => reject(request.error ?? new Error("Could not load Purple flow"));
    transaction.oncomplete = () => database.close();
  });
}

export async function getPurpleFlows(): Promise<PurpleFlow[]> {
  const records = await getAllRecords(PURPLE_FLOWS_STORE, "Could not load Purple flows");
  for (const record of records) validatePurpleFlow(record);
  return (records as PurpleFlow[]).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function deletePurpleFlow(id: string): Promise<void> {
  requireStorageId(id);
  await deleteRecord(PURPLE_FLOWS_STORE, id, "Could not delete Purple flow");
}

export function validatePurpleRunSummary(value: unknown): asserts value is PurpleRunSummary {
  rejectSecretOrBodyFields(value);
  const run = requireRecord(value, "Purple run summary is malformed.");
  exactKeys(run, ["id", "flowId", "flowName", "origin", "identityDisplayName", "startedAt", "completedAt", "status", "steps", "preventionScore", "detectionScore"]);
  requireId(run.id);
  requireId(run.flowId);
  boundedString(run.flowName, 1, 80, "Purple run flow name is malformed.");
  boundedString(run.identityDisplayName, 1, 80, "Purple run identity display name is malformed.");
  const origin = parseUrl(run.origin, "Purple run origin is malformed.");
  if (origin.href !== `${origin.origin}/`) throw new Error("Purple run origin is malformed.");
  timestamp(run.startedAt);
  timestamp(run.completedAt);
  if (Date.parse(run.completedAt as string) < Date.parse(run.startedAt as string)) throw new Error("Purple run times are malformed.");
  if (!(run.status === "completed" || run.status === "cancelled" || run.status === "failed" || run.status === "inconclusive")) throw new Error("Purple run status is malformed.");

  if (!Array.isArray(run.steps) || run.steps.length > MAX_PURPLE_RUN_STEPS) throw new Error("Purple run steps are malformed.");
  const stepIds = new Set<string>();
  for (const candidate of run.steps) {
    const step = requireRecord(candidate, "Purple run step outcome is malformed.");
    exactKeys(step, ["stepId", "preventionOutcome", "detectionOutcome", "status", "responseLength", "responseSha256", "responseTruncated", "evidenceSequenceIds", "error"]);
    requireId(step.stepId);
    if (stepIds.has(step.stepId as string)) throw new Error("Purple run step IDs must be unique.");
    stepIds.add(step.stepId as string);
    if (!(step.preventionOutcome === "prevented" || step.preventionOutcome === "allowed" || step.preventionOutcome === "inconclusive")) throw new Error("Purple run prevention outcome is malformed.");
    if (!(step.detectionOutcome === "detected" || step.detectionOutcome === "missed" || step.detectionOutcome === "inconclusive")) throw new Error("Purple run detection outcome is malformed.");
    if (step.status !== null && (!Number.isInteger(step.status) || (step.status as number) < 100 || (step.status as number) > 599)) throw new Error("Purple run response status is malformed.");
    if (step.responseLength !== null && (!Number.isInteger(step.responseLength) || (step.responseLength as number) < 0 || (step.responseLength as number) > 1024 * 1024)) throw new Error("Purple run response length is malformed.");
    if (step.responseSha256 !== null && (typeof step.responseSha256 !== "string" || !/^[a-f0-9]{64}$/.test(step.responseSha256))) throw new Error("Purple run response fingerprint is malformed.");
    if (typeof step.responseTruncated !== "boolean" || (step.responseTruncated && step.responseSha256 !== null)) throw new Error("Purple run response truncation is malformed.");
    if (step.status === null) {
      if (step.responseLength !== null || step.responseSha256 !== null || step.responseTruncated) throw new Error("Purple run response evidence is malformed.");
    } else if (step.responseLength === null || (step.responseTruncated ? step.responseLength !== 1024 * 1024 : step.responseSha256 === null)) {
      throw new Error("Purple run response evidence is malformed.");
    }
    if (!Array.isArray(step.evidenceSequenceIds) || step.evidenceSequenceIds.length > 100 || step.evidenceSequenceIds.some((sequence) => !Number.isSafeInteger(sequence) || sequence <= 0) || new Set(step.evidenceSequenceIds).size !== step.evidenceSequenceIds.length) throw new Error("Purple run detection evidence is malformed.");
    if (step.error !== null) boundedString(step.error, 1, 500, "Purple run error is malformed.");
  }

  validateScore(run.preventionScore, run.steps.length, "Purple run prevention score is malformed.");
  validateScore(run.detectionScore, run.steps.length, "Purple run detection score is malformed.");
}

export async function savePurpleRunSummary(summary: PurpleRunSummary): Promise<PurpleRunSummary> {
  validatePurpleRunSummary(summary);
  const database = await openTrafficDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(PURPLE_RUNS_STORE, "readwrite");
    const store = transaction.objectStore(PURPLE_RUNS_STORE);
    store.put(summary);
    const request = store.getAll();
    request.onsuccess = () => {
      const records = request.result;
      try {
        for (const record of records) validatePurpleRunSummary(record);
      } catch (error) {
        transaction.abort();
        reject(error);
        return;
      }
      records
        .filter((record) => (record as PurpleRunSummary).flowId === summary.flowId)
        .sort((a, b) => (b as PurpleRunSummary).startedAt.localeCompare((a as PurpleRunSummary).startedAt) || String((b as PurpleRunSummary).id).localeCompare(String((a as PurpleRunSummary).id)))
        .slice(MAX_PURPLE_RUN_SUMMARIES)
        .forEach((record) => store.delete((record as PurpleRunSummary).id));
    };
    transaction.oncomplete = () => { database.close(); resolve(); };
    transaction.onerror = () => { database.close(); reject(transaction.error ?? new Error("Could not save Purple run summary")); };
    transaction.onabort = () => database.close();
  });
  return summary;
}

export async function getPurpleRunSummary(id: string): Promise<PurpleRunSummary | undefined> {
  requireStorageId(id);
  const database = await openTrafficDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(PURPLE_RUNS_STORE, "readonly");
    const request = transaction.objectStore(PURPLE_RUNS_STORE).get(id);
    request.onsuccess = () => {
      try {
        if (request.result === undefined) return resolve(undefined);
        validatePurpleRunSummary(request.result);
        resolve(request.result as PurpleRunSummary);
      } catch (error) { reject(error); }
    };
    request.onerror = () => reject(request.error ?? new Error("Could not load Purple run summary"));
    transaction.oncomplete = () => database.close();
  });
}

export async function getPurpleRunSummaries(flowId?: string): Promise<PurpleRunSummary[]> {
  if (flowId !== undefined) requireStorageId(flowId);
  const records = await getAllRecords(PURPLE_RUNS_STORE, "Could not load Purple run summaries");
  for (const record of records) validatePurpleRunSummary(record);
  return (records as PurpleRunSummary[])
    .filter((record) => flowId === undefined || record.flowId === flowId)
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt));
}

export async function deletePurpleRunSummary(id: string): Promise<void> {
  requireStorageId(id);
  await deleteRecord(PURPLE_RUNS_STORE, id, "Could not delete Purple run summary");
}

async function putRecord(storeName: string, value: unknown, message: string): Promise<void> {
  const database = await openTrafficDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(storeName, "readwrite");
    transaction.objectStore(storeName).put(value);
    transaction.oncomplete = () => { database.close(); resolve(); };
    transaction.onerror = () => { database.close(); reject(transaction.error ?? new Error(message)); };
  });
}

async function getAllRecords(storeName: string, message: string): Promise<unknown[]> {
  const database = await openTrafficDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(storeName, "readonly");
    const request = transaction.objectStore(storeName).getAll();
    request.onsuccess = () => resolve(request.result as unknown[]);
    request.onerror = () => reject(request.error ?? new Error(message));
    transaction.oncomplete = () => database.close();
  });
}

async function deleteRecord(storeName: string, id: string, message: string): Promise<void> {
  const database = await openTrafficDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(storeName, "readwrite");
    transaction.objectStore(storeName).delete(id);
    transaction.oncomplete = () => { database.close(); resolve(); };
    transaction.onerror = () => { database.close(); reject(transaction.error ?? new Error(message)); };
  });
}

function validateScore(value: unknown, maximum: number, message: string): void {
  const score = requireRecord(value, message);
  exactKeys(score, ["met", "total"]);
  if (!Number.isSafeInteger(score.met) || !Number.isSafeInteger(score.total) || (score.met as number) < 0 || (score.total as number) < 0 || (score.met as number) > (score.total as number) || (score.total as number) > maximum) throw new Error(message);
}

function rejectSecretOrBodyFields(value: unknown, seen = new Set<object>()): void {
  if (value === null || typeof value !== "object") return;
  if (seen.has(value as object)) throw new Error("Purple run summary is malformed.");
  seen.add(value as object);
  for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
    if (/body|authorization|cookie|credential|password|secret|token|identityvalue/i.test(key)) {
      throw new Error("Purple run summaries cannot contain response bodies or identity secrets.");
    }
    rejectSecretOrBodyFields(nested, seen);
  }
}

function requireRecord(value: unknown, message: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) throw new Error(message);
  return value as Record<string, unknown>;
}

function exactKeys(record: Record<string, unknown>, keys: string[]): void {
  const actual = Object.keys(record);
  if (actual.length !== keys.length || actual.some((key) => !keys.includes(key))) throw new Error("Purple run summary is malformed.");
}

function requireId(value: unknown): asserts value is string {
  if (typeof value !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(value)) throw new Error("Purple storage ID is malformed.");
}

function requireStorageId(value: string): void { requireId(value); }

function boundedString(value: unknown, minimum: number, maximum: number, message: string): asserts value is string {
  if (typeof value !== "string" || value.length < minimum || value.length > maximum || value.trim().length < minimum) throw new Error(message);
}

function timestamp(value: unknown): asserts value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T/.test(value) || !Number.isFinite(Date.parse(value))) throw new Error("Purple run timestamp is malformed.");
}

function parseUrl(value: unknown, message: string): URL {
  if (typeof value !== "string" || value.length > 8192) throw new Error(message);
  let url: URL;
  try { url = new URL(value); } catch { throw new Error(message); }
  if ((url.protocol !== "http:" && url.protocol !== "https:") || url.username || url.password) throw new Error(message);
  return url;
}
