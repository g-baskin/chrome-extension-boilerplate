import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Icon } from "../components/Icon";
import { MAX_NOTES_LENGTH } from "../lib/storage";
import { sendMessage } from "../lib/messages";
import type { SavedJob } from "../lib/types";

type Filter = "all" | "eligible" | "blocked";

function Evidence({ saved }: { saved: SavedJob }) {
  const { match } = saved;
  return <div className="evidence" aria-label="Match evidence">
    <div className="evidence-row evidence-row--matched"><strong>Matched</strong><span>{[...match.matchedRequired, ...match.matchedPreferred].join(", ") || "None"}</span></div>
    <div className="evidence-row evidence-row--missing"><strong>Missing</strong><span>{match.missingRequired.join(", ") || "None"}</span></div>
    <div className="evidence-row evidence-row--excluded"><strong>Excluded</strong><span>{match.matchedExcluded.join(", ") || "None"}</span></div>
  </div>;
}

interface JobRowProps { saved: SavedJob; onDelete: (id: string) => Promise<void>; onNotes: (id: string, notes: string) => Promise<boolean> }
function JobRow({ saved, onDelete, onNotes }: JobRowProps) {
  const [notes, setNotes] = useState(saved.notes);
  const [noteStatus, setNoteStatus] = useState("");
  const [savingNotes, setSavingNotes] = useState(false);

  const saveNotes = async (event: FormEvent) => {
    event.preventDefault();
    setSavingNotes(true);
    setNoteStatus("Saving…");
    setNoteStatus(await onNotes(saved.job.id, notes) ? "Notes saved." : "Could not save notes.");
    setSavingNotes(false);
  };

  const remove = async () => {
    if (window.confirm(`Delete ${saved.job.title} from saved jobs?`)) await onDelete(saved.job.id);
  };

  return <article className="job-row">
    <div className="job-main">
      <div className="job-heading">
        <div>
          <p className={`record-status record-status--${saved.match.eligible ? "eligible" : "blocked"}`}>{saved.match.eligible ? "Eligible" : "Not eligible"}</p>
          <h2>{saved.job.title}</h2>
          <p className="job-meta">{[saved.job.company, saved.job.location].filter(Boolean).join(" · ") || "Company and location unavailable"}</p>
        </div>
        <p className="saved-date">Saved {new Date(saved.savedAt).toLocaleDateString()}</p>
      </div>
      <p className="match-count">{saved.match.positiveMatched} of {saved.match.positiveTotal} positive keywords</p>
      <Evidence saved={saved} />
    </div>
    <div className="job-actions">
      <form onSubmit={(event) => void saveNotes(event)}>
        <label htmlFor={`notes-${saved.job.id}`}>Notes</label>
        <textarea id={`notes-${saved.job.id}`} value={notes} onChange={(event) => setNotes(event.target.value)} maxLength={MAX_NOTES_LENGTH} rows={3} placeholder="Interview details, contacts, or next steps" />
        <div className="note-footer"><span role="status" aria-live="polite">{noteStatus}</span><button type="submit" className="small-button" disabled={savingNotes || (notes === saved.notes && noteStatus !== "Could not save notes.")}>{savingNotes ? "Saving…" : "Save notes"}</button></div>
      </form>
      <div className="record-links">
        <a className="open-link" href={saved.job.url} target="_blank" rel="noreferrer">Open LinkedIn job <Icon name="arrow" /></a>
        <button className="delete-button" type="button" onClick={() => void remove()}><Icon name="trash" /> Delete</button>
      </div>
    </div>
  </article>;
}

export function SavedJobs() {
  const [jobs, setJobs] = useState<SavedJob[]>([]);
  const [phase, setPhase] = useState<"loading" | "ready" | "error">("loading");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [status, setStatus] = useState("");

  useEffect(() => { void sendMessage<SavedJob[]>({ type: "GET_JOBS" }).then((response) => {
    if (!response.ok) throw new Error();
    setJobs(response.data);
    setPhase("ready");
  }).catch(() => setPhase("error")); }, []);

  const visible = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    return jobs.filter((saved) => (filter === "all" || (filter === "eligible") === saved.match.eligible)
      && (!needle || [saved.job.title, saved.job.company, saved.job.location, saved.notes].some((value) => value.toLocaleLowerCase().includes(needle))));
  }, [filter, jobs, query]);

  const deleteOne = async (id: string) => {
    const response = await sendMessage({ type: "DELETE_JOB", id });
    if (!response.ok) { setStatus(response.error); return; }
    setJobs((old) => old.filter((saved) => saved.job.id !== id));
    setStatus("Saved job deleted.");
  };

  const saveNotes = async (id: string, notes: string) => {
    const response = await sendMessage({ type: "UPDATE_NOTES", id, notes });
    if (!response.ok) return false;
    setJobs((old) => old.map((saved) => saved.job.id === id ? { ...saved, notes, updatedAt: new Date().toISOString() } : saved));
    return true;
  };

  const clearAll = async () => {
    if (!window.confirm(`Delete all ${jobs.length} saved jobs? This cannot be undone.`)) return;
    const response = await sendMessage({ type: "CLEAR_JOBS" });
    if (!response.ok) { setStatus(response.error); return; }
    setJobs([]);
    setStatus("All saved jobs deleted.");
  };

  return <>
    <header className="page-header"><div className="rail"><div><p className="utility">LINKEDIN JOB FINDER</p><h1>Saved jobs</h1><p>Review match evidence and keep your next steps together.</p></div>{jobs.length > 0 && <button className="clear-button" type="button" onClick={() => void clearAll()}>Clear all saved jobs</button>}</div></header>
    <main className="rail page-main">
      <section className="toolbar" aria-label="Saved job filters">
        <label className="search-label"><span>Search saved jobs</span><span className="search-control"><Icon name="search" /><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Title, company, location, or notes" /></span></label>
        <label className="filter-label"><span>Match status</span><select value={filter} onChange={(event) => setFilter(event.target.value as Filter)}><option value="all">All jobs</option><option value="eligible">Eligible</option><option value="blocked">Not eligible</option></select></label>
      </section>
      <p className="results-status" role="status" aria-live="polite">{phase === "ready" ? `${visible.length} ${visible.length === 1 ? "job" : "jobs"}` : ""}</p>
      {phase === "loading" && <p className="page-notice">Loading saved jobs…</p>}
      {phase === "error" && <p className="page-notice page-notice--error">Saved jobs could not load. Refresh this page to try again.</p>}
      {phase === "ready" && jobs.length === 0 && <section className="empty"><h2>No saved jobs yet</h2><p>Open a LinkedIn job and use the in-page panel to save it.</p></section>}
      {phase === "ready" && jobs.length > 0 && visible.length === 0 && <section className="empty"><h2>No jobs match these filters</h2><p>Change the search or match status to see saved jobs.</p></section>}
      <div className="job-list">{visible.map((saved) => <JobRow key={saved.job.id} saved={saved} onDelete={deleteOne} onNotes={saveNotes} />)}</div>
      <p className="global-status" role="status" aria-live="polite">{status}</p>
    </main>
  </>;
}
