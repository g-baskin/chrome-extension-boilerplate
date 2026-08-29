import { getApiTrafficPage, type ApiExchange, type ApiTrafficFilters } from "./api-traffic";
import { inspectAgentProtocol, inspectAgentSseEvent, type AgentProtocolInspection } from "./agent-protocol";
import { getProtocolEvents, type ProtocolEvent, type ProtocolFilters } from "./protocol-traffic";

export interface AgentInspectorQuery {
  pageHostname: string | null;
  pageSize?: number;
  resultLimit?: number;
  recordLimit?: number;
}

export interface AgentInspectorResult {
  inspections: AgentProtocolInspection[];
  scannedApi: number;
  scannedProtocol: number;
  apiResultLimitReached: boolean;
  protocolResultLimitReached: boolean;
  apiRecordLimitReached: boolean;
  protocolRecordLimitReached: boolean;
}

interface AgentInspectorDependencies {
  getApiPage: typeof getApiTrafficPage;
  getProtocolPage: typeof getProtocolEvents;
  inspectExchange: (exchange: ApiExchange) => AgentProtocolInspection | null;
  inspectEvent: (event: ProtocolEvent) => AgentProtocolInspection | null;
}

const DEFAULT_PAGE_SIZE = 250;
const DEFAULT_RESULT_LIMIT = 500;
const MAX_PAGE_SIZE = 500;
const MAX_RESULT_LIMIT = 1_000;
const MAX_RECORD_LIMIT = 50_000;

const defaultDependencies: AgentInspectorDependencies = {
  getApiPage: getApiTrafficPage,
  getProtocolPage: getProtocolEvents,
  inspectExchange: inspectAgentProtocol,
  inspectEvent: (event) => inspectAgentSseEvent(event, "mcp") ?? inspectAgentSseEvent(event, "a2a"),
};

export async function scanAgentTraffic(
  query: AgentInspectorQuery,
  dependencies: AgentInspectorDependencies = defaultDependencies,
  onProgress?: (scanned: number) => void
): Promise<AgentInspectorResult> {
  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, query.pageSize ?? DEFAULT_PAGE_SIZE));
  const resultLimit = Math.min(MAX_RESULT_LIMIT, Math.max(1, query.resultLimit ?? DEFAULT_RESULT_LIMIT));
  const recordLimit = Math.min(MAX_RECORD_LIMIT, Math.max(1, query.recordLimit ?? MAX_RECORD_LIMIT));
  const apiInspection = emptyInspection();
  const protocolInspection = emptyInspection();
  let scannedApi = 0;
  let scannedProtocol = 0;
  let apiResults = 0;
  let protocolResults = 0;
  let beforeApi: number | null = null;
  let beforeProtocol: number | null = null;

  while (apiResults < resultLimit && scannedApi < recordLimit) {
    const limit = Math.min(pageSize, recordLimit - scannedApi);
    const page = await dependencies.getApiPage(beforeApi, limit, apiFilters(query.pageHostname));
    if (page.length === 0) break;
    scannedApi += page.length;
    for (const exchange of page) {
      const inspection = dependencies.inspectExchange(exchange);
      if (inspection) {
        appendInspection(apiInspection, inspection, resultLimit);
        apiResults += 1;
        if (apiResults >= resultLimit) break;
      }
    }
    onProgress?.(scannedApi + scannedProtocol);
    const next = page[page.length - 1]?.sequence;
    if (page.length < limit || next === undefined) break;
    beforeApi = next;
  }

  while (protocolResults < resultLimit && scannedProtocol < recordLimit) {
    const limit = Math.min(pageSize, recordLimit - scannedProtocol);
    const page = await dependencies.getProtocolPage(beforeProtocol, limit, protocolFilters(query.pageHostname));
    if (page.length === 0) break;
    scannedProtocol += page.length;
    for (const event of page) {
      const inspection = dependencies.inspectEvent(event);
      if (inspection) {
        appendInspection(protocolInspection, inspection, resultLimit);
        protocolResults += 1;
        if (protocolResults >= resultLimit) break;
      }
    }
    onProgress?.(scannedApi + scannedProtocol);
    const next = page[page.length - 1]?.sequence;
    if (page.length < limit || next === undefined) break;
    beforeProtocol = next;
  }

  return {
    inspections: [apiInspection, protocolInspection].filter(hasInspection),
    scannedApi,
    scannedProtocol,
    apiResultLimitReached: apiResults >= resultLimit,
    protocolResultLimitReached: protocolResults >= resultLimit,
    apiRecordLimitReached: scannedApi >= recordLimit,
    protocolRecordLimitReached: scannedProtocol >= recordLimit,
  };
}

function emptyInspection(): AgentProtocolInspection {
  return { protocols: [], timeline: [], capabilities: [], signals: [] };
}

function appendInspection(
  target: AgentProtocolInspection,
  source: AgentProtocolInspection,
  limit: number
): void {
  for (const protocol of source.protocols) {
    if (!target.protocols.includes(protocol)) target.protocols.push(protocol);
  }
  target.timeline.push(...source.timeline.slice(0, Math.max(0, limit - target.timeline.length)));
  target.capabilities.push(...source.capabilities.slice(0, Math.max(0, limit - target.capabilities.length)));
  target.signals.push(...source.signals.slice(0, Math.max(0, limit - target.signals.length)));
}

function hasInspection(inspection: AgentProtocolInspection): boolean {
  return inspection.protocols.length > 0;
}

function apiFilters(pageHostname: string | null): ApiTrafficFilters {
  return {
    pageHostname,
    method: "",
    status: "",
    mimeType: "",
    domain: "",
    analysis: "",
    attribution: "",
  };
}

function protocolFilters(pageHostname: string | null): ProtocolFilters {
  return {
    pageHostname,
    transport: "sse",
    direction: "",
    port: "",
    operationName: "",
    text: "",
  };
}
