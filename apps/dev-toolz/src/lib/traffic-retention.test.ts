import "fake-indexeddb/auto";
import { afterEach, describe, expect, it } from "vitest";
import {
  API_TRAFFIC_STORE,
  openTrafficDatabase,
  PROTOCOL_EVENTS_STORE,
  TRAFFIC_DATABASE_NAME,
} from "./traffic-database";
import { enforceTrafficRetention } from "./traffic-retention";

function deleteDatabase(): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(TRAFFIC_DATABASE_NAME);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

afterEach(deleteDatabase);

async function seed(storeName: string, count: number): Promise<void> {
  const database = await openTrafficDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(storeName, "readwrite");
    const store = transaction.objectStore(storeName);
    for (let index = 0; index < count; index += 1) {
      const timestamp = new Date(Date.UTC(2026, 7, 28, 12, index)).toISOString();
      store.add(storeName === API_TRAFFIC_STORE ? { startedAt: timestamp } : { timestamp });
    }
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
  database.close();
}

async function keys(storeName: string): Promise<IDBValidKey[]> {
  const database = await openTrafficDatabase();
  const result = await new Promise<IDBValidKey[]>((resolve, reject) => {
    const request = database.transaction(storeName).objectStore(storeName).getAllKeys();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  database.close();
  return result;
}

describe("traffic retention", () => {
  it("count-checks and evicts only the oldest records from each source", async () => {
    await seed(API_TRAFFIC_STORE, 4);
    await seed(PROTOCOL_EVENTS_STORE, 3);

    await enforceTrafficRetention({ maxPerSource: 2, storagePressure: false });

    expect(await keys(API_TRAFFIC_STORE)).toEqual([3, 4]);
    expect(await keys(PROTOCOL_EVENTS_STORE)).toEqual([2, 3]);
  });

  it("prunes a bounded oldest batch under storage pressure", async () => {
    await seed(API_TRAFFIC_STORE, 20);
    await seed(PROTOCOL_EVENTS_STORE, 20);

    await enforceTrafficRetention({ maxPerSource: 50, storagePressure: true });

    expect((await keys(API_TRAFFIC_STORE))[0]).toBe(2);
    expect((await keys(PROTOCOL_EVENTS_STORE))[0]).toBe(2);
  });
});
