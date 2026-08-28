import { downloadDataAsFile } from "../lib/download";
import { explainTraffic } from "../lib/traffic-explanation";
import { sendToBackground } from "../lib/messaging";
import type { ApiTrafficPauseStatus } from "../lib/api-traffic-pause";
import type { SiteAccessMode } from "../lib/site-access";
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

const requestList = requireElement("request-list");
const emptyState = requireElement("empty-state");
const requestCount = requireElement("request-count");
const clearResponses = requireButton("clear-responses");
const exportResponses = requireButton("export-responses");
const groupDuplicates = requireButton("group-duplicates");
const groupSiteDuplicates = requireButton("group-site-duplicates");
const showHidden = requireButton("show-hidden");
const loadOlder = requireButton("load-older");
const filterForm = requireForm("traffic-filters");
const captureSite = requireSelect("capture-site");
const scopeFilter = requireSelect("filter-scope");
const analysisFilter = requireSelect("filter-analysis");
const domainFilter = requireInput("filter-domain");
const routeFilter = requireSelect("filter-route");
const methodFilter = requireSelect("filter-method");
const statusFilter = requireSelect("filter-status");
const mimeFilter = requireInput("filter-mime");
const resetFilters = requireButton("reset-filters");
let totalCount = 0;
let oldestSequence: number | null = null;
let currentPageHostname = "";
let activeFilters = readFilters();
let displayedExchanges: ApiExchange[] = [];
let groupingMode: "nearby" | "site" | null = null;
const hiddenEndpoints = new Set<string>();
const hiddenMediaStreams = new Set<string>();
const sessionManifestUrls = new Map<number, { url: string; pageHostname: string }>();

void initializePanel();

chrome.runtime.onMessage.addListener((message: unknown) => {
  if (!isCapturedMessage(message)) return false;
  if (message.sessionRequestUrl && isHttpUrl(message.sessionRequestUrl)) {
    sessionManifestUrls.set(message.payload.sequence, {
      url: message.sessionRequestUrl,
      pageHostname: getHostname(message.payload.pageUrl ?? ""),
    });
  }
  totalCount += 1;
  updateCount();
  updateScopeActions();
  if (matchesApiTraffic(message.payload, activeFilters)) {
    displayedExchanges.unshift(message.payload);
    if (
      groupingMode ||
      hiddenEndpoints.size > 0 ||
      hiddenMediaStreams.size > 0 ||
      isMediaAnalysisMode(analysisFilter.value)
    ) {
      renderDisplayedTraffic();
    }
    else requestList.prepend(createExchange(message.payload));
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

captureSite.addEventListener("change", () => {
  void updateCapturePause();
});

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
  void resetDisplayedTraffic();
});

resetFilters.addEventListener("click", () => {
  filterForm.reset();
  activeFilters = readFilters();
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
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (
    areaName === "local" &&
    (changes.apiTrafficPauses || changes.settings)
  ) {
    void refreshCaptureStatus();
  }
});

async function initializePanel(): Promise<void> {
  currentPageHostname = await getInspectedPageHostname();
  activeFilters = readFilters();
  await refreshCaptureStatus();
  totalCount = await countApiTraffic();
  updateCount();
  updateScopeActions();
  await loadNextPage();
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

function getInspectedPageHostname(): Promise<string> {
  return new Promise((resolve) => {
    chrome.devtools.inspectedWindow.eval("location.href", (result, exceptionInfo) => {
      resolve(!exceptionInfo && typeof result === "string" ? getHostname(result) : "");
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

async function refreshCaptureStatus(): Promise<void> {
  const response = await sendToBackground("GET_API_CAPTURE_STATUS", {
    tabId: chrome.devtools.inspectedWindow.tabId,
  });
  if (response.success && response.data) renderCaptureStatus(response.data);
  else renderCaptureUnavailable();
}

async function updateCapturePause(): Promise<void> {
  const action = captureSite.value;
  if (!Object.prototype.hasOwnProperty.call(PAUSE_DURATIONS, action)) return;
  const durationMs = PAUSE_DURATIONS[action as keyof typeof PAUSE_DURATIONS];
  captureSite.disabled = true;
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
  const options = [createOption("", statusText)];
  if (!status.enabled || !status.allowed) {
    captureSite.replaceChildren(...options);
    captureSite.disabled = true;
    return;
  }
  if (status.paused) options.push(createOption("resume", "Resume this site"));
  else if (status.hostname) {
    options.push(
      createOption("pause5", "Pause site for 5 minutes"),
      createOption("pause15", "Pause site for 15 minutes"),
      createOption("pause60", "Pause site for 1 hour"),
      createOption("pauseUntilResumed", "Pause until resumed")
    );
  }
  captureSite.replaceChildren(...options);
  captureSite.disabled = !status.hostname;
}

function renderCaptureUnavailable(): void {
  captureSite.replaceChildren(createOption("", "Capture controls unavailable"));
  captureSite.disabled = true;
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

function renderDisplayedTraffic(): void {
  const visibleExchanges = displayedExchanges.filter((exchange) => !isExchangeHidden(exchange));
  const hiddenRequestCount = displayedExchanges.length - visibleExchanges.length;
  showHidden.hidden = hiddenRequestCount === 0;
  showHidden.textContent = `Show hidden (${hiddenRequestCount})`;

  if (visibleExchanges.length === 0) {
    emptyState.textContent = hiddenRequestCount
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
  actions.append(copyUrl, ...(openUrl ? [openUrl] : []));
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
