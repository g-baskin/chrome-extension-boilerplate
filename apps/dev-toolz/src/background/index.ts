/**
 * Background Service Worker
 * Handles extension lifecycle, messaging, and background tasks
 */

import { createMessageHandler } from "@/lib/messaging";
import {
  appendCaptureEntry,
  deleteCaptureEntry,
  getCaptureEntryById,
  getCaptureHistory,
  getStorage,
  initializeStorage,
  setStorage,
  defaultSettings,
} from "@/lib/storage";
import type { CapturedPageSummary } from "@/lib/capture";
import { isSiteAllowed, normalizeSiteRule } from "@/lib/site-access";
import {
  getApiTrafficPauseStatus,
  setApiTrafficPause,
} from "@/lib/api-traffic-pause";
import { captureTab, stopApiTrafficCapture } from "./api-traffic-capture";

const API_TRAFFIC_ALARM_PREFIX = "api-traffic-resume:";
const tabStatusRevisions = new Map<number, number>();
let apiTrafficCaptureRevision = 0;

console.log("[Background] Service worker started");

// Handle extension installation
chrome.runtime.onInstalled.addListener(async (details) => {
  console.log("[Background] Extension installed:", details.reason);
  await initializeStorage();

  if (details.reason === chrome.runtime.OnInstalledReason.INSTALL) {
    // First-time installation
    console.log("[Background] Storage initialized with defaults");

    // Optional: Open welcome/onboarding page
    // chrome.tabs.create({ url: chrome.runtime.getURL("src/options/options.html") });
  }

  if (details.reason === chrome.runtime.OnInstalledReason.UPDATE) {
    // Extension updated
    console.log(
      "[Background] Extension updated from version:",
      details.previousVersion
    );
  }
  await syncApiTrafficCapture();
});

// Handle extension startup (browser restart, etc.)
chrome.runtime.onStartup.addListener(async () => {
  console.log("[Background] Extension started");
  await initializeStorage();
  await syncApiTrafficCapture();
});

// Set up message handlers
createMessageHandler({
  GET_TAB_INFO: async (_payload, sender) => {
    const tab = sender.tab;
    return {
      url: tab?.url ?? "",
      title: tab?.title ?? "",
    };
  },

  GET_SETTINGS: async () => {
    const settings = await getStorage("settings");
    return { ...defaultSettings, ...settings };
  },

  UPDATE_SETTINGS: async (payload) => {
    if (
      payload.siteAccessMode !== undefined &&
      !["all", "deny", "allow"].includes(payload.siteAccessMode)
    ) {
      throw new Error("Unsupported site access mode");
    }
    const siteAccessSites = payload.siteAccessSites?.map((value) => {
      const site = normalizeSiteRule(value);
      if (!site) throw new Error("Invalid site access rule");
      return site;
    });

    const currentSettings = { ...defaultSettings, ...(await getStorage("settings")) };
    const newSettings = {
      ...currentSettings,
      ...payload,
      ...(siteAccessSites
        ? { siteAccessSites: [...new Set(siteAccessSites)].sort() }
        : {}),
    };
    await setStorage("settings", newSettings);
    if (
      payload.enabled !== undefined ||
      payload.siteAccessMode !== undefined ||
      payload.siteAccessSites !== undefined
    ) {
      await syncApiTrafficCapture();
    }
    return { success: true };
  },

  TOGGLE_EXTENSION: async (payload) => {
    const currentSettings = (await getStorage("settings")) ?? defaultSettings;
    await setStorage("settings", { ...currentSettings, enabled: payload.enabled });
    if (payload.enabled) await syncApiTrafficCapture();
    else await stopSynchronizedApiTrafficCapture();

    // Notify all tabs about the state change
    const tabs = await chrome.tabs.query({});
    for (const tab of tabs) {
      if (tab.id) {
        try {
          await chrome.tabs.sendMessage(tab.id, {
            type: "EXTENSION_STATE_CHANGED",
            payload: { enabled: payload.enabled },
          });
        } catch {
          // Tab might not have content script loaded
        }
      }
    }

    return { success: true };
  },

  DEVTOOLS_CLOSED: async ({ tabId }) => {
    await new Promise((resolve) => setTimeout(resolve, 250));
    const [tab, settings] = await Promise.all([
      chrome.tabs.get(tabId),
      getStorage("settings"),
    ]);
    if (tab.active && settings?.enabled) await syncApiTrafficCapture();
    return { success: true };
  },

  GET_API_CAPTURE_STATUS: async ({ tabId }) => {
    const [tab, storedSettings] = await Promise.all([
      chrome.tabs.get(tabId),
      getStorage("settings"),
    ]);
    const settings = { ...defaultSettings, ...storedSettings };
    const pageUrl = tab.url ?? "";
    return {
      ...(await getApiTrafficPauseStatus(pageUrl)),
      allowed: isSiteAllowed(pageUrl, {
        mode: settings.siteAccessMode,
        sites: settings.siteAccessSites,
      }),
      siteAccessMode: settings.siteAccessMode,
    };
  },

  SET_API_CAPTURE_PAUSE: async ({ tabId, durationMs }) => {
    if (![0, 300_000, 900_000, 3_600_000, null].includes(durationMs)) {
      throw new Error("Unsupported API capture pause duration");
    }
    const tab = await chrome.tabs.get(tabId);
    const pageUrl = tab.url ?? "";
    const pausedUntil = durationMs === 0 ? undefined : durationMs === null ? null : Date.now() + durationMs;
    const status = await setApiTrafficPause(pageUrl, pausedUntil);
    if (status.hostname) {
      const alarmName = `${API_TRAFFIC_ALARM_PREFIX}${status.hostname}`;
      await chrome.alarms.clear(alarmName);
      if (status.pausedUntil !== null) {
        chrome.alarms.create(alarmName, { when: status.pausedUntil });
      }
    }
    const activeTab = await getActiveTab();
    if (activeTab?.id === tabId) {
      if (status.paused) await stopSynchronizedApiTrafficCapture();
      else await syncApiTrafficCapture();
    }
    return status;
  },

  CONTENT_ACTION: async (payload) => {
    console.log("[Background] Content action received:", payload);
    return { success: true, result: payload.data };
  },

  SAVE_CAPTURE: async ({ entry }) => {
    const success = await appendCaptureEntry(entry);
    return { success };
  },

  GET_CAPTURE_HISTORY: async () => {
    const history = await getCaptureHistory();
    const entries: CapturedPageSummary[] = history.map(
      ({ id, markdown: _markdown, html: _html, ...metadata }) => ({
        id,
        ...metadata,
      })
    );

    return { entries };
  },

  GET_CAPTURE_ENTRY: async ({ id }) => {
    const entry = await getCaptureEntryById(id);
    return { entry };
  },

  DELETE_CAPTURE: async ({ id }) => {
    const success = await deleteCaptureEntry(id);
    return { success };
  },
});

// Context menu setup
chrome.runtime.onInstalled.addListener(() => {
  // Remove existing menus first (best practice)
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: "extension-action",
      title: "Extension Action",
      contexts: ["page", "selection"],
    });
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "extension-action") {
    console.log("[Background] Context menu clicked:", info, tab);
    // Handle context menu action
  }
});

chrome.tabs.onActivated.addListener(({ tabId }) => {
  void chrome.tabs
    .get(tabId)
    .then((tab) => {
      if (tab.status === "complete") return syncApiTrafficCapture(tabId);

      const statusRevision = (tabStatusRevisions.get(tabId) ?? 0) + 1;
      tabStatusRevisions.set(tabId, statusRevision);
      return stopApiTrafficCaptureForActiveTab(tabId, statusRevision);
    })
    .catch(() => undefined);
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (!tab.active || !changeInfo.status) return;
  const statusRevision = (tabStatusRevisions.get(tabId) ?? 0) + 1;
  tabStatusRevisions.set(tabId, statusRevision);
  if (changeInfo.status === "loading") {
    void stopApiTrafficCaptureForActiveTab(tabId, statusRevision);
  } else if (changeInfo.status === "complete") {
    void syncApiTrafficCapture(tabId);
  }
});

chrome.tabs.onRemoved.addListener((tabId) => {
  tabStatusRevisions.delete(tabId);
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name.startsWith(API_TRAFFIC_ALARM_PREFIX)) void syncApiTrafficCapture();
});

async function getActiveTab(): Promise<chrome.tabs.Tab | undefined> {
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  return tab;
}

async function stopSynchronizedApiTrafficCapture(): Promise<void> {
  apiTrafficCaptureRevision += 1;
  await stopApiTrafficCapture();
}

async function stopApiTrafficCaptureForActiveTab(
  expectedTabId: number,
  expectedStatusRevision: number
): Promise<void> {
  const [activeTab, updatedTab] = await Promise.all([
    getActiveTab(),
    chrome.tabs.get(expectedTabId).catch(() => undefined),
  ]);
  if (
    activeTab?.id === expectedTabId &&
    updatedTab?.status === "loading" &&
    tabStatusRevisions.get(expectedTabId) === expectedStatusRevision
  ) {
    await stopSynchronizedApiTrafficCapture();
  }
}

async function syncApiTrafficCapture(expectedTabId?: number): Promise<void> {
  const [settings, tab] = await Promise.all([getStorage("settings"), getActiveTab()]);
  if (expectedTabId !== undefined && tab?.id !== expectedTabId) return;

  const revision = ++apiTrafficCaptureRevision;
  const url = tab?.url ?? "";
  if (
    !(settings ?? defaultSettings).enabled ||
    !tab?.id ||
    tab.status !== "complete" ||
    !isInspectableUrl(url)
  ) {
    if (revision === apiTrafficCaptureRevision) await stopApiTrafficCapture();
    return;
  }

  const status = await getApiTrafficPauseStatus(url);
  if (
    status.paused ||
    !isSiteAllowed(url, {
      mode: settings?.siteAccessMode ?? defaultSettings.siteAccessMode,
      sites: settings?.siteAccessSites ?? defaultSettings.siteAccessSites,
    })
  ) {
    if (revision === apiTrafficCaptureRevision) await stopApiTrafficCapture();
    return;
  }

  const currentTab = await chrome.tabs.get(tab.id).catch(() => undefined);
  const isCurrent = () => revision === apiTrafficCaptureRevision;
  if (
    !isCurrent() ||
    !currentTab?.active ||
    currentTab.status !== "complete" ||
    currentTab.url !== url
  ) {
    return;
  }
  await captureTab(tab.id, url, isCurrent).catch(() => undefined);
}

function isInspectableUrl(url: string): boolean {
  return url.startsWith("http://") || url.startsWith("https://");
}

// Keep service worker alive for long-running tasks (use sparingly)
// chrome.alarms.create("keepAlive", { periodInMinutes: 0.5 });
// chrome.alarms.onAlarm.addListener((alarm) => {
//   if (alarm.name === "keepAlive") {
//     console.log("[Background] Keep alive alarm");
//   }
// });

// Export for type checking
export {};
