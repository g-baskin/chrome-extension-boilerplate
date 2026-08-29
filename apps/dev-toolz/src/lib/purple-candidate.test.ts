import { describe, expect, it } from "vitest";

import type { ApiExchange } from "./api-traffic";
import { findPurpleCandidateMatches } from "./purple-candidate";
import type { PurpleFlow } from "./purple-flow";

const originalStep = {
  id: "step-1",
  name: "Update user",
  capturedRequest: {
    exchangeSequence: 1,
    capturedPageUrl: "https://app.example.com/users/123",
    method: "PATCH",
    url: "https://app.example.com/api/users/123?expand=team",
    headers: [],
    body: JSON.stringify({ profile: { name: "Original" }, enabled: true }),
    mimeType: "application/json",
  },
  openApiOperation: null,
  expectation: {
    prevention: "observe-only" as const,
    detectionQuery: null,
    expectedStatus: null,
    expectedStatusClass: null,
  },
};

const flow: PurpleFlow = {
  id: "flow-1",
  name: "User administration",
  origin: "https://app.example.com",
  source: "capture",
  steps: [originalStep],
  expectedControls: [],
  attackAnnotations: [],
  createdAt: "2026-08-28T00:00:00.000Z",
  updatedAt: "2026-08-28T00:00:00.000Z",
};

function exchange(overrides: Partial<ApiExchange["request"]> = {}): ApiExchange {
  return {
    sequence: 2,
    pageUrl: "https://app.example.com/users/456",
    startedAt: "2026-08-28T00:00:00.000Z",
    durationMs: 10,
    request: {
      method: "PATCH",
      url: "https://app.example.com/api/users/456?expand=department",
      mimeType: "application/json",
      headers: [],
      body: { kind: "json", value: { profile: { name: "Candidate" }, enabled: false } },
      ...overrides,
    },
    response: { status: 200, statusText: "OK", mimeType: "application/json", headers: [], body: { kind: "text", raw: "" } },
  };
}

describe("findPurpleCandidateMatches", () => {
  it("matches method, normalized path, query names, and JSON body shape", () => {
    expect(findPurpleCandidateMatches(exchange(), [flow])).toEqual([{
      flowId: "flow-1",
      flowName: "User administration",
      stepIndex: 0,
      step: originalStep,
    }]);
  });

  it("rejects different request logic", () => {
    expect(findPurpleCandidateMatches(exchange({ method: "POST" }), [flow])).toEqual([]);
    expect(findPurpleCandidateMatches(exchange({ url: "https://app.example.com/api/groups/456?expand=team" }), [flow])).toEqual([]);
    expect(findPurpleCandidateMatches(exchange({ url: "https://app.example.com/api/users/456?include=team" }), [flow])).toEqual([]);
    expect(findPurpleCandidateMatches(exchange({ body: { kind: "json", value: { profile: { name: "Candidate" }, role: "admin" } } }), [flow])).toEqual([]);
    expect(findPurpleCandidateMatches({ ...exchange(), pageUrl: "https://other.example.com/users/456" }, [flow])).toEqual([]);
  });

  it("does not offer an already-added capture as a candidate", () => {
    expect(findPurpleCandidateMatches({ ...exchange(), sequence: 1 }, [flow])).toEqual([]);
  });

  it("fails closed for malformed or excessive untrusted input", () => {
    expect(findPurpleCandidateMatches(exchange({ url: "not a URL" }), [flow])).toEqual([]);
    expect(findPurpleCandidateMatches(exchange({ body: { kind: "malformed-json", raw: "{", error: "invalid" } }), [flow])).toEqual([]);
    const oversizedBody = "x".repeat(256 * 1024 + 1);
    const oversizedFlow = {
      ...flow,
      steps: [{
        ...originalStep,
        capturedRequest: { ...originalStep.capturedRequest, body: oversizedBody, mimeType: "text/plain" },
      }],
    };
    expect(findPurpleCandidateMatches(
      exchange({ body: { kind: "text", raw: oversizedBody }, mimeType: "text/plain" }),
      [oversizedFlow]
    )).toEqual([]);
    expect(findPurpleCandidateMatches(exchange(), Array.from({ length: 1_001 }, () => flow))).toEqual([]);
  });
});
