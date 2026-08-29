import "fake-indexeddb/auto";
import { afterEach, describe, expect, it } from "vitest";
import {
  API_LOG_TIME_INDEX,
  API_TRAFFIC_STORE,
  openTrafficDatabase,
  PROTOCOL_EVENTS_STORE,
  PROTOCOL_LOG_TIME_INDEX,
  PURPLE_FLOWS_STORE,
  PURPLE_RUNS_STORE,
  RACE_FLOWS_STORE,
  TRAFFIC_DATABASE_NAME,
} from "./traffic-database";

function deleteDatabase(): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(TRAFFIC_DATABASE_NAME);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

afterEach(deleteDatabase);

describe("openTrafficDatabase", () => {
  it("creates every store for a fresh database", async () => {
    const database = await openTrafficDatabase();
    expect([...database.objectStoreNames]).toEqual([
      API_TRAFFIC_STORE,
      PROTOCOL_EVENTS_STORE,
      PURPLE_FLOWS_STORE,
      PURPLE_RUNS_STORE,
      RACE_FLOWS_STORE,
    ]);
    const transaction = database.transaction([API_TRAFFIC_STORE, PROTOCOL_EVENTS_STORE]);
    expect([...transaction.objectStore(API_TRAFFIC_STORE).indexNames]).toContain(API_LOG_TIME_INDEX);
    expect([...transaction.objectStore(PROTOCOL_EVENTS_STORE).indexNames]).toContain(PROTOCOL_LOG_TIME_INDEX);
    database.close();
  });

  it("preserves version-one traffic while adding stores", async () => {
    const original = { startedAt: "2026-08-28T00:00:00.000Z" };
    const legacy = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(TRAFFIC_DATABASE_NAME, 1);
      request.onupgradeneeded = () => {
        request.result.createObjectStore(API_TRAFFIC_STORE, {
          keyPath: "sequence",
          autoIncrement: true,
        });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    await new Promise<void>((resolve, reject) => {
      const transaction = legacy.transaction(API_TRAFFIC_STORE, "readwrite");
      transaction.objectStore(API_TRAFFIC_STORE).add(original);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
    legacy.close();

    const upgraded = await openTrafficDatabase();
    const stored = await new Promise<Record<string, unknown>>((resolve, reject) => {
      const request = upgraded.transaction(API_TRAFFIC_STORE).objectStore(API_TRAFFIC_STORE).get(1);
      request.onsuccess = () => resolve(request.result as Record<string, unknown>);
      request.onerror = () => reject(request.error);
    });
    expect(stored).toMatchObject(original);
    expect([...upgraded.objectStoreNames]).toContain(PROTOCOL_EVENTS_STORE);
    expect([...upgraded.objectStoreNames]).toContain(RACE_FLOWS_STORE);
    const transaction = upgraded.transaction([API_TRAFFIC_STORE, PROTOCOL_EVENTS_STORE]);
    expect([...transaction.objectStore(API_TRAFFIC_STORE).indexNames]).toContain(API_LOG_TIME_INDEX);
    expect([...transaction.objectStore(PROTOCOL_EVENTS_STORE).indexNames]).toContain(PROTOCOL_LOG_TIME_INDEX);
    upgraded.close();
  });

  it("preserves version-three stores and records while adding Purple stores", async () => {
    const legacy = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(TRAFFIC_DATABASE_NAME, 3);
      request.onupgradeneeded = () => {
        request.result.createObjectStore(API_TRAFFIC_STORE, { keyPath: "sequence", autoIncrement: true });
        request.result.createObjectStore(PROTOCOL_EVENTS_STORE, { keyPath: "sequence", autoIncrement: true });
        request.result.createObjectStore(RACE_FLOWS_STORE, { keyPath: "id" });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    await new Promise<void>((resolve, reject) => {
      const transaction = legacy.transaction(RACE_FLOWS_STORE, "readwrite");
      transaction.objectStore(RACE_FLOWS_STORE).put({ id: "race-1", name: "keep me" });
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
    legacy.close();

    const upgraded = await openTrafficDatabase();
    expect([...upgraded.objectStoreNames]).toEqual([
      API_TRAFFIC_STORE,
      PROTOCOL_EVENTS_STORE,
      PURPLE_FLOWS_STORE,
      PURPLE_RUNS_STORE,
      RACE_FLOWS_STORE,
    ]);
    const preserved = await new Promise<Record<string, unknown>>((resolve, reject) => {
      const request = upgraded.transaction(RACE_FLOWS_STORE).objectStore(RACE_FLOWS_STORE).get("race-1");
      request.onsuccess = () => resolve(request.result as Record<string, unknown>);
      request.onerror = () => reject(request.error);
    });
    expect(preserved).toEqual({ id: "race-1", name: "keep me" });
    upgraded.close();
  });
});
