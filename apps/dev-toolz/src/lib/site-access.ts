export type SiteAccessMode = "all" | "deny" | "allow";

export interface SiteAccessSettings {
  mode: SiteAccessMode;
  sites: string[];
}

export function normalizeSiteRule(value: string): string | null {
  const trimmed = value.trim().toLowerCase().replace(/^\*\./, "");
  if (!trimmed) return null;

  try {
    const url = new URL(trimmed.includes("://") ? trimmed : `https://${trimmed}`);
    return url.hostname || null;
  } catch {
    return null;
  }
}

export function isSiteAllowed(pageUrl: string, settings: SiteAccessSettings): boolean {
  let hostname: string;
  try {
    hostname = new URL(pageUrl).hostname.toLowerCase();
  } catch {
    return false;
  }

  const matches = settings.sites.some(
    (site) => hostname === site || hostname.endsWith(`.${site}`)
  );
  if (settings.mode === "deny") return !matches;
  if (settings.mode === "allow") return matches;
  return true;
}
