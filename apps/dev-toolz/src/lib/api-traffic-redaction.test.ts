import { describe, expect, it } from "vitest";
import { createApiBody, createRequestBody, normalizeHttpVersion, redactHeaders, redactUrl } from "./api-traffic";

describe("API traffic redaction mode", () => {
  it("normalizes missing HAR protocol metadata without crashing capture", () => {
    expect(normalizeHttpVersion(undefined)).toBe("unknown");
    expect(normalizeHttpVersion("HTTP/2")).toBe("HTTP/2");
  });
  it("redacts sensitive values by default", () => {
    expect(redactUrl("https://api.example.test/users?access_token=secret")).toContain(
      "access_token=%3Credacted%3E"
    );
    expect(redactHeaders([{ name: "authorization", value: "Bearer secret" }])).toEqual([
      { name: "authorization", value: "<redacted>" },
    ]);
    expect(createApiBody('{"token":"secret"}', "application/json")).toEqual({
      kind: "json",
      value: { token: "<redacted>" },
    });
  });

  it("preserves raw values only when redaction is explicitly disabled", () => {
    const url = "https://api.example.test/users?access_token=secret";
    expect(redactUrl(url, false)).toBe(url);
    expect(redactHeaders([{ name: "authorization", value: "Bearer secret" }], false)).toEqual([
      { name: "authorization", value: "Bearer secret" },
    ]);
    expect(createRequestBody("password=secret", "application/x-www-form-urlencoded", false)).toEqual({
      kind: "json",
      value: [{ name: "password", value: "secret" }],
    });
  });
});
