import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { DragEvent } from "react";
import { decryptSavedRecords, encryptSavedRecords } from "../lib/encrypted-backup";
import { mergeImportedRecords, parseSocialFinderImport, previewImportedRecords } from "../lib/import";
import type { ImportPreview } from "../lib/import";
import { acceptsTabUpdate, isFinderSnapshot } from "../lib/messages";
import { analysisPrompt, searchIdeas } from "../lib/research";
import { buildAdLibrarySearchUrl } from "../lib/search";
import type { AdLibrarySearch } from "../lib/search";
import { downloadText, recordsToCsv, recordsToJson } from "../lib/export";
import { screenshotDragPayload, screenshotFilename, validScreenshotDataUrl } from "../lib/screenshot";
import { DEFAULT_PREFERENCES, clearSocialFinderStorage, loadPreferences, loadSavedRecords, savePreferences, saveRecords } from "../lib/storage";
import type { Preferences } from "../lib/storage";
import { adRescanErrorMessage, FACEBOOK_ONLY_MESSAGE, supportsAdRescan } from "../lib/tab-eligibility";
import type { AdLibraryRecord, FinderRequest, FinderSnapshot, FinderUpdate, FindingKind } from "../lib/types";
import { appendRecords, applyWorkspaceView, collectVisibleAdsOnce, collectVisibleButtonState, DEFAULT_FILTERS, emptyWorkspace, workspaceSummary } from "../lib/workspace";

const KIND_LABELS: Record<FindingKind, string> = {
  "ad-library-ad": "Ad Library ad",
  "feed-sponsored": "Sponsored post",
  "marketplace-listing": "Marketplace listing",
  "marketplace-sponsored": "Promoted listing",
};

async function activeTab(): Promise<chrome.tabs.Tab> {
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if (!tab?.id) throw new Error("Open Facebook in the active tab.");
  return tab;
}

function safeHttps(raw: string | null): string | null {
  if (!raw) return null;
  try { const url = new URL(raw); return url.protocol === "https:" && !url.username && !url.password && url.href.length <= 2_048 ? url.toString() : null; } catch { return null; }
}

function evidenceText(record: AdLibraryRecord): string {
  return [`Advertiser: ${record.advertiser ?? "unknown"}`, `Library ID: ${record.libraryId}`, `Status: ${record.status ?? "unknown"}`, `Start date: ${record.startDate ?? "unknown"}`, `Runtime: ${record.runtimeDays ?? "unknown"} days`, `Platforms: ${record.platforms.join(", ") || "unknown"}`, `Text: ${record.text}`].join("\n");
}

async function requestSnapshot(request: FinderRequest): Promise<FinderSnapshot> {
  const tab = await activeTab();
  if (!supportsAdRescan(tab.url)) throw new Error(FACEBOOK_ONLY_MESSAGE);
  try {
    const response: unknown = await chrome.tabs.sendMessage(tab.id!, request);
    if (!isFinderSnapshot(response)) throw new Error("Reload this Facebook tab, then try again.");
    return response;
  } catch (reason) {
    throw new Error(adRescanErrorMessage(reason, tab.url));
  }
}

export function App() {
  const [snapshot, setSnapshot] = useState<FinderSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [capturing, setCapturing] = useState(false);
  const [captureError, setCaptureError] = useState<string | null>(null);
  const [screenshot, setScreenshot] = useState<{ dataUrl: string; filename: string } | null>(null);
  const [search, setSearch] = useState<AdLibrarySearch>({ keyword: "", country: "US", adType: "all", activeStatus: "active" });
  const [searchError, setSearchError] = useState<string | null>(null);
  const [workspace, setWorkspace] = useState(() => emptyWorkspace("unsupported"));
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [saved, setSaved] = useState<AdLibraryRecord[]>([]);
  const [view, setView] = useState<"collected" | "saved">("collected");
  const [selected, setSelected] = useState<string[]>([]);
  const [savedSearch, setSavedSearch] = useState("");
  const [actionStatus, setActionStatus] = useState<string | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const [preferences, setPreferences] = useState<Preferences>(DEFAULT_PREFERENCES);
  const [ideaForm, setIdeaForm] = useState({ niche: "", product: "" });
  const [ideas, setIdeas] = useState<{ keywords: string[]; prompt: string } | null>(null);
  const [importPreview, setImportPreview] = useState<ImportPreview | null>(null);
  const [backupPassphrase, setBackupPassphrase] = useState("");
  const [encryptedBackupFile, setEncryptedBackupFile] = useState<File | null>(null);
  const [backupBusy, setBackupBusy] = useState(false);
  const clearDialog = useRef<HTMLDialogElement>(null);
  const backupFileInput = useRef<HTMLInputElement>(null);

  const load = useCallback(async (rescan = false) => {
    setLoading(true);
    setError(null);
    try {
      setSnapshot(await requestSnapshot({ schemaVersion: 1, type: rescan ? "RESCAN_SOCIAL_FINDINGS" : "GET_SOCIAL_FINDINGS" }));
    } catch (reason) {
      setSnapshot(null);
      setError(reason instanceof Error ? reason.message : "Social Finder could not read this tab.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { void Promise.all([loadSavedRecords(), loadPreferences()]).then(([records, prefs]) => { setSaved(records); setPreferences(prefs); setFilters(prefs.filters); setWorkspace((current) => emptyWorkspace(current.pageKey, prefs.collectionCap)); }).catch(() => setActionStatus("Local workspace settings could not be loaded.")); }, []);
  useEffect(() => { const dialog = clearDialog.current; if (!dialog) return; if (confirmClear && !dialog.open) dialog.showModal(); if (!confirmClear && dialog.open) dialog.close(); }, [confirmClear]);
  useEffect(() => {
    if (!snapshot) return;
    setWorkspace((current) => snapshot.pageKey !== current.pageKey ? emptyWorkspace(snapshot.pageKey, current.cap) : appendRecords(current, snapshot.adLibraryRecords));
  }, [snapshot]);

  const sourceRecords = view === "saved" ? saved : workspace.records;
  const searchedRecords = useMemo(() => { const query = savedSearch.trim().toLocaleLowerCase(); return view !== "saved" || !query ? sourceRecords : sourceRecords.filter((record) => [record.libraryId, record.advertiser, record.text].some((value) => value?.toLocaleLowerCase().includes(query))); }, [savedSearch, sourceRecords, view]);
  const visibleRecords = useMemo(() => applyWorkspaceView(searchedRecords, filters), [searchedRecords, filters]);
  const summary = useMemo(() => workspaceSummary(workspace.records, visibleRecords), [workspace.records, visibleRecords]);
  const collectControl = collectVisibleButtonState(snapshot?.surface, loading);

  useEffect(() => {
    const receiveUpdate = (message: unknown, sender: chrome.runtime.MessageSender) => {
      if (sender.id !== chrome.runtime.id || !message || typeof message !== "object" || !("type" in message)) return;
      const update = message as Partial<FinderUpdate>;
      if (update.schemaVersion !== 1 || update.type !== "SOCIAL_FINDINGS_UPDATED" || !isFinderSnapshot(update.snapshot)) return;
      void activeTab().then((tab) => {
        if (!acceptsTabUpdate(tab.id, sender.tab?.id)) return;
        setSnapshot(update.snapshot!);
        setError(null);
        setLoading(false);
      }).catch(() => undefined);
    };
    chrome.runtime.onMessage.addListener(receiveUpdate);
    return () => chrome.runtime.onMessage.removeListener(receiveUpdate);
  }, []);

  const capture = useCallback(async () => {
    setCapturing(true);
    setCaptureError(null);
    try {
      const tab = await activeTab();
      if (tab.windowId === undefined) throw new Error("The active Facebook window is unavailable.");
      setScreenshot(null);
      const dataUrl: unknown = await chrome.tabs.captureVisibleTab(tab.windowId, { format: "png" });
      if (!validScreenshotDataUrl(dataUrl)) throw new Error("Chrome returned an invalid or oversized screenshot.");
      setScreenshot({ dataUrl, filename: screenshotFilename(new Date()) });
    } catch (reason) {
      setScreenshot(null);
      setCaptureError(reason instanceof Error ? reason.message : "Social Finder could not capture this tab.");
    } finally {
      setCapturing(false);
    }
  }, []);

  const persistSaved = useCallback(async (records: AdLibraryRecord[]): Promise<boolean> => {
    try { await saveRecords(records); setSaved(records); setActionStatus("Saved ads updated."); return true; }
    catch { setActionStatus("Saved ads could not be updated. Your current list was kept."); return false; }
  }, []);

  const toggleSaved = useCallback((record: AdLibraryRecord) => {
    const next = saved.some(({ key }) => key === record.key) ? saved.filter(({ key }) => key !== record.key) : [...saved.filter(({ key }) => key !== record.key), record].slice(0, 500);
    void persistSaved(next);
  }, [persistSaved, saved]);

  const copyEvidence = useCallback(async (record: AdLibraryRecord) => {
    try { await navigator.clipboard.writeText(evidenceText(record)); setActionStatus(`Copied evidence for Library ID ${record.libraryId}.`); }
    catch { setActionStatus("Clipboard access failed. Keep this panel open and try again."); }
  }, []);

  const shareEvidence = useCallback(async (record: AdLibraryRecord) => {
    const text = evidenceText(record);
    try {
      const share = Reflect.get(navigator, "share") as ((data: ShareData) => Promise<void>) | undefined;
      if (share) await share.call(navigator, { title: record.advertiser ?? "Ad Library evidence", text, url: `https://www.facebook.com/ads/library/?id=${record.libraryId}` });
      else await navigator.clipboard.writeText(text);
      setActionStatus(share ? "Share sheet opened." : "Share evidence copied.");
    } catch { setActionStatus("Sharing was cancelled or unavailable; no data was lost."); }
  }, []);

  const readImport = useCallback(async (file: File | undefined) => {
    if (!file) return;
    if (file.size > 5_000_000) { setActionStatus("Import exceeds the 5 MB limit."); return; }
    try { setImportPreview(parseSocialFinderImport(await file.text(), saved)); setActionStatus("Import validated. Review the preview before merging."); }
    catch (reason) { setImportPreview(null); setActionStatus(reason instanceof Error ? reason.message : "Import could not be read."); }
  }, [saved]);


  const exportEncryptedBackup = useCallback(async () => {
    setBackupBusy(true);
    try {
      const encrypted = await encryptSavedRecords(saved, backupPassphrase);
      setBackupPassphrase("");
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      await downloadText(`social-finder-saved-${timestamp}.social-finder-backup`, encrypted, "application/json");
      setActionStatus(`Encrypted backup created for ${saved.length} saved ads.`);
    } catch (reason) {
      setActionStatus(reason instanceof Error ? reason.message : "Encrypted backup could not be created.");
    } finally {
      setBackupBusy(false);
    }
  }, [backupPassphrase, saved]);

  const previewEncryptedBackup = useCallback(async () => {
    if (!encryptedBackupFile) return;
    if (encryptedBackupFile.size > 7_000_000) { setActionStatus("Encrypted backup exceeds the 7 MB limit."); return; }
    setBackupBusy(true);
    try {
      const records = await decryptSavedRecords(await encryptedBackupFile.text(), backupPassphrase);
      setImportPreview(previewImportedRecords(records, saved));
      setBackupPassphrase("");
      setEncryptedBackupFile(null);
      if (backupFileInput.current) backupFileInput.current.value = "";
      setActionStatus("Backup decrypted and validated. Review the preview before merging.");
    } catch (reason) {
      setImportPreview(null);
      setActionStatus(reason instanceof Error ? reason.message : "Encrypted backup could not be decrypted.");
    } finally {
      setBackupBusy(false);
    }
  }, [backupPassphrase, encryptedBackupFile, saved]);

  const runSearch = useCallback(async () => {
    try {
      const url = buildAdLibrarySearchUrl(search);
      if (workspace.records.some((record) => !saved.some(({ key }) => key === record.key)) && !window.confirm("Open a new search and clear unsaved collected ads? Saved ads will remain.")) return;
      const tab = await activeTab();
      await chrome.tabs.update(tab.id!, { url });
      setSearchError(null);
    } catch (reason) {
      setSearchError(reason instanceof Error ? reason.message : "The search could not be opened.");
    }
  }, [saved, search, workspace.records]);

  const collectVisible = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await collectVisibleAdsOnce(workspace, () => requestSnapshot({ schemaVersion: 1, type: "RESCAN_SOCIAL_FINDINGS" }));
      setSnapshot(result.snapshot);
      setWorkspace(result.state);
      setView("collected");
      setActionStatus(`Collected ${result.snapshot.adLibraryRecords.length} ads visible on this screen.`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Visible ads could not be collected.");
    } finally {
      setLoading(false);
    }
  }, [workspace]);

  const startScreenshotDrag = useCallback((event: DragEvent<HTMLImageElement>) => {
    if (!screenshot) return;
    event.dataTransfer.effectAllowed = "copy";
    event.dataTransfer.setData("DownloadURL", screenshotDragPayload(screenshot.dataUrl, screenshot.filename));
    event.dataTransfer.setData("text/uri-list", screenshot.dataUrl);
  }, [screenshot]);

  return (
    <main className={`density-${preferences.density}`}>
      <header>
        <div>
          <p className="eyebrow">Local Facebook detector</p>
          <h1>Social Finder</h1>
        </div>
        <span className="total" aria-label={`${snapshot?.findings.length ?? 0} findings`}>{snapshot?.findings.length ?? 0}</span>
      </header>

      <section className="search-panel" aria-labelledby="search-heading">
        <h2 id="search-heading">Ad Library search</h2>
        <label>Keyword<input value={search.keyword} maxLength={200} onChange={(event) => setSearch({ ...search, keyword: event.target.value })} /></label>
        <div className="search-row">
          <label>Country<select value={search.country} onChange={(event) => setSearch({ ...search, country: event.target.value })}><option value="US">United States</option><option value="GB">United Kingdom</option><option value="CA">Canada</option><option value="AU">Australia</option></select></label>
          <label>Ad type<select value={search.adType} onChange={(event) => setSearch({ ...search, adType: event.target.value as AdLibrarySearch["adType"] })}><option value="all">All ads</option><option value="political_and_issue_ads">Issues, elections or politics</option></select></label>
          <label>Status<select value={search.activeStatus} onChange={(event) => setSearch({ ...search, activeStatus: event.target.value as "all" | "active" | "inactive" })}><option value="active">Active</option><option value="all">All</option><option value="inactive">Inactive</option></select></label>
        </div>
        <button type="button" onClick={() => void runSearch()}>Open search</button>
        <button type="button" className="collect-visible" disabled={collectControl.disabled} title={collectControl.title} onClick={() => void collectVisible()}>{loading ? "Reading visible ads…" : "Collect visible ads"}</button>
        <p className="collect-help">{collectControl.help}</p>
        {searchError && <p className="field-error" role="alert">{searchError}</p>}
      </section>

      <details className="research-panel"><summary>Local research helpers</summary><div>
        <h2>Search ideas</h2><p>Compose editable keywords and a transparent prompt. Nothing is sent.</p>
        <label>Niche<input maxLength={100} value={ideaForm.niche} onChange={(event) => setIdeaForm({ ...ideaForm, niche: event.target.value })} /></label>
        <label>Product<input maxLength={100} value={ideaForm.product} onChange={(event) => setIdeaForm({ ...ideaForm, product: event.target.value })} /></label>
        <button type="button" onClick={() => { try { setIdeas(searchIdeas(ideaForm.niche, ideaForm.product)); } catch (reason) { setActionStatus(reason instanceof Error ? reason.message : "Ideas could not be composed."); } }}>Compose ideas</button>
        {ideas && <><label>Editable keywords<textarea value={ideas.keywords.join("\n")} onChange={(event) => setIdeas({ ...ideas, keywords: event.target.value.split("\n").slice(0, 20) })} /></label><button type="button" className="secondary" onClick={() => void navigator.clipboard.writeText(ideas.prompt).then(() => setActionStatus("Research prompt copied.")).catch(() => setActionStatus("Clipboard access failed."))}>Copy research prompt</button></>}
      </div></details>

      <details className="preferences-panel"><summary>Preferences and import</summary><div>
        <label>Result density<select value={preferences.density} onChange={(event) => setPreferences({ ...preferences, density: event.target.value as Preferences["density"] })}><option value="compact">Compact</option><option value="comfortable">Comfortable</option></select></label>
        <label>Collection cap<input type="number" min="1" max="500" value={preferences.collectionCap} onChange={(event) => setPreferences({ ...preferences, collectionCap: Math.max(1, Math.min(500, Number(event.target.value) || 1)) })} /></label>
        <label className="check-label"><input type="checkbox" checked={preferences.diagnosticsExpanded} onChange={(event) => setPreferences({ ...preferences, diagnosticsExpanded: event.target.checked })} />Start diagnostics expanded</label>
        <button type="button" onClick={() => void savePreferences({ ...preferences, filters }).then(() => { setWorkspace((current) => ({ ...current, cap: preferences.collectionCap })); setActionStatus("Preferences saved locally."); }).catch(() => setActionStatus("Preferences could not be saved."))}>Save preferences</button>
        <section className="backup-panel" aria-labelledby="backup-heading">
          <h2 id="backup-heading">Encrypted cross-profile backup</h2>
          <p>Use the same passphrase in another Chrome profile. Social Finder never stores it.</p>
          <label>Backup passphrase<input type="password" minLength={12} maxLength={1024} autoComplete="new-password" value={backupPassphrase} onChange={(event) => setBackupPassphrase(event.target.value)} /></label>
          <label>Encrypted backup file<input ref={backupFileInput} type="file" accept="application/json,.social-finder-backup" onChange={(event) => setEncryptedBackupFile(event.target.files?.[0] ?? null)} /></label>
          <div className="backup-actions"><button type="button" disabled={backupBusy || saved.length === 0} onClick={() => void exportEncryptedBackup()}>{backupBusy ? "Working…" : "Export encrypted backup"}</button><button type="button" className="secondary" disabled={backupBusy || !encryptedBackupFile} onClick={() => void previewEncryptedBackup()}>{backupBusy ? "Working…" : "Decrypt and preview"}</button></div>
        </section>
        <label>Import Social Finder JSON<input type="file" accept="application/json,.json" onChange={(event) => void readImport(event.target.files?.[0])} /></label>
        {importPreview && <div className="import-preview"><p>{importPreview.newRecords} new records; {importPreview.duplicates} duplicates.</p><button type="button" onClick={() => { const merged = mergeImportedRecords(saved, importPreview.records); void persistSaved(merged).then((savedSuccessfully) => { if (!savedSuccessfully) return; setImportPreview(null); setActionStatus(`Import merged ${importPreview.newRecords} new records and reviewed ${importPreview.duplicates} duplicates.`); }); }}>Confirm merge</button><button type="button" className="secondary" onClick={() => setImportPreview(null)}>Cancel import</button></div>}
      </div></details>

      <nav className="view-switch" aria-label="Workspace views"><button type="button" aria-pressed={view === "collected"} onClick={() => setView("collected")}>Collected</button><button type="button" aria-pressed={view === "saved"} onClick={() => setView("saved")}>Saved ({saved.length})</button></nav>

      {view === "saved" && <label className="saved-search">Search saved ads<input type="search" value={savedSearch} maxLength={200} onChange={(event) => setSavedSearch(event.target.value)} /></label>}

      <section className="source-strip" aria-label="Current source">
        <strong>{snapshot?.surface === "ad-library" ? "Meta Ad Library" : snapshot?.surface ?? "Loading"}</strong>
        <span>{workspace.collecting ? "Collecting while you browse" : workspace.capReached ? `Stopped at ${workspace.cap}` : "Collection stopped"}</span>
      </section>

      {snapshot?.surface === "ad-library" && view === "collected" && <section className="collection-panel" aria-labelledby="collection-heading">
        <div className="section-heading"><h2 id="collection-heading">Collection</h2><button type="button" className="secondary compact" onClick={() => setWorkspace((current) => ({ ...current, collecting: !current.collecting && !current.capReached }))}>{workspace.collecting ? "Stop collecting" : "Collect while I browse"}</button></div>
        <div className="summary" role="status" aria-live="polite"><span><strong>{summary.visibleCollectedAds}</strong> visible collected ads</span><span><strong>{summary.filteredResults}</strong> filtered results</span><span><strong>{summary.uniqueAdvertisers}</strong> unique advertisers</span></div>
        <details className="filters"><summary>Filters and sorting</summary><div className="filter-grid">
          <label>Advertiser<input value={filters.advertiser} onChange={(event) => setFilters({ ...filters, advertiser: event.target.value })} /></label>
          <label>Status<select value={filters.status} onChange={(event) => setFilters({ ...filters, status: event.target.value as typeof filters.status })}><option value="all">All</option><option value="active">Active</option><option value="inactive">Inactive</option></select></label>
          <label>Minimum runtime<input type="number" min="0" max="10000" value={filters.minRuntime ?? ""} onChange={(event) => setFilters({ ...filters, minRuntime: event.target.value ? Number(event.target.value) : null })} /></label>
          <label>Maximum runtime<input type="number" min="0" max="10000" value={filters.maxRuntime ?? ""} onChange={(event) => setFilters({ ...filters, maxRuntime: event.target.value ? Number(event.target.value) : null })} /></label>
          <label>Platform<select value={filters.platform} onChange={(event) => setFilters({ ...filters, platform: event.target.value as typeof filters.platform })}><option value="all">All</option><option value="facebook">Facebook</option><option value="instagram">Instagram</option><option value="messenger">Messenger</option><option value="audience-network">Audience Network</option></select></label>
          <label>Has media<select value={filters.hasMedia} onChange={(event) => setFilters({ ...filters, hasMedia: event.target.value as typeof filters.hasMedia })}><option value="all">All</option><option value="yes">Yes</option><option value="no">No</option></select></label>
          <label>Multiple versions<select value={filters.multipleVersions} onChange={(event) => setFilters({ ...filters, multipleVersions: event.target.value as typeof filters.multipleVersions })}><option value="all">All</option><option value="yes">Visible</option><option value="no">Not visible</option></select></label>
          <label>Sort<select value={filters.sort} onChange={(event) => setFilters({ ...filters, sort: event.target.value as typeof filters.sort })}><option value="first-seen">First seen</option><option value="newest">Newest start</option><option value="oldest">Oldest start</option><option value="longest">Longest runtime</option><option value="shortest">Shortest runtime</option><option value="advertiser">Advertiser</option></select></label>
        </div></details>
        <button type="button" className="text-button" onClick={() => setWorkspace((current) => ({ ...emptyWorkspace(current.pageKey, current.cap) }))}>Clear collected ads</button>
      </section>}

      {loading && <p className="notice" role="status">Scanning the visible page…</p>}
      {error && <p className="notice error" role="alert">{error}</p>}
      {!loading && snapshot?.surface === "unsupported" && <p className="notice">Open Meta Ad Library, Facebook Feed, or Marketplace to scan.</p>}
      {!loading && snapshot && snapshot.surface !== "unsupported" && snapshot.findings.length === 0 && (
        <p className="notice">No matching visible cards yet. Scroll normally, then rescan.</p>
      )}

      {actionStatus && <p className="notice" role="status">{actionStatus}</p>}
      {visibleRecords.length > 0 ? (
        <><ul className="findings" aria-label="Filtered Ad Library records">
          {visibleRecords.map((record) => {
            const destination = safeHttps(record.destinationUrl);
            const media = record.mediaUrls.map(safeHttps).find(Boolean) ?? null;
            const isSaved = saved.some(({ key }) => key === record.key);
            return <li key={record.key}>
              <div className="record-heading"><label className="select-record"><input type="checkbox" checked={selected.includes(record.key)} onChange={(event) => setSelected(event.target.checked ? [...new Set([...selected, record.key])] : selected.filter((key) => key !== record.key))} />Select</label><span className="kind">{record.status ?? "Status unavailable"}</span></div>
              <strong>{record.advertiser ?? "Advertiser unavailable"}</strong>
              <p>Library ID {record.libraryId}{record.runtimeDays === null ? "" : ` · ${record.runtimeDays} days`}</p>
              <p>{record.text}</p>
              <div className="card-actions">
                <a href={`https://www.facebook.com/ads/library/?id=${record.libraryId}`} target="_blank" rel="noreferrer">Open source</a>
                {destination ? <a href={destination} target="_blank" rel="noreferrer">Open destination</a> : <span title="No visible HTTPS destination">Destination unavailable</span>}
                <button type="button" onClick={() => void copyEvidence(record)}>Copy</button><button type="button" onClick={() => toggleSaved(record)}>{isSaved ? "Unsave" : "Save"}</button><button type="button" onClick={() => void shareEvidence(record)}>Share</button><button type="button" onClick={() => void navigator.clipboard.writeText(analysisPrompt(record)).then(() => setActionStatus("Analysis prompt copied.")).catch(() => setActionStatus("Clipboard access failed."))}>Analysis prompt</button>
                <button type="button" onClick={() => void downloadText(`social-finder-${record.libraryId}.json`, recordsToJson([record]), "application/json").catch(() => setActionStatus("Metadata download failed."))}>Metadata</button>
                <button type="button" disabled={!media} title={media ? "Download visible creative media" : "No visible HTTPS media"} onClick={() => media && void chrome.downloads.download({ url: media, saveAs: true }).catch(() => setActionStatus("Chrome could not download this media source."))}>Media</button>
              </div>
            </li>;
          })}
        </ul><section className="export-actions" aria-label="Export saved records"><button type="button" className="secondary" disabled={!selected.length} onClick={() => void downloadText("social-finder-selected.json", recordsToJson(sourceRecords.filter(({ key }) => selected.includes(key))), "application/json")}>Export selected</button><button type="button" className="secondary" onClick={() => void downloadText("social-finder-ads.csv", recordsToCsv(sourceRecords), "text/csv")}>Export CSV</button>{view === "saved" && <button type="button" className="danger" onClick={() => setConfirmClear(true)}>Clear all saved</button>}</section></>
      ) : view === "saved" ? <p className="notice">No saved ads match these filters.</p> : snapshot && snapshot.findings.length > 0 && (
        <ul className="findings" aria-label="Visible findings">{snapshot.findings.map((finding) => <li key={finding.key}><span className="kind">{KIND_LABELS[finding.kind]}</span><strong>{finding.title}</strong>{finding.snippet && <p>{finding.snippet}</p>}{finding.url && <a href={finding.url} target="_blank" rel="noreferrer">Open result</a>}</li>)}</ul>
      )}

      {snapshot && (
        <details className="diagnostics" open={preferences.diagnosticsExpanded} onToggle={(event) => setPreferences((current) => ({ ...current, diagnosticsExpanded: event.currentTarget.open }))}><summary>Detection diagnostics</summary><div><span>{snapshot.diagnostics.candidates} candidates</span><span>{snapshot.diagnostics.rejected} rejected</span><span>{snapshot.diagnostics.renderFailures} render failures</span></div></details>
      )}

      <section className="actions" aria-label="Social Finder actions">
        <button type="button" onClick={() => void load(true)} disabled={loading}>Rescan visible page</button>
        <button type="button" className="secondary" onClick={() => void capture()} disabled={capturing}>
          {capturing ? "Capturing…" : "Take screen snapshot"}
        </button>
      </section>

      {captureError && <p className="notice error" role="alert">{captureError}</p>}
      {screenshot && (
        <section className="snapshot" aria-label="Captured screen snapshot">
          <div className="snapshot-heading">
            <strong>Screen snapshot</strong>
            <button type="button" className="text-button" onClick={() => setScreenshot(null)}>Clear</button>
          </div>
          <img
            src={screenshot.dataUrl}
            alt="Captured active Facebook tab"
            draggable
            onDragStart={startScreenshotDrag}
          />
          <p>Drag this image into GG Coder, or download it.</p>
          <a href={screenshot.dataUrl} download={screenshot.filename}>Download PNG</a>
        </section>
      )}

      <dialog ref={clearDialog} aria-labelledby="clear-title" onClose={() => setConfirmClear(false)}><h2 id="clear-title">Clear all saved ads?</h2><p>This removes only Social Finder saved ads and preferences from this Chrome profile. It cannot be undone.</p><div className="actions"><button type="button" className="secondary" onClick={() => setConfirmClear(false)}>Cancel</button><button type="button" className="danger" autoFocus onClick={() => void clearSocialFinderStorage().then(() => { setSaved([]); setConfirmClear(false); setActionStatus("All Social Finder saved data cleared."); }).catch(() => setActionStatus("Saved data could not be cleared."))}>Clear all</button></div></dialog>
      <p className="privacy">Runs locally. Saved ads persist; screenshots stay in memory until cleared or closed.</p>
    </main>
  );
}
