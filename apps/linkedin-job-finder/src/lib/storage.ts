import { normalizeKeywordSettings } from "./keywords";
import type { ExtractedJob, JobMatch, KeywordSettings, SavedJob } from "./types";

export const STORAGE_KEYS = { settings: "keywordSettings", jobs: "savedJobs" } as const;
export const MAX_SAVED_JOBS = 250;
export const MAX_NOTES_LENGTH = 2_000;

export interface StorageAdapter {
  get(keys: string | string[]): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
}

const validDate = (value: unknown): value is string => typeof value === "string" && !Number.isNaN(Date.parse(value));
const validString = (value: unknown, max: number): value is string => typeof value === "string" && value.length <= max;
const validTerms = (value: unknown): value is string[] => Array.isArray(value) && value.length <= 50 && value.every((term) => validString(term, 80));

function normalizeJob(value: unknown): ExtractedJob | null {
  if (!value || typeof value !== "object") return null;
  const job = value as Record<string, unknown>;
  if (typeof job.id !== "string" || !/^\d{1,30}$/.test(job.id)) return null;
  if (!validString(job.title, 300) || !job.title || !validString(job.company, 200) || !validString(job.location, 200) || !validString(job.description, 20_000)) return null;
  const url = `https://www.linkedin.com/jobs/view/${job.id}/`;
  if (job.url !== url) return null;
  return { id: job.id, title: job.title, company: job.company, location: job.location, description: job.description, url };
}

function normalizeMatch(value: unknown): JobMatch | null {
  if (!value || typeof value !== "object") return null;
  const match = value as Record<string, unknown>;
  if (typeof match.eligible !== "boolean" || !validTerms(match.matchedRequired) || !validTerms(match.matchedPreferred)
    || !validTerms(match.missingRequired) || !validTerms(match.matchedExcluded)
    || !Number.isInteger(match.positiveMatched) || !Number.isInteger(match.positiveTotal)) return null;
  const positiveMatched = Number(match.positiveMatched);
  const positiveTotal = Number(match.positiveTotal);
  if (positiveMatched !== match.matchedRequired.length + match.matchedPreferred.length
    || positiveMatched > positiveTotal || positiveTotal > 100
    || match.eligible !== (match.missingRequired.length === 0 && match.matchedExcluded.length === 0)) return null;
  return { eligible: match.eligible, matchedRequired: match.matchedRequired, matchedPreferred: match.matchedPreferred,
    missingRequired: match.missingRequired, matchedExcluded: match.matchedExcluded, positiveMatched, positiveTotal };
}

export function normalizeSavedJobs(value: unknown): SavedJob[] {
  if (!Array.isArray(value)) return [];
  const unique = new Map<string, SavedJob>();
  for (const item of value.slice(0, MAX_SAVED_JOBS * 2)) {
    if (!item || typeof item !== "object") continue;
    const record = item as Record<string, unknown>;
    const job = normalizeJob(record.job);
    const match = normalizeMatch(record.match);
    if (!job || !match || !validString(record.notes, MAX_NOTES_LENGTH) || !validDate(record.savedAt) || !validDate(record.updatedAt)) continue;
    const saved = { job, match, notes: record.notes, savedAt: record.savedAt, updatedAt: record.updatedAt };
    const previous = unique.get(job.id);
    if (!previous || saved.updatedAt > previous.updatedAt) unique.set(job.id, saved);
  }
  return [...unique.values()].sort((a, b) => b.savedAt.localeCompare(a.savedAt) || b.updatedAt.localeCompare(a.updatedAt) || b.job.id.localeCompare(a.job.id)).slice(0, MAX_SAVED_JOBS);
}

export async function getSettings(storage: StorageAdapter): Promise<KeywordSettings> {
  const values = await storage.get(STORAGE_KEYS.settings);
  return normalizeKeywordSettings(values[STORAGE_KEYS.settings]);
}

export async function setSettings(storage: StorageAdapter, settings: KeywordSettings): Promise<KeywordSettings> {
  const normalized = normalizeKeywordSettings(settings);
  await storage.set({ [STORAGE_KEYS.settings]: normalized });
  return normalized;
}

export async function getJobs(storage: StorageAdapter): Promise<SavedJob[]> {
  const values = await storage.get(STORAGE_KEYS.jobs);
  return normalizeSavedJobs(values[STORAGE_KEYS.jobs]);
}

export async function saveJob(storage: StorageAdapter, job: ExtractedJob, match: JobMatch, now = new Date().toISOString()): Promise<SavedJob> {
  const jobs = await getJobs(storage);
  const existing = jobs.find((saved) => saved.job.id === job.id);
  const saved: SavedJob = { job, match, notes: existing?.notes ?? "", savedAt: existing?.savedAt ?? now, updatedAt: now };
  await storage.set({ [STORAGE_KEYS.jobs]: normalizeSavedJobs([saved, ...jobs.filter((item) => item.job.id !== job.id)]) });
  return saved;
}

export async function updateNotes(storage: StorageAdapter, id: string, notes: string, now = new Date().toISOString()): Promise<boolean> {
  const jobs = await getJobs(storage);
  const found = jobs.some((item) => item.job.id === id);
  if (!found) return false;
  await storage.set({ [STORAGE_KEYS.jobs]: jobs.map((item) => item.job.id === id ? { ...item, notes: notes.slice(0, MAX_NOTES_LENGTH), updatedAt: now } : item) });
  return true;
}

export async function deleteJob(storage: StorageAdapter, id: string): Promise<void> {
  await storage.set({ [STORAGE_KEYS.jobs]: (await getJobs(storage)).filter((item) => item.job.id !== id) });
}

export async function clearJobs(storage: StorageAdapter): Promise<void> {
  await storage.set({ [STORAGE_KEYS.jobs]: [] });
}
