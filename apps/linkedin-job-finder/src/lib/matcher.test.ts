import { describe, expect, it } from "vitest";
import { matchJob } from "./matcher";

const job = { title: "Senior React / Node.js Engineer", description: "Build TypeScript APIs in C++ alongside a remote team." };

describe("job matching", () => {
  it("requires every required term and counts preferred evidence", () => {
    const result = matchJob(job, { required: ["react", "TypeScript"], preferred: ["remote", "GraphQL"], excluded: [], excludeClearanceRequired: false });
    expect(result).toMatchObject({ eligible: true, positiveMatched: 3, positiveTotal: 4, matchedPreferred: ["remote"] });
  });

  it("lets excluded terms disqualify an otherwise eligible job", () => {
    const result = matchJob(job, { required: ["React"], preferred: [], excluded: ["C++"], excludeClearanceRequired: false });
    expect(result).toMatchObject({ eligible: false, matchedExcluded: ["C++"] });
  });

  it("uses literal punctuation and case-insensitive phrases", () => {
    expect(matchJob(job, { required: ["node.js", "c++"], preferred: [], excluded: [], excludeClearanceRequired: false }).eligible).toBe(true);
    expect(matchJob(job, { required: ["nodeXjs"], preferred: [], excluded: [], excludeClearanceRequired: false }).eligible).toBe(false);
  });

  it("detects existing and future clearance requirements when enabled", () => {
    const settings = { required: [], preferred: [], excluded: [], excludeClearanceRequired: true };
    for (const description of [
      "An active TS/SCI clearance is required.",
      "Candidates must possess a current Top Secret security clearance.",
      "A CI polygraph is required for this position.",
      "Must be able to obtain and maintain a Secret clearance.",
      "Applicants must be eligible for a security clearance.",
      "Must be eligible to obtain and maintain a Secret clearance.",
    ]) {
      expect(matchJob({ title: "Engineer", description }, settings)).toMatchObject({ eligible: false, matchedExcluded: ["Security clearance required"] });
    }
  });

  it("does not reject explicit no-clearance language", () => {
    const settings = { required: [], preferred: [], excluded: [], excludeClearanceRequired: true };
    for (const description of ["No security clearance is required.", "No TS/SCI required.", "This role does not require a clearance.", "You are not required to obtain a clearance."]) {
      expect(matchJob({ title: "Engineer", description }, settings)).toMatchObject({ eligible: true, matchedExcluded: [] });
    }
  });

  it("treats empty settings as eligible without inventing a score", () => {
    expect(matchJob(job, { required: [], preferred: [], excluded: [], excludeClearanceRequired: false })).toMatchObject({ eligible: true, positiveMatched: 0, positiveTotal: 0 });
  });
});
