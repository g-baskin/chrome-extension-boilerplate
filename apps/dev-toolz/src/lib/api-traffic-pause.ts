import { getStorage, setStorage } from "@/lib/storage";

export interface ApiTrafficPauseStatus {
  hostname: string;
  paused: boolean;
  pausedUntil: number | null;
}

export function getPageHostname(rawUrl: string): string {
  try {
    const url = new URL(rawUrl);
    return url.protocol === "http:" || url.protocol === "https:"
      ? url.hostname.toLowerCase()
      : "";
  } catch {
    return "";
  }
}

export async function getApiTrafficPauseStatus(
  pageUrl: string,
  now = Date.now()
): Promise<ApiTrafficPauseStatus> {
  const hostname = getPageHostname(pageUrl);
  if (!hostname) return { hostname: "", paused: false, pausedUntil: null };

  const pauses = (await getStorage("apiTrafficPauses")) ?? {};
  const pausedUntil = pauses[hostname];
  if (pausedUntil === undefined) return { hostname, paused: false, pausedUntil: null };
  if (pausedUntil !== null && pausedUntil <= now) {
    const activePauses = { ...pauses };
    delete activePauses[hostname];
    if (!(await setStorage("apiTrafficPauses", activePauses))) {
      throw new Error("Could not clear expired API capture pause");
    }
    return { hostname, paused: false, pausedUntil: null };
  }
  return { hostname, paused: true, pausedUntil };
}

export async function setApiTrafficPause(
  pageUrl: string,
  pausedUntil: number | null | undefined
): Promise<ApiTrafficPauseStatus> {
  const hostname = getPageHostname(pageUrl);
  if (!hostname) return { hostname: "", paused: false, pausedUntil: null };

  const pauses = (await getStorage("apiTrafficPauses")) ?? {};
  if (pausedUntil === undefined) {
    const activePauses = { ...pauses };
    delete activePauses[hostname];
    if (!(await setStorage("apiTrafficPauses", activePauses))) {
      throw new Error("Could not resume API capture");
    }
    return { hostname, paused: false, pausedUntil: null };
  }

  if (!(await setStorage("apiTrafficPauses", { ...pauses, [hostname]: pausedUntil }))) {
    throw new Error("Could not pause API capture");
  }
  return { hostname, paused: true, pausedUntil };
}
