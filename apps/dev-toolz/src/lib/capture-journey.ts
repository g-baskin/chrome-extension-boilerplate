export type CaptureTransition = "initial" | "navigation" | "new-window" | "tab-switch";

export type CaptureEndpoint = {
  tabId: number;
  windowId: number;
  pageUrl: string;
};

export type CaptureJourney = CaptureEndpoint & {
  openerTabId?: number;
  attachedAt: string;
  previousTabId?: number;
  previousPageUrl?: string;
  transition: CaptureTransition;
  mayHaveMissedInitialRequests: true;
};

export function createCaptureJourney(
  current: CaptureEndpoint & { openerTabId?: number },
  previous: CaptureEndpoint | null,
  attachedAt = new Date().toISOString()
): CaptureJourney {
  const transition: CaptureTransition = previous === null
    ? "initial"
    : previous.tabId === current.tabId
      ? "navigation"
      : current.openerTabId === previous.tabId
        ? "new-window"
        : "tab-switch";
  return {
    ...current,
    attachedAt,
    ...(previous ? { previousTabId: previous.tabId, previousPageUrl: previous.pageUrl } : {}),
    transition,
    mayHaveMissedInitialRequests: true,
  };
}

export function readCaptureEndpoint(value: unknown): CaptureEndpoint | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Record<string, unknown>;
  return Number.isInteger(candidate.tabId) &&
    Number.isInteger(candidate.windowId) &&
    typeof candidate.pageUrl === "string"
    ? {
        tabId: candidate.tabId as number,
        windowId: candidate.windowId as number,
        pageUrl: candidate.pageUrl.slice(0, 2_000),
      }
    : null;
}
