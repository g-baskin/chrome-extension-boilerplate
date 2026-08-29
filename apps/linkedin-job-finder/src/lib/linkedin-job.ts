import type { ExtractedJob } from "./types";

const FIELD_LIMITS = { title: 300, company: 200, location: 200, description: 20_000 } as const;
const SELECTORS = {
  title: [".job-details-jobs-unified-top-card__job-title", ".jobs-unified-top-card__job-title", "main h1", "h1"],
  company: [".job-details-jobs-unified-top-card__company-name", ".jobs-unified-top-card__company-name", "[data-tracking-control-name='public_jobs_topcard-org-name']"],
  location: [".job-details-jobs-unified-top-card__primary-description-container", ".jobs-unified-top-card__bullet", ".topcard__flavor--bullet"],
  description: ["#job-details", ".jobs-description__content", ".show-more-less-html__markup"],
} as const;

type QueryRoot = Pick<Document, "querySelector">;

function clean(value: string, limit: number): string {
  return value.replace(/\s+/g, " ").trim().slice(0, limit);
}

function read(root: QueryRoot, selectors: readonly string[], limit: number): string {
  for (const selector of selectors) {
    const value = root.querySelector(selector)?.textContent;
    if (value?.trim()) return clean(value, limit);
  }
  return "";
}

export function getLinkedInJobId(urlValue: string): string | null {
  let url: URL;
  try { url = new URL(urlValue); } catch { return null; }
  if (url.protocol !== "https:" || !["linkedin.com", "www.linkedin.com"].includes(url.hostname)) return null;
  const pathId = url.pathname.match(/^\/jobs\/view\/(\d+)/)?.[1];
  const queryId = url.searchParams.get("currentJobId");
  const id = pathId ?? (queryId && /^\d+$/.test(queryId) ? queryId : null);
  return id && id.length <= 30 ? id : null;
}

export function canonicalLinkedInJobUrl(id: string): string {
  return `https://www.linkedin.com/jobs/view/${id}/`;
}

export function extractLinkedInJob(root: QueryRoot, urlValue: string): ExtractedJob | null {
  const id = getLinkedInJobId(urlValue);
  if (!id) return null;
  const title = read(root, SELECTORS.title, FIELD_LIMITS.title);
  const description = read(root, SELECTORS.description, FIELD_LIMITS.description);
  if (!title || !description) return null;
  return {
    id,
    title,
    company: read(root, SELECTORS.company, FIELD_LIMITS.company),
    location: read(root, SELECTORS.location, FIELD_LIMITS.location),
    description,
    url: canonicalLinkedInJobUrl(id),
  };
}
