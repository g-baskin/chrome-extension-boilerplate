import { downloadDataAsFile } from "../lib/download";
import { explainTraffic } from "../lib/traffic-explanation";
import { sendToBackground } from "../lib/messaging";
import { getApiTrafficPauseStatus, type ApiTrafficPauseStatus } from "../lib/api-traffic-pause";
import { defaultSettings, getStorage } from "../lib/storage";
import {
  loadStarredLogEventIds,
  MAX_STARRED_LOG_EVENTS,
  persistStarredLogEventIds,
} from "../lib/log-stars";
import { isSiteAllowed, type SiteAccessMode } from "../lib/site-access";
import type { RaceOutcome, RaceRunResult } from "../background/race-runner";
import {
  buildInferredConnectionChain,
  matchesConnectionChainFilter,
  type ConnectionChainFilter,
} from "../lib/api-connection-chain";
import {
  extractApiFields,
  matchesApiFieldQuery,
  parseApiFieldQuery,
  summarizeApiFields,
  type ApiFieldQuery,
  type ApiFieldSummary,
} from "../lib/api-fields";
import {
  clearApiTraffic,
  clearApiTrafficForPage,
  countApiTraffic,
  countApiTrafficForPage,
  detectMediaKind,
  getAllApiTraffic,
  getApiTrafficPage,
  getMediaRole,
  matchesApiTraffic,
  type ApiBody,
  type ApiExchange,
  type ApiHeader,
  type ApiTrafficFilters,
  type MediaKind,
  type MediaRole,
} from "../lib/api-traffic";
import {
  buildObservedRoutes,
  compareOpenApi,
  generateOpenApi,
  MAX_OPENAPI_IMPORT_BYTES,
  normalizeObservedRoute,
  parseOpenApiBaseline,
  type AttackMapEntry,
  type OpenApiDocument,
} from "../lib/api-spec";
import {
  createRaceFlow,
  createRaceSnapshot,
  deleteRaceFlow,
  getRaceFlows,
  saveRaceFlow,
  validateRaceFlow,
  type RaceFlow,
} from "../lib/race-flow";
import {
  createApiLogRecord,
  createProtocolLogRecord,
  LOG_SEARCH_LIMITS,
  matchesLogRecord,
  type DetectionExpression,
  type LogRecord,
  type LogSourceFilter,
} from "../lib/log-search";
import { queryLogHistoryOffThread } from "../lib/log-history-client";
import { enforceTrafficRetention } from "../lib/traffic-retention";
import {
  extractGraphqlOperation,
  getProtocolEvents,
  matchesProtocolEvent,
  type ProtocolEvent,
  type ProtocolFilters,
  type ProtocolTransport,
} from "../lib/protocol-traffic";

const JSON_TOKEN_REGEX =
  /("(?:\\u[\da-fA-F]{4}|\\[^u]|[^\\"])*"\s*:)|("(?:\\u[\da-fA-F]{4}|\\[^u]|[^\\"])*")|\b(true|false|null)\b|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/g;
const PAGE_SIZE = 200;
const DUPLICATE_WINDOW_MS = 10_000;
const PAUSE_DURATIONS = {
  resume: 0,
  pause5: 300_000,
  pause15: 900_000,
  pause60: 3_600_000,
  pauseUntilResumed: null,
} as const;

interface TrafficGroup {
  exchanges: [ApiExchange, ...ApiExchange[]];
  key: string;
  latestStartedAt: number;
}

interface ReconEndpoint {
  key: string;
  method: string;
  hostname: string;
  route: string;
  requestCount: number;
  statuses: Set<number>;
  queryNames: Set<string>;
  bodyFields: Set<string>;
  identityHeaders: Set<string>;
  samples: ApiExchange[];
}

type ToolSection = "log-search" | "traffic" | "red-team";
type RedTeamTool = "recon" | "protocols" | "api-map" | "race-lab";

const logSearchSection = requireElement("log-search-section");
const logSearchForm = requireForm("log-search-form");
const logSearchQuery = requireInput("log-search-query");
const logSearchSource = requireSelect("log-search-source");
const logSearchTime = requireSelect("log-search-time");
const logCustomTime = requireElement("log-custom-time");
const logSearchEarliest = requireInput("log-search-earliest");
const logSearchLatest = requireInput("log-search-latest");
const logSearchSubmit = requireButton("log-search-submit");
const logSearchClear = requireButton("log-search-clear");
const logSearchError = requireElement("log-search-error");
const logSearchStatus = requireElement("log-search-status");
const logCaptureSite = requireSelect("log-capture-site");
const logTimeline = requireElement("log-timeline");
const logFieldList = requireElement("log-field-list");
const logSearchResults = requireElement("log-search-results");
const requestList = requireElement("request-list");
const emptyState = requireElement("empty-state");
const requestCount = requireElement("request-count");
const clearResponses = requireButton("clear-responses");
const exportResponses = requireButton("export-responses");
const groupDuplicates = requireButton("group-duplicates");
const groupSiteDuplicates = requireButton("group-site-duplicates");
const showHidden = requireButton("show-hidden");
const loadOlder = requireButton("load-older");
const fieldSearch = requireInput("field-search");
const fieldSearchApply = requireButton("field-search-apply");
const fieldSearchClear = requireButton("field-search-clear");
const fieldsScope = requireElement("fields-scope");
const selectedFields = requireElement("selected-fields");
const interestingFields = requireElement("interesting-fields");
const filterForm = requireForm("traffic-filters");
const captureSite = requireSelect("capture-site");
const scopeFilter = requireSelect("filter-scope");
const analysisFilter = requireSelect("filter-analysis");
const domainFilter = requireInput("filter-domain");
const routeFilter = requireSelect("filter-route");
const methodFilter = requireSelect("filter-method");
const statusFilter = requireSelect("filter-status");
const mimeFilter = requireInput("filter-mime");
const connectionFilter = requireSelect("filter-connection");
const resetFilters = requireButton("reset-filters");
const trafficSection = requireElement("traffic-section");
const redTeamSection = requireElement("red-team-section");
const showLogSearchSection = requireButton("show-log-search-section");
const showTrafficSection = requireButton("show-traffic-section");
const showRedTeamSection = requireButton("show-red-team-section");
const refreshRecon = requireButton("refresh-recon");
const reconScope = requireSelect("recon-scope");
const reconCount = requireElement("recon-count");
const reconState = requireElement("recon-state");
const reconTableRegion = requireElement("recon-table-region");
const reconEndpoints = requireElement("recon-endpoints");
const redTeamTools: Record<RedTeamTool, { button: HTMLButtonElement; panel: HTMLElement }> = {
  recon: { button: requireButton("show-recon-tool"), panel: requireElement("recon-tool") },
  protocols: { button: requireButton("show-protocols-tool"), panel: requireElement("protocols-tool") },
  "api-map": { button: requireButton("show-api-map-tool"), panel: requireElement("api-map-tool") },
  "race-lab": { button: requireButton("show-race-lab-tool"), panel: requireElement("race-lab-tool") },
};
const protocolForm = requireForm("protocol-filters");
const protocolScope = requireSelect("protocol-scope");
const protocolTransport = requireSelect("protocol-transport");
const protocolDirection = requireSelect("protocol-direction");
const protocolOperation = requireInput("protocol-operation");
const protocolText = requireInput("protocol-text");
const protocolState = requireElement("protocol-state");
const protocolEvents = requireElement("protocol-events");
const loadOlderProtocols = requireButton("load-older-protocols");
const exportProtocols = requireButton("export-protocols");
const apiMapScope = requireSelect("api-map-scope");
const apiMapDrift = requireSelect("api-map-drift");
const apiMapMethod = requireSelect("api-map-method");
const apiMapHostname = requireInput("api-map-hostname");
const apiMapRoute = requireInput("api-map-route");
const apiMapImport = requireInput("api-map-import");
const apiMapExport = requireButton("api-map-export");
const apiMapRefresh = requireButton("api-map-refresh");
const apiMapState = requireElement("api-map-state");
const apiMapRegion = requireElement("api-map-region");
const apiMapEntries = requireElement("api-map-entries");
const raceFlowSelect = requireSelect("race-flow-select");
const raceFlowName = requireInput("race-flow-name");
const raceFlowCreate = requireButton("race-flow-create");
const raceFlowRename = requireButton("race-flow-rename");
const raceFlowDelete = requireButton("race-flow-delete");
const raceConcurrency = requireInput("race-concurrency");
const raceRun = requireButton("race-run");
const raceCancel = requireButton("race-cancel");
const raceState = requireElement("race-state");
const raceSteps = requireElement("race-steps");
const raceResults = requireElement("race-results");
let totalCount = 0;
let oldestSequence: number | null = null;
let currentPageHostname = "";
let activeFilters = readFilters();
let displayedExchanges: ApiExchange[] = [];
let groupingMode: "nearby" | "site" | null = null;
const hiddenEndpoints = new Set<string>();
const hiddenMediaStreams = new Set<string>();
const selectedFieldNames = new Set(["request.method", "response.status", "url.host"]);
let activeFieldQuery: ApiFieldQuery | null = null;
let activeConnectionFilter: ConnectionChainFilter = "";
const sessionManifestUrls = new Map<number, { url: string; pageHostname: string }>();
let activeSection: ToolSection = "log-search";
let logSearchLoaded = false;
let logRecords: LogRecord[] = [];
let pendingLogRecords: LogRecord[] = [];
let logSearchRenderFrame: number | null = null;
let logSearchAbort: AbortController | null = null;
let logSearchMatching = 0;
let logSearchScanned = 0;
let activeLogSearch: {
  expression: DetectionExpression | null;
  source: LogSourceFilter;
  earliest: number | null;
  latest: number | null;
} | null = null;
let starredLogEventIds = new Set<string>();
let starWritePending = false;
let reconLoaded = false;
let reconExchanges: ApiExchange[] = [];
let activeRedTeamTool: RedTeamTool = "recon";
let protocolLoaded = false;
let displayedProtocolEvents: ProtocolEvent[] = [];
let oldestProtocolSequence: number | null = null;
let apiMapLoaded = false;
let apiMapExchanges: ApiExchange[] = [];
let apiMapBaseline: OpenApiDocument | null = null;
let raceFlows: RaceFlow[] = [];
let raceLoaded = false;
let activeRaceRunId: string | null = null;

showLogSearchSection.addEventListener("click", () => {
  setActiveSection("log-search");
  if (logSearchLoaded) renderLogSearch();
  else void refreshLogSearch();
});
showTrafficSection.addEventListener("click", () => setActiveSection("traffic"));
showRedTeamSection.addEventListener("click", () => {
  setActiveSection("red-team");
  if (!reconLoaded) void refreshReconWorkspace();
});
logSearchForm.addEventListener("submit", (event) => {
  event.preventDefault();
  void refreshLogSearch();
});
logSearchTime.addEventListener("change", updateCustomTimeVisibility);
logSearchClear.addEventListener("click", () => {
  logSearchForm.reset();
  logSearchQuery.value = "";
  updateCustomTimeVisibility();
  void refreshLogSearch();
  logSearchQuery.focus();
});
refreshRecon.addEventListener("click", () => void refreshReconWorkspace());
reconScope.addEventListener("change", renderReconWorkspace);
for (const [tool, controls] of Object.entries(redTeamTools)) {
  controls.button.addEventListener("click", () => void setActiveRedTeamTool(tool as RedTeamTool));
}
protocolForm.addEventListener("submit", (event) => {
  event.preventDefault();
  void refreshProtocolWorkspace(true);
});
protocolScope.addEventListener("change", () => void refreshProtocolWorkspace(true));
loadOlderProtocols.addEventListener("click", () => void loadProtocolPage());
exportProtocols.addEventListener("click", () => void exportProtocolHistory());
apiMapScope.addEventListener("change", renderApiMap);
apiMapDrift.addEventListener("change", renderApiMap);
apiMapMethod.addEventListener("change", renderApiMap);
apiMapHostname.addEventListener("input", renderApiMap);
apiMapRoute.addEventListener("input", renderApiMap);
apiMapRefresh.addEventListener("click", () => void refreshApiMap());
apiMapExport.addEventListener("click", exportObservedOpenApi);
apiMapImport.addEventListener("change", () => void importOpenApiBaseline());
raceFlowSelect.addEventListener("change", renderRaceLab);
raceFlowCreate.addEventListener("click", () => void createNewRaceFlow());
raceFlowRename.addEventListener("click", () => void renameSelectedRaceFlow());
raceFlowDelete.addEventListener("click", () => void deleteSelectedRaceFlow());
raceConcurrency.addEventListener("input", renderRaceLab);
raceFlowName.addEventListener("input", renderRaceLab);
raceRun.addEventListener("click", () => void reviewAndRunRace());
raceCancel.addEventListener("click", () => void cancelActiveRace());
raceResults.replaceChildren();
fieldSearch.addEventListener("input", () => {
  updateFieldSearchActions();
  renderFieldSidebar();
});
fieldSearch.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && parseApiFieldQuery(fieldSearch.value)) applyFieldSearch();
});
fieldSearchApply.addEventListener("click", applyFieldSearch);
fieldSearchClear.addEventListener("click", clearFieldSearch);

void initializePanel();

chrome.runtime.onMessage.addListener((message: unknown) => {
  if (isProtocolCapturedMessage(message)) {
    streamLogRecord(createProtocolLogRecord(message.payload));
    if (protocolLoaded && matchesProtocolEvent(message.payload, readProtocolFilters())) {
      displayedProtocolEvents.unshift(message.payload);
      if (activeSection === "red-team" && activeRedTeamTool === "protocols") renderProtocolWorkspace();
    }
    return false;
  }
  if (!isCapturedMessage(message)) return false;
  if (message.sessionRequestUrl && isHttpUrl(message.sessionRequestUrl)) {
    sessionManifestUrls.set(message.payload.sequence, {
      url: message.sessionRequestUrl,
      pageHostname: getHostname(message.payload.pageUrl ?? ""),
    });
  }
  totalCount += 1;
  streamLogRecord(createApiLogRecord(message.payload));
  updateCount();
  updateScopeActions();
  if (reconLoaded) {
    reconExchanges.unshift(message.payload);
    if (activeSection === "red-team" && activeRedTeamTool === "recon") renderReconWorkspace();
  }
  if (apiMapLoaded) {
    apiMapExchanges.unshift(message.payload);
    if (activeSection === "red-team" && activeRedTeamTool === "api-map") renderApiMap();
  }
  if (matchesApiTraffic(message.payload, activeFilters)) {
    displayedExchanges.unshift(message.payload);
    if (
      groupingMode ||
      hiddenEndpoints.size > 0 ||
      hiddenMediaStreams.size > 0 ||
      isMediaAnalysisMode(analysisFilter.value) ||
      activeConnectionFilter ||
      activeFieldQuery
    ) {
      renderDisplayedTraffic();
    } else {
      requestList.prepend(createExchange(message.payload));
      renderFieldSidebar();
    }
    updateGroupingButtons();
  }
  return false;
});

exportResponses.addEventListener("click", async () => {
  exportResponses.disabled = true;
  exportResponses.textContent = "Exporting…";
  try {
    const currentSiteOnly = scopeFilter.value === "current";
    const pageHostname = currentPageHostname;
    // simplification: export materializes the database; stream chunks if exports outgrow memory.
    const storedExchanges = await getAllApiTraffic();
    const exchanges = currentSiteOnly
      ? storedExchanges.filter((exchange) => matchesSite(exchange, pageHostname))
      : storedExchanges;
    const scope = currentSiteOnly ? pageHostname : "all-sites";
    downloadDataAsFile(
      `dev-toolz-${scope}-api-traffic.json`,
      JSON.stringify(exchanges.map(addMediaLabels), null, 2),
      "application/json"
    );
  } finally {
    updateScopeActions();
  }
});

clearResponses.addEventListener("click", async () => {
  clearResponses.disabled = true;
  const currentSiteOnly = scopeFilter.value === "current";
  const pageHostname = currentPageHostname;
  let affectedCount: number;
  try {
    affectedCount = currentSiteOnly
      ? await countApiTrafficForPage(pageHostname)
      : await countApiTraffic();
  } catch {
    showClearFailure();
    return;
  }
  if (affectedCount === 0) {
    updateScopeActions();
    return;
  }
  const scope = currentSiteOnly ? pageHostname : "all sites";
  if (!window.confirm(`Permanently clear ${affectedCount} exchanges for ${scope}?`)) {
    updateScopeActions();
    return;
  }

  try {
    if (currentSiteOnly) {
      await clearApiTrafficForPage(pageHostname);
      for (const [id, manifest] of sessionManifestUrls) {
        if (manifest.pageHostname === pageHostname) sessionManifestUrls.delete(id);
      }
    } else {
      await clearApiTraffic();
      sessionManifestUrls.clear();
    }
    totalCount = await countApiTraffic();
    updateCount();
    await resetDisplayedTraffic();
    if (reconLoaded) await refreshReconWorkspace();
  } catch {
    showClearFailure();
    return;
  }
  updateScopeActions();
});

groupDuplicates.addEventListener("click", () => {
  groupingMode = groupingMode === "nearby" ? null : "nearby";
  updateGroupingButtons();
  renderDisplayedTraffic();
});

groupSiteDuplicates.addEventListener("click", () => {
  groupingMode = groupingMode === "site" ? null : "site";
  updateGroupingButtons();
  void resetDisplayedTraffic();
});

showHidden.addEventListener("click", () => {
  hiddenEndpoints.clear();
  hiddenMediaStreams.clear();
  renderDisplayedTraffic();
});

loadOlder.addEventListener("click", () => {
  void loadNextPage();
});

for (const control of [logCaptureSite, captureSite]) {
  control.addEventListener("change", () => void updateCapturePause(control));
}

scopeFilter.addEventListener("change", () => {
  if (scopeFilter.value !== "current" && groupingMode === "site") groupingMode = null;
  activeFilters = readFilters();
  updateScopeActions();
  updateGroupingButtons();
  void resetDisplayedTraffic();
});

filterForm.addEventListener("submit", (event) => {
  event.preventDefault();
  activeFilters = readFilters();
  activeConnectionFilter = readConnectionFilter();
  void resetDisplayedTraffic();
});

resetFilters.addEventListener("click", () => {
  filterForm.reset();
  activeFilters = readFilters();
  activeConnectionFilter = readConnectionFilter();
  void resetDisplayedTraffic();
});

chrome.devtools.network.onNavigated.addListener((url) => {
  currentPageHostname = getHostname(url);
  updateScopeActions();
  void refreshCaptureStatus();
  if (scopeFilter.value === "current") {
    activeFilters = readFilters();
    void resetDisplayedTraffic();
  }
  if (reconLoaded && reconScope.value === "current") renderReconWorkspace();
  if (protocolLoaded && protocolScope.value === "current") void refreshProtocolWorkspace(true);
  if (apiMapLoaded && apiMapScope.value === "current") renderApiMap();
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (
    areaName === "local" &&
    (changes.apiTrafficPauses || changes.settings)
  ) {
    void refreshCaptureStatus();
  }
});

async function refreshLogSearch(): Promise<void> {
  const range = readLogTimeRange();
  if (range.error) {
    logSearchError.textContent = range.error;
    logSearchStatus.textContent = "Time range needs attention";
    logTimeline.replaceChildren();
    logFieldList.replaceChildren();
    logSearchResults.replaceChildren();
    return;
  }
  logSearchAbort?.abort();
  const controller = new AbortController();
  logSearchAbort = controller;
  logSearchLoaded = false;
  logSearchSubmit.disabled = true;
  logSearchStatus.textContent = "Searching indexed history…";
  logSearchError.textContent = "";
  const source = readLogSource();
  try {
    const result = await queryLogHistoryOffThread(
      {
        rawQuery: logSearchQuery.value.trim(),
        source,
        earliestTimestamp: range.earliest,
        latestTimestamp: range.latest,
      },
      controller.signal,
      (scanned) => {
        if (logSearchAbort === controller) {
          logSearchStatus.textContent = `Searching indexed history… ${scanned.toLocaleString()} scanned`;
        }
      }
    );
    if (controller.signal.aborted) return;
    if (result.error) {
      activeLogSearch = null;
      logRecords = [];
      logSearchMatching = 0;
      logSearchScanned = 0;
      logSearchLoaded = true;
      logSearchError.textContent = result.error;
      logSearchStatus.textContent = "Query needs attention";
      logTimeline.replaceChildren();
      logFieldList.replaceChildren();
      logSearchResults.replaceChildren();
      return;
    }
    activeLogSearch = {
      expression: result.expression,
      source,
      earliest: range.earliest,
      latest: range.latest,
    };
    logRecords = result.records;
    logSearchMatching = result.matching;
    logSearchScanned = result.scanned;
    logSearchLoaded = true;
    const pending = pendingLogRecords;
    pendingLogRecords = [];
    for (const record of pending) applyLiveLogRecord(record);
    renderLogSearch();
  } catch {
    if (controller.signal.aborted) return;
    logSearchError.textContent = "Stored events could not be searched. Try again.";
    logSearchStatus.textContent = "Search unavailable";
  } finally {
    if (logSearchAbort === controller) {
      logSearchAbort = null;
      logSearchSubmit.disabled = false;
    }
  }
}

function streamLogRecord(record: LogRecord): void {
  if (!logSearchLoaded) {
    pendingLogRecords.unshift(record);
    pendingLogRecords = pendingLogRecords.slice(0, 2_000);
    return;
  }
  applyLiveLogRecord(record);
}

function applyLiveLogRecord(record: LogRecord): void {
  if (!activeLogSearch || logRecords.some((candidate) => candidate.id === record.id)) return;
  const { expression, source, earliest, latest } = activeLogSearch;
  if (!matchesLogRecord(record, null, source, earliest, latest)) return;
  logSearchScanned += 1;
  if (!matchesLogRecord(record, expression, source, earliest, latest)) return;
  logSearchMatching += 1;
  prependLogRecord(record);
  if (activeSection === "log-search") queueLogSearchRender();
}

function queueLogSearchRender(): void {
  if (logSearchRenderFrame !== null) return;
  logSearchRenderFrame = window.requestAnimationFrame(() => {
    logSearchRenderFrame = null;
    if (activeSection === "log-search") renderLogSearch();
  });
}

function prependLogRecord(record: LogRecord): void {
  if (logRecords.some((candidate) => candidate.id === record.id)) return;
  logRecords.unshift(record);
  if (logRecords.length > LOG_SEARCH_LIMITS.results) logRecords.pop();
}

function readLogSource(): LogSourceFilter {
  return logSearchSource.value === "api" || logSearchSource.value === "red-team"
    ? logSearchSource.value
    : "";
}

function updateCustomTimeVisibility(): void {
  const custom = logSearchTime.value === "custom";
  logCustomTime.hidden = !custom;
  if (!custom || (logSearchEarliest.value && logSearchLatest.value)) return;
  const latest = new Date();
  latest.setSeconds(0, 0);
  const earliest = new Date(latest.getTime() - 60 * 60_000);
  logSearchEarliest.value = toLocalDateTimeValue(earliest);
  logSearchLatest.value = toLocalDateTimeValue(latest);
}

function toLocalDateTimeValue(date: Date): string {
  const part = (value: number): string => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${part(date.getMonth() + 1)}-${part(date.getDate())}T${part(date.getHours())}:${part(date.getMinutes())}`;
}

function readLogTimeRange(): { earliest: number | null; latest: number | null; error: string | null } {
  const duration = logSearchTime.value === "15m"
    ? 15 * 60_000
    : logSearchTime.value === "1h"
      ? 60 * 60_000
      : logSearchTime.value === "4h"
        ? 4 * 60 * 60_000
        : logSearchTime.value === "24h"
          ? 24 * 60 * 60_000
          : logSearchTime.value === "7d"
            ? 7 * 24 * 60 * 60_000
            : null;
  if (duration !== null) return { earliest: Date.now() - duration, latest: null, error: null };
  if (logSearchTime.value !== "custom") return { earliest: null, latest: null, error: null };
  const earliest = new Date(logSearchEarliest.value).getTime();
  const latest = new Date(logSearchLatest.value).getTime();
  if (!Number.isFinite(earliest) || !Number.isFinite(latest)) {
    return { earliest: null, latest: null, error: "Choose both custom time boundaries." };
  }
  if (earliest > latest) {
    return { earliest: null, latest: null, error: "Earliest time must be before latest time." };
  }
  return { earliest, latest, error: null };
}

function renderLogSearch(): void {
  logSearchError.textContent = "";
  const shown = logRecords.length < logSearchMatching
    ? ` · newest ${logRecords.length.toLocaleString()} shown`
    : "";
  logSearchStatus.textContent = `Live · ${logSearchMatching.toLocaleString()} matching · ${logSearchScanned.toLocaleString()} indexed events scanned${shown}`;
  renderLogTimeline(logRecords);
  renderLogFields(logRecords);
  renderLogResults(logRecords);
}

function renderLogTimeline(records: LogRecord[]): void {
  if (records.length === 0) {
    logTimeline.replaceChildren();
    return;
  }
  const times = records.map((record) => Date.parse(record.timestamp)).filter(Number.isFinite);
  if (times.length === 0) {
    logTimeline.replaceChildren();
    return;
  }
  const bucketCount = 12;
  const minimum = Math.min(...times);
  const maximum = Math.max(...times);
  const span = Math.max(maximum - minimum, 60_000);
  const buckets = Array.from({ length: bucketCount }, () => 0);
  for (const time of times) {
    const index = Math.min(bucketCount - 1, Math.floor(((time - minimum) / span) * bucketCount));
    buckets[index] = (buckets[index] ?? 0) + 1;
  }
  const highest = Math.max(...buckets, 1);
  logTimeline.replaceChildren(...buckets.map((count, index) => {
    const item = document.createElement("li");
    const bar = document.createElement("span");
    bar.style.height = `${Math.max(2, Math.round((count / highest) * 44))}px`;
    const bucketStart = new Date(minimum + (span / bucketCount) * index);
    const accessibleLabel = `${count} events near ${bucketStart.toLocaleTimeString()}`;
    item.title = accessibleLabel;
    item.setAttribute("aria-label", accessibleLabel);
    const label = document.createElement("span");
    label.textContent = index === 0 || index === bucketCount - 1
      ? bucketStart.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
      : "";
    item.append(bar, label);
    return item;
  }));
}

function renderLogFields(records: LogRecord[]): void {
  const facets = new Map<string, { events: number; values: Map<string, number> }>();
  for (const record of records) {
    for (const [field, values] of Object.entries(record.fields)) {
      const facet = facets.get(field) ?? { events: 0, values: new Map<string, number>() };
      facet.events += 1;
      for (const value of new Set(values)) {
        facet.values.set(value, (facet.values.get(value) ?? 0) + 1);
      }
      facets.set(field, facet);
    }
  }
  const available = [...facets]
    .sort(([left, leftFacet], [right, rightFacet]) =>
      rightFacet.events - leftFacet.events || left.localeCompare(right)
    )
    .slice(0, 30);
  if (available.length === 0) {
    const empty = document.createElement("p");
    empty.textContent = "Fields appear when events match.";
    logFieldList.replaceChildren(empty);
    return;
  }
  logFieldList.replaceChildren(...available.map(([field, facet]) => {
    const details = document.createElement("details");
    details.className = "log-field-facet";
    const summary = document.createElement("summary");
    const fieldName = document.createElement("code");
    fieldName.textContent = field;
    const coverage = document.createElement("span");
    coverage.className = "log-field-facet-meta";
    coverage.textContent = `${facet.events} events · ${facet.values.size} values`;
    summary.append(fieldName, coverage);

    const values = document.createElement("ul");
    values.className = "log-field-values";
    const topValues = [...facet.values]
      .sort(([left, leftCount], [right, rightCount]) =>
        rightCount - leftCount || left.localeCompare(right)
      )
      .slice(0, 10);
    for (const [value, count] of topValues) {
      const item = document.createElement("li");
      const button = document.createElement("button");
      button.type = "button";
      button.title = `Add ${field}=${value} to the query`;
      const label = document.createElement("span");
      label.textContent = value;
      const frequency = document.createElement("span");
      frequency.textContent = String(count);
      frequency.setAttribute("aria-label", `${count} matching events`);
      button.append(label, frequency);
      button.addEventListener("click", () => appendLogQuery(field, value));
      item.appendChild(button);
      values.appendChild(item);
    }
    details.append(summary, values);
    return details;
  }));
}

function createLogFilterButton(
  field: string,
  value: string,
  label = value,
  source?: LogSourceFilter,
  _record?: LogRecord
): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "log-filter-link";
  button.textContent = label;
  button.title = `Add ${field}=${value} to Log Search`;
  button.addEventListener("click", () => confirmAddLogFilter(field, value, source));
  return button;
}

function confirmAddLogFilter(
  field: string,
  value: string,
  source?: LogSourceFilter
): void {
  const escapedValue = /\s|["']/.test(value) ? JSON.stringify(value) : value;
  const clause = `${field}=${escapedValue}`;
  if (!window.confirm(`Add this filter to Log Search?\n\n${clause}`)) return;
  if (source) logSearchSource.value = source;
  logSearchTime.value = "all";
  updateCustomTimeVisibility();
  appendLogQuery(field, value);
  setActiveSection("log-search");
  logSearchQuery.focus();
}

function appendLogQuery(field: string, value: string): void {
  const escapedValue = /\s|["']/.test(value) ? JSON.stringify(value) : value;
  const clause = `${field}=${escapedValue}`;
  logSearchQuery.value = `${logSearchQuery.value.trim()} ${clause}`.trim();
  void refreshLogSearch();
  logSearchQuery.focus();
}

function renderLogResults(records: LogRecord[]): void {
  if (records.length === 0) {
    const empty = document.createElement("p");
    empty.className = "log-empty";
    empty.textContent = logSearchScanned > 0
      ? "No indexed events match this search."
      : "No traffic or red-team protocol events are stored yet.";
    logSearchResults.replaceChildren(empty);
    return;
  }
  const rendered: HTMLElement[] = [];
  const seenAttachments = new Set<string>();
  for (const record of records) {
    const attachedAt = record.fields["capture.attached_at"]?.[0];
    const transition = record.fields["capture.transition"]?.[0];
    if (attachedAt && transition && transition !== "initial" && !seenAttachments.has(attachedAt)) {
      seenAttachments.add(attachedAt);
      rendered.push(createJourneyMarker(record, transition));
    }
    rendered.push(createLogResult(record));
  }
  logSearchResults.replaceChildren(...rendered);
}

function createJourneyMarker(record: LogRecord, transition: string): HTMLElement {
  const marker = document.createElement("aside");
  marker.className = "log-journey-marker";
  const previousHost = record.fields["capture.previous_page_host"]?.[0] ?? "another page";
  const pageHost = record.fields["page.host"]?.[0] ?? "this page";
  const label = transition === "new-window"
    ? "new window"
    : transition === "navigation"
      ? "navigation"
      : "tab switch";
  marker.textContent = `Capture moved ${previousHost} → ${pageHost} · ${label} · attached after page load; initial requests may be missing.`;
  return marker;
}

function createStarButton(recordId: string): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "event-star-button";
  button.dataset.eventId = recordId;
  button.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    void toggleStarredLogEvent(recordId);
  });
  updateStarButton(button);
  return button;
}

function updateStarButton(button: HTMLButtonElement): void {
  const recordId = button.dataset.eventId ?? "";
  const starred = starredLogEventIds.has(recordId);
  button.textContent = starred ? "★" : "☆";
  button.title = starred ? "Remove star" : "Star event";
  button.setAttribute("aria-label", button.title);
  button.setAttribute("aria-pressed", String(starred));
  button.disabled = starWritePending;
}

function updateStarButtons(): void {
  document.querySelectorAll<HTMLButtonElement>(".event-star-button").forEach(updateStarButton);
}

async function toggleStarredLogEvent(recordId: string): Promise<void> {
  if (starWritePending) return;
  const next = new Set(starredLogEventIds);
  if (next.has(recordId)) next.delete(recordId);
  else {
    if (next.size >= MAX_STARRED_LOG_EVENTS) {
      window.alert(`You can star up to ${MAX_STARRED_LOG_EVENTS.toLocaleString()} events. Remove a star before adding another.`);
      return;
    }
    next.add(recordId);
  }
  starWritePending = true;
  updateStarButtons();
  const saved = await persistStarredLogEventIds(next);
  if (saved) starredLogEventIds = next;
  else window.alert("Could not save this star. Try again.");
  starWritePending = false;
  updateStarButtons();
}

function createLogResult(record: LogRecord): HTMLElement {
  const article = document.createElement("article");
  article.className = "log-result";
  const heading = document.createElement("div");
  heading.className = "log-result-heading";
  const titleContent = document.createElement("div");
  titleContent.className = "log-result-title";
  const title = document.createElement("h3");
  title.textContent = record.title;
  const metadata = document.createElement("p");
  metadata.textContent = `${record.source === "api" ? "Traffic event" : "Red-team protocol event"} · ${new Date(record.timestamp).toLocaleString()}`;
  titleContent.append(title, metadata);
  heading.append(titleContent, createStarButton(record.id));
  const summary = document.createElement("p");
  summary.className = "log-result-summary";
  summary.textContent = record.summary;
  const details = document.createElement("details");
  const detailsSummary = document.createElement("summary");
  detailsSummary.textContent = "Fields";
  const list = document.createElement("dl");
  for (const [field, values] of Object.entries(record.fields).slice(0, 40)) {
    const term = document.createElement("dt");
    term.textContent = field;
    const description = document.createElement("dd");
    description.textContent = values.join(", ");
    list.append(term, description);
  }
  details.append(detailsSummary, list);
  article.append(heading, summary, details);
  return article;
}

async function initializePanel(): Promise<void> {
  starredLogEventIds = await loadStarredLogEventIds();
  const inspectedPageUrl = await getInspectedPageUrl();
  currentPageHostname = getHostname(inspectedPageUrl);
  activeFilters = readFilters();
  await refreshCaptureStatus(inspectedPageUrl);
  try {
    await enforceTrafficRetention({});
  } catch (error) {
    console.warn("Traffic retention maintenance failed", error);
  }
  totalCount = await countApiTraffic();
  updateCount();
  updateScopeActions();
  await Promise.all([loadNextPage(), refreshLogSearch()]);
}

function setActiveSection(section: ToolSection): void {
  activeSection = section;
  const showSearch = section === "log-search";
  const showTraffic = section === "traffic";
  const showRedTeam = section === "red-team";
  if (!showSearch && logSearchRenderFrame !== null) {
    window.cancelAnimationFrame(logSearchRenderFrame);
    logSearchRenderFrame = null;
  }
  logSearchSection.hidden = !showSearch;
  trafficSection.hidden = !showTraffic;
  redTeamSection.hidden = !showRedTeam;
  showLogSearchSection.setAttribute("aria-pressed", String(showSearch));
  showTrafficSection.setAttribute("aria-pressed", String(showTraffic));
  showRedTeamSection.setAttribute("aria-pressed", String(showRedTeam));
  document.title = showSearch
    ? "Dev Toolz Log Search"
    : showTraffic
      ? "Dev Toolz API Traffic"
      : `Dev Toolz Red Team ${activeRedTeamTool}`;
}

async function setActiveRedTeamTool(tool: RedTeamTool): Promise<void> {
  activeRedTeamTool = tool;
  for (const [name, controls] of Object.entries(redTeamTools)) {
    const active = name === tool;
    controls.button.setAttribute("aria-pressed", String(active));
    controls.panel.hidden = !active;
  }
  document.title = `Dev Toolz Red Team ${tool}`;
  if (tool === "recon" && !reconLoaded) await refreshReconWorkspace();
  if (tool === "protocols" && !protocolLoaded) await refreshProtocolWorkspace(true);
  if (tool === "api-map" && !apiMapLoaded) await refreshApiMap();
  if (tool === "race-lab" && !raceLoaded) await loadRaceFlows();
}

function readProtocolFilters(): ProtocolFilters {
  const transports: ProtocolTransport[] = ["graphql-http", "websocket", "sse", "webtransport"];
  const transport = transports.includes(protocolTransport.value as ProtocolTransport)
    ? protocolTransport.value as ProtocolTransport
    : "";
  const directions = ["sent", "received", "none"] as const;
  const direction = directions.includes(protocolDirection.value as (typeof directions)[number])
    ? protocolDirection.value as (typeof directions)[number]
    : "";
  return {
    pageHostname: protocolScope.value === "current" ? currentPageHostname : null,
    transport,
    direction,
    operationName: protocolOperation.value.trim(),
    text: protocolText.value.trim(),
  };
}

async function refreshProtocolWorkspace(reset: boolean): Promise<void> {
  protocolState.hidden = false;
  protocolState.textContent = "Loading protocol history…";
  protocolEvents.replaceChildren();
  if (reset) {
    displayedProtocolEvents = [];
    oldestProtocolSequence = null;
  }
  try {
    if (!reconLoaded) {
      reconExchanges = await getAllApiTraffic();
      reconLoaded = true;
    }
    await loadProtocolPage();
    protocolLoaded = true;
  } catch {
    protocolState.textContent = "Could not load protocol history. Try again.";
  }
}

async function loadProtocolPage(): Promise<void> {
  loadOlderProtocols.disabled = true;
  const page = await getProtocolEvents(oldestProtocolSequence, PAGE_SIZE + 1, readProtocolFilters());
  const events = page.slice(0, PAGE_SIZE);
  displayedProtocolEvents.push(...events);
  oldestProtocolSequence = events[events.length - 1]?.sequence ?? oldestProtocolSequence;
  loadOlderProtocols.hidden = page.length <= PAGE_SIZE;
  loadOlderProtocols.disabled = false;
  renderProtocolWorkspace();
}

function createGraphqlHttpEvents(): ProtocolEvent[] {
  const filters = readProtocolFilters();
  return reconExchanges.flatMap((exchange): ProtocolEvent[] => {
    const body = exchange.request.body;
    const raw = body?.kind === "json" ? JSON.stringify(body.value) : body?.raw;
    const graphql = extractGraphqlOperation(body?.kind === "json" ? body.value : raw);
    if (!graphql) return [];
    const event: ProtocolEvent = {
      sequence: exchange.sequence,
      sessionId: `http-${exchange.sequence ?? exchange.startedAt}`,
      pageUrl: exchange.pageUrl ?? "",
      url: exchange.request.url,
      transport: "graphql-http",
      kind: "message",
      direction: "sent",
      timestamp: exchange.startedAt,
      payload: raw,
      payloadBytes: raw ? new TextEncoder().encode(raw).length : 0,
      truncated: false,
      binary: false,
      graphql,
    };
    return matchesProtocolEvent(event, filters) ? [event] : [];
  }).slice(0, PAGE_SIZE);
}

function renderProtocolWorkspace(): void {
  const events = [...displayedProtocolEvents, ...createGraphqlHttpEvents()]
    .sort((left, right) => right.timestamp.localeCompare(left.timestamp));
  if (events.length === 0) {
    protocolEvents.replaceChildren();
    protocolState.hidden = false;
    protocolState.textContent = "No matching protocol events. Generate traffic, then try again.";
    return;
  }
  protocolState.hidden = true;
  const sessions = new Map<string, ProtocolEvent[]>();
  for (const event of events) {
    const key = `${event.transport}\n${event.url}\n${event.sessionId}`;
    const session = sessions.get(key);
    if (session) session.push(event);
    else sessions.set(key, [event]);
  }
  protocolEvents.replaceChildren(...[...sessions.values()].map(createProtocolSession));
}

function createProtocolSession(events: ProtocolEvent[]): HTMLElement {
  const section = document.createElement("section");
  section.className = "protocol-event";
  const first = events[0];
  if (!first) return section;
  const heading = document.createElement("h2");
  heading.className = "protocol-event-header";
  const badge = document.createElement("span");
  badge.className = "protocol-badge";
  badge.textContent = formatProtocolTransport(first.transport);
  const title = document.createElement("span");
  title.textContent = first.graphql?.name ?? first.eventName ?? first.kind;
  heading.append(badge, title);
  const url = document.createElement("p");
  url.className = "protocol-url";
  url.textContent = first.url;
  section.append(heading, url, ...events.map(createProtocolEventView));
  return section;
}

function createProtocolEventView(event: ProtocolEvent): HTMLElement {
  const row = document.createElement("div");
  row.className = "protocol-event-row";
  const details = document.createElement("details");
  const summary = document.createElement("summary");
  const operation = event.graphql ? ` · ${event.graphql.type} ${event.graphql.name ?? "anonymous"}` : "";
  summary.textContent = `${event.direction} · ${event.kind}${operation} · ${formatByteSize(event.payloadBytes)} · ${new Date(event.timestamp).toLocaleTimeString()}${event.truncated ? " · truncated" : ""}${event.binary ? " · binary" : ""}`;
  const fields = document.createElement("div");
  const logRecord = createProtocolLogRecord(event);
  fields.className = "protocol-log-fields";
  fields.append(
    createLogFilterButton("transport", event.transport, `transport=${event.transport}`, "red-team", logRecord),
    createLogFilterButton("kind", event.kind, `kind=${event.kind}`, "red-team", logRecord),
    createLogFilterButton("direction", event.direction, `direction=${event.direction}`, "red-team", logRecord)
  );
  try {
    const url = new URL(event.url);
    fields.append(
      createLogFilterButton("host", url.hostname, `host=${url.hostname}`, "red-team", logRecord),
      createLogFilterButton("path", url.pathname, `path=${url.pathname}`, "red-team", logRecord)
    );
  } catch {
    // Malformed captured URLs remain visible in the protocol session.
  }
  if (event.eventName) fields.appendChild(createLogFilterButton("event", event.eventName, `event=${event.eventName}`, "red-team", logRecord));
  if (event.graphql?.name) {
    fields.appendChild(createLogFilterButton("graphql.operation", event.graphql.name, `graphql.operation=${event.graphql.name}`, "red-team", logRecord));
  }
  details.append(summary, fields, createCopyButton("Copy event", JSON.stringify(event, null, 2)));
  if (event.payload !== undefined) {
    const payload = createCodeBlock(event.payload);
    payload.className = "protocol-payload";
    details.appendChild(payload);
  }
  row.append(createStarButton(logRecord.id), details);
  return row;
}

function formatProtocolTransport(transport: ProtocolTransport): string {
  return transport === "graphql-http" ? "GraphQL HTTP" : transport === "sse" ? "SSE" : transport === "websocket" ? "WebSocket" : "WebTransport";
}

async function exportProtocolHistory(): Promise<void> {
  exportProtocols.disabled = true;
  try {
    const events = await getProtocolEvents(null, Number.MAX_SAFE_INTEGER, readProtocolFilters());
    downloadDataAsFile("dev-toolz-protocol-events.json", JSON.stringify([...events, ...createGraphqlHttpEvents()], null, 2), "application/json");
  } finally {
    exportProtocols.disabled = false;
  }
}

async function refreshApiMap(): Promise<void> {
  apiMapRefresh.disabled = true;
  apiMapState.hidden = false;
  apiMapState.textContent = "Building observed API draft…";
  try {
    apiMapExchanges = await getAllApiTraffic();
    apiMapLoaded = true;
    renderApiMap();
  } catch {
    apiMapRegion.hidden = true;
    apiMapState.textContent = "Could not load captured traffic. Try refreshing.";
  } finally {
    apiMapRefresh.disabled = false;
  }
}

function getScopedApiMapExchanges(): ApiExchange[] {
  return apiMapScope.value === "current"
    ? apiMapExchanges.filter((exchange) => matchesSite(exchange, currentPageHostname))
    : apiMapExchanges;
}

function getFilteredApiMapEntries(): AttackMapEntry[] {
  const drift = apiMapDrift.value;
  const method = apiMapMethod.value.toLowerCase();
  const hostname = apiMapHostname.value.trim().toLowerCase();
  const routeText = apiMapRoute.value.trim().toLowerCase();
  return compareOpenApi(buildObservedRoutes(getScopedApiMapExchanges()), apiMapBaseline).filter((entry) =>
    (!drift || entry.state === drift) &&
    (!method || entry.method === method) &&
    (!hostname || entry.observed?.hostname.includes(hostname) === true) &&
    (!routeText || entry.path.toLowerCase().includes(routeText))
  );
}

function renderApiMap(): void {
  if (!apiMapLoaded) return;
  const entries = getFilteredApiMapEntries();
  if (entries.length === 0) {
    apiMapEntries.replaceChildren();
    apiMapRegion.hidden = true;
    apiMapState.hidden = false;
    apiMapState.textContent = "No routes match this scope and filter.";
    return;
  }
  apiMapState.hidden = false;
  apiMapState.textContent = `${entries.length} routes · ${apiMapBaseline ? "compared with imported baseline" : "observed draft; completeness is not guaranteed"}`;
  apiMapRegion.hidden = false;
  apiMapEntries.replaceChildren(...entries.map(createApiMapRow));
}

function createApiMapRow(entry: AttackMapEntry): HTMLTableRowElement {
  const row = document.createElement("tr");
  const state = document.createElement("td");
  const badge = document.createElement("span");
  badge.className = `protocol-badge map-state-${entry.state}`;
  badge.textContent = entry.state[0]?.toUpperCase() + entry.state.slice(1);
  state.appendChild(badge);
  const method = document.createElement("td");
  method.appendChild(createLogFilterButton("method", entry.method.toUpperCase(), entry.method.toUpperCase(), "api"));
  const route = document.createElement("td");
  const routeCode = createLogFilterButton(
    "path",
    entry.path.replace(/\{[^/{}]+\}/g, "*"),
    `${entry.observed?.hostname ?? "baseline"}${entry.path}`,
    "api"
  );
  routeCode.classList.add("recon-route");
  route.appendChild(routeCode);
  const requests = document.createElement("td");
  requests.textContent = entry.observed ? String(entry.observed.requestCount) : "Not observed";
  const shape = document.createElement("td");
  shape.className = "recon-signals";
  shape.textContent = entry.observed
    ? `Statuses: ${entry.observed.statuses.join(", ") || "none"} · Query: ${entry.observed.queryFields.join(", ") || "none"} · Body: ${Object.keys(entry.observed.bodyFields).join(", ") || "none"} · Content: ${entry.observed.contentTypes.join(", ") || "none"}`
    : "Declared in baseline; no matching traffic observed.";
  row.append(state, method, route, requests, shape);
  return row;
}

async function importOpenApiBaseline(): Promise<void> {
  const file = apiMapImport.files?.[0];
  apiMapImport.value = "";
  if (!file) return;
  try {
    if (file.size > MAX_OPENAPI_IMPORT_BYTES) throw new Error("OpenAPI file must be 5 MiB or smaller.");
    const parsed = parseOpenApiBaseline(await file.text());
    apiMapBaseline = parsed;
    renderApiMap();
  } catch (error) {
    apiMapState.hidden = false;
    apiMapState.textContent = error instanceof Error ? error.message : "Could not import OpenAPI JSON.";
  }
}

function exportObservedOpenApi(): void {
  const scope = apiMapScope.value === "current" ? currentPageHostname || "current-site" : "all-sites";
  downloadDataAsFile(
    `dev-toolz-${scope}-observed-openapi.json`,
    JSON.stringify(generateOpenApi(getScopedApiMapExchanges()), null, 2),
    "application/json"
  );
}

async function loadRaceFlows(selectedId?: string): Promise<void> {
  try {
    raceFlows = await getRaceFlows();
    raceLoaded = true;
    raceFlowSelect.replaceChildren(
      createOption("", raceFlows.length ? "Select a flow" : "No saved flows"),
      ...raceFlows.map((flow) => createOption(flow.id, flow.name))
    );
    if (selectedId && raceFlows.some((flow) => flow.id === selectedId)) raceFlowSelect.value = selectedId;
    renderRaceLab();
  } catch {
    raceState.textContent = "Could not load saved flows. Reopen the panel and try again.";
  }
}

function getSelectedRaceFlow(): RaceFlow | undefined {
  return raceFlows.find((flow) => flow.id === raceFlowSelect.value);
}

async function createNewRaceFlow(): Promise<void> {
  const saved = await saveRaceFlow(createRaceFlow(raceFlowName.value));
  raceFlowName.value = "";
  await loadRaceFlows(saved.id);
}

async function renameSelectedRaceFlow(): Promise<void> {
  const flow = getSelectedRaceFlow();
  if (!flow || !raceFlowName.value.trim()) return;
  const saved = await saveRaceFlow({ ...flow, name: raceFlowName.value });
  raceFlowName.value = "";
  await loadRaceFlows(saved.id);
}

async function deleteSelectedRaceFlow(): Promise<void> {
  const flow = getSelectedRaceFlow();
  if (!flow || !window.confirm(`Permanently delete the flow “${flow.name}”?`)) return;
  await deleteRaceFlow(flow.id);
  await loadRaceFlows();
}

function renderRaceLab(): void {
  const flow = getSelectedRaceFlow();
  raceFlowRename.disabled = !flow || !raceFlowName.value.trim();
  raceFlowDelete.disabled = !flow;
  raceSteps.replaceChildren();
  if (!flow) {
    raceState.hidden = false;
    raceState.textContent = "Create or select a flow, then add captured Recon requests.";
    raceRun.disabled = true;
    return;
  }
  raceState.hidden = false;
  raceState.textContent = flow.steps.length
    ? `${flow.steps.length} steps · select one synchronized race step.`
    : "This flow has no steps. Add a request from Recon.";
  raceSteps.replaceChildren(...flow.steps.map((step, index) => createRaceStep(flow, step, index)));
  void updateRaceRunState(flow);
}

function createRaceStep(flow: RaceFlow, step: RaceFlow["steps"][number], index: number): HTMLLIElement {
  const item = document.createElement("li");
  item.className = "race-step";
  const main = document.createElement("div");
  main.className = "race-step-main";
  const race = document.createElement("input");
  race.type = "radio";
  race.name = "race-step";
  race.checked = flow.raceStepIndex === index;
  race.setAttribute("aria-label", `Synchronize step ${index + 1}`);
  race.addEventListener("change", () => void updateRaceFlow({ ...flow, raceStepIndex: index }));
  const code = document.createElement("code");
  code.textContent = `${step.method} ${new URL(step.url).pathname}`;
  const up = createRaceStepButton("Move up", index === 0, () => moveRaceStep(flow, index, index - 1));
  const down = createRaceStepButton("Move down", index === flow.steps.length - 1, () => moveRaceStep(flow, index, index + 1));
  const remove = createRaceStepButton("Remove", false, () => removeRaceStep(flow, index));
  main.append(race, code, up, down, remove);
  item.appendChild(main);
  return item;
}

function createRaceStepButton(label: string, disabled: boolean, action: () => void): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = label;
  button.disabled = disabled;
  button.addEventListener("click", action);
  return button;
}

function moveRaceStep(flow: RaceFlow, from: number, to: number): void {
  const steps = [...flow.steps];
  const [step] = steps.splice(from, 1);
  if (!step) return;
  steps.splice(to, 0, step);
  const raceStepIndex = flow.raceStepIndex === from ? to
    : flow.raceStepIndex === to ? from : flow.raceStepIndex;
  void updateRaceFlow({ ...flow, steps, raceStepIndex });
}

function removeRaceStep(flow: RaceFlow, index: number): void {
  const steps = flow.steps.filter((_, stepIndex) => stepIndex !== index);
  const raceStepIndex = flow.raceStepIndex === index ? -1
    : flow.raceStepIndex > index ? flow.raceStepIndex - 1 : flow.raceStepIndex;
  void updateRaceFlow({ ...flow, steps, raceStepIndex });
}

async function updateRaceFlow(flow: RaceFlow): Promise<void> {
  const saved = await saveRaceFlow(flow);
  await loadRaceFlows(saved.id);
}

async function updateRaceRunState(flow: RaceFlow): Promise<void> {
  if (activeRaceRunId) {
    raceRun.disabled = true;
    return;
  }
  try {
    validateRaceFlow(flow, await getInspectedPageOrigin(), Number(raceConcurrency.value));
    raceRun.disabled = false;
  } catch {
    raceRun.disabled = true;
  }
}

async function reviewAndRunRace(): Promise<void> {
  const flow = getSelectedRaceFlow();
  if (!flow || activeRaceRunId) return;
  const pageUrl = await getInspectedPageUrl();
  const concurrency = Number(raceConcurrency.value);
  let origin: string;
  try {
    origin = new URL(pageUrl).origin;
    validateRaceFlow(flow, origin, concurrency);
  } catch (error) {
    raceState.textContent = error instanceof Error ? error.message : "The flow is not ready.";
    return;
  }
  const raceStep = flow.steps[flow.raceStepIndex];
  if (!raceStep) return;
  const target = new URL(raceStep.url);
  const requestCount = flow.steps.length - 1 + concurrency;
  const confirmed = window.confirm(
    `Authorized test only. Run ${requestCount} requests?\n\nRace: ${raceStep.method} ${target.origin}${target.pathname}\nConcurrency: ${concurrency}\n\nThis can change target data.`
  );
  if (!confirmed) return;

  const runId = crypto.randomUUID();
  activeRaceRunId = runId;
  setRaceRunning(true);
  raceState.textContent = "Running setup steps, then launching the synchronized burst…";
  raceResults.replaceChildren();
  try {
    const response = await sendToBackground("RUN_RACE_FLOW", {
      tabId: chrome.devtools.inspectedWindow.tabId,
      runId,
      expectedPageUrl: pageUrl,
      flow,
      concurrency,
    });
    if (!response.success || !response.data) throw new Error(response.error ?? "Race did not return results.");
    renderRaceResults(response.data);
  } catch (error) {
    raceState.textContent = error instanceof Error ? error.message : "Race failed.";
  } finally {
    if (activeRaceRunId === runId) activeRaceRunId = null;
    setRaceRunning(false);
    void updateRaceRunState(flow);
  }
}

async function cancelActiveRace(): Promise<void> {
  const runId = activeRaceRunId;
  if (!runId) return;
  raceCancel.disabled = true;
  raceState.textContent = "Cancelling outstanding requests…";
  const response = await sendToBackground("CANCEL_RACE_FLOW", {
    tabId: chrome.devtools.inspectedWindow.tabId,
    runId,
  });
  if (!response.success || !response.data?.cancelled) {
    raceState.textContent = response.error ?? "The run already finished or could not be cancelled.";
  }
}

function setRaceRunning(running: boolean): void {
  raceFlowSelect.disabled = running;
  raceFlowCreate.disabled = running;
  raceFlowRename.disabled = running || !getSelectedRaceFlow();
  raceFlowDelete.disabled = running || !getSelectedRaceFlow();
  raceConcurrency.disabled = running;
  raceRun.disabled = running;
  raceCancel.hidden = !running;
  raceCancel.disabled = false;
}

function renderRaceResults(result: RaceRunResult): void {
  raceState.hidden = false;
  raceState.textContent = `${result.state[0]?.toUpperCase()}${result.state.slice(1)} · ${result.outcomes.length} outcomes${result.error ? ` · ${result.error}` : ""}`;
  if (result.outcomes.length === 0) {
    raceResults.replaceChildren();
    return;
  }
  const groups = new Map<string, RaceOutcome[]>();
  for (const outcome of result.outcomes) {
    const key = `${outcome.status}\u0000${outcome.error ?? ""}\u0000${outcome.responseBytes}\u0000${outcome.preview}`;
    const group = groups.get(key);
    if (group) group.push(outcome);
    else groups.set(key, [outcome]);
  }
  const heading = document.createElement("h2");
  heading.textContent = "Grouped outcomes";
  const list = document.createElement("div");
  list.className = "protocol-events";
  list.replaceChildren(...[...groups.values()].map(createRaceOutcomeGroup));
  raceResults.replaceChildren(heading, list);
}

function createRaceOutcomeGroup(outcomes: RaceOutcome[]): HTMLElement {
  const first = outcomes[0];
  const section = document.createElement("section");
  section.className = "protocol-event";
  if (!first) return section;
  const heading = document.createElement("h3");
  heading.textContent = `${outcomes.length}× ${first.error ?? `HTTP ${first.status}`} · ${formatByteSize(first.responseBytes)}${first.truncated ? " · truncated" : ""}`;
  const durations = document.createElement("p");
  durations.className = "protocol-meta";
  durations.textContent = `Durations: ${outcomes.map((outcome) => `${Math.round(outcome.durationMs)} ms`).join(", ")}`;
  section.append(heading, durations);
  if (first.preview) {
    const preview = createCodeBlock(first.preview);
    preview.className = "protocol-payload";
    section.appendChild(preview);
  }
  return section;
}

function createAddToFlowButton(exchange: ApiExchange): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = "Add to flow";
  button.addEventListener("click", async () => {
    button.disabled = true;
    try {
      if (!raceLoaded) await loadRaceFlows();
      let flow = getSelectedRaceFlow();
      if (!flow) flow = await saveRaceFlow(createRaceFlow("Captured flow"));
      const snapshot = createRaceSnapshot(exchange, await getInspectedPageOrigin());
      const saved = await saveRaceFlow({ ...flow, steps: [...flow.steps, snapshot] });
      await loadRaceFlows(saved.id);
      button.textContent = "Added";
    } catch (error) {
      button.textContent = error instanceof Error ? error.message : "Could not add";
    } finally {
      window.setTimeout(() => { button.disabled = false; button.textContent = "Add to flow"; }, 1800);
    }
  });
  return button;
}

async function refreshReconWorkspace(): Promise<void> {
  refreshRecon.disabled = true;
  reconState.hidden = false;
  reconState.textContent = "Building endpoint inventory…";
  reconTableRegion.hidden = true;
  try {
    // simplification: recon materializes history; index routes during capture if datasets outgrow memory.
    reconExchanges = await getAllApiTraffic();
    reconLoaded = true;
    renderReconWorkspace();
  } catch {
    reconCount.textContent = "Unavailable";
    reconState.textContent = "Could not load captured traffic. Try refreshing the inventory.";
  } finally {
    refreshRecon.disabled = false;
  }
}

function renderReconWorkspace(): void {
  if (!reconLoaded) return;
  const currentSiteOnly = reconScope.value === "current";
  const scopedExchanges = currentSiteOnly
    ? reconExchanges.filter((exchange) => matchesSite(exchange, currentPageHostname))
    : reconExchanges;
  const endpoints = createReconEndpoints(scopedExchanges);
  reconCount.textContent = `${endpoints.length} endpoints · ${scopedExchanges.length} exchanges`;

  if (currentSiteOnly && !currentPageHostname) {
    showReconEmpty("Inspect a website to build its endpoint inventory.");
    return;
  }
  if (endpoints.length === 0) {
    showReconEmpty("No captured endpoints in this scope. Browse the target, then refresh inventory.");
    return;
  }

  reconState.hidden = true;
  reconTableRegion.hidden = false;
  reconEndpoints.replaceChildren(...endpoints.map(createReconEndpointRow));
}

function showReconEmpty(message: string): void {
  reconEndpoints.replaceChildren();
  reconTableRegion.hidden = true;
  reconState.textContent = message;
  reconState.hidden = false;
}

async function loadNextPage(): Promise<void> {
  if (groupingMode === "site") {
    // simplification: site grouping materializes history; move grouping into IndexedDB if it grows slow.
    const storedExchanges = await getAllApiTraffic();
    displayedExchanges = storedExchanges.filter((exchange) =>
      matchesApiTraffic(exchange, activeFilters)
    );
    loadOlder.hidden = true;
    renderDisplayedTraffic();
    updateGroupingButtons();
    return;
  }

  loadOlder.disabled = true;
  const page = await getApiTrafficPage(oldestSequence, PAGE_SIZE + 1, activeFilters);
  const exchanges = page.slice(0, PAGE_SIZE);
  displayedExchanges.push(...exchanges);
  const lastSequence = exchanges[exchanges.length - 1]?.sequence;
  if (lastSequence !== undefined) oldestSequence = lastSequence;
  loadOlder.hidden = page.length <= PAGE_SIZE;
  loadOlder.disabled = false;
  renderDisplayedTraffic();
  updateGroupingButtons();
}

async function resetDisplayedTraffic(): Promise<void> {
  oldestSequence = null;
  displayedExchanges = [];
  loadOlder.hidden = true;
  emptyState.textContent = "Loading matching API traffic…";
  requestList.replaceChildren(emptyState);
  await loadNextPage();
}

function readConnectionFilter(): ConnectionChainFilter {
  const value = connectionFilter.value;
  return value === "tcp-handshake" || value === "quic-handshake" || value === "reused"
    ? value
    : "";
}

function readFilters(): ApiTrafficFilters {
  const analysis = analysisFilter.value;
  const attribution = routeFilter.value;
  const status = statusFilter.value;
  return {
    pageHostname: scopeFilter.value === "current" ? currentPageHostname : null,
    analysis: [
      "target",
      "focus",
      "discovery",
      "writes",
      "failures",
      "videos",
      "direct-videos",
      "stream-manifests",
      "streaming-videos",
    ].includes(analysis)
      ? (analysis as ApiTrafficFilters["analysis"])
      : "",
    domain: domainFilter.value.trim(),
    attribution:
      attribution === "unknown" ||
      attribution === "unknown-source" ||
      attribution === "unknown-destination" ||
      attribution === "no-response" ||
      attribution === "page-initiated" ||
      attribution === "extension-initiated" ||
      attribution === "unknown-initiator"
        ? attribution
        : "",
    method: methodFilter.value,
    status:
      status === "failed" || /^[2-5]xx$/.test(status)
        ? (status as ApiTrafficFilters["status"])
        : "",
    mimeType: mimeFilter.value.trim(),
  };
}

function getInspectedPageUrl(): Promise<string> {
  return new Promise((resolve) => {
    chrome.devtools.inspectedWindow.eval("location.href", (result, exceptionInfo) => {
      resolve(!exceptionInfo && typeof result === "string" ? result : "");
    });
  });
}

function getInspectedPageOrigin(): Promise<string> {
  return new Promise((resolve) => {
    chrome.devtools.inspectedWindow.eval("location.origin", (result, exceptionInfo) => {
      resolve(!exceptionInfo && typeof result === "string" ? result : "");
    });
  });
}


function getHostname(rawUrl: string): string {
  try {
    const url = new URL(rawUrl);
    return url.protocol === "http:" || url.protocol === "https:"
      ? url.hostname.toLowerCase()
      : "";
  } catch {
    return "";
  }
}

function getEndpointKey(rawUrl: string): string {
  try {
    const url = new URL(rawUrl);
    return `${url.origin}${url.pathname}`;
  } catch {
    return rawUrl;
  }
}

function createReconEndpoints(exchanges: ApiExchange[]): ReconEndpoint[] {
  const endpoints = new Map<string, ReconEndpoint>();
  for (const exchange of exchanges) {
    const target = getReconTarget(exchange.request.url);
    const method = exchange.request.method.toUpperCase();
    const key = `${method}\u0000${target.route}`;
    let endpoint = endpoints.get(key);
    if (!endpoint) {
      endpoint = {
        key,
        method,
        hostname: target.hostname,
        route: target.route,
        requestCount: 0,
        statuses: new Set(),
        queryNames: new Set(),
        bodyFields: new Set(),
        identityHeaders: new Set(),
        samples: [],
      };
      endpoints.set(key, endpoint);
    }
    endpoint.requestCount += 1;
    endpoint.statuses.add(exchange.response.status);
    collectReconSignals(endpoint, exchange);
    if (endpoint.samples.length === 0) endpoint.samples.push(exchange);
  }
  return [...endpoints.values()].sort(
    (left, right) => right.requestCount - left.requestCount || left.route.localeCompare(right.route)
  );
}

function getReconTarget(rawUrl: string): { hostname: string; route: string } {
  const target = normalizeObservedRoute(rawUrl);
  return { hostname: target.hostname, route: target.origin ? `${target.origin}${target.path}` : target.path };
}

function collectReconSignals(endpoint: ReconEndpoint, exchange: ApiExchange): void {
  try {
    for (const name of new URL(exchange.request.url).searchParams.keys()) {
      if (name) endpoint.queryNames.add(name);
    }
  } catch {
    // The raw route remains useful evidence when URL parsing fails.
  }
  for (const { name } of exchange.request.headers) {
    if (/(authorization|cookie|credential|api[-_]?key|session|token)/i.test(name)) {
      endpoint.identityHeaders.add(name.toLowerCase());
    }
  }
  const body = exchange.request.body;
  if (!body || body.kind !== "json") return;
  if (Array.isArray(body.value)) {
    for (const item of body.value) {
      if (!isRecord(item)) continue;
      if (typeof item.name === "string" && Object.prototype.hasOwnProperty.call(item, "value")) {
        endpoint.bodyFields.add(item.name);
      } else {
        for (const name of Object.keys(item)) endpoint.bodyFields.add(name);
      }
    }
  } else if (isRecord(body.value)) {
    for (const name of Object.keys(body.value)) endpoint.bodyFields.add(name);
  }
}

function createReconEndpointRow(endpoint: ReconEndpoint): HTMLTableRowElement {
  const row = document.createElement("tr");
  const method = document.createElement("td");
  const sampleRecord = endpoint.samples[0] ? createApiLogRecord(endpoint.samples[0]) : undefined;
  const methodCode = createLogFilterButton("method", endpoint.method, endpoint.method, "api", sampleRecord);
  methodCode.classList.add("recon-method");
  method.appendChild(methodCode);

  const route = document.createElement("td");
  let latestPath = endpoint.route;
  try {
    if (endpoint.samples[0]) latestPath = new URL(endpoint.samples[0].request.url).pathname;
  } catch {
    // Keep the normalized route for malformed stored URLs.
  }
  const routeCode = createLogFilterButton("path", latestPath, endpoint.route, "api", sampleRecord);
  routeCode.classList.add("recon-route");
  route.appendChild(routeCode);
  const latestExchange = endpoint.samples[0];
  if (latestExchange) route.appendChild(createReconEvidence(latestExchange));

  const requests = document.createElement("td");
  requests.textContent = String(endpoint.requestCount);
  const statuses = document.createElement("td");
  const sortedStatuses = [...endpoint.statuses].sort((left, right) => left - right);
  for (const status of sortedStatuses) {
    if (statuses.childElementCount) statuses.append(", ");
    statuses.appendChild(createLogFilterButton(
      "status",
      String(status),
      status === 0 ? "No response" : String(status),
      "api",
      sampleRecord
    ));
  }
  const signals = document.createElement("td");
  signals.className = "recon-signals";
  signals.textContent = formatReconSignals(endpoint);
  row.append(method, route, requests, statuses, signals);
  return row;
}

function createReconEvidence(exchange: ApiExchange): HTMLDetailsElement {
  const details = document.createElement("details");
  details.className = "recon-evidence";
  const summary = document.createElement("summary");
  summary.textContent = "Inspect latest captured exchange";
  details.appendChild(summary);
  details.addEventListener("toggle", () => {
    if (!details.open || details.childElementCount > 1) return;
    const startedAt = new Date(exchange.startedAt);
    const metadata = document.createElement("p");
    metadata.className = "recon-sample-meta";
    metadata.textContent = `${Number.isNaN(startedAt.getTime()) ? exchange.startedAt : startedAt.toLocaleString()} · ${exchange.response.status || "No response"} · ${Math.round(exchange.durationMs)} ms`;
    const url = document.createElement("p");
    url.className = "recon-sample-url";
    url.textContent = exchange.request.url;
    const actions = document.createElement("div");
    actions.className = "actions";
    actions.append(
      createCopyButton("Copy request URL", exchange.request.url),
      createAddToFlowButton(exchange)
    );
    details.append(
      metadata,
      url,
      actions,
      createDetails("Outgoing request", exchange.request.headers, exchange.request.body),
      createDetails("Incoming response", exchange.response.headers, exchange.response.body)
    );
  });
  return details;
}

function formatReconSignals(endpoint: ReconEndpoint): string {
  const signals: string[] = [];
  if (endpoint.queryNames.size) signals.push(`Query: ${[...endpoint.queryNames].join(", ")}`);
  if (endpoint.bodyFields.size) signals.push(`Body: ${[...endpoint.bodyFields].join(", ")}`);
  if (endpoint.identityHeaders.size) {
    signals.push(`Identity: ${[...endpoint.identityHeaders].join(", ")}`);
  }
  return signals.join(" · ") || "No structured inputs observed";
}

async function refreshCaptureStatus(pageUrl = ""): Promise<void> {
  try {
    const inspectedPageUrl = pageUrl || await getInspectedPageUrl();
    const [storedSettings, pauseStatus] = await Promise.all([
      getStorage("settings"),
      getApiTrafficPauseStatus(inspectedPageUrl),
    ]);
    const settings = { ...defaultSettings, ...storedSettings };
    renderCaptureStatus({
      ...pauseStatus,
      enabled: settings.enabled,
      allowed: isSiteAllowed(inspectedPageUrl, {
        mode: settings.siteAccessMode,
        sites: settings.siteAccessSites,
      }),
      siteAccessMode: settings.siteAccessMode,
    });
  } catch {
    renderCaptureUnavailable();
  }
}

async function updateCapturePause(control: HTMLSelectElement): Promise<void> {
  const action = control.value;
  if (!Object.prototype.hasOwnProperty.call(PAUSE_DURATIONS, action)) return;
  const durationMs = PAUSE_DURATIONS[action as keyof typeof PAUSE_DURATIONS];
  for (const captureControl of [logCaptureSite, captureSite]) captureControl.disabled = true;
  const response = await sendToBackground("SET_API_CAPTURE_PAUSE", {
    tabId: chrome.devtools.inspectedWindow.tabId,
    durationMs,
  });
  if (response.success) await refreshCaptureStatus();
  else renderCaptureUnavailable();
}

function renderCaptureStatus(
  status: ApiTrafficPauseStatus & {
    enabled: boolean;
    allowed: boolean;
    siteAccessMode: SiteAccessMode;
  }
): void {
  const statusText = !status.enabled
    ? "Capture disabled"
    : status.hostname
      ? !status.allowed
        ? status.siteAccessMode === "allow"
          ? `Not on allow list: ${status.hostname}`
          : `Blocked: ${status.hostname}`
        : status.paused
          ? status.pausedUntil === null
            ? `Paused: ${status.hostname}`
            : `Paused until ${new Date(status.pausedUntil).toLocaleTimeString([], {
                hour: "numeric",
                minute: "2-digit",
              })}`
          : `Capturing: ${status.hostname}`
      : "No website selected";
  for (const control of [logCaptureSite, captureSite]) {
    const options = [createOption("", statusText)];
    if (status.paused) options.push(createOption("resume", "Resume this site"));
    else if (status.enabled && status.allowed && status.hostname) {
      options.push(
        createOption("pause5", "Pause site for 5 minutes"),
        createOption("pause15", "Pause site for 15 minutes"),
        createOption("pause60", "Pause site for 1 hour"),
        createOption("pauseUntilResumed", "Pause until resumed")
      );
    }
    control.replaceChildren(...options);
    control.disabled = !status.enabled || !status.allowed || !status.hostname;
  }
}

function renderCaptureUnavailable(): void {
  for (const control of [logCaptureSite, captureSite]) {
    control.replaceChildren(createOption("", "Capture controls unavailable"));
    control.disabled = true;
  }
}

function createOption(value: string, label: string): HTMLOptionElement {
  const option = document.createElement("option");
  option.value = value;
  option.textContent = label;
  return option;
}

function matchesSite(exchange: ApiExchange, pageHostname: string): boolean {
  return getHostname(exchange.pageUrl ?? "") === pageHostname;
}

function showClearFailure(): void {
  clearResponses.textContent = "Clear failed";
  window.setTimeout(updateScopeActions, 1500);
}

function updateScopeActions(): void {
  const currentSiteOnly = scopeFilter.value === "current";
  const unavailable = totalCount === 0 || (currentSiteOnly && !currentPageHostname);
  exportResponses.textContent = currentSiteOnly ? "Export current site" : "Export all";
  clearResponses.textContent = currentSiteOnly ? "Clear current site" : "Clear all";
  exportResponses.disabled = unavailable;
  clearResponses.disabled = unavailable;
}

function getVisibleExchanges(): ApiExchange[] {
  return displayedExchanges.filter((exchange) =>
    !isExchangeHidden(exchange) &&
    matchesConnectionChainFilter(exchange, activeConnectionFilter) &&
    (!activeFieldQuery || matchesApiFieldQuery(exchange, activeFieldQuery))
  );
}

function updateFieldSearchActions(): void {
  fieldSearchApply.hidden = !parseApiFieldQuery(fieldSearch.value);
  fieldSearchClear.hidden = !fieldSearch.value && !activeFieldQuery;
}


function applyFieldSearch(): void {
  const query = parseApiFieldQuery(fieldSearch.value);
  if (!query) return;
  activeFieldQuery = query;
  updateFieldSearchActions();
  renderDisplayedTraffic();
}

function clearFieldSearch(): void {
  fieldSearch.value = "";
  activeFieldQuery = null;
  updateFieldSearchActions();
  renderDisplayedTraffic();
}

function renderFieldSidebar(exchanges = getVisibleExchanges()): void {
  const queryName = fieldSearch.value.split("=", 1)[0]?.trim().toLowerCase() ?? "";
  const summaries = summarizeApiFields(exchanges).filter((field) =>
    field.name.toLowerCase().includes(queryName)
  );
  const selected = summaries
    .filter((field) => selectedFieldNames.has(field.name))
    .sort((left, right) => left.name.localeCompare(right.name));
  const interesting = summaries
    .filter((field) => !selectedFieldNames.has(field.name))
    .sort((left, right) =>
      right.coveragePercentage - left.coveragePercentage || left.name.localeCompare(right.name)
    );
  fieldsScope.textContent = `Loaded results · ${exchanges.length} visible`;
  renderFieldCatalog(selectedFields, selected, "No selected fields match.");
  renderFieldCatalog(interestingFields, interesting, "No interesting fields match.");
}

function renderFieldCatalog(
  container: HTMLElement,
  summaries: ApiFieldSummary[],
  emptyMessage: string
): void {
  if (summaries.length) {
    container.replaceChildren(...summaries.map(createFieldSummary));
    return;
  }
  const empty = document.createElement("p");
  empty.className = "field-empty";
  empty.textContent = emptyMessage;
  container.replaceChildren(empty);
}

function createFieldSummary(field: ApiFieldSummary): HTMLElement {
  const row = document.createElement("div");
  row.className = "field-row";
  const heading = document.createElement("div");
  heading.className = "field-row-heading";
  const key = document.createElement("button");
  key.type = "button";
  key.className = "field-key";
  key.textContent = field.name;
  key.title = `Add ${field.name}=* to Log Search`;
  key.addEventListener("click", () => confirmAddLogFilter(field.name, "*", "api"));
  const coverage = document.createElement("span");
  coverage.textContent = `${field.coveragePercentage}%`;
  coverage.title = `${field.eventCount} loaded results · ${field.distinctValueCount} distinct values`;
  heading.append(key, coverage);

  const details = document.createElement("details");
  const summary = document.createElement("summary");
  summary.textContent = `${field.distinctValueCount} values`;
  const values = document.createElement("ul");
  values.className = "field-values";
  for (const topValue of field.topValues) {
    const item = document.createElement("li");
    const value = document.createElement("button");
    value.type = "button";
    value.className = "field-value";
    value.textContent = topValue.value;
    value.title = `Add ${field.name}=${topValue.value} to Log Search`;
    value.addEventListener("click", () => confirmAddLogFilter(field.name, topValue.value, "api"));
    const count = document.createElement("span");
    count.textContent = `× ${topValue.count}`;
    item.append(value, count);
    values.appendChild(item);
  }
  const selection = document.createElement("button");
  selection.type = "button";
  const isSelected = selectedFieldNames.has(field.name);
  selection.textContent = isSelected ? "Remove from selected" : "Add to selected";
  selection.setAttribute("aria-label", `${selection.textContent}: ${field.name}`);
  selection.addEventListener("click", () => {
    if (isSelected) selectedFieldNames.delete(field.name);
    else selectedFieldNames.add(field.name);
    renderFieldSidebar();
  });
  details.append(summary, values, selection);
  row.append(heading, details);
  return row;
}

function createConnectionDetails(exchange: ApiExchange): HTMLDetailsElement {
  const chain = buildInferredConnectionChain(exchange);
  const details = document.createElement("details");
  details.className = "connection-chain";
  const summary = document.createElement("summary");
  summary.textContent = `Connection chain (inferred) · ${chain.protocol}`;
  const list = document.createElement("ol");
  for (const step of chain.steps) {
    const item = document.createElement("li");
    item.dataset.direction = step.direction;
    const direction = document.createElement("span");
    direction.className = "connection-direction";
    direction.textContent = step.direction === "outbound"
      ? "→"
      : step.direction === "inbound"
        ? "←"
        : step.direction === "bidirectional"
          ? "↔"
          : "•";
    const label = document.createElement("strong");
    label.textContent = step.label;
    const timing = document.createElement("span");
    timing.className = "connection-timing";
    timing.textContent = step.detail;
    item.append(direction, label, timing);
    list.appendChild(item);
  }
  const disclaimer = document.createElement("p");
  disclaimer.textContent = chain.disclaimer;
  details.append(summary, list, disclaimer);
  return details;
}

function createFieldsDetails(exchange: ApiExchange): HTMLDetailsElement {
  const fields = extractApiFields(exchange);
  const details = document.createElement("details");
  details.className = "exchange-fields";
  const summary = document.createElement("summary");
  summary.textContent = `Fields (${fields.length})`;
  const list = document.createElement("dl");
  for (const field of fields) {
    const name = document.createElement("dt");
    const key = document.createElement("button");
    key.type = "button";
    key.textContent = field.name;
    key.addEventListener("click", () => confirmAddLogFilter(field.name, "*", "api"));
    name.appendChild(key);
    const value = document.createElement("dd");
    const valueButton = document.createElement("button");
    valueButton.type = "button";
    valueButton.textContent = field.value;
    valueButton.addEventListener("click", () => confirmAddLogFilter(field.name, field.value, "api"));
    value.appendChild(valueButton);
    list.append(name, value);
  }
  details.append(summary, list);
  return details;
}

function renderDisplayedTraffic(): void {
  const unhiddenExchanges = displayedExchanges.filter((exchange) => !isExchangeHidden(exchange));
  const connectionExchanges = unhiddenExchanges.filter((exchange) =>
    matchesConnectionChainFilter(exchange, activeConnectionFilter)
  );
  const visibleExchanges = activeFieldQuery
    ? connectionExchanges.filter((exchange) => matchesApiFieldQuery(exchange, activeFieldQuery!))
    : connectionExchanges;
  renderFieldSidebar(visibleExchanges);
  const hiddenRequestCount = displayedExchanges.length - unhiddenExchanges.length;
  showHidden.hidden = hiddenRequestCount === 0;
  showHidden.textContent = `Show hidden (${hiddenRequestCount})`;

  if (visibleExchanges.length === 0) {
    emptyState.textContent = activeFieldQuery
      ? "No loaded requests match this field filter."
      : activeConnectionFilter
        ? "No loaded requests match this connection-chain filter."
        : hiddenRequestCount
        ? "All matching requests are hidden."
        : "No matching API traffic.";
    requestList.replaceChildren(emptyState);
    return;
  }

  const videoMode = isMediaAnalysisMode(analysisFilter.value);
  const groupMedia = videoMode && analysisFilter.value !== "stream-manifests";
  const items = groupMedia
    ? createMediaGroups(visibleExchanges)
    : videoMode
      ? visibleExchanges
      : groupingMode
        ? createTrafficGroups(
            visibleExchanges,
            groupingMode === "nearby" ? DUPLICATE_WINDOW_MS : null
          )
        : visibleExchanges;
  requestList.replaceChildren(
    ...items.map((item) =>
      isTrafficGroup(item) && item.exchanges.length > 1
        ? createGroup(
            item,
            groupMedia ? "stream" : groupingMode === "site" ? "site-history" : "nearby"
          )
        : createExchange(isTrafficGroup(item) ? item.exchanges[0] : item)
    )
  );
}

function createExchange(exchange: ApiExchange): HTMLElement {
  const article = document.createElement("article");
  const mediaKind = detectMediaKind(
    exchange.resourceType,
    exchange.response.mimeType,
    exchange.request.url
  );
  const mediaRole = getMediaRole(mediaKind);
  const heading = document.createElement("h2");
  heading.textContent = `${exchange.request.method} ${exchange.request.url}`;
  heading.title = exchange.request.url;
  const headingRow = document.createElement("div");
  headingRow.className = "exchange-heading";
  const actions = document.createElement("div");
  actions.className = "exchange-actions";
  const sessionManifest =
    mediaKind === "manifest" && exchange.sequence !== undefined
      ? sessionManifestUrls.get(exchange.sequence)
      : undefined;
  const actionableUrl = sessionManifest?.url ?? exchange.request.url;
  const copyUrl = createCopyButton(
    sessionManifest ? "Copy signed URL" : "Copy URL",
    actionableUrl
  );
  const openUrl = createOpenUrlButton(
    actionableUrl,
    sessionManifest ? "Open signed URL" : "Open URL"
  );
  const hideEndpoint = createHideEndpointButton(exchange.request.url);
  actions.append(createStarButton(createApiLogRecord(exchange).id), copyUrl, ...(openUrl ? [openUrl] : []));
  if (sessionManifest) {
    const quotedUrl = quoteShellArgument(sessionManifest.url);
    actions.append(
      createCopyButton("Copy yt-dlp", `yt-dlp -- ${quotedUrl}`),
      createCopyButton("Copy ffmpeg", `ffmpeg -i ${quotedUrl} -c copy video.mp4`)
    );
  }
  actions.appendChild(hideEndpoint);
  headingRow.append(heading, actions);
  article.appendChild(headingRow);

  const summary = document.createElement("p");
  summary.className = "exchange-summary";
  const startedAt = new Date(exchange.startedAt);
  const time = Number.isNaN(startedAt.getTime())
    ? exchange.startedAt
    : startedAt.toLocaleTimeString();
  summary.textContent =
    `${time} · ← ${exchange.response.status} ${exchange.response.statusText}` +
    ` · ${exchange.response.mimeType || "unknown type"}` +
    (mediaKind
      ? ` · Media: ${formatMediaKind(mediaKind)} · Role: ${mediaRole}`
      : "") +
    (mediaKind && exchange.transferSize !== undefined
      ? ` · ${formatByteSize(exchange.transferSize)}`
      : "") +
    ` · ${Math.round(exchange.durationMs)} ms`;
  article.append(summary, createTrafficRoute(exchange));

  const explanation = explainTraffic(exchange);
  const explanationText = document.createElement("p");
  explanationText.className = `traffic-explanation ${explanation.tone}`;
  explanationText.textContent = explanation.summary;
  article.appendChild(explanationText);
  if (explanation.external !== null) {
    const scope = document.createElement("span");
    scope.className = explanation.external ? "scope external" : "scope first-party";
    scope.textContent = explanation.external
      ? `External API · ${explanation.destination}`
      : "First-party API";
    article.appendChild(scope);
  }

  article.append(
    createConnectionDetails(exchange),
    createFieldsDetails(exchange),
    createDetails("Outgoing request", exchange.request.headers, exchange.request.body),
    createDetails("Incoming response", exchange.response.headers, exchange.response.body)
  );
  return article;
}

function createTrafficGroups(
  exchanges: ApiExchange[],
  duplicateWindowMs: number | null
): Array<ApiExchange | TrafficGroup> {
  const items: Array<ApiExchange | TrafficGroup> = [];
  const latestGroups = new Map<string, TrafficGroup>();

  for (const exchange of exchanges) {
    const startedAt = Date.parse(exchange.startedAt);
    const key = [exchange.request.method, exchange.request.url].join("\u0000");
    const latestGroup = latestGroups.get(key);
    if (
      latestGroup &&
      (duplicateWindowMs === null ||
        (Number.isFinite(startedAt) &&
          Math.abs(latestGroup.latestStartedAt - startedAt) <= duplicateWindowMs))
    ) {
      latestGroup.exchanges.push(exchange);
      continue;
    }

    const group: TrafficGroup = { exchanges: [exchange], key, latestStartedAt: startedAt };
    items.push(group);
    latestGroups.set(key, group);
  }
  return items;
}

function createMediaGroups(exchanges: ApiExchange[]): Array<ApiExchange | TrafficGroup> {
  const items: Array<ApiExchange | TrafficGroup> = [];
  const groups = new Map<string, TrafficGroup>();

  for (const exchange of exchanges) {
    const mediaKind = detectMediaKind(
      exchange.resourceType,
      exchange.response.mimeType,
      exchange.request.url
    );
    if (!mediaKind) {
      items.push(exchange);
      continue;
    }

    const key = getMediaStreamKey(exchange, mediaKind);
    const group = groups.get(key);
    if (group) {
      group.exchanges.push(exchange);
      continue;
    }

    const nextGroup: TrafficGroup = {
      exchanges: [exchange],
      key,
      latestStartedAt: Date.parse(exchange.startedAt),
    };
    groups.set(key, nextGroup);
    items.push(nextGroup);
  }
  return items;
}

function getMediaStreamKey(exchange: ApiExchange, mediaKind: MediaKind): string {
  const endpointKey = getEndpointKey(exchange.request.url);
  if (mediaKind === "video" || mediaKind === "audio") return endpointKey;
  try {
    const url = new URL(exchange.request.url);
    const directory = url.pathname.slice(0, url.pathname.lastIndexOf("/") + 1);
    return `${url.origin}${directory}`;
  } catch {
    return endpointKey;
  }
}

function isExchangeHidden(exchange: ApiExchange): boolean {
  if (hiddenEndpoints.has(getEndpointKey(exchange.request.url))) return true;
  const mediaKind = detectMediaKind(
    exchange.resourceType,
    exchange.response.mimeType,
    exchange.request.url
  );
  return mediaKind
    ? hiddenMediaStreams.has(getMediaStreamKey(exchange, mediaKind))
    : false;
}

function isMediaAnalysisMode(value: string): boolean {
  return ["videos", "direct-videos", "stream-manifests", "streaming-videos"].includes(value);
}

function formatMediaKind(mediaKind: MediaKind): string {
  if (mediaKind === "manifest") return "stream manifest";
  if (mediaKind === "subtitle") return "subtitles";
  if (mediaKind === "key") return "encryption key";
  return mediaKind;
}

function formatByteSize(bytes: number): string {
  if (bytes < 1024) return `${Math.round(bytes)} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function createGroup(
  group: TrafficGroup,
  groupLabel: "nearby" | "site-history" | "stream"
): HTMLDetailsElement {
  const details = document.createElement("details");
  details.className = "duplicate-group";
  details.style.setProperty("--group-hue", String(hashGroupKey(group.key) % 360));

  const summary = document.createElement("summary");
  const label = document.createElement("span");
  label.className = "duplicate-group-label";
  const firstExchange = group.exchanges[0];
  label.textContent = `${firstExchange.request.method} ${formatTrafficRoute(firstExchange)}`;
  label.title = firstExchange.request.url;
  const count = document.createElement("strong");
  count.textContent = `${group.exchanges.length} ${groupLabel} requests`;
  const hideEndpoint =
    groupLabel === "stream"
      ? createHideStreamButton(group.key)
      : createHideEndpointButton(firstExchange.request.url);
  summary.append(label, count, hideEndpoint);
  details.appendChild(summary);

  const items = document.createElement("div");
  items.className = "duplicate-group-items";
  items.append(...group.exchanges.map(createExchange));
  details.appendChild(items);
  return details;
}

function createHideEndpointButton(rawUrl: string): HTMLButtonElement {
  const endpointKey = getEndpointKey(rawUrl);
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = "Hide endpoint";
  button.title = `Hide ${endpointKey} for this panel session`;
  button.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    hiddenEndpoints.add(endpointKey);
    renderDisplayedTraffic();
  });
  return button;
}

function createHideStreamButton(streamKey: string): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = "Hide stream";
  button.title = "Hide every detected request in this stream for this panel session";
  button.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    hiddenMediaStreams.add(streamKey);
    renderDisplayedTraffic();
  });
  return button;
}

function updateGroupingButtons(): void {
  const videoMode = isMediaAnalysisMode(analysisFilter.value);
  const nearbyDuplicateCount = createTrafficGroups(
    displayedExchanges,
    DUPLICATE_WINDOW_MS
  ).filter((item) => isTrafficGroup(item) && item.exchanges.length > 1).length;
  groupDuplicates.disabled =
    videoMode || (nearbyDuplicateCount === 0 && groupingMode !== "nearby");
  groupDuplicates.setAttribute("aria-pressed", String(groupingMode === "nearby"));
  groupDuplicates.textContent =
    groupingMode === "nearby"
      ? "Ungroup requests"
      : `Group duplicates${nearbyDuplicateCount ? ` (${nearbyDuplicateCount})` : ""}`;

  const siteGroupingAvailable = scopeFilter.value === "current" && Boolean(currentPageHostname);
  groupSiteDuplicates.disabled = videoMode || !siteGroupingAvailable || totalCount === 0;
  groupSiteDuplicates.setAttribute("aria-pressed", String(groupingMode === "site"));
  groupSiteDuplicates.textContent =
    groupingMode === "site" ? "Ungroup site duplicates" : "Group duplicates per site";
}

function isTrafficGroup(item: ApiExchange | TrafficGroup): item is TrafficGroup {
  return "exchanges" in item;
}

function hashGroupKey(value: string): number {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return hash;
}

function createTrafficRoute(exchange: ApiExchange): HTMLParagraphElement {
  const source = getHostname(exchange.pageUrl ?? "") || "Unknown source";
  const destination = getHostname(exchange.request.url) || "Unknown destination";
  const route = document.createElement("p");
  route.className = "traffic-route";
  route.append(
    createRouteLabel(`Request: ${source} → ${destination}`),
    createRouteLabel(
      exchange.response.status === 0
        ? "Response: no response received"
        : `Response: ${destination} → ${source}`
    ),
    createRouteLabel(formatInitiator(exchange))
  );
  return route;
}

function formatInitiator(exchange: ApiExchange): string {
  const initiator = exchange.initiator;
  if (!initiator || initiator.kind === "unknown") return "Initiator: unknown";
  if (initiator.kind === "extension") {
    return `Initiator: extension ${initiator.origin ?? "unknown ID"}`;
  }
  return `Initiator: page${initiator.origin ? ` (${initiator.origin})` : ""}`;
}

function createRouteLabel(label: string): HTMLSpanElement {
  const span = document.createElement("span");
  span.textContent = label;
  return span;
}

function formatTrafficRoute(exchange: ApiExchange): string {
  const source = getHostname(exchange.pageUrl ?? "") || "Unknown source";
  const destination = getHostname(exchange.request.url) || "Unknown destination";
  let path = "";
  try {
    path = new URL(exchange.request.url).pathname;
  } catch {
    // The destination label already falls back for malformed URLs.
  }
  return `${source} → ${destination}${path}`;
}

function createDetails(
  label: string,
  headers: ApiHeader[],
  body: ApiBody | null
): HTMLDetailsElement {
  const details = document.createElement("details");
  const summary = document.createElement("summary");
  summary.textContent = label;
  details.appendChild(summary);

  const headersLabel = document.createElement("h3");
  headersLabel.textContent = "Headers";
  details.append(headersLabel, createCodeBlock(JSON.stringify(headers, null, 2)));

  const bodyLabel = document.createElement("h3");
  bodyLabel.textContent = "Body";
  details.appendChild(bodyLabel);
  if (!body) {
    const empty = document.createElement("p");
    empty.className = "no-body";
    empty.textContent = "No body";
    details.appendChild(empty);
    return details;
  }

  if (body.kind === "json") {
    const formatted = JSON.stringify(body.value, null, 2);
    const minified = JSON.stringify(body.value);
    const actions = document.createElement("div");
    actions.className = "actions";
    actions.append(
      createCopyButton("Copy formatted", formatted),
      createCopyButton("Copy minified", minified)
    );
    details.append(actions, createCodeBlock(formatted, true));
  } else {
    if (body.kind === "malformed-json") {
      const error = document.createElement("p");
      error.className = "parse-error";
      error.textContent = `Malformed JSON: ${body.error}`;
      details.appendChild(error);
    }
    details.appendChild(createCodeBlock(body.raw));
  }
  return details;
}

function createCodeBlock(value: string, highlight = false): HTMLPreElement {
  const pre = document.createElement("pre");
  const code = document.createElement("code");
  if (highlight) highlightJson(code, value);
  else code.textContent = value;
  pre.appendChild(code);
  return pre;
}

function createOpenUrlButton(rawUrl: string, label: string): HTMLButtonElement | null {
  if (!isHttpUrl(rawUrl)) return null;

  const button = document.createElement("button");
  button.type = "button";
  button.textContent = label;
  button.addEventListener("click", () => {
    window.open(rawUrl, "_blank", "noopener,noreferrer");
  });
  return button;
}

function addMediaLabels(exchange: ApiExchange): ApiExchange & {
  mediaKind: MediaKind | null;
  mediaRole: MediaRole | null;
} {
  const mediaKind = detectMediaKind(
    exchange.resourceType,
    exchange.response.mimeType,
    exchange.request.url
  );
  return { ...exchange, mediaKind, mediaRole: getMediaRole(mediaKind) };
}

function quoteShellArgument(value: string): string {
  return `'${value.replace(/'/g, `'"'"'`)}'`;
}

function isHttpUrl(rawUrl: string): boolean {
  try {
    const url = new URL(rawUrl);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function createCopyButton(label: string, value: string): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = label;
  button.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(value);
      button.textContent = "Copied";
    } catch {
      button.textContent = "Copy failed";
    }
    window.setTimeout(() => {
      button.textContent = label;
    }, 1500);
  });
  return button;
}

function highlightJson(container: HTMLElement, json: string): void {
  let cursor = 0;
  for (const match of json.matchAll(JSON_TOKEN_REGEX)) {
    const index = match.index;
    container.append(document.createTextNode(json.slice(cursor, index)));
    const token = document.createElement("span");
    token.className = getTokenClass(match[0]);
    token.textContent = match[0];
    container.append(token);
    cursor = index + match[0].length;
  }
  container.append(document.createTextNode(json.slice(cursor)));
}

function getTokenClass(token: string): string {
  if (token.startsWith('"')) {
    return token.trimEnd().endsWith(":") ? "token-key" : "token-string";
  }
  if (token === "true" || token === "false") return "token-boolean";
  if (token === "null") return "token-null";
  return "token-number";
}

function updateCount(): void {
  requestCount.textContent = `${totalCount} stored`;
}

function isProtocolCapturedMessage(
  message: unknown
): message is { type: "PROTOCOL_EVENT_CAPTURED"; payload: ProtocolEvent & { sequence: number } } {
  if (!isRecord(message) || message.type !== "PROTOCOL_EVENT_CAPTURED" || !isRecord(message.payload)) return false;
  const payload = message.payload;
  return (
    typeof payload.sequence === "number" &&
    typeof payload.sessionId === "string" &&
    typeof payload.pageUrl === "string" &&
    typeof payload.url === "string" &&
    typeof payload.transport === "string" &&
    typeof payload.kind === "string" &&
    typeof payload.direction === "string" &&
    typeof payload.timestamp === "string" &&
    typeof payload.payloadBytes === "number" &&
    typeof payload.truncated === "boolean" &&
    typeof payload.binary === "boolean"
  );
}

function isCapturedMessage(
  message: unknown
): message is {
  type: "API_TRAFFIC_CAPTURED";
  payload: ApiExchange & { sequence: number };
  sessionRequestUrl?: string;
} {
  if (!isRecord(message) || message.type !== "API_TRAFFIC_CAPTURED") return false;
  const payload = message.payload;
  if (
    (message.sessionRequestUrl !== undefined &&
      typeof message.sessionRequestUrl !== "string") ||
    !isRecord(payload) ||
    !isRecord(payload.request) ||
    !isRecord(payload.response)
  ) {
    return false;
  }
  return (
    typeof payload.sequence === "number" &&
    typeof payload.startedAt === "string" &&
    typeof payload.durationMs === "number" &&
    typeof payload.request.method === "string" &&
    typeof payload.request.url === "string" &&
    Array.isArray(payload.request.headers) &&
    typeof payload.response.status === "number" &&
    typeof payload.response.mimeType === "string" &&
    Array.isArray(payload.response.headers)
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function requireElement(id: string): HTMLElement {
  const element = document.getElementById(id);
  if (!(element instanceof HTMLElement)) throw new Error(`Missing required element: ${id}`);
  return element;
}

function requireButton(id: string): HTMLButtonElement {
  const element = document.getElementById(id);
  if (!(element instanceof HTMLButtonElement)) {
    throw new Error(`Missing required button: ${id}`);
  }
  return element;
}

function requireForm(id: string): HTMLFormElement {
  const element = document.getElementById(id);
  if (!(element instanceof HTMLFormElement)) {
    throw new Error(`Missing required form: ${id}`);
  }
  return element;
}

function requireInput(id: string): HTMLInputElement {
  const element = document.getElementById(id);
  if (!(element instanceof HTMLInputElement)) {
    throw new Error(`Missing required input: ${id}`);
  }
  return element;
}

function requireSelect(id: string): HTMLSelectElement {
  const element = document.getElementById(id);
  if (!(element instanceof HTMLSelectElement)) {
    throw new Error(`Missing required select: ${id}`);
  }
  return element;
}
