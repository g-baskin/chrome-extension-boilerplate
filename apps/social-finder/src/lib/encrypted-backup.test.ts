import { describe, expect, it } from "vitest";
import { decryptSavedRecords, encryptSavedRecords } from "./encrypted-backup";
import type { AdLibraryRecord } from "./types";

const record: AdLibraryRecord = { schemaVersion: 1, key: "ad-library:1", libraryId: "1", advertiser: "Nike", status: "active", startDate: null, runtimeDays: null, platforms: ["facebook"], text: "Visible ad", destinationUrl: null, mediaUrls: [], multipleVersions: null, pageKey: "q", capturedAt: "2026-08-31T00:00:00.000Z", diagnostics: [] };

describe("encrypted saved-ad backup", () => {
  it("round-trips a versioned backup without exposing records or passphrase", async () => {
    const passphrase = "correct horse battery staple";
    const encrypted = await encryptSavedRecords([record], passphrase);
    expect(encrypted).toContain('"format":"social-finder-encrypted-backup"');
    expect(encrypted).not.toContain(passphrase);
    expect(encrypted).not.toContain("Visible ad");
    expect(await decryptSavedRecords(encrypted, passphrase)).toEqual([record]);
  }, 15_000);

  it("fails closed for a wrong passphrase or unsupported envelope", async () => {
    const encrypted = await encryptSavedRecords([record], "correct horse battery staple");
    await expect(decryptSavedRecords(encrypted, "incorrect horse battery staple")).rejects.toThrow("could not be decrypted");
    await expect(decryptSavedRecords('{"format":"wrong"}', "correct horse battery staple")).rejects.toThrow("valid Social Finder encrypted backup");
  }, 15_000);

  it("rejects weak or oversized passphrases before cryptography", async () => {
    await expect(encryptSavedRecords([record], "too short")).rejects.toThrow("12 characters");
    await expect(encryptSavedRecords([record], "x".repeat(1_025))).rejects.toThrow("1,024");
  });
});
