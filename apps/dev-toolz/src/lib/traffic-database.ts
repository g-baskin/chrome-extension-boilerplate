export const TRAFFIC_DATABASE_NAME = "dev-toolz";
export const TRAFFIC_DATABASE_VERSION = 4;
export const API_TRAFFIC_STORE = "api-traffic";
export const PROTOCOL_EVENTS_STORE = "protocol-events";
export const RACE_FLOWS_STORE = "race-flows";
export const PURPLE_FLOWS_STORE = "purple-flows";
export const PURPLE_RUNS_STORE = "purple-runs";
export const API_LOG_TIME_INDEX = "log-time";
export const PROTOCOL_LOG_TIME_INDEX = "log-time";

export function openTrafficDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(TRAFFIC_DATABASE_NAME, TRAFFIC_DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      const transaction = request.transaction;
      if (!transaction) return;
      const apiStore = database.objectStoreNames.contains(API_TRAFFIC_STORE)
        ? transaction.objectStore(API_TRAFFIC_STORE)
        : database.createObjectStore(API_TRAFFIC_STORE, {
            keyPath: "sequence",
            autoIncrement: true,
          });
      if (!apiStore.indexNames.contains(API_LOG_TIME_INDEX)) {
        apiStore.createIndex(API_LOG_TIME_INDEX, ["startedAt", "sequence"]);
      }
      const protocolStore = database.objectStoreNames.contains(PROTOCOL_EVENTS_STORE)
        ? transaction.objectStore(PROTOCOL_EVENTS_STORE)
        : database.createObjectStore(PROTOCOL_EVENTS_STORE, {
            keyPath: "sequence",
            autoIncrement: true,
          });
      if (!protocolStore.indexNames.contains(PROTOCOL_LOG_TIME_INDEX)) {
        protocolStore.createIndex(PROTOCOL_LOG_TIME_INDEX, ["timestamp", "sequence"]);
      }
      if (!database.objectStoreNames.contains(RACE_FLOWS_STORE)) {
        database.createObjectStore(RACE_FLOWS_STORE, { keyPath: "id" });
      }
      if (!database.objectStoreNames.contains(PURPLE_FLOWS_STORE)) {
        database.createObjectStore(PURPLE_FLOWS_STORE, { keyPath: "id" });
      }
      if (!database.objectStoreNames.contains(PURPLE_RUNS_STORE)) {
        database.createObjectStore(PURPLE_RUNS_STORE, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Could not open traffic database"));
    request.onblocked = () => reject(new Error("Traffic database upgrade is blocked"));
  });
}
