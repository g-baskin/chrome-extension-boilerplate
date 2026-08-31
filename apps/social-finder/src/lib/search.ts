export interface AdLibrarySearch { keyword: string; country: string; adType: "all" | "political_and_issue_ads"; activeStatus: "all" | "active" | "inactive" }

export function buildAdLibrarySearchUrl(search: AdLibrarySearch): string {
  const keyword = search.keyword.replace(/\s+/g, " ").trim();
  if (!keyword || keyword.length > 200) throw new Error("Enter a keyword up to 200 characters.");
  if (!/^[A-Z]{2}$/.test(search.country)) throw new Error("Choose a valid two-letter country.");
  if (!["all", "political_and_issue_ads"].includes(search.adType)) throw new Error("Choose a valid ad type.");
  if (!["all", "active", "inactive"].includes(search.activeStatus)) throw new Error("Choose a valid active status.");
  const url = new URL("https://www.facebook.com/ads/library/");
  url.searchParams.set("active_status", search.activeStatus);
  url.searchParams.set("ad_type", search.adType);
  url.searchParams.set("country", search.country);
  url.searchParams.set("q", keyword);
  url.searchParams.set("search_type", "keyword_unordered");
  return url.toString();
}
