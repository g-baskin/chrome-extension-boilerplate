import { decodeSavedRecords } from "./storage";
import type { AdLibraryRecord } from "./types";

export interface ImportPreview { records: AdLibraryRecord[]; duplicates: number; newRecords: number }

export function mergeImportedRecords(existing: AdLibraryRecord[], imported: AdLibraryRecord[]): AdLibraryRecord[] {
  return [...new Map([...imported, ...existing].map((record) => [record.key, record])).values()].slice(0, 500);
}

export function previewImportedRecords(records: AdLibraryRecord[], existing: AdLibraryRecord[]): ImportPreview {
  const keys = new Set(existing.map(({ key }) => key));
  const duplicates = records.filter(({ key }) => keys.has(key)).length;
  return { records, duplicates, newRecords: records.length - duplicates };
}

export function parseSocialFinderImport(text: string, existing: AdLibraryRecord[]): ImportPreview {
  if (text.length > 5_000_000) throw new Error("Import exceeds the 5 MB limit.");
  let value: unknown;
  try { value = JSON.parse(text); } catch { throw new Error("Choose a valid JSON export."); }
  if (!value || typeof value !== "object" || (value as { schemaVersion?: unknown }).schemaVersion !== 1 || !Array.isArray((value as { records?: unknown }).records)) throw new Error("Choose a Social Finder versioned export.");
  const rawRecords = (value as { records: unknown[] }).records;
  const records = decodeSavedRecords(value);
  if (rawRecords.length > 500 || records.length !== rawRecords.length) throw new Error("Import contains unsupported or invalid records.");
  return previewImportedRecords(records, existing);
}
