export interface KeywordSettings {
  required: string[];
  preferred: string[];
  excluded: string[];
}

export interface ExtractedJob {
  id: string;
  title: string;
  company: string;
  location: string;
  description: string;
  url: string;
}

export interface JobMatch {
  eligible: boolean;
  matchedRequired: string[];
  matchedPreferred: string[];
  missingRequired: string[];
  matchedExcluded: string[];
  positiveMatched: number;
  positiveTotal: number;
}

export interface SavedJob {
  job: ExtractedJob;
  match: JobMatch;
  notes: string;
  savedAt: string;
  updatedAt: string;
}
