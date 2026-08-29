import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentInspectorResult } from "./agent-inspector";
import { inspectAgentTrafficOffThread } from "./agent-inspector-client";

interface WorkerEvent {
  data?: unknown;
  message?: string;
}

type WorkerListener = (event: WorkerEvent) => void;

class FakeWorker {
  static instances: FakeWorker[] = [];

  readonly posted: unknown[] = [];
  readonly terminate = vi.fn();
  private readonly listeners = new Map<string, Set<WorkerListener>>();

  constructor() {
    FakeWorker.instances.push(this);
  }

  addEventListener(type: string, listener: WorkerListener): void {
    const listeners = this.listeners.get(type) ?? new Set<WorkerListener>();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  }

  removeEventListener(type: string, listener: WorkerListener): void {
    this.listeners.get(type)?.delete(listener);
  }

  postMessage(message: unknown): void {
    this.posted.push(message);
  }

  emit(type: string, event: WorkerEvent): void {
    for (const listener of this.listeners.get(type) ?? []) listener(event);
  }
}

const result: AgentInspectorResult = {
  inspections: [],
  scannedApi: 3,
  scannedProtocol: 2,
  apiResultLimitReached: false,
  protocolResultLimitReached: false,
  apiRecordLimitReached: false,
  protocolRecordLimitReached: false,
};

describe("Agent Inspector worker client", () => {
  beforeEach(() => {
    FakeWorker.instances = [];
    vi.stubGlobal("Worker", FakeWorker);
  });

  afterEach(() => vi.unstubAllGlobals());

  it("returns worker results, reports progress, and terminates the worker", async () => {
    const progress = vi.fn();
    const pending = inspectAgentTrafficOffThread({ pageHostname: null }, undefined, progress);
    const worker = FakeWorker.instances[0];
    expect(worker?.posted).toEqual([{ type: "scan", query: { pageHostname: null } }]);

    worker?.emit("message", { data: { type: "progress", scanned: 5 } });
    worker?.emit("message", { data: { type: "result", result } });

    await expect(pending).resolves.toEqual(result);
    expect(progress).toHaveBeenCalledWith(5);
    expect(worker?.terminate).toHaveBeenCalledOnce();
  });

  it("terminates and rejects with AbortError when cancelled", async () => {
    const controller = new AbortController();
    const pending = inspectAgentTrafficOffThread({ pageHostname: "example.test" }, controller.signal);
    const worker = FakeWorker.instances[0];

    controller.abort();

    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    expect(worker?.terminate).toHaveBeenCalledOnce();
  });

  it("terminates and surfaces worker failures", async () => {
    const pending = inspectAgentTrafficOffThread({ pageHostname: null });
    const worker = FakeWorker.instances[0];

    worker?.emit("error", { message: "worker exploded" });

    await expect(pending).rejects.toThrow("worker exploded");
    expect(worker?.terminate).toHaveBeenCalledOnce();
  });
});
