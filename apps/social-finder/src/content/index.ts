import { parseAdLibraryRecord } from "../lib/ad-library";
import { classifyCandidate, dedupeFindings, getLibraryIds, normalizeSignal } from "../lib/detector";
import { getFacebookPageKey, getFacebookSurface, getMarketplaceItemId } from "../lib/facebook-url";
import { createWeakExtractorCache, respondToFinderRequest } from "../lib/scan-cache";
import type { AdLibraryRecord, CandidateSignals, FinderRequest, FinderSnapshot, FinderUpdate, Finding, Surface } from "../lib/types";
import { clearBadges, clearUndetectedBadges, renderBadge } from "./badge";
import "./styles.css";

const MAX_CANDIDATES = 200;
const MAX_SIGNAL_NODES = 200;
const MAX_LINKS = 100;
let currentPageKey = getFacebookPageKey(location.href);
let snapshot: FinderSnapshot = emptySnapshot("unsupported");
let timer: number | undefined;
let snapshotDirty = true;
const signalCache = createWeakExtractorCache<HTMLElement, string, CandidateSignals>();

function emptySnapshot(surface: Surface): FinderSnapshot {
  return { schemaVersion: 1, pageKey: currentPageKey, surface, findings: [], adLibraryRecords: [], diagnostics: { candidates: 0, rejected: 0, detected: 0, renderFailures: 0 } };
}

function visible(element: HTMLElement): boolean {
  return element.isConnected && element.getClientRects().length > 0 && element.getAttribute("aria-hidden") !== "true";
}

function collectLabels(root: HTMLElement): string[] {
  const values = new Set<string>();
  for (const element of [...root.querySelectorAll<HTMLElement>("a, span, [aria-label]")].slice(0, MAX_SIGNAL_NODES)) {
    if (element.closest(".social-finder-badge")) continue;
    const ariaLabel = element.getAttribute("aria-label");
    if (ariaLabel) values.add(normalizeSignal(ariaLabel, 50));
    const text = normalizeSignal(element.textContent ?? "", 51);
    if (text && text.length <= 50) values.add(text);
  }
  return [...values].slice(0, MAX_SIGNAL_NODES);
}

function collectLinks(root: HTMLElement): string[] {
  const links = new Set<string>();
  for (const anchor of [...root.querySelectorAll<HTMLAnchorElement>("a[href]")].slice(0, MAX_LINKS)) {
    try {
      const url = new URL(anchor.href);
      if (url.protocol === "https:" && !url.username && !url.password && url.href.length <= 2_048) {
        url.hash = "";
        links.add(url.toString());
      }
    } catch { /* Ignore malformed page-owned links. */ }
  }
  return [...links];
}

function collectMedia(root: HTMLElement): string[] {
  const media = new Set<string>();
  for (const element of [...root.querySelectorAll<HTMLImageElement | HTMLVideoElement>("img[src], video[src], video[poster]")].slice(0, 24)) {
    for (const raw of [element.getAttribute("src"), element instanceof HTMLVideoElement ? element.poster : null]) {
      try {
        if (!raw) continue;
        const url = new URL(raw, location.href);
        if (url.protocol === "https:" && url.href.length <= 2_048) media.add(url.toString());
      } catch { /* Ignore malformed page-owned media. */ }
    }
  }
  return [...media].slice(0, 8);
}

function pageText(root: HTMLElement, max: number): string {
  let text = root.innerText;
  for (const badge of root.querySelectorAll<HTMLElement>(".social-finder-badge")) {
    text = text.replace(badge.innerText, "");
  }
  return normalizeSignal(text, max);
}

function titleFor(root: HTMLElement, fallback: string): string {
  const heading = root.querySelector<HTMLElement>("h1, h2, h3, h4, strong");
  return normalizeSignal(heading?.textContent ?? fallback, 160);
}

function cardFingerprint(root: HTMLElement, surface: Exclude<Surface, "unsupported">): string {
  const links = [...root.querySelectorAll<HTMLElement>("a[href]")].slice(0, MAX_LINKS).map((element) => normalizeSignal(element.getAttribute("href") ?? "", 2_048));
  const media = [...root.querySelectorAll<HTMLElement>("img[src], video[src], video[poster]")].slice(0, 24).flatMap((element) => [normalizeSignal(element.getAttribute("src") ?? "", 2_048), normalizeSignal(element.getAttribute("poster") ?? "", 2_048)]);
  return [surface, normalizeSignal(root.textContent ?? "", 6_000), ...links, ...media].join("\u0000");
}

function signalsFor(root: HTMLElement, surface: Exclude<Surface, "unsupported">): CandidateSignals {
  const fingerprint = cardFingerprint(root, surface);
  return signalCache.get(root, fingerprint, () => {
    const fullText = pageText(root, 4_000);
    return {
      surface,
      labels: collectLabels(root),
      links: collectLinks(root),
      media: collectMedia(root),
      title: titleFor(root, fullText),
      snippet: normalizeSignal(fullText, 240),
      fullText,
    };
  });
}

function adLibraryCard(marker: HTMLElement): HTMLElement | null {
  let current: HTMLElement | null = marker;
  let best: HTMLElement | null = marker.parentElement;
  for (let depth = 0; current && depth < 9; depth += 1) {
    const ids = new Set(getLibraryIds(pageText(current, 6_000)));
    if (ids.size > 1) break;
    if (ids.size === 1) best = current;
    current = current.parentElement;
  }
  return best;
}

function adLibraryRoots(): HTMLElement[] {
  const roots = new Set<HTMLElement>();
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let scanned = 0; scanned < 5_000; scanned += 1) {
    const node = walker.nextNode();
    if (!node) break;
    const parent = node.parentElement;
    if (!parent || !getLibraryIds(parent.textContent ?? "").length) continue;
    const card = adLibraryCard(parent);
    if (card && visible(card)) roots.add(card);
    if (roots.size === MAX_CANDIDATES) break;
  }
  return [...roots];
}

function marketplaceCard(anchor: HTMLAnchorElement): HTMLElement | null {
  let current: HTMLElement | null = anchor;
  let best: HTMLElement | null = anchor.parentElement;
  for (let depth = 0; current && depth < 7; depth += 1) {
    const ids = new Set(
      [...current.querySelectorAll<HTMLAnchorElement>("a[href*='/marketplace/item/']")]
        .map((link) => getMarketplaceItemId(link.href))
        .filter((id): id is string => Boolean(id)),
    );
    if (ids.size > 1) break;
    if (ids.size === 1 && normalizeSignal(current.innerText, 500)) best = current;
    current = current.parentElement;
  }
  return best;
}

function candidateRoots(surface: Exclude<Surface, "unsupported">): HTMLElement[] {
  if (surface === "ad-library") return adLibraryRoots();
  if (surface === "feed") {
    return [...document.querySelectorAll<HTMLElement>("[role='article']")]
      .filter(visible)
      .slice(0, MAX_CANDIDATES);
  }

  const roots = new Set<HTMLElement>();
  for (const anchor of [...document.querySelectorAll<HTMLAnchorElement>("a[href*='/marketplace/item/']")]) {
    const card = marketplaceCard(anchor);
    if (card && visible(card)) roots.add(card);
    if (roots.size === MAX_CANDIDATES) break;
  }
  return [...roots];
}

function publishSnapshot(): void {
  const update: FinderUpdate = { schemaVersion: 1, type: "SOCIAL_FINDINGS_UPDATED", snapshot };
  void chrome.runtime.sendMessage(update).catch(() => undefined);
}

function resetForPageChange(pageKey: string, surface: Surface): FinderSnapshot {
  currentPageKey = pageKey;
  clearBadges();
  snapshot = emptySnapshot(surface);
  publishSnapshot();
  window.clearTimeout(timer);
  timer = window.setTimeout(scan, 750);
  return snapshot;
}

function scan(): FinderSnapshot {
  const surface = getFacebookSurface(location.href);
  const pageKey = getFacebookPageKey(location.href);
  if (pageKey !== currentPageKey) return resetForPageChange(pageKey, surface);
  if (surface === "unsupported") {
    snapshotDirty = false;
    clearBadges();
    snapshot = emptySnapshot(surface);
    publishSnapshot();
    return snapshot;
  }

  const roots = candidateRoots(surface);
  const detected: Array<{ finding: Finding; record: AdLibraryRecord | null; root: HTMLElement }> = [];
  const capturedAt = new Date().toISOString();
  for (const root of roots) {
    const signals = signalsFor(root, surface);
    const finding = classifyCandidate(signals);
    const record = surface === "ad-library" ? parseAdLibraryRecord({ text: signals.fullText ?? signals.snippet, links: signals.links, media: signals.media ?? [], pageKey, capturedAt }) : null;
    if (finding) detected.push({ finding, record, root });
  }

  const findings = dedupeFindings(detected.map(({ finding }) => finding));
  const adLibraryRecords = [...new Map(detected.flatMap(({ record }) => record ? [[record.key, record] as const] : [])).values()];
  const detectedByKey = new Map<string, { finding: Finding; record: AdLibraryRecord | null; root: HTMLElement }>();
  for (const item of detected) if (!detectedByKey.has(item.finding.key)) detectedByKey.set(item.finding.key, item);
  const detectedRoots = new Set<HTMLElement>();
  let renderFailures = 0;
  for (const finding of findings) {
    const item = detectedByKey.get(finding.key);
    if (!item) continue;
    detectedRoots.add(item.root);
    if (!renderBadge(item.root, finding, item.record?.runtimeDays ?? null)) renderFailures += 1;
  }
  clearUndetectedBadges(detectedRoots);

  snapshot = {
    schemaVersion: 1,
    pageKey,
    surface,
    findings,
    adLibraryRecords,
    diagnostics: {
      candidates: roots.length,
      rejected: roots.length - detected.length,
      detected: findings.length,
      renderFailures,
    },
  };
  snapshotDirty = false;
  publishSnapshot();
  return snapshot;
}

function scheduleScan(): void {
  snapshotDirty = true;
  window.clearTimeout(timer);
  timer = window.setTimeout(scan, 250);
}

function extensionOwnedNode(node: Node): boolean {
  const element = node instanceof Element ? node : node.parentElement;
  return Boolean(element?.matches(".social-finder-badge") || element?.closest(".social-finder-badge"));
}

function hasPageMutation(mutations: MutationRecord[]): boolean {
  return mutations.some((mutation) => {
    if (extensionOwnedNode(mutation.target)) return false;
    const changed = [...mutation.addedNodes, ...mutation.removedNodes];
    return changed.length === 0 || changed.some((node) => !extensionOwnedNode(node));
  });
}

if (!document.documentElement.hasAttribute("data-social-finder-active")) {
  document.documentElement.setAttribute("data-social-finder-active", "true");
  const observer = new MutationObserver((mutations) => { if (hasPageMutation(mutations)) scheduleScan(); });
  observer.observe(document.body, { childList: true, characterData: true, subtree: true });
  window.setInterval(() => {
    const pageKey = getFacebookPageKey(location.href);
    if (pageKey !== currentPageKey) resetForPageChange(pageKey, getFacebookSurface(location.href));
  }, 250);

  chrome.runtime.onMessage.addListener((message: unknown, sender, sendResponse) => {
    if (sender.id !== chrome.runtime.id || !message || typeof message !== "object" || !("type" in message)) return;
    const request = message as FinderRequest;
    if (request.schemaVersion === 1 && (request.type === "GET_SOCIAL_FINDINGS" || request.type === "RESCAN_SOCIAL_FINDINGS")) sendResponse(respondToFinderRequest(request, snapshot, scan, snapshotDirty));
  });

  scan();
}
