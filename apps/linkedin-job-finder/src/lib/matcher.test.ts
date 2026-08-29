import { describe, expect, it } from "vitest";
import { matchJob } from "./matcher";

const job = { title: "Senior React / Node.js Engineer", description: "Build TypeScript APIs in C++ alongside a remote team." };

describe("job matching", () => {
  it("requires every required term and counts preferred evidence", () => {
    const result = matchJob(job, { required: ["react", "TypeScript"], preferred: ["remote", "GraphQL"], excluded: [] });
    expect(result).toMatchObject({ eligible: true, positiveMatched: 3, positiveTotal: 4, matchedPreferred: ["remote"] });
  });

  it("lets excluded terms disqualify an otherwise eligible job", () => {
    const result = matchJob(job, { required: ["React"], preferred: [], excluded: ["C++"] });
    expect(result).toMatchObject({ eligible: false, matchedExcluded: ["C++"] });
  });

  it("uses literal punctuation and case-insensitive phrases", () => {
    expect(matchJob(job, { required: ["node.js", "c++"], preferred: [], excluded: [] }).eligible).toBe(true);
    expect(matchJob(job, { required: ["nodeXjs"], preferred: [], excluded: [] }).eligible).toBe(false);
  });

  it("treats empty settings as eligible without inventing a score", () => {
    expect(matchJob(job, { required: [], preferred: [], excluded: [] })).toMatchObject({ eligible: true, positiveMatched: 0, positiveTotal: 0 });
  });
});
