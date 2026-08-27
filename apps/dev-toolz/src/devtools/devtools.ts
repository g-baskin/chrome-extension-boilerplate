import { downloadDataAsFile } from "../lib/download";
import { explainTraffic } from "../lib/traffic-explanation";
import {
  clearApiTraffic,
  countApiTraffic,
  getAllApiTraffic,
  getApiTrafficPage,
  matchesApiTraffic,
  type ApiBody,
  type ApiExchange,
  type ApiHeader,
  type ApiTrafficFilters,
} from "../lib/api-traffic";

const JSON_TOKEN_REGEX =
  /("(?:\\u[\da-fA-F]{4}|\\[^u]|[^\\"])*"\s*:)|("(?:\\u[\da-fA-F]{4}|\\[^u]|[^\\"])*")|\b(true|false|null)\b|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/g;
const PAGE_SIZE = 200;
const DUPLICATE_WINDOW_MS = 10_000;

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
const loadOlder = requireButton("load-older");
const filterForm = requireForm("traffic-filters");
const scopeFilter = requireSelect("filter-scope");
const domainFilter = requireInput("filter-domain");
const methodFilter = requireSelect("filter-method");
const statusFilter = requireSelect("filter-status");
const mimeFilter = requireInput("filter-mime");
const resetFilters = requireButton("reset-filters");
let totalCount = 0;
let oldestSequence: number | null = null;
let currentPageHostname = "";
let activeFilters = readFilters();
let displayedExchanges: ApiExchange[] = [];
let groupingEnabled = false;

void initializePanel();

chrome.runtime.onMessage.addListener((message: unknown) => {
  if (!isCapturedMessage(message)) return false;
  totalCount += 1;
  updateCount();
  if (matchesApiTraffic(message.payload, activeFilters)) {
    displayedExchanges.unshift(message.payload);
    if (groupingEnabled) renderDisplayedTraffic();
    else requestList.prepend(createExchange(message.payload));
    updateGroupingButton();
  }
  return false;
});

exportResponses.addEventListener("click", async () => {
  exportResponses.disabled = true;
  exportResponses.textContent = "Exporting…";
  try {
    // simplification: export materializes the database; stream chunks if exports outgrow memory.
    const exchanges = await getAllApiTraffic();
    downloadDataAsFile(
      "dev-toolz-api-traffic.json",
      JSON.stringify(exchanges, null, 2),
      "application/json"
    );
  } finally {
    exportResponses.disabled = totalCount === 0;
    exportResponses.textContent = "Export all";
  }
});

clearResponses.addEventListener("click", async () => {
  await clearApiTraffic();
  totalCount = 0;
  oldestSequence = null;
  displayedExchanges = [];
  updateCount();
  exportResponses.disabled = true;
  loadOlder.hidden = true;
  emptyState.textContent = "Capturing active-tab API traffic automatically…";
  requestList.replaceChildren(emptyState);
  updateGroupingButton();
});

groupDuplicates.addEventListener("click", () => {
  groupingEnabled = !groupingEnabled;
  groupDuplicates.setAttribute("aria-pressed", String(groupingEnabled));
  renderDisplayedTraffic();
  updateGroupingButton();
});

loadOlder.addEventListener("click", () => {
  void loadNextPage();
});

scopeFilter.addEventListener("change", () => {
  activeFilters = readFilters();
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
  if (scopeFilter.value === "current") {
    activeFilters = readFilters();
    void resetDisplayedTraffic();
  }
});

async function initializePanel(): Promise<void> {
  currentPageHostname = await getInspectedPageHostname();
  activeFilters = readFilters();
  totalCount = await countApiTraffic();
  updateCount();
  exportResponses.disabled = totalCount === 0;
  await loadNextPage();
}

async function loadNextPage(): Promise<void> {
  loadOlder.disabled = true;
  const page = await getApiTrafficPage(oldestSequence, PAGE_SIZE + 1, activeFilters);
  const exchanges = page.slice(0, PAGE_SIZE);
  displayedExchanges.push(...exchanges);
  const lastSequence = exchanges[exchanges.length - 1]?.sequence;
  if (lastSequence !== undefined) oldestSequence = lastSequence;
  loadOlder.hidden = page.length <= PAGE_SIZE;
  loadOlder.disabled = false;
  renderDisplayedTraffic();
  updateGroupingButton();
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
  const status = statusFilter.value;
  return {
    pageHostname: scopeFilter.value === "current" ? currentPageHostname : null,
    domain: domainFilter.value.trim(),
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

function renderDisplayedTraffic(): void {
  if (displayedExchanges.length === 0) {
    emptyState.textContent = "No matching API traffic.";
    requestList.replaceChildren(emptyState);
    return;
  }

  const items = groupingEnabled ? createTrafficGroups(displayedExchanges) : displayedExchanges;
  requestList.replaceChildren(
    ...items.map((item) =>
      isTrafficGroup(item) && item.exchanges.length > 1
        ? createGroup(item)
        : createExchange(isTrafficGroup(item) ? item.exchanges[0] : item)
    )
  );
}

function createExchange(exchange: ApiExchange): HTMLElement {
  const article = document.createElement("article");
  const heading = document.createElement("h2");
  heading.textContent = `${exchange.request.method} ${exchange.request.url}`;
  heading.title = exchange.request.url;
  article.appendChild(heading);

  const summary = document.createElement("p");
  summary.className = "exchange-summary";
  const startedAt = new Date(exchange.startedAt);
  const time = Number.isNaN(startedAt.getTime())
    ? exchange.startedAt
    : startedAt.toLocaleTimeString();
  summary.textContent =
    `${time} · ← ${exchange.response.status} ${exchange.response.statusText}` +
    ` · ${exchange.response.mimeType || "unknown type"}` +
    ` · ${Math.round(exchange.durationMs)} ms`;
  article.appendChild(summary);

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

function createTrafficGroups(exchanges: ApiExchange[]): Array<ApiExchange | TrafficGroup> {
  const items: Array<ApiExchange | TrafficGroup> = [];
  const latestGroups = new Map<string, TrafficGroup>();

  for (const exchange of exchanges) {
    const startedAt = Date.parse(exchange.startedAt);
    const key = [exchange.request.method, exchange.request.url].join("\u0000");
    const latestGroup = latestGroups.get(key);
    if (
      latestGroup &&
      Number.isFinite(startedAt) &&
      Math.abs(latestGroup.latestStartedAt - startedAt) <= DUPLICATE_WINDOW_MS
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

function createGroup(group: TrafficGroup): HTMLDetailsElement {
  const details = document.createElement("details");
  details.className = "duplicate-group";
  details.style.setProperty("--group-hue", String(hashGroupKey(group.key) % 360));

  const summary = document.createElement("summary");
  const label = document.createElement("span");
  label.className = "duplicate-group-label";
  label.textContent = `${group.exchanges[0].request.method} ${group.exchanges[0].request.url}`;
  const count = document.createElement("strong");
  count.textContent = `${group.exchanges.length} nearby requests`;
  summary.append(label, count);
  details.appendChild(summary);

  const items = document.createElement("div");
  items.className = "duplicate-group-items";
  items.append(...group.exchanges.map(createExchange));
  details.appendChild(items);
  return details;
}

function updateGroupingButton(): void {
  const duplicateCount = createTrafficGroups(displayedExchanges).filter(
    (item) => isTrafficGroup(item) && item.exchanges.length > 1
  ).length;
  groupDuplicates.disabled = duplicateCount === 0 && !groupingEnabled;
  groupDuplicates.textContent = groupingEnabled
    ? "Ungroup requests"
    : `Group duplicates${duplicateCount ? ` (${duplicateCount})` : ""}`;
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
): message is { type: "API_TRAFFIC_CAPTURED"; payload: ApiExchange } {
  if (!isRecord(message) || message.type !== "API_TRAFFIC_CAPTURED") return false;
  const payload = message.payload;
  if (!isRecord(payload) || !isRecord(payload.request) || !isRecord(payload.response)) {
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
