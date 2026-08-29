import { describe, expect, it } from "vitest";
import { isRequest } from "./messages";

const job = { id: "123", title: "Engineer", company: "Co", location: "Remote", description: "Description", url: "https://www.linkedin.com/jobs/view/123/" };
const match = { eligible: true, matchedRequired: [], matchedPreferred: [], missingRequired: [], matchedExcluded: [], positiveMatched: 0, positiveTotal: 0 };

describe("runtime message guards", () => {
  it("accepts known bounded messages", () => {
    expect(isRequest({ type: "GET_SETTINGS" })).toBe(true);
    expect(isRequest({ type: "SAVE_JOB", job, match })).toBe(true);
    expect(isRequest({ type: "UPDATE_NOTES", id: "123", notes: "Follow up" })).toBe(true);
  });

  it("rejects unknown, malformed, and oversized messages", () => {
    expect(isRequest({ type: "NOPE" })).toBe(false);
    expect(isRequest({ type: "DELETE_JOB", id: "../123" })).toBe(false);
    expect(isRequest({ type: "UPDATE_NOTES", id: "123", notes: "x".repeat(2_001) })).toBe(false);
    expect(isRequest({ type: "SAVE_JOB", job: { ...job, url: "https://evil.test" }, match })).toBe(false);
    expect(isRequest({ type: "SAVE_JOB", job, match: { ...match, positiveMatched: 2, positiveTotal: 1 } })).toBe(false);
    expect(isRequest({ type: "SAVE_JOB", job, match: { ...match, eligible: true, missingRequired: ["React"], positiveTotal: 1 } })).toBe(false);
    expect(isRequest({ type: "SET_SETTINGS", settings: { required: Array(51).fill("x"), preferred: [], excluded: [] } })).toBe(false);
  });
});
