import type { AgentInspectorQuery, AgentInspectorResult } from "./agent-inspector";

type WorkerResponse =
  | { type: "progress"; scanned: number }
  | { type: "result"; result: AgentInspectorResult }
  | { type: "error"; message: string };

export function inspectAgentTrafficOffThread(
  query: AgentInspectorQuery,
  signal?: AbortSignal,
  onProgress?: (scanned: number) => void
): Promise<AgentInspectorResult> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL("../workers/agent-inspector-worker.ts", import.meta.url), {
      type: "module",
    });
    const abort = () => {
      cleanup();
      reject(new DOMException("Agent traffic inspection was cancelled", "AbortError"));
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
      reject(new Error(event.message || "Agent traffic inspection worker failed"));
    });
    if (signal?.aborted) abort();
    else {
      signal?.addEventListener("abort", abort, { once: true });
      worker.postMessage({ type: "scan", query });
    }
  });
}
