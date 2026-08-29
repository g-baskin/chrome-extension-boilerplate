import { getLinkedInJobId, extractLinkedInJob } from "../lib/linkedin-job";
import { matchJob } from "../lib/matcher";
import { sendMessage } from "../lib/messages";
import type { KeywordSettings, SavedJob } from "../lib/types";
import { MatchPanel } from "./panel";

if (!document.getElementById("linkedin-job-finder-root")) {
  let settings: KeywordSettings = { required: [], preferred: [], excluded: [] };
  let savedIds = new Set<string>();
  let renderedJobId: string | null = null;
  let currentSnapshot: { job: SavedJob["job"]; match: SavedJob["match"]; saved: boolean } | null = null;
  let timer: number | undefined;

  const panel = new MatchPanel(async (job, match) => {
    const response = await sendMessage<SavedJob>({ type: "SAVE_JOB", job, match });
    if (!response.ok) throw new Error(response.error);
    savedIds.add(job.id);
    if (currentSnapshot?.job.id === job.id) currentSnapshot = { ...currentSnapshot, saved: true };
  });

  const loadState = async (): Promise<void> => {
    const [settingsResponse, jobsResponse] = await Promise.all([
      sendMessage<KeywordSettings>({ type: "GET_SETTINGS" }),
      sendMessage<SavedJob[]>({ type: "GET_JOBS" }),
    ]);
    if (!settingsResponse.ok || !jobsResponse.ok) throw new Error("Could not load extension state.");
    settings = settingsResponse.data;
    savedIds = new Set(jobsResponse.data.map((saved) => saved.job.id));
  };

  const renderCurrentJob = async (force = false): Promise<void> => {
    const id = getLinkedInJobId(location.href);
    if (!id) {
      renderedJobId = null;
      currentSnapshot = null;
      panel.setState({ kind: "unsupported" });
      return;
    }
    if (!force && id === renderedJobId) return;
    const job = extractLinkedInJob(document, location.href);
    if (!job) {
      currentSnapshot = null;
      panel.setState({ kind: "loading" });
      return;
    }
    renderedJobId = id;
    const match = matchJob(job, settings);
    const saved = savedIds.has(id);
    currentSnapshot = { job, match, saved };
    panel.setState({ kind: "ready", job, match, saved });
  };

  const scheduleRender = (): void => {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => { void renderCurrentJob(); }, 250);
  };

  const observer = new MutationObserver(scheduleRender);
  observer.observe(document.body, { childList: true, subtree: true });
  chrome.runtime.onMessage.addListener((message: unknown, _sender, sendResponse) => {
    if (!message || typeof message !== "object" || !("type" in message)) return;
    if (message.type === "SETTINGS_CHANGED") void loadState().then(() => renderCurrentJob(true)).catch(() => panel.setState({ kind: "unsupported" }));
    if (message.type === "READ_CURRENT_JOB") sendResponse(currentSnapshot);
  });

  void loadState().then(() => renderCurrentJob(true)).catch(() => panel.setState({ kind: "unsupported" }));
}
