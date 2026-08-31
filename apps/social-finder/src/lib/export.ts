import type { AdLibraryRecord } from "./types";

const COLUMNS = ["libraryId", "advertiser", "status", "startDate", "runtimeDays", "platforms", "text", "destinationUrl", "mediaUrls", "multipleVersions", "capturedAt"] as const;

function spreadsheetSafe(value: unknown): string {
  const text = Array.isArray(value) ? value.join(" | ") : value === null || value === undefined ? "" : String(value);
  const safe = /^[=+\-@]/.test(text) ? `'${text}` : text;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function recordsToCsv(records: AdLibraryRecord[]): string {
  if (records.length > 500) throw new Error("Export supports at most 500 records.");
  return `${COLUMNS.join(",")}\r\n${records.map((record) => COLUMNS.map((column) => spreadsheetSafe(record[column])).join(",")).join("\r\n")}`;
}

export function recordsToJson(records: AdLibraryRecord[]): string {
  if (records.length > 500) throw new Error("Export supports at most 500 records.");
  const json = JSON.stringify({ schemaVersion: 1, exportedAt: new Date().toISOString(), records }, null, 2);
  if (json.length > 5_000_000) throw new Error("Export exceeds the 5 MB limit.");
  return json;
}

export async function downloadText(filename: string, text: string, mime: string): Promise<void> {
  const url = URL.createObjectURL(new Blob([text], { type: `${mime};charset=utf-8` }));
  try { await chrome.downloads.download({ url, filename, saveAs: true }); } finally { window.setTimeout(() => URL.revokeObjectURL(url), 1_000); }
}
