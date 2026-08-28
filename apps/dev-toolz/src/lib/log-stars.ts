import { getStorage, setStorage } from "./storage";

export const MAX_STARRED_LOG_EVENTS = 1_000;

export async function loadStarredLogEventIds(): Promise<Set<string>> {
  const stored = await getStorage("starredLogEvents");
  return new Set(
    Array.isArray(stored)
      ? stored
          .filter((id): id is string => typeof id === "string" && id.length <= 1_000)
          .slice(0, MAX_STARRED_LOG_EVENTS)
      : []
  );
}

export async function persistStarredLogEventIds(ids: ReadonlySet<string>): Promise<boolean> {
  return setStorage("starredLogEvents", [...ids].slice(0, MAX_STARRED_LOG_EVENTS));
}
