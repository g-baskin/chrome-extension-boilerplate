export const TRAFFIC_DATABASE_NAME = "dev-toolz";
export const TRAFFIC_DATABASE_VERSION = 2;
export const API_TRAFFIC_STORE = "api-traffic";
export const PROTOCOL_EVENTS_STORE = "protocol-events";
export const RACE_FLOWS_STORE = "race-flows";

export function openTrafficDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(TRAFFIC_DATABASE_NAME, TRAFFIC_DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(API_TRAFFIC_STORE)) {
        database.createObjectStore(API_TRAFFIC_STORE, {
          keyPath: "sequence",
          autoIncrement: true,
        });
      }
      if (!database.objectStoreNames.contains(PROTOCOL_EVENTS_STORE)) {
        database.createObjectStore(PROTOCOL_EVENTS_STORE, {
          keyPath: "sequence",
          autoIncrement: true,
        });
      }
      if (!database.objectStoreNames.contains(RACE_FLOWS_STORE)) {
        database.createObjectStore(RACE_FLOWS_STORE, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Could not open traffic database"));
    request.onblocked = () => reject(new Error("Traffic database upgrade is blocked"));
  });
}
