import "fake-indexeddb/auto";
import { afterEach, describe, expect, it } from "vitest";
import {
  createPurpleFlow,
  validateIdentityProfile,
  validatePurpleFlow,
  type PurpleFlow,
} from "./purple-flow";
import {
  deletePurpleFlow,
  deletePurpleRunSummary,
  getPurpleFlow,
  getPurpleFlows,
  getPurpleRunSummaries,
  getPurpleRunSummary,
  MAX_PURPLE_RUN_SUMMARIES,
  savePurpleFlow,
  savePurpleRunSummary,
  validatePurpleRunSummary,
  type PurpleRunSummary,
} from "./purple-flow-store";
import { openTrafficDatabase, PURPLE_FLOWS_STORE, PURPLE_RUNS_STORE, TRAFFIC_DATABASE_NAME } from "./traffic-database";

const ORIGIN = "https://example.com";

function flow(): PurpleFlow {
  const result = createPurpleFlow(" Account check ", ORIGIN, "flow-1");
  result.source = "capture";
  result.steps.push({
    id: "step-1",
    name: "Load account",
    capturedRequest: {
      exchangeSequence: 1,
      capturedPageUrl: `${ORIGIN}/account`,
      method: "POST",
      url: `${ORIGIN}/api/account`,
      headers: [{ name: "content-type", value: "application/json" }],
      body: "{}",
      mimeType: "application/json",
    },
    openApiOperation: { sourceId: "baseline-1", operationId: "loadAccount", operationPath: null },
    expectation: {
      prevention: "allowed",
      detectionQuery: "method=POST AND status=200",
      expectedStatus: 200,
      expectedStatusClass: null,
    },
  });
  result.expectedControls.push({
    id: "control-1",
    name: "Account authorization",
    description: "Only the account owner is allowed.",
    stepIds: ["step-1"],
  });
  result.attackAnnotations.push({
    id: "annotation-1",
    stepId: "step-1",
    tacticId: "TA0001",
    tacticName: "Initial Access",
    techniqueId: "T1190",
    techniqueName: "Exploit Public-Facing Application",
  });
  return result;
}

function run(id = "run-1", offset = 0): PurpleRunSummary {
  const startedAt = new Date(Date.UTC(2026, 7, 28, 0, 0, offset)).toISOString();
  return {
    id,
    flowId: "flow-1",
    flowName: "Account check",
    origin: ORIGIN,
    identityDisplayName: "Auditor",
    startedAt,
    completedAt: startedAt,
    status: "completed",
    steps: [{
      stepId: "step-1",
      preventionOutcome: "allowed",
      detectionOutcome: "detected",
      status: 200,
      responseLength: 2,
      responseSha256: "a".repeat(64),
      responseTruncated: false,
      evidenceSequenceIds: [7],
      error: null,
    }],
    preventionScore: { met: 1, total: 1 },
    detectionScore: { met: 1, total: 1 },
  };
}

afterEach(async () => {
  await new Promise<void>((resolve) => {
    const request = indexedDB.deleteDatabase(TRAFFIC_DATABASE_NAME);
    request.onsuccess = () => resolve();
    request.onerror = () => resolve();
  });
});

describe("Purple flow validation and storage", () => {
  it("validates the complete editable model and metadata-only identities", () => {
    expect(() => validatePurpleFlow(flow())).not.toThrow();
    expect(() => validateIdentityProfile({ id: "browser", displayName: "Browser", mode: "browser", authorizationScheme: null })).not.toThrow();
    expect(() => validateIdentityProfile({ id: "admin", displayName: "Admin", mode: "authorization-header", authorizationScheme: "Bearer" })).not.toThrow();
    expect(() => validateIdentityProfile({ id: "admin", displayName: "Admin", mode: "authorization-header", authorizationScheme: "Bearer secret" })).toThrow("scheme metadata only");
    expect(() => validateIdentityProfile({ id: "anonymous", displayName: "Anonymous", mode: "anonymous", authorizationScheme: "Bearer" })).toThrow("Only Authorization");
  });

  it("rejects cross-origin, malformed DSL, dangling metadata, and secret-bearing captures", () => {
    expect(() => validatePurpleFlow({ ...flow(), origin: "javascript:alert(1)" })).toThrow();
    expect(() => validatePurpleFlow({ ...flow(), steps: [{ ...flow().steps[0]!, capturedRequest: { ...flow().steps[0]!.capturedRequest, url: "https://evil.example/api" } }] })).toThrow("same-origin");
    expect(() => validatePurpleFlow({ ...flow(), steps: [{ ...flow().steps[0]!, expectation: { ...flow().steps[0]!.expectation, detectionQuery: "status=(" } }] })).toThrow("detection query");
    expect(() => validatePurpleFlow({ ...flow(), attackAnnotations: [{ ...flow().attackAnnotations[0]!, stepId: "missing-step" }] })).toThrow("unknown step");
    expect(() => validatePurpleFlow({ ...flow(), steps: [{ ...flow().steps[0]!, capturedRequest: { ...flow().steps[0]!.capturedRequest, headers: [{ name: "X-Api-Key", value: "example-value" }] } }] })).toThrow("Identity");
    expect(() => validatePurpleFlow({ ...flow(), steps: [{ ...flow().steps[0]!, capturedRequest: { ...flow().steps[0]!.capturedRequest, url: `${ORIGIN}/api?access_token=example-value` } }] })).toThrow("secrets");
    expect(() => validatePurpleFlow({ ...flow(), steps: [{ ...flow().steps[0]!, capturedRequest: { ...flow().steps[0]!.capturedRequest, capturedPageUrl: `${ORIGIN}/account?session=example-value` } }] })).toThrow("secrets");
    expect(() => validatePurpleFlow({ ...flow(), steps: [{ ...flow().steps[0]!, capturedRequest: { ...flow().steps[0]!.capturedRequest, body: "{\"password\":\"example-value\"}" } }] })).toThrow("secrets");
    expect(() => validatePurpleFlow({ ...flow(), __proto__: { polluted: true } })).toThrow();
  });

  it("requires one local OpenAPI selector and one optional status expectation", () => {
    expect(() => validatePurpleFlow({ ...flow(), steps: [{ ...flow().steps[0]!, openApiOperation: { sourceId: "baseline", operationId: null, operationPath: "https://remote.example/openapi.json" } }] })).toThrow("local");
    expect(() => validatePurpleFlow({ ...flow(), steps: [{ ...flow().steps[0]!, expectation: { ...flow().steps[0]!.expectation, expectedStatusClass: "2xx" } }] })).toThrow("not both");
    const statusClassFlow = flow();
    statusClassFlow.steps[0]!.expectation.expectedStatus = null;
    statusClassFlow.steps[0]!.expectation.expectedStatusClass = "2xx";
    expect(() => validatePurpleFlow(statusClassFlow)).not.toThrow();
  });

  it("saves, loads, lists, and deletes validated flows with editable metadata", async () => {
    const saved = await savePurpleFlow(flow());
    expect(saved.name).toBe("Account check");
    expect(saved.source).toBe("capture");
    expect(saved.expectedControls[0]?.stepIds).toEqual(["step-1"]);
    expect(saved.attackAnnotations[0]?.techniqueId).toBe("T1190");
    expect(await getPurpleFlow("flow-1")).toEqual(saved);
    expect(await getPurpleFlows()).toEqual([saved]);
    await deletePurpleFlow("flow-1");
    expect(await getPurpleFlow("flow-1")).toBeUndefined();
  });

  it("fails closed when a malformed flow record already exists", async () => {
    const database = await openTrafficDatabase();
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(PURPLE_FLOWS_STORE, "readwrite");
      transaction.objectStore(PURPLE_FLOWS_STORE).put({ id: "hostile", steps: "not-an-array" });
      transaction.oncomplete = () => { database.close(); resolve(); };
      transaction.onerror = () => reject(transaction.error);
    });
    await expect(getPurpleFlows()).rejects.toThrow("malformed");
  });
});

describe("Purple run summary storage", () => {
  it("stores compact outcomes, identity display, evidence IDs, scores, and supports CRUD", async () => {
    await savePurpleRunSummary(run());
    expect(await getPurpleRunSummary("run-1")).toEqual(run());
    expect(await getPurpleRunSummaries("flow-1")).toEqual([run()]);
    await deletePurpleRunSummary("run-1");
    expect(await getPurpleRunSummaries()).toEqual([]);
  });

  it("rejects response bodies, identity secret values, duplicate evidence, and invalid scores", async () => {
    const withBody = { ...run(), responseBody: "top secret" };
    const withSecret = { ...run(), authorization: "Bearer secret" };
    const duplicateEvidence = { ...run(), steps: [{ ...run().steps[0]!, evidenceSequenceIds: [7, 7] }] };
    const invalidScore = { ...run(), detectionScore: { met: 2, total: 1 } };
    expect(() => validatePurpleRunSummary(withBody)).toThrow("response bodies");
    await expect(savePurpleRunSummary(withSecret as PurpleRunSummary)).rejects.toThrow("identity secrets");
    expect(() => validatePurpleRunSummary(duplicateEvidence)).toThrow("evidence");
    expect(() => validatePurpleRunSummary(invalidScore)).toThrow("score");
    expect(await getPurpleRunSummaries()).toEqual([]);
  });

  it("retains only the newest compact run summaries per flow", async () => {
    await savePurpleRunSummary({ ...run("other-run"), flowId: "flow-2" });
    for (let index = 0; index <= MAX_PURPLE_RUN_SUMMARIES; index += 1) {
      await savePurpleRunSummary(run(`run-${index}`, index));
    }
    const stored = await getPurpleRunSummaries();
    expect(stored).toHaveLength(MAX_PURPLE_RUN_SUMMARIES + 1);
    expect(stored[0]?.id).toBe(`run-${MAX_PURPLE_RUN_SUMMARIES}`);
    expect(stored.some(({ id }) => id === "run-0")).toBe(false);
    expect(stored.some(({ id }) => id === "other-run")).toBe(true);
  });

  it("fails closed when a malformed run record already exists", async () => {
    const database = await openTrafficDatabase();
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(PURPLE_RUNS_STORE, "readwrite");
      transaction.objectStore(PURPLE_RUNS_STORE).put({ id: "hostile", responseBody: "secret" });
      transaction.oncomplete = () => { database.close(); resolve(); };
      transaction.onerror = () => reject(transaction.error);
    });
    await expect(getPurpleRunSummaries()).rejects.toThrow("response bodies");
  });
});
