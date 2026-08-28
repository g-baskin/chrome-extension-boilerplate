import type { LogHistoryQuery, LogHistoryResult } from "./log-history";

type WorkerResponse =
  | { type: "progress"; scanned: number }
  | { type: "result"; result: LogHistoryResult }
  | { type: "error"; message: string };

export function queryLogHistoryOffThread(
  query: LogHistoryQuery,
  signal?: AbortSignal,
  onProgress?: (scanned: number) => void
): Promise<LogHistoryResult> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL("../workers/log-history-worker.ts", import.meta.url), {
      type: "module",
    });
    const abort = () => {
      cleanup();
      reject(new DOMException("Log history search was cancelled", "AbortError"));
    };
    const cleanup = () => {
      signal?.removeEventListener("abort", abort);
      worker.terminate();
    };
    worker.addEventListener("message", (event: MessageEvent<WorkerResponse>) => {
      if (event.data.type === "progress") {
        onProgress?.(event.data.scanned);
        return;
      }
      cleanup();
      if (event.data.type === "result") resolve(event.data.result);
      else reject(new Error(event.data.message));
    });
    worker.addEventListener("error", (event) => {
      cleanup();
      reject(new Error(event.message || "Log history worker failed"));
    });
    if (signal?.aborted) abort();
    else {
      signal?.addEventListener("abort", abort, { once: true });
      worker.postMessage({ type: "query", query });
    }
  });
}
