import { describe, expect, it, vi } from "vitest";
import type { ApiExchange } from "./api-traffic";
import {
  buildObservedRoutes,
  compareOpenApi,
  generateOpenApi,
  MAX_OPENAPI_IMPORT_BYTES,
  normalizeObservedRoute,
  parseOpenApiBaseline,
} from "./api-spec";

function exchange(overrides: Partial<ApiExchange> = {}): ApiExchange {
  return {
    startedAt: "2026-08-28T00:00:00.000Z",
    durationMs: 10,
    request: {
      method: "POST",
      url: "https://api.example.com/users/123?expand=profile",
      mimeType: "application/json; charset=utf-8",
      headers: [{ name: "authorization", value: "<redacted>" }],
      body: { kind: "json", value: { email: "private@example.com", active: true, profile: { age: 42 } } },
    },
    response: {
      status: 201,
      statusText: "Created",
      mimeType: "application/json",
      headers: [{ name: "set-cookie", value: "<redacted>" }],
      body: { kind: "json", value: { token: "<redacted>" } },
    },
    ...overrides,
  };
}

describe("API spec", () => {
  it("normalizes identifiers and collects route observations", () => {
    expect(normalizeObservedRoute("https://api.example.com/users/123").path).toBe("/users/{id}");
    expect(normalizeObservedRoute("https://api.example.com/jobs/550e8400-e29b-41d4-a716-446655440000").path).toBe("/jobs/{id}");
    expect(buildObservedRoutes([exchange()])[0]).toMatchObject({
      path: "/users/{id}", method: "post", requestCount: 1,
      statuses: [201], queryFields: ["expand"], contentTypes: ["application/json"],
      bodyFields: { email: { type: "string" }, active: { type: "boolean" } },
    });
  });

  it("exports shapes and metadata without captured values, headers, or examples", () => {
    const text = JSON.stringify(generateOpenApi([exchange()]));
    expect(text).toContain('"openapi":"3.1.0"');
    expect(text).toContain('"email":{"type":"string"}');
    expect(text).not.toContain("private@example.com");
    expect(text).not.toContain("authorization");
    expect(text).not.toContain("set-cookie");
    expect(text).not.toContain('"example"');
    expect(text).not.toContain('"examples"');
  });

  it("classifies matched, shadow, and unseen routes", () => {
    const observed = buildObservedRoutes([
      exchange(),
      exchange({ request: { ...exchange().request, method: "GET", url: "https://api.example.com/shadow" } }),
    ]);
    const baseline = parseOpenApiBaseline(JSON.stringify({
      openapi: "3.1.0",
      paths: { "/users/{id}": { post: {} }, "/unseen": { get: {} } },
    }));
    expect(compareOpenApi(observed, baseline).map((entry) => entry.state).sort()).toEqual(["matched", "shadow", "unseen"]);
    expect(compareOpenApi(observed, null).every((entry) => entry.state === "observed")).toBe(true);
  });

  it("rejects invalid and oversized baselines", () => {
    expect(() => parseOpenApiBaseline("not json")).toThrow("valid JSON");
    expect(() => parseOpenApiBaseline('{"openapi":"2.0","paths":{}}')).toThrow("3.x");
    expect(() => parseOpenApiBaseline('{"openapi":"3.1.0","paths":[]}')).toThrow("paths object");
    expect(() => parseOpenApiBaseline("x".repeat(MAX_OPENAPI_IMPORT_BYTES + 1))).toThrow("5 MiB");
  });

  it("keeps refs as inert metadata without network access", () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const baseline = parseOpenApiBaseline(JSON.stringify({
      openapi: "3.1.0",
      paths: { "/users": { $ref: "https://attacker.invalid/spec.json", get: {} } },
    }));
    expect(baseline.paths["/users"]).toMatchObject({ $ref: "https://attacker.invalid/spec.json" });
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});
