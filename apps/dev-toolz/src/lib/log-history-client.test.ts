import { afterEach, describe, expect, it, vi } from "vitest";
import { queryLogHistoryOffThread } from "./log-history-client";

class FakeWorker {
  static latest: FakeWorker | null = null;
  readonly listeners = new Map<string, Array<(event: { data?: unknown; message?: string }) => void>>();
  posted: unknown = null;
  terminated = false;

  constructor() {
    FakeWorker.latest = this;
  }

  addEventListener(type: string, listener: (event: { data?: unknown; message?: string }) => void): void {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
  }

  postMessage(value: unknown): void {
    this.posted = value;
  }

  terminate(): void {
    this.terminated = true;
  }

  emit(type: string, event: { data?: unknown; message?: string }): void {
    for (const listener of this.listeners.get(type) ?? []) listener(event);
  }
}

const query = {
  rawQuery: "method=POST",
  source: "api" as const,
  earliestTimestamp: null,
  latestTimestamp: null,
};

describe("off-thread log history client", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    FakeWorker.latest = null;
  });

  it("delegates history work to a worker and forwards bounded progress", async () => {
    vi.stubGlobal("Worker", FakeWorker);
    const progress = vi.fn();
    const pending = queryLogHistoryOffThread(query, undefined, progress);
    const worker = FakeWorker.latest;
    expect(worker?.posted).toEqual({ type: "query", query });
    worker?.emit("message", { data: { type: "progress", scanned: 500 } });
    worker?.emit("message", {
      data: {
        type: "result",
        result: { records: [], expression: null, error: null, matching: 0, scanned: 500 },
      },
    });

    await expect(pending).resolves.toMatchObject({ scanned: 500 });
    expect(progress).toHaveBeenCalledWith(500);
    expect(worker?.terminated).toBe(true);
  });

  it("terminates in-flight work when a newer search aborts it", async () => {
    vi.stubGlobal("Worker", FakeWorker);
    const controller = new AbortController();
    const pending = queryLogHistoryOffThread(query, controller.signal);
    const worker = FakeWorker.latest;

    controller.abort();

    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    expect(worker?.terminated).toBe(true);
  });
});
