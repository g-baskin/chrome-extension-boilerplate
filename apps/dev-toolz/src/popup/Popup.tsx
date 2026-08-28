import { useEffect, useState } from "react";
import { sendToBackground } from "@/lib/messaging";

interface Settings {
  enabled: boolean;
}

interface CaptureStatus {
  hostname: string;
  paused: boolean;
  allowed: boolean;
}

export function Popup() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [status, setStatus] = useState<CaptureStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    void loadData();
  }, []);

  async function loadData() {
    try {
      const [settingsResponse, [tab]] = await Promise.all([
        sendToBackground("GET_SETTINGS", undefined),
        chrome.tabs.query({ active: true, currentWindow: true }),
      ]);

      if (settingsResponse.success && settingsResponse.data) {
        setSettings(settingsResponse.data);
      } else {
        setError(settingsResponse.error ?? "Could not load capture settings.");
      }

      if (tab?.id) {
        const statusResponse = await sendToBackground("GET_API_CAPTURE_STATUS", { tabId: tab.id });
        if (statusResponse.success && statusResponse.data) setStatus(statusResponse.data);
      }
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load capture status.");
    } finally {
      setLoading(false);
    }
  }

  async function toggleEnabled() {
    if (!settings) return;
    const enabled = !settings.enabled;
    const response = await sendToBackground("TOGGLE_EXTENSION", { enabled });
    if (response.success) {
      setSettings({ enabled });
      await loadData();
    } else {
      setError(response.error ?? "Could not update capture.");
    }
  }

  const captureLabel = !settings?.enabled
    ? "Capture disabled"
    : status?.paused
      ? `Paused on ${status.hostname}`
      : status && !status.allowed
        ? `Blocked on ${status.hostname || "this page"}`
        : status?.hostname
          ? `Enabled for ${status.hostname}`
          : "Waiting for an inspectable page";

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-primary-600" />
      </div>
    );
  }

  return (
    <div className="p-4 bg-white animate-fade-in">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-lg font-semibold text-gray-900">Dev Toolz</h1>
          <p className="text-xs text-gray-500">Persistent network endpoint discovery</p>
        </div>
        <button
          onClick={() => chrome.runtime.openOptionsPage()}
          className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg"
          title="Settings"
          aria-label="Open settings"
        >
          ⚙
        </button>
      </div>

      <div className="mb-4 rounded-lg bg-gray-50 p-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Status</p>
        <p className="mt-1 text-sm font-medium text-gray-900">{captureLabel}</p>
      </div>

      <div className="flex items-center justify-between rounded-lg bg-gray-50 p-3">
        <span className="text-sm font-medium text-gray-700">Automatic capture</span>
        <button
          onClick={toggleEnabled}
          aria-label="Toggle automatic capture"
          aria-pressed={settings?.enabled}
          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
            settings?.enabled ? "bg-primary-600" : "bg-gray-300"
          }`}
        >
          <span
            className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
              settings?.enabled ? "translate-x-6" : "translate-x-1"
            }`}
          />
        </button>
      </div>

      {error && <p className="mt-3 text-sm text-red-700">{error}</p>}

      <div className="mt-4 pt-3 border-t border-gray-100 text-center">
        <p className="text-xs text-gray-400">Version {chrome.runtime.getManifest().version}</p>
      </div>
    </div>
  );
}