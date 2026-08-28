import { detectMediaKind, saveHarEntry } from "../lib/api-traffic";
import { getApiTrafficPauseStatus } from "../lib/api-traffic-pause";
import { sendToBackground } from "../lib/messaging";

let inspectedPageUrl = "";
let capturePaused = true;
chrome.devtools.inspectedWindow.eval("location.href", (result, exceptionInfo) => {
  if (!exceptionInfo && typeof result === "string") {
    inspectedPageUrl = result;
    void refreshPauseStatus();
  }
});
chrome.devtools.network.onNavigated.addListener((url) => {
  inspectedPageUrl = url;
  capturePaused = true;
  void refreshPauseStatus();
});
chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === "local" && changes.apiTrafficPauses) void refreshPauseStatus();
});

chrome.devtools.network.onRequestFinished.addListener((entry) => {
  if (!chrome.runtime.id || capturePaused) return;

  const mimeType = entry.response.content.mimeType.toLowerCase();
  const resourceType =
    typeof entry._resourceType === "string" ? entry._resourceType : undefined;
  const isApiRequest =
    entry._resourceType === "fetch" ||
    entry._resourceType === "xhr" ||
    mimeType.includes("application/json") ||
    mimeType.includes("+json") ||
    detectMediaKind(resourceType, mimeType, entry.request.url) !== null;
  if (!isApiRequest) return;

  void saveHarEntry(entry, inspectedPageUrl)
    .then((saved) =>
      chrome.runtime
        .sendMessage({ type: "API_TRAFFIC_CAPTURED", payload: saved })
        .catch(() => undefined)
    )
    .catch((error: unknown) => {
      if (!chrome.runtime.id || isContextInvalidatedError(error)) return;
      console.error(
        "[API Traffic] DevTools capture failed",
        error instanceof Error ? error.message : "Unknown error"
      );
    });
});

async function refreshPauseStatus(): Promise<void> {
  const pageUrl = inspectedPageUrl;
  const status = await getApiTrafficPauseStatus(pageUrl);
  if (pageUrl === inspectedPageUrl) capturePaused = status.paused;
}

function isContextInvalidatedError(error: unknown): boolean {
  return error instanceof Error && error.message.includes("Extension context invalidated");
}

window.addEventListener("unload", () => {
  void sendToBackground("DEVTOOLS_CLOSED", {
    tabId: chrome.devtools.inspectedWindow.tabId,
  });
});
