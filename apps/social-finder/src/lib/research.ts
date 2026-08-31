import type { AdLibraryRecord } from "./types";

function bounded(label: string, value: string): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (!normalized || normalized.length > 100) throw new Error(`Enter a ${label} up to 100 characters.`);
  return normalized;
}

export function searchIdeas(nicheInput: string, productInput: string) {
  const niche = bounded("niche", nicheInput);
  const product = bounded("product", productInput);
  const phrase = `${niche} ${product}`;
  const keywords = [phrase, `${phrase} benefits`, `${phrase} alternatives`];
  return { keywords, prompt: `Suggest ethical Meta Ad Library search keywords for this niche and product.\nNiche: ${niche}\nProduct: ${product}\nReturn editable keyword phrases only. Do not claim performance, reach, spend, or audience facts.` };
}

export function analysisPrompt(record: AdLibraryRecord): string {
  const unknown = [!record.advertiser && "advertiser", !record.startDate && "start date", record.runtimeDays === null && "runtime", !record.platforms.length && "platforms", !record.destinationUrl && "destination", !record.mediaUrls.length && "media", record.multipleVersions === null && "multiple-version state"].filter(Boolean);
  return `Analyze only this visible Meta Ad Library evidence. Separate observation from interpretation and do not infer performance.\nAdvertiser: ${record.advertiser ?? "unknown"}\nLibrary ID: ${record.libraryId}\nStatus: ${record.status ?? "unknown"}\nStart date: ${record.startDate ?? "unknown"}\nRuntime days: ${record.runtimeDays ?? "unknown"}\nPlatforms: ${record.platforms.join(", ") || "unknown"}\nVisible text: ${record.text}\nUnknown facts: ${unknown.join(", ") || "none"}`;
}
