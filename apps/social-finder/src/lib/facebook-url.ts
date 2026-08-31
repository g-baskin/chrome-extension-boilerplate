import type { Surface } from "./types";

const FACEBOOK_HOSTS = new Set(["facebook.com", "www.facebook.com"]);
const MARKETPLACE_ITEM = /^\/marketplace\/item\/(\d{1,30})(?:\/|$)/;

function facebookUrl(raw: string): URL | null {
  try {
    const url = new URL(raw);
    return url.protocol === "https:" && FACEBOOK_HOSTS.has(url.hostname) ? url : null;
  } catch {
    return null;
  }
}

export function getFacebookSurface(raw: string): Surface {
  const url = facebookUrl(raw);
  if (!url) return "unsupported";
  if (url.pathname === "/ads/library" || url.pathname.startsWith("/ads/library/")) return "ad-library";
  if (url.pathname === "/marketplace" || url.pathname.startsWith("/marketplace/")) return "marketplace";
  return url.pathname === "/" || url.pathname === "/home.php" ? "feed" : "unsupported";
}

export function getFacebookPageKey(raw: string): string {
  const url = facebookUrl(raw);
  const surface = getFacebookSurface(raw);
  if (!url || surface === "unsupported") return "unsupported";
  url.hash = "";
  url.searchParams.sort();
  return `${surface}:${url.pathname}?${url.searchParams.toString()}`;
}

export function getMarketplaceItemId(raw: string): string | null {
  const url = facebookUrl(raw);
  return url?.pathname.match(MARKETPLACE_ITEM)?.[1] ?? null;
}

export function canonicalMarketplaceItemUrl(raw: string): string | null {
  const id = getMarketplaceItemId(raw);
  return id ? `https://www.facebook.com/marketplace/item/${id}/` : null;
}
