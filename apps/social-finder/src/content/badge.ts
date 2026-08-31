import type { Finding } from "../lib/types";

const BADGED_ATTRIBUTE = "data-social-finder-badged";

const LABELS: Record<Finding["kind"], string> = {
  "ad-library-ad": "Ad Library ad",
  "feed-sponsored": "Sponsored post",
  "marketplace-listing": "Marketplace listing",
  "marketplace-sponsored": "Promoted listing",
};

export function badgeLabel(finding: Finding, runtimeDays: number | null = null): string {
  const runtime = finding.kind === "ad-library-ad" && runtimeDays !== null ? ` · Running ${runtimeDays} ${runtimeDays === 1 ? "day" : "days"}` : "";
  return `Social Finder · ${LABELS[finding.kind]}${runtime}`;
}

export function renderBadge(root: HTMLElement, finding: Finding, runtimeDays: number | null = null): boolean {
  try {
    const existing = root.querySelector<HTMLElement>(":scope > .social-finder-badge");
    const badge = existing ?? document.createElement("span");
    const label = badgeLabel(finding, runtimeDays);
    badge.className = "social-finder-badge";
    badge.textContent = label;
    badge.setAttribute("role", "status");
    badge.setAttribute("aria-label", label);
    root.setAttribute(BADGED_ATTRIBUTE, finding.kind);
    if (!existing) root.prepend(badge);
    return true;
  } catch {
    root.removeAttribute(BADGED_ATTRIBUTE);
    return false;
  }
}

export function clearUndetectedBadges(detectedRoots: ReadonlySet<HTMLElement>): void {
  document.querySelectorAll<HTMLElement>(`[${BADGED_ATTRIBUTE}]`).forEach((root) => {
    if (detectedRoots.has(root)) return;
    root.querySelector<HTMLElement>(":scope > .social-finder-badge")?.remove();
    root.removeAttribute(BADGED_ATTRIBUTE);
  });
}

export function clearBadges(): void {
  document.querySelectorAll(".social-finder-badge").forEach((badge) => badge.remove());
  document.querySelectorAll(`[${BADGED_ATTRIBUTE}]`).forEach((root) => root.removeAttribute(BADGED_ATTRIBUTE));
}
