import { describe, expect, it, vi } from "vitest";
import type { ApiBody, ApiExchange } from "./api-traffic";
import {
  AGENT_PROTOCOL_LIMITS,
  inspectAgentProtocol,
  inspectAgentSseEvent,
  sanitizeAgentValue,
} from "./agent-protocol";
import type { ProtocolEvent } from "./protocol-traffic";

function json(value: unknown): ApiBody { return { kind: "json", value }; }
function exchange(request: unknown, response: unknown, options: Partial<ApiExchange> = {}): ApiExchange {
  return {
    sequence: 7,
    startedAt: "2026-08-28T12:00:00.000Z",
    durationMs: 4,
    request: { method: "POST", url: "https://agent.test/rpc", mimeType: "application/json", headers: [], body: json(request) },
    response: { status: 200, statusText: "OK", mimeType: "application/json", headers: [], body: json(response) },
    ...options,
  };
}

describe("agent protocol inspection", () => {
  it("normalizes an evidence-linked MCP lifecycle, tools, calls, errors, and exact signals", () => {
    const initialized = inspectAgentProtocol(exchange(
      { jsonrpc: "2.0", id: "1", method: "initialize", params: { protocolVersion: "2026-07-28" } },
      { jsonrpc: "2.0", id: "1", result: { protocolVersion: "2026-07-28", capabilities: { tools: { listChanged: true }, resources: {} } } },
    ));
    expect(initialized?.protocols).toEqual(["mcp"]);
    expect(initialized?.capabilities.map((item) => [item.name, item.triggeringField])).toEqual([
      ["tools", "response.result.capabilities.tools"], ["resources", "response.result.capabilities.resources"],
    ]);
    expect(initialized?.timeline[0]?.evidence).toMatchObject({ sequence: 7, source: "request", path: "request" });

    const resources = inspectAgentProtocol(exchange(
      { jsonrpc: "2.0", id: "r", method: "resources/list" },
      { jsonrpc: "2.0", id: "r", result: { resources: [{ uri: "file:///local/readme.txt", name: "Readme" }] } },
    ));
    expect(resources?.capabilities[0]).toMatchObject({ name: "Readme", triggeringField: "response.result.resources[0].name" });

    const called = inspectAgentProtocol(exchange(
      { jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "write_file", arguments: { path: "/tmp/a", authorization: "Bearer exposed" } } },
      { jsonrpc: "2.0", id: 2, result: { isError: true, content: [{ type: "text", text: "failed" }] } },
    ));
    expect(called?.timeline[0]).toMatchObject({ kind: "tool-call", detail: "write_file" });
    expect(called?.signals).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "credential", triggeringField: "request.params.arguments.authorization", value: "<redacted>" }),
      expect.objectContaining({ kind: "file", triggeringField: "request.params.name" }),
      expect.objectContaining({ kind: "tool-result-error", triggeringField: "response.result.isError" }),
    ]));
    expect(JSON.stringify(called)).not.toContain("exposed");
  });

  it("keeps unknown JSON-RPC and lookalike REST responses ordinary", () => {
    expect(inspectAgentProtocol(exchange({ jsonrpc: "2.0", id: 1, method: "company/deleteAll" }, { result: {} }))).toBeNull();
    const lookalike = exchange(null, { id: "not-a-task", title: "ordinary" });
    lookalike.request.method = "GET";
    lookalike.request.url = "https://example.test/tasks/not-a-task";
    lookalike.request.body = null;
    expect(inspectAgentProtocol(lookalike)).toBeNull();
  });

  it("recognizes a strict A2A 1.0 Agent Card and REST task status without following URLs", () => {
    const card = exchange(null, {
      name: "Recipe agent", description: "Recipes", version: "1.0.0",
      supportedInterfaces: [{ url: "https://do-not-follow.invalid", protocolBinding: "JSONRPC" }],
      capabilities: { streaming: true, extendedAgentCard: true },
      defaultInputModes: ["text/plain"], defaultOutputModes: ["text/plain"],
      skills: [{ id: "cook", name: "Cook", description: "Cook", tags: ["food"] }],
    });
    card.request.method = "GET";
    card.request.url = "https://agent.test/.well-known/agent-card.json";
    card.request.body = null;
    const result = inspectAgentProtocol(card);
    expect(result?.protocols).toEqual(["a2a"]);
    expect(result?.capabilities).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "streaming", triggeringField: "response.capabilities.streaming" }),
      expect.objectContaining({ name: "Cook", triggeringField: "response.skills[0].name" }),
    ]));

    const task = exchange(null, { id: "task-1", contextId: "ctx", status: { state: "TASK_STATE_WORKING", timestamp: "2026-08-28T12:00:00Z" } });
    task.request.method = "GET"; task.request.url = "https://agent.test/tasks/task-1"; task.request.body = null;
    expect(inspectAgentProtocol(task)?.timeline[0]).toMatchObject({ kind: "task", id: "task-1", state: "TASK_STATE_WORKING" });

    const tasks = exchange(null, { tasks: [
      { id: "task-2", status: { state: "TASK_STATE_SUBMITTED" } },
      { id: "task-3", status: { state: "TASK_STATE_FAILED" } },
    ] });
    tasks.request.method = "GET"; tasks.request.url = "https://agent.test/tasks"; tasks.request.body = null;
    expect(inspectAgentProtocol(tasks)?.timeline.map((item) => item.id)).toEqual(["task-2", "task-3"]);
  });

  it("normalizes A2A SSE status and artifact events and ignores malformed/binary input", () => {
    const base: ProtocolEvent = {
      sessionId: "s", pageUrl: "https://page.test", url: "https://agent.test/message:stream", transport: "sse",
      kind: "message", direction: "received", timestamp: "2026-08-28T12:00:01Z", payloadBytes: 1, truncated: false, binary: false,
      payload: "data: {\"taskId\":\"t1\",\"status\":{\"state\":\"TASK_STATE_COMPLETED\"}}\n\ndata: {\"taskId\":\"t1\",\"artifact\":{\"artifactId\":\"a1\",\"name\":\"answer\",\"parts\":[{\"text\":\"ok\"}]}}\n\n",
    };
    const result = inspectAgentSseEvent(base, "a2a");
    expect(result?.timeline).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "status", id: "t1", state: "TASK_STATE_COMPLETED" }),
      expect.objectContaining({ kind: "artifact", id: "a1" }),
    ]));
    expect(inspectAgentSseEvent({ ...base, binary: true }, "a2a")).toBeNull();
    expect(inspectAgentSseEvent({ ...base, payload: "data: {bad}\n\n" }, "a2a")).toBeNull();
    expect(inspectAgentSseEvent({ ...base, payload: "data: {\"ordinary\":true}\n\n" }, "a2a")).toBeNull();

    const subscription = exchange(null, null);
    subscription.request.method = "GET";
    subscription.request.url = "https://agent.test/tasks/t1:subscribe";
    subscription.request.body = null;
    subscription.response.mimeType = "text/event-stream";
    subscription.response.body = { kind: "text", raw: "data: {\"taskId\":\"t1\",\"status\":{\"state\":\"TASK_STATE_WORKING\"}}\n\n" };
    expect(inspectAgentProtocol(subscription)?.timeline[0]).toMatchObject({ kind: "status", id: "t1", state: "TASK_STATE_WORKING" });
  });
});

describe("agent parser bounds and redaction", () => {
  it("redacts key- and value-shaped secrets before output", () => {
    expect(sanitizeAgentValue({ password: "p", note: "Bearer abc.def.ghi", safe: "hello" })).toEqual({
      password: "<redacted>", note: "<redacted>", safe: "hello",
    });
  });

  it("rejects deep and oversized values and does not invoke accessor properties", () => {
    let deep: Record<string, unknown> = {};
    for (let i = 0; i < AGENT_PROTOCOL_LIMITS.depth + 2; i += 1) deep = { next: deep };
    expect(sanitizeAgentValue(deep)).toBeNull();
    expect(sanitizeAgentValue("x".repeat(AGENT_PROTOCOL_LIMITS.bytes + 1))).toBeNull();

    const getter = vi.fn(() => "secret");
    const hostile = Object.defineProperty({ safe: "ok" }, "password", { enumerable: true, get: getter });
    expect(sanitizeAgentValue(hostile)).toEqual({ safe: "ok" });
    expect(getter).not.toHaveBeenCalled();
  });

  it("flags oversized tool arguments without returning their content", () => {
    const huge = "x".repeat(AGENT_PROTOCOL_LIMITS.argumentBytes + 1);
    const result = inspectAgentProtocol(exchange(
      { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "summarize", arguments: { text: huge } } },
      { jsonrpc: "2.0", id: 1, result: { content: [{ type: "text", text: "ok" }] } },
    ));
    expect(result?.signals).toContainEqual(expect.objectContaining({ kind: "oversized-arguments", triggeringField: "request.params.arguments" }));
    expect(JSON.stringify(result)).not.toContain(huge);
  });
});
