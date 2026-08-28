import { describe, expect, it } from "vitest";
import type { ApiExchange } from "./api-traffic";
import {
  API_FIELD_LIMITS,
  extractApiFields,
  matchesApiFieldQuery,
  parseApiFieldQuery,
  summarizeApiFields,
} from "./api-fields";

function exchange(overrides: Partial<ApiExchange> = {}): ApiExchange {
  return {
    startedAt: "2026-08-28T00:00:00.000Z",
    durationMs: 12.4,
    pageUrl: "https://www.example.com/watch",
    resourceType: "fetch",
    initiator: { kind: "page", origin: "https://www.example.com" },
    request: {
      method: "GET",
      url: "https://api.example.com/items",
      mimeType: "",
      headers: [],
      body: null,
    },
    response: {
      status: 200,
      statusText: "OK",
      mimeType: "application/json",
      headers: [],
      body: { kind: "text", raw: "" },
    },
    ...overrides,
  };
}

function values(fields: ReturnType<typeof extractApiFields>, name: string): string[] {
  return fields.filter((field) => field.name === name).map((field) => field.value);
}

describe("API field extraction", () => {
  it("decodes the stored YouTube URL without changing its redaction sentinel", () => {
    const url = "https://www.youtube.com/api/timedtext?v=abc123&lang=en&fmt=json3&cbr=Safari+Mobile&sparams=ip%2Cipbits%2Cexpire%2Cv%2Cei%2Ccaps%2Copi%2Cxoaf&signature=%3Credacted%3E";
    const fields = extractApiFields(exchange({ request: { ...exchange().request, url } }));
    expect(values(fields, "url.query.v")).toEqual(["abc123"]);
    expect(values(fields, "url.query.lang")).toEqual(["en"]);
    expect(values(fields, "url.query.fmt")).toEqual(["json3"]);
    expect(values(fields, "url.query.cbr")).toEqual(["Safari Mobile"]);
    expect(values(fields, "url.query.sparams")).toEqual(["ip,ipbits,expire,v,ei,caps,opi,xoaf"]);
    expect(values(fields, "url.query.signature")).toEqual(["<redacted>"]);
  });

  it("preserves repeated query parameters and ignores malformed URLs", () => {
    const repeated = extractApiFields(exchange({
      request: { ...exchange().request, url: "https://api.example.com:8443/items?a=1&a=2" },
    }));
    expect(values(repeated, "url.query.a")).toEqual(["1", "2"]);
    expect(values(repeated, "url.scheme")).toEqual(["https"]);
    expect(values(repeated, "url.port")).toEqual(["8443"]);
    expect(extractApiFields(exchange({ request: { ...exchange().request, url: "not a URL" } }))
      .some((field) => field.source === "url")).toBe(false);
    const oversizedUrl = `https://api.example.com?v=${"x".repeat(API_FIELD_LIMITS.inputCharacters)}`;
    expect(extractApiFields(exchange({ request: { ...exchange().request, url: oversizedUrl } }))
      .some((field) => field.source === "url")).toBe(false);
  });

  it("extracts searchable capture-journey fields", () => {
    const fields = extractApiFields(exchange({
      capture: {
        tabId: 11,
        windowId: 2,
        openerTabId: 10,
        pageUrl: "https://destination.example",
        attachedAt: "2026-08-28T12:00:00.000Z",
        previousTabId: 10,
        previousPageUrl: "https://origin.example/path",
        transition: "new-window",
        mayHaveMissedInitialRequests: true,
      },
    }));
    expect(values(fields, "capture.transition")).toEqual(["new-window"]);
    expect(values(fields, "capture.previous_page_host")).toEqual(["origin.example"]);
    expect(values(fields, "capture.opener_tab_id")).toEqual(["10"]);
    expect(values(fields, "capture.initial_requests_may_be_missing")).toEqual(["true"]);
  });

  it("flattens nested JSON and normalizes array positions", () => {
    const fields = extractApiFields(exchange({
      request: { ...exchange().request, body: { kind: "json", value: { user: { roles: ["admin", "editor"] } } } },
      response: { ...exchange().response, body: { kind: "json", value: [{ id: 1 }, { id: 2 }] } },
    }));
    expect(values(fields, "request.body.user.roles[]")).toEqual(["admin", "editor"]);
    expect(values(fields, "response.body[].id")).toEqual(["1", "2"]);
  });

  it("flattens form entries by name and extracts conservative text pairs", () => {
    const fields = extractApiFields(exchange({
      request: { ...exchange().request, body: { kind: "json", value: [
        { name: "email", value: "a@example.com" }, { name: "tag", value: "one" }, { name: "tag", value: "two" },
      ] } },
      response: { ...exchange().response, body: { kind: "text", raw: "state=ready message='all good' ignored prose" } },
    }));
    expect(values(fields, "request.body.email")).toEqual(["a@example.com"]);
    expect(values(fields, "request.body.tag")).toEqual(["one", "two"]);
    expect(values(fields, "response.body.state")).toEqual(["ready"]);
    expect(values(fields, "response.body.message")).toEqual(["all good"]);
  });

  it("parses exact field queries and matches any repeated value", () => {
    const captured = exchange({
      request: { ...exchange().request, url: "https://api.example.com?a=one&a=two" },
      response: {
        ...exchange().response,
        body: { kind: "json", value: { region: "us", summaries: [] } },
      },
    });
    expect(parseApiFieldQuery("url.query.a=two=parts")).toEqual({
      name: "url.query.a",
      value: "two=parts",
    });
    expect(parseApiFieldQuery("url.query.a=")).toBeNull();
    expect(parseApiFieldQuery("url.query.a")).toBeNull();
    expect(matchesApiFieldQuery(captured, { name: "url.query.a", value: "two" })).toBe(true);
    expect(matchesApiFieldQuery(captured, { name: "url.query.a", value: "missing" })).toBe(false);
    expect(matchesApiFieldQuery(captured, { name: "region", value: "us" })).toBe(true);
    expect(matchesApiFieldQuery(captured, { name: "summaries", value: "[]" })).toBe(true);
  });

  it("counts field coverage once per event and value counts once per event", () => {
    const first = exchange({ request: { ...exchange().request, url: "https://api.example.com?a=x&a=x" } });
    const second = exchange({ request: { ...exchange().request, url: "https://api.example.com?a=y" } });
    const third = exchange({ request: { ...exchange().request, url: "https://api.example.com" } });
    const summary = summarizeApiFields([first, second, third]).find((field) => field.name === "url.query.a");
    expect(summary).toMatchObject({ eventCount: 2, coveragePercentage: 67, distinctValueCount: 2 });
    expect(summary?.topValues).toEqual([{ value: "x", count: 1 }, { value: "y", count: 1 }]);
  });

  it("enforces field, per-field, depth, input, and display ceilings", () => {
    const manyValues = new URLSearchParams();
    for (let index = 0; index < API_FIELD_LIMITS.valuesPerField + 5; index += 1) manyValues.append("x", String(index));
    const manyFields = Object.fromEntries(Array.from({ length: API_FIELD_LIMITS.fields + 50 }, (_, index) => [`key${index}`, index]));
    const deep = { stop: "hidden" };
    let nested: Record<string, unknown> = deep;
    for (let index = 0; index < API_FIELD_LIMITS.depth + 2; index += 1) nested = { next: nested };
    const fields = extractApiFields(exchange({
      request: { ...exchange().request, url: `https://api.example.com?${manyValues}`, body: { kind: "json", value: manyFields } },
      response: { ...exchange().response, body: { kind: "text", raw: `${"z".repeat(API_FIELD_LIMITS.inputCharacters)} late=value` } },
    }));
    expect(values(fields, "url.query.x")).toHaveLength(API_FIELD_LIMITS.valuesPerField);
    expect(fields.length).toBeLessThanOrEqual(API_FIELD_LIMITS.fields);
    expect(fields.some((field) => field.name === "response.body.late")).toBe(false);

    const depthFields = extractApiFields(exchange({ request: { ...exchange().request, body: { kind: "json", value: nested } } }));
    expect(depthFields.some((field) => field.value === "hidden")).toBe(false);
    const longValue = extractApiFields(exchange({ request: { ...exchange().request, url: `https://api.example.com?v=${"x".repeat(700)}` } }));
    expect(values(longValue, "url.query.v")[0]).toHaveLength(API_FIELD_LIMITS.displayedValueLength);
  });
});
