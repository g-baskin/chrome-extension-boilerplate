import type { ApiExchange } from "./api-traffic";
import {
  createApiLogRecord,
  createApiMetadataLogRecord,
  createProtocolLogRecord,
  expressionRequiresExtractedFields,
  LOG_SEARCH_LIMITS,
  matchesLogRecord,
  parseLogQuery,
  type DetectionExpression,
  type LogRecord,
  type LogSourceFilter,
} from "./log-search";
import type { ProtocolEvent } from "./protocol-traffic";
import {
  API_LOG_TIME_INDEX,
  API_TRAFFIC_STORE,
  openTrafficDatabase,
  PROTOCOL_EVENTS_STORE,
  PROTOCOL_LOG_TIME_INDEX,
} from "./traffic-database";

export const LOG_HISTORY_MAX_PER_SOURCE = 50_000;
const PROGRESS_INTERVAL = 500;

export type LogHistoryQuery = {
  rawQuery: string;
  source: LogSourceFilter;
  earliestTimestamp: number | null;
  latestTimestamp: number | null;
};

export type LogHistoryResult = {
  records: LogRecord[];
  expression: DetectionExpression | null;
  error: string | null;
  matching: number;
  scanned: number;
};

type StoredLogSource = {
  store: typeof API_TRAFFIC_STORE | typeof PROTOCOL_EVENTS_STORE;
  index: typeof API_LOG_TIME_INDEX | typeof PROTOCOL_LOG_TIME_INDEX;
  toSearchRecord: (value: ApiExchange | ProtocolEvent) => LogRecord;
  toDisplayRecord: (value: ApiExchange | ProtocolEvent, searchRecord: LogRecord) => LogRecord;
};

const API_SOURCE: StoredLogSource = {
  store: API_TRAFFIC_STORE,
  index: API_LOG_TIME_INDEX,
  toSearchRecord: (value) => createApiMetadataLogRecord(value as ApiExchange),
  toDisplayRecord: (value) => createApiLogRecord(value as ApiExchange),
};
const PROTOCOL_SOURCE: StoredLogSource = {
  store: PROTOCOL_EVENTS_STORE,
  index: PROTOCOL_LOG_TIME_INDEX,
  toSearchRecord: (value) => createProtocolLogRecord(value as ProtocolEvent),
  toDisplayRecord: (_value, searchRecord) => searchRecord,
};

export async function queryLogHistory(
  query: LogHistoryQuery,
  signal?: AbortSignal,
  onProgress?: (scanned: number) => void
): Promise<LogHistoryResult> {
  const parsed = parseLogQuery(query.rawQuery);
  if (parsed.error) {
    return { records: [], expression: null, error: parsed.error, matching: 0, scanned: 0 };
  }
  const records: LogRecord[] = [];
  let matching = 0;
  let scanned = 0;
  const requiresExtractedFields = expressionRequiresExtractedFields(parsed.expression);
  const sources = query.source === "api"
    ? [API_SOURCE]
    : query.source === "red-team"
      ? [PROTOCOL_SOURCE]
      : [API_SOURCE, PROTOCOL_SOURCE];

  await Promise.all(sources.map((source) => scanSource(source, query, signal, (value) => {
    scanned += 1;
    const searchRecord = requiresExtractedFields
      ? source.toDisplayRecord(value, source.toSearchRecord(value))
      : source.toSearchRecord(value);
    if (matchesLogRecord(searchRecord, parsed.expression, query.source, query.earliestTimestamp, query.latestTimestamp)) {
      matching += 1;
      if (wouldRetain(records, searchRecord)) {
        insertNewest(records, source.toDisplayRecord(value, searchRecord));
      }
    }
    if (scanned % PROGRESS_INTERVAL === 0) onProgress?.(scanned);
  })));

  return { records, expression: parsed.expression, error: null, matching, scanned };
}

function scanSource(
  source: StoredLogSource,
  query: LogHistoryQuery,
  signal: AbortSignal | undefined,
  visit: (value: ApiExchange | ProtocolEvent) => void
): Promise<void> {
  return openTrafficDatabase().then((database) => new Promise((resolve, reject) => {
    let scanned = 0;
    const transaction = database.transaction(source.store, "readonly");
    const store = transaction.objectStore(source.store);
    const range = createTimeRange(query.earliestTimestamp, query.latestTimestamp);
    const request = range
      ? store.index(source.index).openCursor(range, "prev")
      : store.openCursor(null, "prev");
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor || scanned >= LOG_HISTORY_MAX_PER_SOURCE || signal?.aborted) return;
      scanned += 1;
      visit(cursor.value as ApiExchange | ProtocolEvent);
      cursor.continue();
    };
    request.onerror = () => reject(request.error ?? new Error(`Could not search ${source.store}`));
    transaction.oncomplete = () => {
      database.close();
      resolve();
    };
    transaction.onerror = () => {
      database.close();
      reject(transaction.error ?? new Error(`Could not search ${source.store}`));
    };
  }));
}

function createTimeRange(earliest: number | null, latest: number | null): IDBKeyRange | null {
  const lower = earliest === null ? null : [new Date(earliest).toISOString(), 0];
  const upper = latest === null ? null : [new Date(latest).toISOString(), Number.MAX_SAFE_INTEGER];
  if (lower && upper) return IDBKeyRange.bound(lower, upper);
  if (lower) return IDBKeyRange.lowerBound(lower);
  if (upper) return IDBKeyRange.upperBound(upper);
  return null;
}

function wouldRetain(records: LogRecord[], record: LogRecord): boolean {
  if (records.length < LOG_SEARCH_LIMITS.results) return true;
  return Date.parse(record.timestamp) >= Date.parse(records[records.length - 1]?.timestamp ?? "");
}

function insertNewest(records: LogRecord[], record: LogRecord): void {
  const timestamp = Date.parse(record.timestamp);
  let low = 0;
  let high = records.length;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (Date.parse(records[middle]?.timestamp ?? "") >= timestamp) low = middle + 1;
    else high = middle;
  }
  records.splice(low, 0, record);
  if (records.length > LOG_SEARCH_LIMITS.results) records.pop();
}
