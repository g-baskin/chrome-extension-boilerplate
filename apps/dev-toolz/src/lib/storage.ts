import type { SiteAccessMode } from "@/lib/site-access";

export interface StorageSchema {
  settings: {
    enabled: boolean;
    siteAccessMode: SiteAccessMode;
    siteAccessSites: string[];
  };
  apiTrafficPauses: Record<string, number | null>;
  starredLogEvents: string[];
}

type StorageKey = keyof StorageSchema;
type StorageValue<K extends StorageKey> = StorageSchema[K];

export async function getStorage<TKey extends StorageKey>(
  storageKey: TKey
): Promise<StorageValue<TKey> | undefined> {
  return new Promise((resolve) => {
    chrome.storage.local.get(storageKey, (result) => {
      if (chrome.runtime.lastError) {
        console.error("[Storage] Get error:", chrome.runtime.lastError.message);
        resolve(undefined);
        return;
      }
      resolve(result[storageKey] as StorageValue<TKey> | undefined);
    });
  });
}

export async function setStorage<TKey extends StorageKey>(
  storageKey: TKey,
  value: StorageValue<TKey>
): Promise<boolean> {
  return new Promise((resolve) => {
    chrome.storage.local.set({ [storageKey]: value }, () => {
      if (chrome.runtime.lastError) {
        console.error("[Storage] Set error:", chrome.runtime.lastError.message);
        resolve(false);
        return;
      }
      resolve(true);
    });
  });
}

export const defaultSettings: StorageSchema["settings"] = {
  enabled: true,
  siteAccessMode: "all",
  siteAccessSites: [],
};

const defaultApiTrafficPauses: StorageSchema["apiTrafficPauses"] = {};
const MAX_STARRED_LOG_EVENTS = 1_000;

export async function initializeStorage(): Promise<void> {
  const settings = await getStorage("settings");
  const siteAccessMode = settings?.siteAccessMode;
  const normalizedSettings: StorageSchema["settings"] = {
    enabled: typeof settings?.enabled === "boolean" ? settings.enabled : defaultSettings.enabled,
    siteAccessMode:
      siteAccessMode === "allow" || siteAccessMode === "deny" ? siteAccessMode : "all",
    siteAccessSites: Array.isArray(settings?.siteAccessSites)
      ? settings.siteAccessSites.filter((site): site is string => typeof site === "string")
      : [],
  };
  if (!(await setStorage("settings", normalizedSettings))) {
    throw new Error("Could not initialize capture settings");
  }

  const apiTrafficPauses = await getStorage("apiTrafficPauses");
  if (!apiTrafficPauses && !(await setStorage("apiTrafficPauses", defaultApiTrafficPauses))) {
    throw new Error("Could not initialize capture pauses");
  }

  const starredLogEvents = await getStorage("starredLogEvents");
  const normalizedStarredLogEvents = Array.isArray(starredLogEvents)
    ? starredLogEvents
        .filter((id): id is string => typeof id === "string" && id.length <= 1_000)
        .slice(0, MAX_STARRED_LOG_EVENTS)
    : [];
  if (!(await setStorage("starredLogEvents", normalizedStarredLogEvents))) {
    throw new Error("Could not initialize starred log events");
  }
}