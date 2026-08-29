import { describe, expect, it } from "vitest";
import {
  classifyAuthorizationResponse,
  createAuthorizationMatrixProfiles,
  type AuthorizationResponseEvidence,
} from "./authorization-matrix";

const A = "a".repeat(64);
const B = "b".repeat(64);

function evidence(overrides: Partial<AuthorizationResponseEvidence> = {}): AuthorizationResponseEvidence {
  return { status: 200, responseLength: 12, responseSha256: A, responseTruncated: false, error: null, ...overrides };
}

describe("authorization response classification", () => {
  it("explains deterministic enforcement evidence", () => {
    const result = classifyAuthorizationResponse(evidence(), evidence({ status: 403, responseLength: 0, responseSha256: B }));
    expect(result.classification).toBe("enforced");
    expect(result.explanations.join(" ")).toContain("lower-privilege request was denied");
    expect(result.explanations.join(" ")).toContain("Status differed");
  });

  it("calls a same-looking successful response only a possible bypass", () => {
    const result = classifyAuthorizationResponse(evidence(), evidence());
    expect(result.classification).toBe("possible-bypass");
    expect(result.explanations.join(" ")).toMatch(/similarity evidence only, not proof/i);
    expect(result.explanations).toEqual(expect.arrayContaining([
      "Bounded response length matched (12 bytes).",
      "SHA-256 fingerprints matched.",
      "No redirects were followed in either request.",
    ]));
  });

  it("reports usable response differences without claiming enforcement", () => {
    const result = classifyAuthorizationResponse(evidence(), evidence({ responseLength: 13, responseSha256: B }));
    expect(result.classification).toBe("different");
    expect(result.explanations.join(" ")).toMatch(/do not prove authorization enforcement or a vulnerability/i);
  });

  it.each([
    ["redirect", evidence({ status: null, responseLength: null, responseSha256: null, error: "Redirect refused." })],
    ["timeout", evidence({ status: null, responseLength: null, responseSha256: null, error: "Step timed out." })],
    ["truncated", evidence({ responseLength: 1024 * 1024, responseSha256: null, responseTruncated: true })],
    ["malformed fingerprint", evidence({ responseSha256: "<script>hostile</script>" })],
  ])("makes %s evidence inconclusive", (name, candidate) => {
    const result = classifyAuthorizationResponse(evidence(), candidate);
    expect(result.classification).toBe("inconclusive");
    expect(JSON.stringify(result)).not.toContain("<script>");
    if (name === "redirect") expect(result.explanations.join(" ")).toContain("redirects are not followed");
    if (name === "timeout") expect(result.explanations.join(" ")).toContain("timeout");
  });
});

describe("authorization matrix profiles", () => {
  it("supports two or more named profiles as metadata without secret values", () => {
    const profiles = createAuthorizationMatrixProfiles([
      { id: "analyst", displayName: "Analyst", mode: "authorization-header", authorizationScheme: "Bearer" },
      { id: "viewer", displayName: "Viewer", mode: "authorization-header", authorizationScheme: "Basic" },
    ]);
    expect(profiles.named).toHaveLength(2);
    expect(profiles.browser.mode).toBe("browser");
    expect(profiles.anonymous.mode).toBe("anonymous");
    expect(JSON.stringify(profiles)).not.toMatch(/authorizationHeader|secret/i);
  });

  it("rejects fewer than two, duplicate, and non-header named profiles", () => {
    expect(() => createAuthorizationMatrixProfiles([])).toThrow("at least two");
    expect(() => createAuthorizationMatrixProfiles([
      { id: "same", displayName: "One", mode: "authorization-header", authorizationScheme: "Bearer" },
      { id: "same", displayName: "Two", mode: "authorization-header", authorizationScheme: "Bearer" },
    ])).toThrow("duplicated");
    expect(() => createAuthorizationMatrixProfiles([
      { id: "named", displayName: "Named", mode: "authorization-header", authorizationScheme: "Bearer" },
      { id: "anonymous-2", displayName: "Not named", mode: "anonymous", authorizationScheme: null },
    ])).toThrow("malformed");
  });
});
