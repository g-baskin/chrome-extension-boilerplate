import { EMPTY_KEYWORDS } from "../lib/keywords";
import { isRequest, type CurrentJob, type Response } from "../lib/messages";
import { clearJobs, deleteJob, getJobs, getSettings, saveJob, setSettings, STORAGE_KEYS, updateNotes, type StorageAdapter } from "../lib/storage";

const storage: StorageAdapter = {
  get: (keys) => chrome.storage.local.get(keys),
  set: (items) => chrome.storage.local.set(items),
};
async function initialize(): Promise<void> {
  await chrome.storage.local.setAccessLevel({ accessLevel: "TRUSTED_CONTEXTS" });
  const values = await chrome.storage.local.get([STORAGE_KEYS.settings, STORAGE_KEYS.jobs]);
  const defaults: Record<string, unknown> = {};
  if (values[STORAGE_KEYS.settings] === undefined) defaults[STORAGE_KEYS.settings] = EMPTY_KEYWORDS;
  if (values[STORAGE_KEYS.jobs] === undefined) defaults[STORAGE_KEYS.jobs] = [];
  if (Object.keys(defaults).length) await chrome.storage.local.set(defaults);
}

chrome.runtime.onInstalled.addListener(() => { void initialize(); });
chrome.runtime.onStartup.addListener(() => { void initialize(); });
void initialize();

async function activeCurrentJob(): Promise<CurrentJob | null> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.id === undefined) return null;
  try {
    const current = await chrome.tabs.sendMessage<unknown, CurrentJob | null>(tab.id, { type: "READ_CURRENT_JOB" });
    if (!current) return null;
    return { ...current, saved: (await getJobs(storage)).some((item) => item.job.id === current.job.id) };
  } catch {
    return null;
  }
}

async function handle(message: unknown, sender: chrome.runtime.MessageSender): Promise<Response> {
  if (sender.id !== chrome.runtime.id || !isRequest(message)) return { ok: false, error: "Invalid request." };
  try {
    switch (message.type) {
      case "GET_SETTINGS": return { ok: true, data: await getSettings(storage) };
      case "SET_SETTINGS": {
        const settings = await setSettings(storage, message.settings);
        const tabs = await chrome.tabs.query({ url: ["https://www.linkedin.com/jobs/*", "https://linkedin.com/jobs/*"] });
        await Promise.allSettled(tabs.flatMap((tab) => tab.id === undefined ? [] : [chrome.tabs.sendMessage(tab.id, { type: "SETTINGS_CHANGED" })]));
        return { ok: true, data: settings };
      }
      case "GET_JOBS": return { ok: true, data: await getJobs(storage) };
      case "SAVE_JOB": {
        const saved = await saveJob(storage, message.job, message.match);
        return { ok: true, data: saved };
      }
      case "UPDATE_NOTES": return (await updateNotes(storage, message.id, message.notes)) ? { ok: true, data: null } : { ok: false, error: "Saved job not found." };
      case "DELETE_JOB":
        await deleteJob(storage, message.id);
        return { ok: true, data: null };
      case "CLEAR_JOBS":
        await clearJobs(storage);
        return { ok: true, data: null };
      case "GET_CURRENT_JOB": return { ok: true, data: await activeCurrentJob() };
    }
  } catch {
    return { ok: false, error: "The extension could not complete that request." };
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  void handle(message, sender).then(sendResponse);
  return true;
});
