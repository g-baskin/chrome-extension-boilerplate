/// <reference lib="webworker" />

import { queryLogHistory, type LogHistoryQuery } from "../lib/log-history";

type WorkerRequest = { type: "query"; query: LogHistoryQuery };
type WorkerResponse =
  | { type: "progress"; scanned: number }
  | { type: "result"; result: Awaited<ReturnType<typeof queryLogHistory>> }
  | { type: "error"; message: string };

self.addEventListener("message", (event: MessageEvent<WorkerRequest>) => {
  if (event.data?.type !== "query") return;
  void queryLogHistory(event.data.query, undefined, (scanned) => {
    self.postMessage({ type: "progress", scanned } satisfies WorkerResponse);
  }).then((result) => {
    self.postMessage({ type: "result", result } satisfies WorkerResponse);
  }).catch((error: unknown) => {
    self.postMessage({
      type: "error",
      message: error instanceof Error ? error.message : "Indexed history search failed",
    } satisfies WorkerResponse);
  });
});
