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
import {
  captureActiveTab,
  captureTab,
  stopApiTrafficCapture,
} from "./api-traffic-capture";

console.log("[Background] Service worker started");
void syncApiTrafficCapture();

// Handle extension installation
chrome.runtime.onInstalled.addListener(async (details) => {
  console.log("[Background] Extension installed:", details.reason);

  if (details.reason === chrome.runtime.OnInstalledReason.INSTALL) {
    // First-time installation
    await initializeStorage();
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
    return settings ?? defaultSettings;
  },

  UPDATE_SETTINGS: async (payload) => {
    const currentSettings = (await getStorage("settings")) ?? defaultSettings;
    const newSettings = { ...currentSettings, ...payload };
    await setStorage("settings", newSettings);
    if (payload.enabled !== undefined) await syncApiTrafficCapture();
    return { success: true };
  },

  TOGGLE_EXTENSION: async (payload) => {
    const currentSettings = (await getStorage("settings")) ?? defaultSettings;
    await setStorage("settings", { ...currentSettings, enabled: payload.enabled });
    if (payload.enabled) await captureActiveTab();
    else await stopApiTrafficCapture();

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
    if (tab.active && settings?.enabled) {
      await captureTab(tabId, tab.url ?? "").catch(() => undefined);
    }
    return { success: true };
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
    const entries: CapturedPageSummary[] = history.map(({ id, markdown, html, ...metadata }) => ({
      id,
      ...metadata,
    }));

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

chrome.tabs.onActivated.addListener(() => {
  void syncApiTrafficCapture();
});

chrome.webNavigation.onCommitted.addListener((details) => {
  if (details.frameId !== 0) return;
  void chrome.tabs
    .get(details.tabId)
    .then((tab) => {
      if (tab.active) return syncApiTrafficCapture();
    })
    .catch(() => undefined);
});

async function syncApiTrafficCapture(): Promise<void> {
  const settings = (await getStorage("settings")) ?? defaultSettings;
  if (settings.enabled) await captureActiveTab().catch(() => undefined);
  else await stopApiTrafficCapture();
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
