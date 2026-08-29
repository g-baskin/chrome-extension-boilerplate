import type { ExtractedJob, JobMatch, KeywordSettings } from "./types";

const CLEARANCE_EXCLUSION = "Security clearance required";
const CLEARANCE_REQUIREMENT_PATTERNS = [
  /\b(?:active|current)\s+(?:[a-z0-9/-]+\s+){0,3}(?:clearance|ts\/sci)\b/,
  /\b(?:must|shall)\s+(?:currently\s+)?(?:possess|hold|maintain|have)\s+(?:an?\s+)?(?:[a-z0-9/-]+\s+){0,5}(?:clearance|ts\/sci)\b/,
  /\b(?:clearance|ts\/sci)\s+(?:is\s+)?required\b/,
  /\b(?:ci|counterintelligence|full[- ]scope)\s+polygraph\s+(?:is\s+)?required\b/,
  /\b(?:must|required to|ability to|able to)\s+(?:be\s+able\s+to\s+)?(?:obtain|maintain|hold)\s+(?:an?\s+)?(?:[a-z0-9/-]+\s+){0,6}(?:clearance|ts\/sci)\b/,
  /\b(?:must|shall)\s+(?:be\s+)?(?:eligible|qualify)\s+for\s+(?:an?\s+)?(?:[a-z0-9/-]+\s+){0,5}(?:clearance|ts\/sci)\b/,
  /\b(?:must|shall)\s+be\s+eligible\s+to\s+(?:obtain|maintain|hold)\s+(?:an?\s+)?(?:[a-z0-9/-]+\s+){0,6}(?:clearance|ts\/sci)\b/,
];

function requiresClearance(text: string): boolean {
  const requirementsOnly = text
    .replace(/\bno\s+(?:[a-z0-9/-]+\s+){0,4}(?:clearance|ts\/sci)\s+(?:is\s+)?required\b/g, "")
    .replace(/\bdoes\s+not\s+require\s+(?:an?\s+)?(?:[a-z0-9/-]+\s+){0,4}(?:clearance|ts\/sci)\b/g, "")
    .replace(/\bnot\s+required\s+to\s+(?:obtain|maintain|hold)\s+(?:an?\s+)?(?:[a-z0-9/-]+\s+){0,5}(?:clearance|ts\/sci)\b/g, "")
    .replace(/\b(?:clearance|ts\/sci)\s+(?:is\s+)?not\s+required\b/g, "");
  return CLEARANCE_REQUIREMENT_PATTERNS.some((pattern) => pattern.test(requirementsOnly));
}

export function matchJob(job: Pick<ExtractedJob, "title" | "description">, settings: KeywordSettings): JobMatch {
  const haystack = `${job.title}\n${job.description}`.toLocaleLowerCase();
  const matches = (term: string) => haystack.includes(term.toLocaleLowerCase());
  const matchedRequired = settings.required.filter(matches);
  const matchedPreferred = settings.preferred.filter(matches);
  const missingRequired = settings.required.filter((term) => !matches(term));
  const matchedExcluded = settings.excluded.filter(matches);
  if (settings.excludeClearanceRequired && requiresClearance(haystack) && !matchedExcluded.includes(CLEARANCE_EXCLUSION)) {
    matchedExcluded.push(CLEARANCE_EXCLUSION);
  }

  return {
    eligible: missingRequired.length === 0 && matchedExcluded.length === 0,
    matchedRequired,
    matchedPreferred,
    missingRequired,
    matchedExcluded,
    positiveMatched: matchedRequired.length + matchedPreferred.length,
    positiveTotal: settings.required.length + settings.preferred.length,
  };
}
