import type { ExtractedJob, JobMatch, KeywordSettings } from "./types";

export function matchJob(job: Pick<ExtractedJob, "title" | "description">, settings: KeywordSettings): JobMatch {
  const haystack = `${job.title}\n${job.description}`.toLocaleLowerCase();
  const matches = (term: string) => haystack.includes(term.toLocaleLowerCase());
  const matchedRequired = settings.required.filter(matches);
  const matchedPreferred = settings.preferred.filter(matches);
  const missingRequired = settings.required.filter((term) => !matches(term));
  const matchedExcluded = settings.excluded.filter(matches);

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
