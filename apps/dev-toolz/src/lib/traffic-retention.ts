import {
  API_TRAFFIC_STORE,
  openTrafficDatabase,
  PROTOCOL_EVENTS_STORE,
} from "./traffic-database";

export const TRAFFIC_RETENTION_PER_SOURCE = 50_000;
export const TRAFFIC_RETENTION_BYTE_CEILING = 250 * 1024 * 1024;
const STORAGE_PRESSURE_DELETE_PER_SOURCE = 250;
const STORAGE_PRESSURE_CHECK_INTERVAL_MS = 30_000;
const RETENTION_WRITE_INTERVAL = 100;

let retentionQueue: Promise<void> = Promise.resolve();
let lastStoragePressureCheck = 0;
let writesSinceRetention = 0;

export function enforceTrafficRetention(options?: {
  maxPerSource?: number;
  storagePressure?: boolean;
}): Promise<void> {
  if (!options) {
    writesSinceRetention += 1;
    if (writesSinceRetention < RETENTION_WRITE_INTERVAL) return Promise.resolve();
    writesSinceRetention = 0;
  }
  const run = retentionQueue.then(() => enforceNow(options));
  retentionQueue = run.catch(() => undefined);
  return run;
}

async function enforceNow(options?: {
  maxPerSource?: number;
  storagePressure?: boolean;
}): Promise<void> {
  const maxPerSource = options?.maxPerSource ?? TRAFFIC_RETENTION_PER_SOURCE;
  const storagePressure = options?.storagePressure ?? await exceedsStorageCeiling();
  const database = await openTrafficDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(
      [API_TRAFFIC_STORE, PROTOCOL_EVENTS_STORE],
      "readwrite"
    );
    for (const storeName of [API_TRAFFIC_STORE, PROTOCOL_EVENTS_STORE]) {
      const store = transaction.objectStore(storeName);
      const countRequest = store.count();
      countRequest.onsuccess = () => {
        const overflow = Math.max(0, countRequest.result - maxPerSource);
        const retained = countRequest.result - overflow;
        const pressureDelete = storagePressure
          ? Math.min(STORAGE_PRESSURE_DELETE_PER_SOURCE, Math.max(1, Math.ceil(retained * 0.05)))
          : 0;
        deleteOldest(store, overflow + pressureDelete);
      };
    }
    transaction.oncomplete = () => {
      database.close();
      resolve();
    };
    transaction.onerror = () => {
      database.close();
      reject(transaction.error ?? new Error("Could not enforce traffic retention"));
    };
  });
}

async function exceedsStorageCeiling(): Promise<boolean> {
  if (typeof navigator === "undefined" || !navigator.storage?.estimate) return false;
  const now = Date.now();
  if (now - lastStoragePressureCheck < STORAGE_PRESSURE_CHECK_INTERVAL_MS) return false;
  lastStoragePressureCheck = now;
  const estimate = await navigator.storage.estimate();
  return (estimate.usage ?? 0) > TRAFFIC_RETENTION_BYTE_CEILING;
}

function deleteOldest(store: IDBObjectStore, limit: number): void {
  if (limit <= 0) return;
  let deleted = 0;
  const request = store.openCursor();
  request.onsuccess = () => {
    const cursor = request.result;
    if (!cursor || deleted >= limit) return;
    cursor.delete();
    deleted += 1;
    cursor.continue();
  };
}
