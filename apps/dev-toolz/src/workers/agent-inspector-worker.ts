/// <reference lib="webworker" />

import { scanAgentTraffic, type AgentInspectorQuery, type AgentInspectorResult } from "../lib/agent-inspector";

type WorkerRequest = { type: "scan"; query: AgentInspectorQuery };
type WorkerResponse =
  | { type: "progress"; scanned: number }
  | { type: "result"; result: AgentInspectorResult }
  | { type: "error"; message: string };

self.addEventListener("message", (event: MessageEvent<WorkerRequest>) => {
  if (event.data?.type !== "scan") return;
  void scanAgentTraffic(event.data.query, undefined, (scanned) => {
    self.postMessage({ type: "progress", scanned } satisfies WorkerResponse);
  }).then((result) => {
    self.postMessage({ type: "result", result } satisfies WorkerResponse);
  }).catch((error: unknown) => {
    self.postMessage({
      type: "error",
      message: error instanceof Error ? error.message : "Agent traffic inspection failed",
    } satisfies WorkerResponse);
  });
});
