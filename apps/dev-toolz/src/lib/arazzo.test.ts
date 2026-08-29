import { describe, expect, it } from "vitest";
import type { OpenApiDocument } from "./api-spec";
import { MAX_ARAZZO_IMPORT_BYTES, parseArazzo, serializeArazzo, toArazzoDocument, type LocalOpenApiBaseline } from "./arazzo";
import { createPurpleFlow, type PurpleFlow } from "./purple-flow";

const ORIGIN = "https://api.example.com";
const document: OpenApiDocument = {
  openapi: "3.1.0",
  info: { title: "Example", version: "1" },
  servers: [{ url: ORIGIN }],
  paths: {
    "/pets/{petId}": {
      get: { operationId: "getPet", responses: { "200": { description: "ok" } } },
    },
    "/pets": {
      post: { responses: { "201": { description: "created" } } },
    },
  },
};
const baseline: LocalOpenApiBaseline = {
  sourceId: "baseline-1",
  name: "petStore",
  url: "openapi.json",
  origin: ORIGIN,
  document,
};

function flow(): PurpleFlow {
  const value = createPurpleFlow("Pet journey", ORIGIN, "petJourney");
  value.steps.push({
    id: "getPetStep",
    name: "Get pet",
    capturedRequest: {
      exchangeSequence: 8,
      capturedPageUrl: `${ORIGIN}/pets`,
      method: "GET",
      url: `${ORIGIN}/pets/pet-7?expand=owner`,
      headers: [{ name: "Accept", value: "application/json" }],
      body: null,
      mimeType: null,
    },
    openApiOperation: { sourceId: baseline.sourceId, operationId: "getPet", operationPath: null },
    expectation: { prevention: "allowed", detectionQuery: "status=200", expectedStatus: 200, expectedStatusClass: null },
  });
  value.steps.push({
    id: "createPetStep",
    name: "Create pet",
    capturedRequest: {
      exchangeSequence: 9,
      capturedPageUrl: `${ORIGIN}/pets`,
      method: "POST",
      url: `${ORIGIN}/pets`,
      headers: [
        { name: "X-Mode", value: "safe-mode" },
        { name: "X-Request-Id", value: "ephemeral-request-123" },
      ],
      body: "{\"name\":\"secret body must not export\"}",
      mimeType: "application/json",
    },
    openApiOperation: { sourceId: baseline.sourceId, operationId: null, operationPath: "#/paths/~1pets/post" },
    expectation: { prevention: "observe-only", detectionQuery: null, expectedStatus: null, expectedStatusClass: "2xx" },
  });
  return value;
}

function minimal(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    arazzo: "1.1.0",
    info: { title: "Pet journey", version: "1.0.0" },
    sourceDescriptions: [{ name: "petStore", url: "openapi.json", type: "openapi" }],
    workflows: [{
      workflowId: "petJourney",
      summary: "Pet journey",
      steps: [{
        stepId: "getPetStep",
        description: "Get pet",
        operationId: "$sourceDescriptions.petStore.getPet",
        parameters: [{ name: "petId", in: "path", value: "pet-7" }],
        successCriteria: [{ condition: "$statusCode == 200" }],
      }],
    }],
    ...overrides,
  });
}

describe("Arazzo 1.1 local conversion", () => {
  it("exports official 1.1 fields without bodies or identity material and round-trips the supported model", () => {
    const original = flow();
    const text = serializeArazzo([original], baseline);
    expect(text).toContain('"arazzo":"1.1.0"');
    expect(text).toContain('"sourceDescriptions"');
    expect(text).toContain('"operationId":"$sourceDescriptions.petStore.getPet"');
    expect(text).toContain('"operationPath":"{$sourceDescriptions.petStore.url}#/paths/~1pets/post"');
    expect(text).toContain('"dependsOn":["getPetStep"]');
    expect(text).not.toContain("secret body must not export");
    expect(text).not.toContain("requestBody");
    expect(text).not.toContain("ephemeral-request-123");
    expect(text).not.toMatch(/authorization|cookie|credential/i);

    const imported = parseArazzo(text, baseline)[0]!;
    expect(imported.steps.map((step) => step.id)).toEqual(["getPetStep", "createPetStep"]);
    expect(imported.steps[0]!.capturedRequest.url).toBe(`${ORIGIN}/pets/pet-7?expand=owner`);
    expect(imported.steps[0]!.capturedRequest.headers).toEqual([{ name: "Accept", value: "application/json" }]);
    expect(imported.steps[0]!.openApiOperation).toEqual({ sourceId: "baseline-1", operationId: "getPet", operationPath: null });
    expect(imported.steps[0]!.expectation).toEqual(original.steps[0]!.expectation);
    expect(imported.steps[1]!.expectation).toEqual(original.steps[1]!.expectation);
    expect(imported.steps.every((step) => step.capturedRequest.body === null)).toBe(true);
  });

  it("imports plain operationId, local operationPath, literal safe parameters, criteria, and prior-step dependencies", () => {
    const value = JSON.parse(minimal()) as Record<string, unknown>;
    const workflows = value.workflows as Array<Record<string, unknown>>;
    const steps = workflows[0]!.steps as Array<Record<string, unknown>>;
    steps.push({
      stepId: "createPetStep",
      operationPath: "{$sourceDescriptions.petStore.url}#/paths/~1pets/post",
      parameters: [{ name: "dryRun", in: "query", value: true }],
      successCriteria: [{ condition: "$statusCode >= 200 && $statusCode < 300", type: "simple" }],
      dependsOn: ["getPetStep"],
    });
    const imported = parseArazzo(JSON.stringify(value), baseline)[0]!;
    expect(imported.steps[0]!.capturedRequest.method).toBe("GET");
    expect(imported.steps[1]!.capturedRequest.url).toBe(`${ORIGIN}/pets?dryRun=true`);
    expect(imported.steps[1]!.expectation.expectedStatusClass).toBe("2xx");
  });

  it("rejects bounded and syntactically invalid input before conversion", () => {
    expect(() => parseArazzo("{", baseline)).toThrow("valid JSON");
    expect(() => parseArazzo("x".repeat(MAX_ARAZZO_IMPORT_BYTES + 1), baseline)).toThrow("1 MiB");
    expect(() => parseArazzo(minimal({ arazzo: "1.0.1" }), baseline)).toThrow("only 1.1.0");
    let nested: unknown = "leaf";
    for (let index = 0; index < 42; index += 1) nested = [nested];
    expect(() => parseArazzo(JSON.stringify(nested), baseline)).toThrow("nesting depth");
  });

  it("rejects remote/external references, unresolved operations, unsafe values, and unsupported features", () => {
    const remote = JSON.parse(minimal()) as Record<string, unknown>;
    remote.sourceDescriptions = [{ name: "petStore", url: "https://attacker.invalid/openapi.json", type: "openapi" }];
    expect(() => parseArazzo(JSON.stringify(remote), baseline)).toThrow("currently loaded local");

    const unresolved = minimal({ workflows: [{ workflowId: "bad", steps: [{ stepId: "bad", operationId: "missing" }] }] });
    expect(() => parseArazzo(unresolved, baseline)).toThrow("could not be resolved locally");

    const body = minimal({ workflows: [{ workflowId: "bad", steps: [{ stepId: "bad", operationId: "getPet", requestBody: { payload: "no" } }] }] });
    expect(() => parseArazzo(body, baseline)).toThrow("unsupported features");

    const reference = minimal({ workflows: [{ workflowId: "bad", steps: [{ stepId: "bad", operationId: "getPet", parameters: [{ $ref: "https://attacker.invalid/value" }] }] }] });
    expect(() => parseArazzo(reference, baseline)).toThrow("never followed");

    const credential = minimal({ workflows: [{ workflowId: "bad", steps: [{ stepId: "bad", operationId: "getPet", parameters: [{ name: "Authorization", in: "header", value: "Bearer example" }] }] }] });
    expect(() => parseArazzo(credential, baseline)).toThrow("credential or ephemeral");

    const dynamic = minimal({ workflows: [{ workflowId: "bad", steps: [{ stepId: "bad", operationId: "getPet", parameters: [{ name: "petId", in: "path", value: "$inputs.petId" }] }] }] });
    expect(() => parseArazzo(dynamic, baseline)).toThrow("dynamic");

    const ephemeral = minimal({ workflows: [{ workflowId: "bad", steps: [{ stepId: "bad", operationId: "getPet", parameters: [{ name: "X-Request-Id", in: "header", value: "request-1" }] }] }] });
    expect(() => parseArazzo(ephemeral, baseline)).toThrow("ephemeral identity");
  });

  it("rejects export mappings not resolved by the selected baseline or using the wrong method", () => {
    const value = flow();
    value.steps[0]!.openApiOperation = { sourceId: "other", operationId: "getPet", operationPath: null };
    expect(() => toArazzoDocument([value], baseline)).toThrow("selected local OpenAPI baseline");

    const wrongMethod = flow();
    wrongMethod.steps[0] = {
      ...wrongMethod.steps[0]!,
      capturedRequest: { ...wrongMethod.steps[0]!.capturedRequest, method: "POST" },
    };
    expect(() => toArazzoDocument([wrongMethod], baseline)).toThrow("method does not match");
  });
});
