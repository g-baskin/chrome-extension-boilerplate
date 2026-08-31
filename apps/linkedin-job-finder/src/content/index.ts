import { collectLinkedInJobIds, extractLinkedInJob, getLinkedInJobId } from "../lib/linkedin-job";
import { matchJob } from "../lib/matcher";
import { sendMessage } from "../lib/messages";
import type { ExtractedJob, KeywordSettings, SavedJob, ScanVisibleJobsResult } from "../lib/types";
import { MatchPanel } from "./panel";

if (!document.getElementById("linkedin-job-finder-root")) {
  let settings: KeywordSettings = { required: [], preferred: [], excluded: [], excludeClearanceRequired: false };
  let savedIds = new Set<string>();
  let renderedJobId: string | null = null;
  let currentSnapshot: { job: SavedJob["job"]; match: SavedJob["match"]; saved: boolean } | null = null;
  let timer: number | undefined;
  let activeScan: Promise<ScanVisibleJobsResult> | null = null;

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
    if (activeScan) return;
    window.clearTimeout(timer);
    timer = window.setTimeout(() => { if (!activeScan) void renderCurrentJob(); }, 250);
  };

  const waitForJob = async (id: string, previousDescription: string | null): Promise<ExtractedJob | null> => {
    const deadline = Date.now() + 4_000;
    while (Date.now() < deadline) {
      const job = getLinkedInJobId(location.href) === id ? extractLinkedInJob(document, location.href) : null;
      if (job && (!previousDescription || job.description !== previousDescription)) return job;
      await new Promise((resolve) => window.setTimeout(resolve, 150));
    }
    return null;
  };

  const findRenderedJobAnchor = (id: string): HTMLAnchorElement | undefined =>
    [...document.querySelectorAll<HTMLAnchorElement>("a[href*='/jobs/view/'], a[href*='currentJobId=']")]
      .find((anchor) => getLinkedInJobId(anchor.href) === id && anchor.getClientRects().length > 0 && !anchor.closest("[aria-hidden='true']"));

  const runVisibleScan = async (): Promise<ScanVisibleJobsResult> => {
    await loadState();
    const originalId = getLinkedInJobId(location.href);
    if (!originalId || !extractLinkedInJob(document, location.href)) return { scanned: 0, failed: 0, eligible: [] };
    const anchors = [...document.querySelectorAll<HTMLAnchorElement>("a[href*='/jobs/view/'], a[href*='currentJobId=']")]
      .filter((anchor) => anchor.getClientRects().length > 0 && !anchor.closest("[aria-hidden='true']"));
    const ids = collectLinkedInJobIds(anchors.map((anchor) => anchor.href));
    let failed = 0;
    const eligible: ScanVisibleJobsResult["eligible"] = [];

    for (const id of ids) {
      const anchor = findRenderedJobAnchor(id);
      if (!anchor) { failed += 1; continue; }
      const currentId = getLinkedInJobId(location.href);
      const beforeClick = currentId ? extractLinkedInJob(document, location.href)?.description ?? null : null;
      if (currentId !== id) anchor.click();
      const job = currentId === id ? extractLinkedInJob(document, location.href) : await waitForJob(id, beforeClick);
      if (!job) { failed += 1; continue; }
      const match = matchJob(job, settings);
      if (match.eligible) eligible.push({ job, match });
    }

    if (originalId && getLinkedInJobId(location.href) !== originalId) {
      const beforeRestore = extractLinkedInJob(document, location.href)?.description ?? null;
      findRenderedJobAnchor(originalId)?.click();
      await waitForJob(originalId, beforeRestore);
    }
    await renderCurrentJob(true);
    return { scanned: ids.length, failed, eligible };
  };

  const scanVisibleJobs = (): Promise<ScanVisibleJobsResult> => {
    if (activeScan) return activeScan;
    activeScan = runVisibleScan().finally(() => { activeScan = null; });
    return activeScan;
  };

  const observer = new MutationObserver(scheduleRender);
  observer.observe(document.body, { childList: true, subtree: true });
  chrome.runtime.onMessage.addListener((message: unknown, _sender, sendResponse) => {
    if (!message || typeof message !== "object" || !("type" in message)) return;
    if (message.type === "SETTINGS_CHANGED") void loadState().then(() => renderCurrentJob(true)).catch(() => panel.setState({ kind: "unsupported" }));
    if (message.type === "READ_CURRENT_JOB") sendResponse(currentSnapshot);
    if (message.type === "SCAN_VISIBLE_JOBS") {
      void scanVisibleJobs().then(sendResponse, () => sendResponse(null));
      return true;
    }
  });

  void loadState().then(() => renderCurrentJob(true)).catch(() => panel.setState({ kind: "unsupported" }));
}
