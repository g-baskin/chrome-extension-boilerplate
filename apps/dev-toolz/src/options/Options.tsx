import { useState, useEffect } from "react";
import { sendToBackground } from "@/lib/messaging";
import { onStorageChange, clearStorage } from "@/lib/storage";
import { downloadDataAsFile } from "@/lib/download";
import type { CaptureMetadata, CapturedPageEntry } from "@/lib/capture";

interface Settings {
  enabled: boolean;
  theme: "light" | "dark" | "system";
  notifications: boolean;
}

interface CaptureHistoryRow extends CaptureMetadata {
  id: string;
}

export function Options() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [history, setHistory] = useState<CaptureHistoryRow[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);

  useEffect(() => {
    loadSettings();
    loadCaptureHistory();

    const unsubscribe = onStorageChange((changes) => {
      if (changes["settings"]) {
        setSettings(changes["settings"].newValue as Settings);
      }
      if (changes["captureHistory"]) {
        const captures = (changes["captureHistory"].newValue as CapturedPageEntry[]) ?? [];
        setHistory(captures.map(({ id, markdown, html, ...meta }) => ({ id, ...meta })));
      }
    });

    return unsubscribe;
  }, []);

  async function loadSettings() {
    setLoading(true);
    try {
      const response = await sendToBackground("GET_SETTINGS", undefined);
      if (response.success && response.data) {
        setSettings(response.data);
      }
    } catch (error) {
      console.error("Failed to load settings:", error);
    } finally {
      setLoading(false);
    }
  }

  async function loadCaptureHistory() {
    setHistoryLoading(true);
    try {
      const response = await sendToBackground("GET_CAPTURE_HISTORY", undefined);
      if (response.success && response.data) {
        setHistory(response.data.entries);
      }
    } catch (error) {
      console.error("Failed to load capture history:", error);
    } finally {
      setHistoryLoading(false);
    }
  }

  async function updateSetting<K extends keyof Settings>(
    key: K,
    value: Settings[K]
  ) {
    if (!settings) return;

    setSaving(true);
    const newSettings = { ...settings, [key]: value };
    setSettings(newSettings);

    try {
      await sendToBackground("UPDATE_SETTINGS", { [key]: value });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (error) {
      console.error("Failed to save setting:", error);
      setSettings(settings);
    } finally {
      setSaving(false);
    }
  }

  async function handleResetSettings() {
    if (!confirm("Are you sure you want to reset all settings to defaults?")) {
      return;
    }

    setSaving(true);
    try {
      await clearStorage();
      await loadSettings();
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (error) {
      console.error("Failed to reset settings:", error);
    } finally {
      setSaving(false);
    }
  }

  async function downloadCapture(id: string, type: "markdown" | "html") {
    const response = await sendToBackground("GET_CAPTURE_ENTRY", { id });
    if (!response.success || !response.data?.entry) {
      alert("Failed to load capture entry.");
      return;
    }

    const entry = response.data.entry;
    const payload = type === "markdown" ? entry.markdown : entry.html;
    const extension = type === "markdown" ? "md" : "html";
    downloadDataAsFile(`${entry.title || entry.url}.${extension}`, payload, type === "markdown" ? "text/markdown" : "text/html");
  }

  async function removeCapture(id: string) {
    const response = await sendToBackground("DELETE_CAPTURE", { id });
    if (response.success) {
      setHistory((prev) => prev.filter((item) => item.id !== id));
    }
  }

  if (loading || historyLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-3xl mx-auto space-y-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Extension Settings</h1>
          <p className="mt-2 text-gray-600">
            Configure your Chrome extension preferences and review captured Skool pages.
          </p>
        </div>

        <div className="bg-white shadow rounded-lg divide-y divide-gray-200">
          <div className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-medium text-gray-900">Enable Extension</h3>
                <p className="text-sm text-gray-500">Toggle the extension on or off globally</p>
              </div>
              <button
                onClick={() => updateSetting("enabled", !settings?.enabled)}
                disabled={saving}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  settings?.enabled ? "bg-primary-600" : "bg-gray-300"
                } disabled:opacity-50`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    settings?.enabled ? "translate-x-6" : "translate-x-1"
                  }`}
                />
              </button>
            </div>
          </div>

          <div className="p-6">
            <h3 className="text-lg font-medium text-gray-900 mb-1">Theme</h3>
            <p className="text-sm text-gray-500 mb-4">Choose your preferred color theme</p>
            <div className="grid grid-cols-3 gap-3">
              {(["light", "dark", "system"] as const).map((theme) => (
                <button
                  key={theme}
                  onClick={() => updateSetting("theme", theme)}
                  disabled={saving}
                  className={`px-4 py-3 text-sm font-medium rounded-lg border-2 transition-all ${
                    settings?.theme === theme
                      ? "border-primary-600 bg-primary-50 text-primary-700"
                      : "border-gray-200 bg-white text-gray-700 hover:border-gray-300"
                  } disabled:opacity-50`}
                >
                  <span className="capitalize">{theme}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-medium text-gray-900">Notifications</h3>
                <p className="text-sm text-gray-500">Receive notifications from the extension</p>
              </div>
              <button
                onClick={() => updateSetting("notifications", !settings?.notifications)}
                disabled={saving}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  settings?.notifications ? "bg-primary-600" : "bg-gray-300"
                } disabled:opacity-50`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    settings?.notifications ? "translate-x-6" : "translate-x-1"
                  }`}
                />
              </button>
            </div>
          </div>

          <div className="p-6">
            <h3 className="text-lg font-medium text-gray-900 mb-1">Captured Skool Pages</h3>
            <p className="text-sm text-gray-500 mb-4">
              View the history of recorded Skool posts. Download or delete entries as needed.
            </p>
            {history.length === 0 ? (
              <p className="text-sm text-gray-500">No captures yet.</p>
            ) : (
              <div className="space-y-4">
                {history.map((item) => (
                  <div
                    key={item.id}
                    className="p-4 border border-gray-200 rounded-lg bg-gray-50"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-gray-900 truncate">
                          {item.title || item.url}
                        </p>
                        <p className="text-xs text-gray-500">
                          Captured {new Date(item.capturedAt).toLocaleString()}
                        </p>
                        <p className="text-xs text-gray-400">
                          {item.authors.join(", ")} · {item.postCount} posts · {item.wordCount} words
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => downloadCapture(item.id, "markdown")}
                          className="px-3 py-1 text-xs font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700"
                        >
                          Download MD
                        </button>
                        <button
                          onClick={() => downloadCapture(item.id, "html")}
                          className="px-3 py-1 text-xs font-medium text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-100"
                        >
                          Download HTML
                        </button>
                      </div>
                    </div>
                    <div className="flex items-center justify-between mt-3 text-xs text-gray-500">
                      <span>Links: {item.linkCount}</span>
                      <button
                        onClick={() => removeCapture(item.id)}
                        className="text-red-600 hover:underline"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="p-6">
            <h3 className="text-lg font-medium text-gray-900 mb-1">Reset Settings</h3>
            <p className="text-sm text-gray-500 mb-4">Restore all settings to their default values</p>
            <button
              onClick={handleResetSettings}
              disabled={saving}
              className="px-4 py-2 text-sm font-medium text-red-700 bg-red-50 rounded-lg hover:bg-red-100 disabled:opacity-50 transition-colors"
            >
              Reset to Defaults
            </button>
          </div>
        </div>

        {saved && (
          <div className="p-3 text-sm text-center text-green-700 bg-green-50 rounded-lg animate-fade-in">
            Settings saved successfully!
          </div>
        )}

        <div className="text-center text-sm text-gray-500">
          Chrome Extension Boilerplate v{chrome.runtime.getManifest().version}
        </div>
      </div>
    </div>
  );
}
