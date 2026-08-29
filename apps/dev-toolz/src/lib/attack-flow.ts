import { validatePurpleFlow, type PurpleAttackAnnotation, type PurpleFlow, type PurpleRun } from "./purple-flow";
import { validatePurpleRunSummary } from "./purple-flow-store";

export const ATTACK_FLOW_EXTENSION_ID = "extension-definition--fb9c968a-745b-4ade-9b25-c324172197f4";
export const MAX_ATTACK_FLOW_NODES = 128;
export const MAX_ATTACK_FLOW_LABEL_LENGTH = 500;

const EXTENSION = { [ATTACK_FLOW_EXTENSION_ID]: { extension_type: "new-sdo" as const } };
const STIX_ID = /^(attack-flow|attack-action|attack-condition|attack-asset)--[0-9a-f]{8}-[0-9a-f]{4}-[45][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const SECRET_VALUE = /(?:authorization|password|passwd|secret|api[_-]?key|access[_-]?token|refresh[_-]?token|session|credential)\s*[:=]\s*\S+|\bbearer\s+[A-Za-z0-9._~+\x2f-]{8,}|\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/i;

export type AttackMetadata = {
  id: string;
  tacticId: string;
  tacticName: string;
  techniqueId: string;
  techniqueName: string;
};

type GraphBase = { id: string; type: "attack-action" | "attack-condition" | "attack-asset"; label: string };
export type AttackActionNode = GraphBase & {
  type: "attack-action";
  stepId: string;
  order: number;
  assetRefs: string[];
  effectRefs: string[];
  evidenceRefs: string[];
  attackMetadata: AttackMetadata[];
};
export type AttackConditionNode = GraphBase & {
  type: "attack-condition";
  outcome: "prevention" | "detection";
  value: string;
  effectRefs: string[];
  evidenceRefs: string[];
};
export type AttackAssetNode = GraphBase & { type: "attack-asset"; origin: string };
export type AttackFlowNode = AttackActionNode | AttackConditionNode | AttackAssetNode;

export type AttackFlowGraph = {
  id: string;
  name: string;
  created: string;
  modified: string;
  startRefs: string[];
  nodes: AttackFlowNode[];
};

export type StixAttackFlowBundle = { type: "bundle"; id: string; objects: Record<string, unknown>[] };

/** Builds a bounded DAG. Input request bodies, headers, paths, errors, identity names and response data are never copied. */
export function createAttackFlowGraph(flow: PurpleFlow, run?: PurpleRun | null): AttackFlowGraph {
  validatePurpleFlow(flow);
  if (run != null) {
    validatePurpleRunSummary(run);
    if (run.flowId !== flow.id || run.origin !== flow.origin) throw new Error("Purple run evidence does not belong to this flow.");
    const knownSteps = new Set(flow.steps.map((step) => step.id));
    if (run.steps.some((step) => !knownSteps.has(step.stepId))) throw new Error("Purple run evidence references an unknown flow step.");
  }
  rejectSecretLabel(flow.name, "Attack Flow name");
  const origin = new URL(flow.origin);
  const assetId = stixId("attack-asset", `flow:${flow.id}:asset:${origin.origin}`);
  const nodes: AttackFlowNode[] = [{ id: assetId, type: "attack-asset", label: origin.hostname, origin: origin.origin }];
  const actions = flow.steps.map<AttackActionNode>((step, order) => {
    rejectSecretLabel(step.name, "Attack action name");
    const annotations = flow.attackAnnotations.filter((item) => item.stepId === step.id).map(copyAnnotation);
    for (const annotation of annotations) {
      for (const value of [annotation.tacticId, annotation.tacticName, annotation.techniqueId, annotation.techniqueName]) rejectSecretLabel(value, "ATT&CK metadata");
    }
    return {
      id: stixId("attack-action", `flow:${flow.id}:step:${step.id}`), type: "attack-action", stepId: stableToken(step.id),
      order, label: step.name, assetRefs: [assetId], effectRefs: [],
      evidenceRefs: [`capture-sequence:${step.capturedRequest.exchangeSequence}`], attackMetadata: annotations,
    };
  });
  const outcomes = run ? new Map(run.steps.map((outcome) => [stableToken(outcome.stepId), outcome])) : new Map();
  for (let index = 0; index < actions.length; index += 1) {
    const action = actions[index]!;
    const next = actions[index + 1]?.id;
    const outcome = outcomes.get(action.stepId);
    if (!outcome) {
      if (next) action.effectRefs.push(next);
      continue;
    }
    const runRef = stixId("attack-flow", `run:${run!.id}`);
    action.evidenceRefs.push(`run:${runRef}:step:${stableToken(action.stepId)}`);
    const conditionData = [
      ["prevention", outcome.preventionOutcome] as const,
      ["detection", outcome.detectionOutcome] as const,
    ];
    for (const [kind, value] of conditionData) {
      const evidenceRefs = [`run:${runRef}:step:${stableToken(action.stepId)}:${kind}`];
      if (kind === "detection") for (const sequence of outcome.evidenceSequenceIds) evidenceRefs.push(`capture-sequence:${sequence}`);
      const condition: AttackConditionNode = {
        id: stixId("attack-condition", `flow:${flow.id}:run:${run!.id}:step:${action.stepId}:${kind}`),
        type: "attack-condition", label: `${kind === "prevention" ? "Prevention" : "Detection"}: ${value}`,
        outcome: kind, value, effectRefs: next ? [next] : [], evidenceRefs,
      };
      action.effectRefs.push(condition.id);
      nodes.push(condition);
    }
  }
  nodes.push(...actions);
  const graph: AttackFlowGraph = {
    id: stixId("attack-flow", `flow:${flow.id}`), name: flow.name, created: flow.createdAt,
    modified: flow.updatedAt, startRefs: [actions[0]!.id], nodes,
  };
  validateAttackFlowGraph(graph);
  return graph;
}

/** Validates graph structure, bounds, references and acyclicity before any serialization. */
export function validateAttackFlowGraph(value: unknown): asserts value is AttackFlowGraph {
  const graph = record(value, "Attack Flow graph is malformed.");
  exactKeys(graph, ["id", "name", "created", "modified", "startRefs", "nodes"], "Attack Flow graph is malformed.");
  requireStixId(graph.id, "attack-flow", "Attack Flow root ID is malformed.");
  boundedString(graph.name, 1, 120, "Attack Flow name is malformed.");
  rejectSecretLabel(graph.name as string, "Attack Flow name");
  timestamp(graph.created, "Attack Flow creation time is malformed.");
  timestamp(graph.modified, "Attack Flow modification time is malformed.");
  if (!Array.isArray(graph.nodes) || graph.nodes.length < 2 || graph.nodes.length > MAX_ATTACK_FLOW_NODES) throw new Error(`Attack Flow graphs require 2–${MAX_ATTACK_FLOW_NODES} nodes.`);
  if (!Array.isArray(graph.startRefs) || graph.startRefs.length === 0 || graph.startRefs.length > 25) throw new Error("Attack Flow start references are malformed.");
  const byId = new Map<string, Record<string, unknown>>();
  for (const candidate of graph.nodes) {
    const node = record(candidate, "Attack Flow node is malformed.");
    if (!(node.type === "attack-action" || node.type === "attack-condition" || node.type === "attack-asset")) throw new Error("Attack Flow node type is unsupported.");
    requireStixId(node.id, node.type, "Attack Flow node ID is malformed.");
    if (byId.has(node.id as string)) throw new Error("Attack Flow node IDs must be unique.");
    boundedString(node.label, 1, MAX_ATTACK_FLOW_LABEL_LENGTH, "Attack Flow node label is malformed.");
    rejectSecretLabel(node.label as string, "Attack Flow node label");
    if (node.type === "attack-action") validateAction(node);
    else if (node.type === "attack-condition") validateCondition(node);
    else validateAsset(node);
    byId.set(node.id as string, node);
  }
  const starts = referenceList(graph.startRefs, byId, "Attack Flow start reference");
  if (starts.some((id) => byId.get(id)?.type === "attack-asset")) throw new Error("Attack Flow start references must target actions or conditions.");
  const edges = new Map<string, string[]>();
  const referencedAssets = new Set<string>();
  const actionOrders: number[] = [];
  for (const [id, node] of byId) {
    const refs = node.type === "attack-action" || node.type === "attack-condition" ? referenceList(node.effectRefs, byId, "Attack Flow effect reference") : [];
    if (refs.some((ref) => byId.get(ref)?.type === "attack-asset")) throw new Error("Attack Flow effects cannot target assets.");
    if (node.type === "attack-action") {
      const assets = referenceList(node.assetRefs, byId, "Attack Flow asset reference", "attack-asset");
      if (assets.length === 0) throw new Error("Attack actions require at least one asset reference.");
      for (const asset of assets) referencedAssets.add(asset);
      actionOrders.push(node.order as number);
    }
    edges.set(id, refs);
  }
  actionOrders.sort((a, b) => a - b);
  if (actionOrders.some((order, index) => order !== index)) throw new Error("Attack action order must be unique and contiguous.");
  for (const [id, node] of byId) if (node.type === "attack-asset" && !referencedAssets.has(id)) throw new Error("Attack Flow graph contains an unreachable asset.");
  const visiting = new Set<string>(); const visited = new Set<string>();
  const walk = (id: string): void => {
    if (visiting.has(id)) throw new Error("Attack Flow graph contains a cycle.");
    if (visited.has(id)) return;
    visiting.add(id); for (const next of edges.get(id) ?? []) walk(next); visiting.delete(id); visited.add(id);
  };
  for (const start of starts) walk(start);
  for (const [id, node] of byId) if (node.type !== "attack-asset" && !visited.has(id)) throw new Error("Attack Flow graph contains an unreachable node.");
}

export function exportAttackFlowBundle(graph: AttackFlowGraph): StixAttackFlowBundle {
  validateAttackFlowGraph(graph);
  const common = (node: AttackFlowNode): Record<string, unknown> => ({
    type: node.type, spec_version: "2.1", id: node.id, created: graph.created, modified: graph.modified, extensions: EXTENSION,
  });
  const objects: Record<string, unknown>[] = [extensionDefinition(), {
    type: "attack-flow", spec_version: "2.1", id: graph.id, created: graph.created, modified: graph.modified,
    name: graph.name, description: "Purple Flow causal graph exported by Dev Toolz.", scope: "emulation-plan",
    start_refs: [...graph.startRefs], extensions: EXTENSION,
  }];
  for (const node of graph.nodes) {
    if (node.type === "attack-asset") objects.push({ ...common(node), name: node.label, description: `HTTP origin asset: ${node.origin}` });
    else if (node.type === "attack-condition") objects.push({
      ...common(node), description: node.label,
      ...(node.effectRefs.length ? { on_true_refs: [...node.effectRefs] } : {}),
      x_dev_toolz_outcome: node.value, x_dev_toolz_evidence_refs: [...node.evidenceRefs],
    });
    else {
      const primary = node.attackMetadata[0];
      objects.push({ ...common(node), name: primary?.techniqueName || node.label,
        description: node.label, asset_refs: [...node.assetRefs], ...(node.effectRefs.length ? { effect_refs: [...node.effectRefs] } : {}),
        ...(primary ? { tactic_id: primary.tacticId, technique_id: primary.techniqueId,
          x_dev_toolz_tactic_name: primary.tacticName, x_dev_toolz_attack_annotations: node.attackMetadata.map(({ id: _id, ...metadata }) => metadata) } : {}),
        x_dev_toolz_capture_step: stableToken(node.stepId), x_dev_toolz_evidence_refs: [...node.evidenceRefs],
      });
    }
  }
  return { type: "bundle", id: stixId("bundle", `bundle:${graph.id}`), objects };
}

function validateAction(node: Record<string, unknown>): void {
  exactKeys(node, ["id", "type", "label", "stepId", "order", "assetRefs", "effectRefs", "evidenceRefs", "attackMetadata"], "Attack action is malformed.");
  boundedString(node.stepId, 1, 128, "Attack action step reference is malformed.");
  if (!Number.isSafeInteger(node.order) || (node.order as number) < 0 || (node.order as number) >= 25) throw new Error("Attack action order is malformed.");
  rawReferences(node.assetRefs, "Attack action asset references are malformed."); rawReferences(node.effectRefs, "Attack action effect references are malformed."); evidence(node.evidenceRefs);
  if (!Array.isArray(node.attackMetadata) || node.attackMetadata.length > 100) throw new Error("Attack action ATT&CK metadata is malformed.");
  for (const item of node.attackMetadata) {
    const metadata = record(item, "Attack action ATT&CK metadata is malformed.");
    exactKeys(metadata, ["id", "tacticId", "tacticName", "techniqueId", "techniqueName"], "Attack action ATT&CK metadata is malformed.");
    for (const key of ["id", "tacticId", "tacticName", "techniqueId", "techniqueName"]) { boundedString(metadata[key], 1, 120, "Attack action ATT&CK metadata is malformed."); rejectSecretLabel(metadata[key] as string, "ATT&CK metadata"); }
  }
}
function validateCondition(node: Record<string, unknown>): void {
  exactKeys(node, ["id", "type", "label", "outcome", "value", "effectRefs", "evidenceRefs"], "Attack condition is malformed.");
  if (!(node.outcome === "prevention" || node.outcome === "detection")) throw new Error("Attack condition outcome is malformed.");
  boundedString(node.value, 1, 40, "Attack condition value is malformed."); rawReferences(node.effectRefs, "Attack condition effect references are malformed."); evidence(node.evidenceRefs);
}
function validateAsset(node: Record<string, unknown>): void {
  exactKeys(node, ["id", "type", "label", "origin"], "Attack asset is malformed.");
  boundedString(node.origin, 1, 2048, "Attack asset origin is malformed.");
  let url: URL; try { url = new URL(node.origin as string); } catch { throw new Error("Attack asset origin is malformed."); }
  if (!/^https?:$/.test(url.protocol) || url.username || url.password || url.href !== `${url.origin}/`) throw new Error("Attack asset origin is malformed.");
}
function evidence(value: unknown): void {
  const runEvidence = /^run:attack-flow--[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}:step:[0-9a-f]{16}(?::(?:prevention|detection))?$/;
  if (!Array.isArray(value) || value.length > 102 || value.some((item) => {
    if (typeof item !== "string" || item.length > 240) return true;
    const capture = /^capture-sequence:(\d+)$/.exec(item);
    return capture ? !Number.isSafeInteger(Number(capture[1])) || Number(capture[1]) <= 0 : !runEvidence.test(item);
  })) throw new Error("Attack Flow evidence references are malformed.");
}
function rawReferences(value: unknown, message: string): void { if (!Array.isArray(value) || value.length > MAX_ATTACK_FLOW_NODES || new Set(value).size !== value.length || value.some((item) => typeof item !== "string" || !STIX_ID.test(item))) throw new Error(message); }
function referenceList(value: unknown, nodes: Map<string, Record<string, unknown>>, label: string, requiredType?: string): string[] { rawReferences(value, `${label}s are malformed.`); const refs = value as string[]; for (const ref of refs) { const target = nodes.get(ref); if (!target) throw new Error(`${label} is dangling: ${ref}.`); if (requiredType && target.type !== requiredType) throw new Error(`${label} targets the wrong node type.`); } return refs; }
function copyAnnotation(item: PurpleAttackAnnotation): AttackMetadata { return { id: stableToken(item.id), tacticId: item.tacticId, tacticName: item.tacticName, techniqueId: item.techniqueId, techniqueName: item.techniqueName }; }
function extensionDefinition(): Record<string, unknown> { return { type: "extension-definition", spec_version: "2.1", id: ATTACK_FLOW_EXTENSION_ID, created: "2022-08-02T19:34:35.143Z", modified: "2022-08-02T19:34:35.143Z", name: "Attack Flow", description: "Extends STIX 2.1 with features to create Attack Flows.", schema: "https://center-for-threat-informed-defense.github.io/attack-flow/stix/attack-flow-schema-2.0.0.json", version: "2.0.0", extension_types: ["new-sdo"] }; }
function record(value: unknown, message: string): Record<string, unknown> { if (value === null || typeof value !== "object" || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) throw new Error(message); return value as Record<string, unknown>; }
function exactKeys(value: Record<string, unknown>, keys: string[], message: string): void { const actual = Object.keys(value); if (actual.length !== keys.length || actual.some((key) => !keys.includes(key))) throw new Error(message); }
function boundedString(value: unknown, min: number, max: number, message: string): asserts value is string { if (typeof value !== "string" || value.length < min || value.length > max || value.trim().length < min) throw new Error(message); }
function timestamp(value: unknown, message: string): void {
  if (typeof value !== "string") throw new Error(message);
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,3})?Z$/.exec(value);
  const parsed = Date.parse(value);
  if (!match || !Number.isFinite(parsed)) throw new Error(message);
  const date = new Date(parsed);
  const parts = [date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate(), date.getUTCHours(), date.getUTCMinutes(), date.getUTCSeconds()];
  if (parts.some((part, index) => part !== Number(match[index + 1]))) throw new Error(message);
}
function rejectSecretLabel(value: string, label: string): void { if (SECRET_VALUE.test(value)) throw new Error(`${label} appears to contain a credential or secret.`); }
function requireStixId(value: unknown, type: string, message: string): asserts value is string { if (typeof value !== "string" || !STIX_ID.test(value) || !value.startsWith(`${type}--`)) throw new Error(message); }
function stableToken(input: string): string { return hashWords(input).slice(0, 4).map((word) => word.toString(16).padStart(8, "0")).join("").slice(0, 16); }
function stixId(type: string, input: string): string { const hex = hashWords(`${type}\0${input}`).map((word) => word.toString(16).padStart(8, "0")).join(""); return `${type}--${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-${((parseInt(hex[16]!, 16) & 3) | 8).toString(16)}${hex.slice(17, 20)}-${hex.slice(20, 32)}`; }
function hashWords(input: string): number[] { const seeds = [0x811c9dc5, 0x9e3779b9, 0x85ebca6b, 0xc2b2ae35]; return seeds.map((seed, index) => { let hash = seed >>> 0; for (let i = 0; i < input.length; i += 1) { hash ^= input.charCodeAt(i) + index * 31; hash = Math.imul(hash, 0x01000193); hash ^= hash >>> 13; } return hash >>> 0; }); }
