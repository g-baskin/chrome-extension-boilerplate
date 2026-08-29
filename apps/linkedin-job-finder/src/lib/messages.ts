import { MAX_KEYWORD_LENGTH, MAX_KEYWORDS_PER_LIST } from "./keywords";
import type { ExtractedJob, JobMatch, KeywordSettings, SavedJob } from "./types";

export type Request =
  | { type: "GET_SETTINGS" }
  | { type: "SET_SETTINGS"; settings: KeywordSettings }
  | { type: "GET_JOBS" }
  | { type: "SAVE_JOB"; job: ExtractedJob; match: JobMatch }
  | { type: "UPDATE_NOTES"; id: string; notes: string }
  | { type: "DELETE_JOB"; id: string }
  | { type: "CLEAR_JOBS" }
  | { type: "GET_CURRENT_JOB" };

export type Response<T = unknown> = { ok: true; data: T } | { ok: false; error: string };
export type CurrentJob = { job: ExtractedJob; match: JobMatch; saved: boolean };
export type SettingsResponse = Response<KeywordSettings>;
export type JobsResponse = Response<SavedJob[]>;

const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const isShortId = (value: unknown): value is string => typeof value === "string" && /^\d{1,30}$/.test(value);
const isBoundedString = (value: unknown, max: number) => typeof value === "string" && value.length <= max;

function isStringList(value: unknown): value is string[] {
  return Array.isArray(value) && value.length <= MAX_KEYWORDS_PER_LIST && value.every((item) => isBoundedString(item, MAX_KEYWORD_LENGTH));
}

function isSettings(value: unknown): value is KeywordSettings {
  return isRecord(value) && isStringList(value.required) && isStringList(value.preferred) && isStringList(value.excluded);
}

function isJob(value: unknown): value is ExtractedJob {
  if (!isRecord(value)) return false;
  return isShortId(value.id) && isBoundedString(value.title, 300) && isBoundedString(value.company, 200)
    && isBoundedString(value.location, 200) && isBoundedString(value.description, 20_000)
    && typeof value.url === "string" && value.url === `https://www.linkedin.com/jobs/view/${value.id}/`;
}

function isMatch(value: unknown): value is JobMatch {
  if (!isRecord(value) || typeof value.eligible !== "boolean"
    || !isStringList(value.matchedRequired) || !isStringList(value.matchedPreferred)
    || !isStringList(value.missingRequired) || !isStringList(value.matchedExcluded)) return false;
  const { matchedRequired, matchedPreferred, missingRequired, matchedExcluded } = value;
  return value.eligible === (missingRequired.length === 0 && matchedExcluded.length === 0)
    && Number.isInteger(value.positiveMatched) && Number.isInteger(value.positiveTotal)
    && Number(value.positiveMatched) === matchedRequired.length + matchedPreferred.length
    && Number(value.positiveMatched) <= Number(value.positiveTotal) && Number(value.positiveTotal) <= 100;
}

export function isRequest(value: unknown): value is Request {
  if (!isRecord(value) || typeof value.type !== "string") return false;
  switch (value.type) {
    case "GET_SETTINGS": case "GET_JOBS": case "CLEAR_JOBS": case "GET_CURRENT_JOB": return true;
    case "SET_SETTINGS": return isSettings(value.settings);
    case "SAVE_JOB": return isJob(value.job) && isMatch(value.match);
    case "UPDATE_NOTES": return isShortId(value.id) && isBoundedString(value.notes, 2_000);
    case "DELETE_JOB": return isShortId(value.id);
    default: return false;
  }
}

export async function sendMessage<T>(request: Request): Promise<Response<T>> {
  try {
    return await chrome.runtime.sendMessage(request) as Response<T>;
  } catch {
    return { ok: false, error: "The extension is unavailable. Try again." };
  }
}
