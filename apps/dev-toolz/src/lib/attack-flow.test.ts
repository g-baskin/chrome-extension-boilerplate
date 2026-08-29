import { describe, expect, it } from "vitest";
import { createAttackFlowGraph, exportAttackFlowBundle, MAX_ATTACK_FLOW_NODES, validateAttackFlowGraph } from "./attack-flow";
import type { PurpleFlow, PurpleRun } from "./purple-flow";

const flow: PurpleFlow = {
  id: "flow-1", name: "Credential access exercise", origin: "https://lab.example",
  source: "capture", createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-02T00:00:00.000Z",
  expectedControls: [],
  attackAnnotations: [{ id: "annotation-1", stepId: "step-1", tacticId: "TA0006", tacticName: "Credential Access", techniqueId: "T1555", techniqueName: "Credentials from Password Stores" }],
  steps: [
    { id: "step-1", name: "Request challenge", capturedRequest: { exchangeSequence: 41, capturedPageUrl: "https://lab.example/page", method: "GET", url: "https://lab.example/api/challenge", headers: [], body: null, mimeType: null }, openApiOperation: null, expectation: { prevention: "allowed", detectionQuery: null, expectedStatus: 200, expectedStatusClass: null } },
    { id: "step-2", name: "Submit proof", capturedRequest: { exchangeSequence: 42, capturedPageUrl: "https://lab.example/page", method: "POST", url: "https://lab.example/api/proof", headers: [{ name: "Accept", value: "application/json" }], body: "{}", mimeType: "application/json" }, openApiOperation: null, expectation: { prevention: "blocked", detectionQuery: null, expectedStatus: null, expectedStatusClass: "4xx" } },
  ],
};

const run: PurpleRun = {
  id: "run-1", flowId: flow.id, flowName: flow.name, origin: flow.origin, identityDisplayName: "Browser",
  startedAt: "2026-01-03T00:00:00.000Z", completedAt: "2026-01-03T00:01:00.000Z", status: "completed",
  preventionScore: { met: 1, total: 2 }, detectionScore: { met: 1, total: 2 },
  steps: [
    { stepId: "step-1", preventionOutcome: "allowed", detectionOutcome: "detected", status: 200, responseLength: 2, responseSha256: "a".repeat(64), responseTruncated: false, evidenceSequenceIds: [101], error: null },
    { stepId: "step-2", preventionOutcome: "prevented", detectionOutcome: "missed", status: 403, responseLength: 0, responseSha256: "b".repeat(64), responseTruncated: false, evidenceSequenceIds: [], error: null },
  ],
};

function clone<T>(value: T): T { return structuredClone(value); }

describe("Attack Flow graph", () => {
  it("creates a deterministic ordered causal graph with assets, outcomes, and evidence", () => {
    const first = createAttackFlowGraph(flow, run);
    const second = createAttackFlowGraph(clone(flow), clone(run));
    expect(second).toEqual(first);
    const actions = first.nodes.filter((node) => node.type === "attack-action");
    const conditions = first.nodes.filter((node) => node.type === "attack-condition");
    expect(actions.map((node) => node.order)).toEqual([0, 1]);
    expect(first.nodes.filter((node) => node.type === "attack-asset")).toHaveLength(1);
    expect(conditions).toHaveLength(4);
    expect(actions[0]!.effectRefs).toEqual(expect.arrayContaining(conditions.slice(0, 2).map((node) => node.id)));
    expect(conditions[0]!.effectRefs).toEqual([actions[1]!.id]);
    expect(JSON.stringify(first)).not.toContain("/api/");
    expect(JSON.stringify(first)).not.toContain("Browser");
    expect(JSON.stringify(first)).not.toContain('"body"');
    expect(JSON.stringify(first)).toContain("capture-sequence:101");
  });

  it("links actions directly when no run evidence is supplied", () => {
    const graph = createAttackFlowGraph(flow);
    const actions = graph.nodes.filter((node) => node.type === "attack-action");
    expect(actions[0]!.effectRefs).toEqual([actions[1]!.id]);
    expect(graph.nodes.some((node) => node.type === "attack-condition")).toBe(false);
  });
});

describe("Attack Flow STIX 2.1 export", () => {
  it("exports one root and current Attack Flow 2.0 fields without captured payloads", () => {
    const bundle = exportAttackFlowBundle(createAttackFlowGraph(flow, run));
    expect(bundle.type).toBe("bundle");
    expect(bundle.objects.filter((object) => object.type === "attack-flow")).toHaveLength(1);
    const root = bundle.objects.find((object) => object.type === "attack-flow")!;
    expect(root).toMatchObject({ spec_version: "2.1", scope: "emulation-plan" });
    expect(root.start_refs).toHaveLength(1);
    const action = bundle.objects.find((object) => object.type === "attack-action" && object.technique_id === "T1555")!;
    expect(action).toMatchObject({ tactic_id: "TA0006", technique_id: "T1555" });
    expect((action.effect_refs as string[]).length).toBeGreaterThan(0);
    const serialized = JSON.stringify(bundle);
    expect(serialized).not.toContain("/api/");
    expect(serialized).not.toContain("Accept");
    expect(serialized).not.toContain("responseSha256");
  });
});

describe("Attack Flow validation stinger", () => {
  it("rejects empty, malformed, dangling, cyclic, unreachable, and oversized graphs", () => {
    expect(() => createAttackFlowGraph({ ...flow, steps: [] })).toThrow(/1–25 steps/i);
    const graph = createAttackFlowGraph(flow);
    expect(() => validateAttackFlowGraph({ ...graph, nodes: [] })).toThrow(/require/i);
    expect(() => validateAttackFlowGraph({ ...graph, id: "attack-flow--bad" })).toThrow(/root ID/i);
    const dangling = clone(graph); (dangling.nodes.find((node) => node.type === "attack-action") as { effectRefs: string[] }).effectRefs = ["attack-action--00000000-0000-4000-8000-000000000000"];
    expect(() => validateAttackFlowGraph(dangling)).toThrow(/dangling/i);
    const cyclic = clone(graph); const actions = cyclic.nodes.filter((node) => node.type === "attack-action"); (actions[1] as { effectRefs: string[] }).effectRefs = [actions[0]!.id];
    expect(() => validateAttackFlowGraph(cyclic)).toThrow(/cycle/i);
    const unreachable = clone(graph); unreachable.startRefs = [actions[1]!.id];
    expect(() => validateAttackFlowGraph(unreachable)).toThrow(/unreachable/i);
    const invalidEvidence = clone(graph); (invalidEvidence.nodes.find((node) => node.type === "attack-action") as { evidenceRefs: string[] }).evidenceRefs = ["capture-sequence:0"];
    expect(() => validateAttackFlowGraph(invalidEvidence)).toThrow(/evidence/i);
    expect(() => validateAttackFlowGraph({ ...graph, created: "2026-02-31T00:00:00Z" })).toThrow(/creation time/i);
    expect(() => validateAttackFlowGraph({ ...graph, nodes: Array.from({ length: MAX_ATTACK_FLOW_NODES + 1 }, () => graph.nodes[0]) })).toThrow(/128 nodes/i);
  });

  it("fails closed on hostile labels, mismatched runs, secret-like values, and invalid output graph edits", () => {
    expect(() => createAttackFlowGraph({ ...flow, name: '<img src=x onerror="alert(1)">' })).not.toThrow();
    const hostile = createAttackFlowGraph({ ...flow, name: '<img src=x onerror="alert(1)">' });
    expect(hostile.name).toBe('<img src=x onerror="alert(1)">');
    expect(() => createAttackFlowGraph({ ...flow, name: "authorization=Bearer abcdefghijk" })).toThrow(/credential|secret/i);
    expect(() => createAttackFlowGraph(flow, { ...run, flowId: "other-flow" })).toThrow(/does not belong/i);
    const graph = createAttackFlowGraph(flow); (graph.nodes[0] as { origin: string }).origin = "https://user:password@lab.example";
    expect(() => exportAttackFlowBundle(graph)).toThrow(/origin/i);
  });
});
