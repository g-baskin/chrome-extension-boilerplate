import { describe, expect, it } from "vitest";
import { isRequest, isScanVisibleJobsResult } from "./messages";

const job = { id: "123", title: "Engineer", company: "Co", location: "Remote", description: "Description", url: "https://www.linkedin.com/jobs/view/123/" };
const match = { eligible: true, matchedRequired: [], matchedPreferred: [], missingRequired: [], matchedExcluded: [], positiveMatched: 0, positiveTotal: 0 };

describe("runtime message guards", () => {
  it("accepts known bounded messages", () => {
    expect(isRequest({ type: "GET_SETTINGS" })).toBe(true);
    expect(isRequest({ type: "SCAN_VISIBLE_JOBS" })).toBe(true);
    expect(isRequest({ type: "SET_SETTINGS", settings: { required: [], preferred: [], excluded: [], excludeClearanceRequired: true } })).toBe(true);
    expect(isRequest({ type: "SAVE_JOB", job, match })).toBe(true);
    expect(isRequest({ type: "UPDATE_NOTES", id: "123", notes: "Follow up" })).toBe(true);
  });

  it("validates bounded scan results", () => {
    expect(isScanVisibleJobsResult({ scanned: 1, failed: 0, eligible: [{ job, match }] })).toBe(true);
    expect(isScanVisibleJobsResult({ scanned: 11, failed: 0, eligible: [] })).toBe(false);
    expect(isScanVisibleJobsResult({ scanned: 1, failed: 0, eligible: [{ job: { ...job, url: "https://evil.test" }, match }] })).toBe(false);
  });

  it("rejects unknown, malformed, and oversized messages", () => {
    expect(isRequest({ type: "NOPE" })).toBe(false);
    expect(isRequest({ type: "DELETE_JOB", id: "../123" })).toBe(false);
    expect(isRequest({ type: "UPDATE_NOTES", id: "123", notes: "x".repeat(2_001) })).toBe(false);
    expect(isRequest({ type: "SAVE_JOB", job: { ...job, url: "https://evil.test" }, match })).toBe(false);
    expect(isRequest({ type: "SAVE_JOB", job, match: { ...match, positiveMatched: 2, positiveTotal: 1 } })).toBe(false);
    expect(isRequest({ type: "SAVE_JOB", job, match: { ...match, eligible: true, missingRequired: ["React"], positiveTotal: 1 } })).toBe(false);
    expect(isRequest({ type: "SET_SETTINGS", settings: { required: Array(51).fill("x"), preferred: [], excluded: [], excludeClearanceRequired: false } })).toBe(false);
    expect(isRequest({ type: "SET_SETTINGS", settings: { required: [], preferred: [], excluded: [], excludeClearanceRequired: "yes" } })).toBe(false);
  });
});
