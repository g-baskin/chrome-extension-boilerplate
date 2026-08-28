import { createMessageHandler } from "@/lib/messaging";
import { defaultSettings, getStorage, initializeStorage, setStorage } from "@/lib/storage";
import { isSiteAllowed, normalizeSiteRule } from "@/lib/site-access";
import { getApiTrafficPauseStatus, setApiTrafficPause } from "@/lib/api-traffic-pause";
import { captureTab, stopApiTrafficCapture } from "./api-traffic-capture";
import { cancelRaceFlow, runRaceFlow } from "./race-runner";

const API_TRAFFIC_ALARM_PREFIX = "api-traffic-resume:";
const tabStatusRevisions = new Map<number, number>();
let apiTrafficCaptureRevision = 0;

chrome.runtime.onInstalled.addListener(async () => {
  await initializeStorage();
  await syncApiTrafficCapture();
});

chrome.runtime.onStartup.addListener(async () => {
  await initializeStorage();
  await syncApiTrafficCapture();
});

createMessageHandler({
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
      enabled: payload.enabled ?? currentSettings.enabled,
      siteAccessMode: payload.siteAccessMode ?? currentSettings.siteAccessMode,
      siteAccessSites: siteAccessSites
        ? [...new Set(siteAccessSites)].sort()
        : currentSettings.siteAccessSites,
    };
    if (!(await setStorage("settings", newSettings))) throw new Error("Could not save settings");
    await syncApiTrafficCapture();
    return { success: true };
  },

  TOGGLE_EXTENSION: async (payload) => {
    const currentSettings = { ...defaultSettings, ...(await getStorage("settings")) };
    if (
      !(await setStorage("settings", {
        enabled: payload.enabled,
        siteAccessMode: currentSettings.siteAccessMode,
        siteAccessSites: currentSettings.siteAccessSites,
      }))
    ) {
      throw new Error("Could not save capture setting");
    }
    if (payload.enabled) await syncApiTrafficCapture();
    else await stopSynchronizedApiTrafficCapture();

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
      enabled: settings.enabled,
      ...(await getApiTrafficPauseStatus(pageUrl)),
      allowed: isSiteAllowed(pageUrl, {
        mode: settings.siteAccessMode,
        sites: settings.siteAccessSites,
      }),
      siteAccessMode: settings.siteAccessMode,
    };
  },

  RUN_RACE_FLOW: async (payload) => runRaceFlow(payload),

  CANCEL_RACE_FLOW: async ({ tabId, runId }) => cancelRaceFlow(tabId, runId),

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

chrome.windows.onFocusChanged.addListener((windowId) => {
  if (windowId !== chrome.windows.WINDOW_ID_NONE) void syncApiTrafficCapture();
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name.startsWith(API_TRAFFIC_ALARM_PREFIX)) void syncApiTrafficCapture();
});

async function getActiveTab(): Promise<chrome.tabs.Tab | undefined> {
  const [focused] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if (isInspectableUrl(focused?.url ?? "")) return focused;
  const activeTabs = await chrome.tabs.query({ active: true });
  return activeTabs
    .filter((tab) => isInspectableUrl(tab.url ?? ""))
    .sort((left, right) => (right.lastAccessed ?? 0) - (left.lastAccessed ?? 0))[0];
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
