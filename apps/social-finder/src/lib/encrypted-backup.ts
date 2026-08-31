import { recordsToJson } from "./export";
import { decodeSavedRecords } from "./storage";
import type { AdLibraryRecord } from "./types";

const FORMAT = "social-finder-encrypted-backup";
const ITERATIONS = 600_000;
const ADDITIONAL_DATA = new TextEncoder().encode(`${FORMAT}:v1`);
const MAX_ENCRYPTED_CHARACTERS = 7_000_000;

interface EncryptedEnvelope {
  format: typeof FORMAT;
  schemaVersion: 1;
  kdf: { name: "PBKDF2"; hash: "SHA-256"; iterations: typeof ITERATIONS; salt: string };
  cipher: { name: "AES-GCM"; iv: string };
  ciphertext: string;
}

function validatePassphrase(passphrase: string): void {
  if (passphrase.length < 12) throw new Error("Use a passphrase of at least 12 characters.");
  if (passphrase.length > 1_024) throw new Error("Passphrase must not exceed 1,024 characters.");
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 32_768) binary += String.fromCharCode(...bytes.subarray(offset, offset + 32_768));
  return btoa(binary);
}

function base64ToBytes(value: string, expectedLength?: number): Uint8Array {
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(value)) throw new Error("Invalid base64.");
  const binary = atob(value);
  if (expectedLength !== undefined && binary.length !== expectedLength) throw new Error("Invalid byte length.");
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

async function deriveKey(passphrase: string, salt: Uint8Array, usage: KeyUsage): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey("raw", new TextEncoder().encode(passphrase), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey({ name: "PBKDF2", hash: "SHA-256", salt: toArrayBuffer(salt), iterations: ITERATIONS }, material, { name: "AES-GCM", length: 256 }, false, [usage]);
}

function parseEnvelope(text: string): EncryptedEnvelope {
  if (text.length > MAX_ENCRYPTED_CHARACTERS) throw new Error("Encrypted backup exceeds the 7 MB limit.");
  let value: unknown;
  try { value = JSON.parse(text); } catch { throw new Error("Choose a valid Social Finder encrypted backup."); }
  if (!value || typeof value !== "object") throw new Error("Choose a valid Social Finder encrypted backup.");
  const item = value as Partial<EncryptedEnvelope>;
  if (item.format !== FORMAT || item.schemaVersion !== 1 || item.kdf?.name !== "PBKDF2" || item.kdf.hash !== "SHA-256" || item.kdf.iterations !== ITERATIONS || item.cipher?.name !== "AES-GCM" || typeof item.kdf.salt !== "string" || typeof item.cipher.iv !== "string" || typeof item.ciphertext !== "string" || item.ciphertext.length > MAX_ENCRYPTED_CHARACTERS) throw new Error("Choose a valid Social Finder encrypted backup.");
  return item as EncryptedEnvelope;
}

export async function encryptSavedRecords(records: AdLibraryRecord[], passphrase: string): Promise<string> {
  validatePassphrase(passphrase);
  const plaintext = new TextEncoder().encode(recordsToJson(records));
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(passphrase, salt, "encrypt");
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: ADDITIONAL_DATA }, key, plaintext);
  const envelope: EncryptedEnvelope = { format: FORMAT, schemaVersion: 1, kdf: { name: "PBKDF2", hash: "SHA-256", iterations: ITERATIONS, salt: bytesToBase64(salt) }, cipher: { name: "AES-GCM", iv: bytesToBase64(iv) }, ciphertext: bytesToBase64(new Uint8Array(ciphertext)) };
  return JSON.stringify(envelope);
}

export async function decryptSavedRecords(text: string, passphrase: string): Promise<AdLibraryRecord[]> {
  validatePassphrase(passphrase);
  const envelope = parseEnvelope(text);
  try {
    const salt = base64ToBytes(envelope.kdf.salt, 16);
    const iv = base64ToBytes(envelope.cipher.iv, 12);
    const ciphertext = base64ToBytes(envelope.ciphertext);
    if (ciphertext.length < 16) throw new Error("Invalid ciphertext.");
    const key = await deriveKey(passphrase, salt, "decrypt");
    const plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv: toArrayBuffer(iv), additionalData: ADDITIONAL_DATA }, key, toArrayBuffer(ciphertext));
    if (plaintext.byteLength > 5_000_000) throw new Error("Invalid plaintext.");
    const value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(plaintext)) as unknown;
    const records = decodeSavedRecords(value);
    if (!value || typeof value !== "object" || !Array.isArray((value as { records?: unknown }).records) || records.length !== (value as { records: unknown[] }).records.length) throw new Error("Invalid records.");
    return records;
  } catch {
    throw new Error("Backup could not be decrypted. Check the passphrase and file.");
  }
}
