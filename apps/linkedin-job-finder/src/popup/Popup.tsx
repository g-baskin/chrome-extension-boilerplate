import { useEffect, useState, type FormEvent } from "react";
import { Icon } from "../components/Icon";
import { normalizeKeywordSettings } from "../lib/keywords";
import { matchJob } from "../lib/matcher";
import { sendMessage, type CurrentJob } from "../lib/messages";
import type { KeywordSettings, SavedJob, ScanVisibleJobsResult } from "../lib/types";

const empty: KeywordSettings = { required: [], preferred: [], excluded: [], excludeClearanceRequired: false };
const asText = (terms: string[]) => terms.join("\n");

export function Popup() {
  const [settings, setSettings] = useState(empty);
  const [current, setCurrent] = useState<CurrentJob | null>(null);
  const [phase, setPhase] = useState<"loading" | "ready" | "error">("loading");
  const [status, setStatus] = useState("");
  const [savingJob, setSavingJob] = useState(false);
  const [savingRules, setSavingRules] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [scanResult, setScanResult] = useState<ScanVisibleJobsResult | null>(null);

  useEffect(() => {
    void Promise.all([
      sendMessage<KeywordSettings>({ type: "GET_SETTINGS" }),
      sendMessage<CurrentJob | null>({ type: "GET_CURRENT_JOB" }),
    ]).then(([settingsResponse, jobResponse]) => {
      if (!settingsResponse.ok || !jobResponse.ok) throw new Error();
      setSettings(settingsResponse.data);
      setCurrent(jobResponse.data);
      setPhase("ready");
    }).catch(() => setPhase("error"));
  }, []);

  const update = (key: "required" | "preferred" | "excluded", value: string) => setSettings((old) => ({ ...old, [key]: value.split("\n") }));

  const saveSettings = async (event: FormEvent) => {
    event.preventDefault();
    setSavingRules(true);
    setStatus("Saving keyword rules…");
    const normalized = normalizeKeywordSettings(settings);
    const response = await sendMessage<KeywordSettings>({ type: "SET_SETTINGS", settings: normalized });
    setSavingRules(false);
    if (!response.ok) { setStatus(response.error); return; }
    setSettings(response.data);
    setCurrent((old) => old ? { ...old, match: matchJob(old.job, response.data) } : null);
    setStatus("Keyword rules saved.");
  };

  const scanVisible = async () => {
    setScanning(true);
    setScanResult(null);
    setStatus("Scanning up to 10 visible jobs…");
    const response = await sendMessage<ScanVisibleJobsResult>({ type: "SCAN_VISIBLE_JOBS" });
    setScanning(false);
    if (!response.ok) { setStatus(response.error); return; }
    setScanResult(response.data);
    setStatus(`Scanned ${response.data.scanned} jobs; ${response.data.failed} could not be read.`);
  };

  const saveCurrent = async () => {
    if (!current) return;
    setSavingJob(true);
    const response = await sendMessage<SavedJob>({ type: "SAVE_JOB", job: current.job, match: current.match });
    setSavingJob(false);
    if (!response.ok) { setStatus(response.error); return; }
    setCurrent({ ...current, saved: true });
    setStatus("Job saved.");
  };

  if (phase === "loading") return <main className="popup-shell"><p className="notice">Loading your keyword rules…</p></main>;
  if (phase === "error") return <main className="popup-shell"><h1>Job Finder</h1><p className="notice notice--error">The extension could not load. Close and reopen the popup.</p></main>;

  return <main className="popup-shell">
    <header className="popup-header">
      <div><p className="utility">LOCAL MATCH RULES</p><h1>Job Finder</h1></div>
    </header>

    <section className="current" aria-labelledby="current-title">
      <h2 id="current-title">Current LinkedIn job</h2>
      {current ? <>
        <p className={`result result--${current.match.eligible ? "eligible" : "blocked"}`}>{current.match.eligible ? "Eligible match" : current.match.matchedExcluded.length ? "Excluded term found" : "Required terms missing"}</p>
        <h3>{current.job.title}</h3>
        <p className="job-meta">{[current.job.company, current.job.location].filter(Boolean).join(" · ")}</p>
        <p className="match-count">{current.match.positiveMatched} of {current.match.positiveTotal} positive keywords</p>
        {(current.match.missingRequired.length > 0 || current.match.matchedExcluded.length > 0) && <dl className="compact-ledger">
          {current.match.missingRequired.length > 0 && <><dt>Missing</dt><dd>{current.match.missingRequired.join(", ")}</dd></>}
          {current.match.matchedExcluded.length > 0 && <><dt>Excluded</dt><dd>{current.match.matchedExcluded.join(", ")}</dd></>}
        </dl>}
        <button className="primary" type="button" disabled={savingJob || current.saved} onClick={() => void saveCurrent()}>{savingJob ? "Saving…" : current.saved ? "Saved" : "Save current job"}</button>
      </> : <p className="notice">Open a LinkedIn job, then reopen this popup.</p>}
    </section>

    <section className="scan" aria-labelledby="scan-title">
      <h2 id="scan-title">Visible listings</h2>
      <p className="help">Uses your saved rules on up to 10 rendered cards. It never clicks Show all or saves automatically.</p>
      <button className="secondary" type="button" disabled={scanning} onClick={() => void scanVisible()}>{scanning ? "Scanning…" : "Scan visible jobs"}</button>
      {scanResult && <div className="scan-results">
        <p><strong>{scanResult.eligible.length}</strong> eligible of {scanResult.scanned} scanned</p>
        {scanResult.eligible.length === 0 ? <p className="help">No eligible visible jobs found.</p> : <ul>{scanResult.eligible.map(({ job }) => <li key={job.id}><a href={job.url} target="_blank" rel="noreferrer">{job.title}<Icon name="arrow" /></a></li>)}</ul>}
      </div>}
    </section>

    <form className="rules" onSubmit={(event) => void saveSettings(event)}>
      <h2>Keyword rules</h2>
      <p className="help">Enter phrases on separate lines or with commas. Matching ignores letter case.</p>
      <label>Required<textarea value={asText(settings.required)} onChange={(event) => update("required", event.target.value)} rows={3} maxLength={4_050} placeholder="React&#10;TypeScript" /></label>
      <label>Preferred<textarea value={asText(settings.preferred)} onChange={(event) => update("preferred", event.target.value)} rows={3} maxLength={4_050} placeholder="Remote&#10;GraphQL" /></label>
      <label>Excluded<textarea value={asText(settings.excluded)} onChange={(event) => update("excluded", event.target.value)} rows={2} maxLength={4_050} placeholder="Unpaid&#10;Commission only" /></label>
      <label className="clearance-option"><input type="checkbox" checked={settings.excludeClearanceRequired} onChange={(event) => setSettings((old) => ({ ...old, excludeClearanceRequired: event.target.checked }))} /><span><strong>Exclude clearance-required jobs</strong><small>Detects active clearances and requirements to obtain or maintain one.</small></span></label>
      <button className="secondary" type="submit" disabled={savingRules}>{savingRules ? "Saving…" : "Save keyword rules"}</button>
    </form>
    <p className="live-status" role="status" aria-live="polite">{status}</p>
    <button className="saved-link" type="button" onClick={() => void chrome.runtime.openOptionsPage()}>Browse saved jobs <Icon name="arrow" /></button>
  </main>;
}
