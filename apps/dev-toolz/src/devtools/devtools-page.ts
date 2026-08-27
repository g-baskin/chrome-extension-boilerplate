import { saveHarEntry } from "../lib/api-traffic";
import { sendToBackground } from "../lib/messaging";

let inspectedPageUrl = "";
chrome.devtools.inspectedWindow.eval("location.href", (result, exceptionInfo) => {
  if (!exceptionInfo && typeof result === "string") inspectedPageUrl = result;
});
chrome.devtools.network.onNavigated.addListener((url) => {
  inspectedPageUrl = url;
});

chrome.devtools.panels.create(
  "Dev Toolz",
  "public/icons/icon-16.png",
  "src/devtools/panel.html"
);

chrome.devtools.network.onRequestFinished.addListener((entry) => {
  if (!chrome.runtime.id) return;

  const mimeType = entry.response.content.mimeType.toLowerCase();
  const isApiRequest =
    entry._resourceType === "fetch" ||
    entry._resourceType === "xhr" ||
    mimeType.includes("application/json") ||
    mimeType.includes("+json");
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

function isContextInvalidatedError(error: unknown): boolean {
  return error instanceof Error && error.message.includes("Extension context invalidated");
}

window.addEventListener("unload", () => {
  void sendToBackground("DEVTOOLS_CLOSED", {
    tabId: chrome.devtools.inspectedWindow.tabId,
  });
});
