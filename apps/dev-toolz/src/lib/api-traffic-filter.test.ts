import { describe, expect, it } from "vitest";
import { matchesApiDomain, matchesApiTraffic, type ApiExchange, type ApiTrafficFilters } from "./api-traffic";

const exchange: ApiExchange = {
  sequence: 1,
  pageUrl: "https://app.viralvue.com/dashboard",
  startedAt: "2026-08-28T11:40:00.000Z",
  durationMs: 120,
  resourceType: "fetch",
  initiator: { kind: "page", origin: "https://app.viralvue.com" },
  request: {
    method: "POST",
    url: "https://www.tiktok.com/api/events",
    headers: [],
    mimeType: "application/json",
    body: null,
  },
  response: {
    status: 200,
    statusText: "OK",
    headers: [],
    mimeType: "application/json",
    body: { kind: "json", value: {} },
  },
};
const filters: ApiTrafficFilters = {
  pageHostname: "app.viralvue.com",
  analysis: "",
  domain: "*tiktok.com",
  attribution: "",
  method: "POST",
  status: "",
  mimeType: "application/json",
};

describe("API Traffic domain filter", () => {
  it("supports wildcard hostnames in the applied traffic filter", () => {
    expect(matchesApiTraffic(exchange, filters)).toBe(true);
    expect(matchesApiTraffic(exchange, { ...filters, domain: "*.example.com" })).toBe(false);
  });

  it("preserves substring matching when no wildcard is supplied", () => {
    expect(matchesApiDomain("www.tiktok.com", "tiktok.com")).toBe(true);
    expect(matchesApiDomain("api.tiktok.com", "api.*.com")).toBe(true);
    expect(matchesApiDomain("www.tiktok.com", "tiktok.*")).toBe(false);
  });
});
