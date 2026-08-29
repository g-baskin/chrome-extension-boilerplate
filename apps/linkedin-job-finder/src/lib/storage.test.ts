import { describe, expect, it } from "vitest";
import { MAX_SAVED_JOBS, type StorageAdapter, deleteJob, getJobs, normalizeSavedJobs, saveJob, updateNotes } from "./storage";
import type { ExtractedJob, JobMatch } from "./types";

class MemoryStorage implements StorageAdapter {
  data: Record<string, unknown> = {};
  async get(keys: string | string[]) { const list = Array.isArray(keys) ? keys : [keys]; return Object.fromEntries(list.map((key) => [key, this.data[key]])); }
  async set(items: Record<string, unknown>) { Object.assign(this.data, items); }
}

const match: JobMatch = { eligible: true, matchedRequired: [], matchedPreferred: [], missingRequired: [], matchedExcluded: [], positiveMatched: 0, positiveTotal: 0 };
const job = (id: string): ExtractedJob => ({ id, title: `Engineer ${id}`, company: "Co", location: "Remote", description: "Build things", url: `https://www.linkedin.com/jobs/view/${id}/` });

describe("saved job storage", () => {
  it("drops malformed records and deterministically sorts newest first", () => {
    const valid = (id: string, savedAt: string) => ({ job: job(id), match, notes: "", savedAt, updatedAt: savedAt });
    expect(normalizeSavedJobs([null, { bad: true }, valid("1", "2026-01-01T00:00:00.000Z"), valid("2", "2026-02-01T00:00:00.000Z")]).map((item) => item.job.id)).toEqual(["2", "1"]);
  });

  it("replaces duplicates while preserving notes and original saved time", async () => {
    const storage = new MemoryStorage();
    await saveJob(storage, job("1"), match, "2026-01-01T00:00:00.000Z");
    await updateNotes(storage, "1", "Interested", "2026-01-02T00:00:00.000Z");
    await saveJob(storage, { ...job("1"), title: "Updated" }, match, "2026-01-03T00:00:00.000Z");
    expect(await getJobs(storage)).toEqual([expect.objectContaining({ notes: "Interested", savedAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-03T00:00:00.000Z", job: expect.objectContaining({ title: "Updated" }) })]);
  });

  it("caps retention, bounds notes, and deletes one record", async () => {
    const storage = new MemoryStorage();
    storage.data.savedJobs = Array.from({ length: MAX_SAVED_JOBS + 20 }, (_, index) => ({ job: job(String(index + 1)), match, notes: "", savedAt: new Date(index * 1_000).toISOString(), updatedAt: new Date(index * 1_000).toISOString() }));
    expect(await getJobs(storage)).toHaveLength(MAX_SAVED_JOBS);
    await updateNotes(storage, "270", "x".repeat(3_000));
    expect((await getJobs(storage))[0]?.notes).toHaveLength(2_000);
    await deleteJob(storage, "270");
    expect((await getJobs(storage)).some((item) => item.job.id === "270")).toBe(false);
  });
});
