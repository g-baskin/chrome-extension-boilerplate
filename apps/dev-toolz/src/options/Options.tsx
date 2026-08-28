import { useEffect, useState } from "react";
import { sendToBackground } from "@/lib/messaging";
import { normalizeSiteRule, type SiteAccessMode } from "@/lib/site-access";

interface Settings {
  enabled: boolean;
  redactionEnabled: boolean;
  siteAccessMode: SiteAccessMode;
  siteAccessSites: string[];
}

const defaultSettings: Settings = {
  enabled: true,
  redactionEnabled: true,
  siteAccessMode: "all",
  siteAccessSites: [],
};

export function Options() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [siteRules, setSiteRules] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    void loadSettings();
  }, []);

  async function loadSettings() {
    const response = await sendToBackground("GET_SETTINGS", undefined);
    if (response.success && response.data) {
      setSettings(response.data);
      setSiteRules(response.data.siteAccessSites.join("\n"));
    } else {
      setMessage(response.error ?? "Could not load settings.");
    }
  }

  async function updateEnabled(enabled: boolean) {
    if (!settings) return;
    setSaving(true);
    const response = await sendToBackground("UPDATE_SETTINGS", { enabled });
    if (response.success) {
      setSettings({ ...settings, enabled });
      setMessage("Settings saved.");
    } else {
      setMessage(response.error ?? "Could not save settings.");
    }
    setSaving(false);
  }

  async function updateRedaction(redactionEnabled: boolean) {
    if (!settings) return;
    if (
      !redactionEnabled &&
      !confirm("Disable redaction? New captures may store passwords, tokens, cookies, and personal data in plaintext.")
    ) return;
    setSaving(true);
    const response = await sendToBackground("UPDATE_SETTINGS", { redactionEnabled });
    if (response.success) {
      setSettings({ ...settings, redactionEnabled });
      setMessage(redactionEnabled
        ? "Redaction enabled for new captures."
        : "Raw capture enabled. New traffic may contain plaintext secrets.");
    } else {
      setMessage(response.error ?? "Could not update redaction.");
    }
    setSaving(false);
  }

  async function saveSiteAccess() {
    if (!settings) return;
    const lines = siteRules
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    const normalized = lines.map(normalizeSiteRule);
    const invalidIndex = normalized.findIndex((site) => site === null);
    if (invalidIndex !== -1) {
      setMessage(`Invalid site: ${lines[invalidIndex]}`);
      return;
    }

    const sites = [...new Set(normalized.filter((site): site is string => site !== null))].sort();
    setSaving(true);
    const response = await sendToBackground("UPDATE_SETTINGS", {
      siteAccessMode: settings.siteAccessMode,
      siteAccessSites: sites,
    });
    if (response.success) {
      setSettings({ ...settings, siteAccessSites: sites });
      setSiteRules(sites.join("\n"));
      setMessage("Site access saved.");
    } else {
      setMessage(response.error ?? "Could not save site access.");
    }
    setSaving(false);
  }

  async function resetSettings() {
    if (!confirm("Reset capture settings to defaults?")) return;
    setSaving(true);
    const response = await sendToBackground("UPDATE_SETTINGS", defaultSettings);
    if (response.success) {
      setSettings(defaultSettings);
      setSiteRules("");
      setMessage("Settings reset.");
    } else {
      setMessage(response.error ?? "Could not reset settings.");
    }
    setSaving(false);
  }

  if (!settings) {
    return (
      <div className="flex min-h-screen items-center justify-center p-8">
        {message ? (
          <p className="text-sm text-red-700">{message}</p>
        ) : (
          <div className="h-12 w-12 animate-spin rounded-full border-b-2 border-primary-600" />
        )}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-3xl mx-auto space-y-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Dev Toolz Settings</h1>
          <p className="mt-2 text-gray-600">Control automatic network capture and site access.</p>
        </div>

        <div className="divide-y divide-gray-200 rounded-lg bg-white shadow">
          <section className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-medium text-gray-900">Automatic capture</h2>
                <p className="text-sm text-gray-500">Follow the active tab and retain API traffic.</p>
              </div>
              <button
                onClick={() => updateEnabled(!settings.enabled)}
                disabled={saving}
                aria-label="Toggle automatic capture"
                aria-pressed={settings.enabled}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  settings.enabled ? "bg-primary-600" : "bg-gray-300"
                } disabled:opacity-50`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    settings.enabled ? "translate-x-6" : "translate-x-1"
                  }`}
                />
              </button>
            </div>
          </section>

          <section className="p-6">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="text-lg font-medium text-gray-900">Redaction coverage</h2>
                <p className="text-sm text-gray-500">
                  Mask sensitive URL values, headers, and bodies before local storage.
                </p>
                {!settings.redactionEnabled && (
                  <p className="mt-2 text-sm font-medium text-red-700">
                    Raw capture is on. New traffic may store plaintext secrets and personal data.
                  </p>
                )}
              </div>
              <button
                onClick={() => void updateRedaction(!settings.redactionEnabled)}
                disabled={saving}
                aria-label="Toggle redaction coverage"
                aria-pressed={settings.redactionEnabled}
                className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
                  settings.redactionEnabled ? "bg-primary-600" : "bg-red-600"
                } disabled:opacity-50`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    settings.redactionEnabled ? "translate-x-6" : "translate-x-1"
                  }`}
                />
              </button>
            </div>
          </section>

          <section className="p-6">
            <h2 className="text-lg font-medium text-gray-900 mb-1">Site access</h2>
            <p className="text-sm text-gray-500 mb-4">Choose where automatic capture may attach.</p>
            <label className="block text-sm font-medium text-gray-700 mb-2" htmlFor="site-access-mode">
              Access mode
            </label>
            <select
              id="site-access-mode"
              value={settings.siteAccessMode}
              onChange={(event) =>
                setSettings({ ...settings, siteAccessMode: event.target.value as SiteAccessMode })
              }
              disabled={saving}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            >
              <option value="all">All sites</option>
              <option value="deny">All sites except deny list</option>
              <option value="allow">Only sites on allow list</option>
            </select>
            <label className="block text-sm font-medium text-gray-700 mt-4 mb-2" htmlFor="site-access-sites">
              Sites, one per line
            </label>
            <textarea
              id="site-access-sites"
              value={siteRules}
              onChange={(event) => setSiteRules(event.target.value)}
              disabled={saving || settings.siteAccessMode === "all"}
              rows={6}
              placeholder={"example.com\napi.example.org"}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 font-mono text-sm disabled:bg-gray-100"
            />
            <p className="mt-2 text-xs text-gray-500">Hostnames include subdomains. Sensitive URL values remain redacted.</p>
            <button
              onClick={saveSiteAccess}
              disabled={saving}
              className="mt-4 px-4 py-2 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 disabled:opacity-50"
            >
              Save site access
            </button>
          </section>

          <section className="p-6">
            <h2 className="text-lg font-medium text-gray-900 mb-1">Reset settings</h2>
            <p className="text-sm text-gray-500 mb-4">Restore automatic capture on all sites.</p>
            <button
              onClick={resetSettings}
              disabled={saving}
              className="px-4 py-2 text-sm font-medium text-red-700 bg-red-50 rounded-lg hover:bg-red-100 disabled:opacity-50"
            >
              Reset to defaults
            </button>
          </section>
        </div>

        {message && <div className="rounded-lg bg-white p-3 text-center text-sm text-gray-700">{message}</div>}
        <div className="text-center text-sm text-gray-500">
          Dev Toolz v{chrome.runtime.getManifest().version}
        </div>
      </div>
    </div>
  );
}
