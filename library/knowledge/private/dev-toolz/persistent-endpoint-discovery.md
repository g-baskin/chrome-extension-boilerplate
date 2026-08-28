# Dev Toolz Persistent Endpoint Discovery

> Category: Product and Engineering Reference | Version: 1.0 | Date: August 2026 | Status: Active

Dev Toolz is focused on persistent, automatic discovery of API and media endpoints used by the currently active HTTP(S) tab.

**Related:**
- [Documentation framework](../standards/documentation-framework.md)
- `apps/dev-toolz/manifest.json`
- `apps/dev-toolz/src/background/index.ts`
- `apps/dev-toolz/src/background/api-traffic-capture.ts`
- `apps/dev-toolz/src/devtools/devtools-page.html`
- `apps/dev-toolz/src/devtools/devtools-page.ts`
- `apps/dev-toolz/src/devtools/devtools.ts`
- `apps/dev-toolz/src/lib/api-traffic.ts`
- `apps/dev-toolz/public/register-panel.js`

## Product boundary

Dev Toolz now has one product job: automatically observe the active website's API and media traffic, preserve useful endpoint history, and expose that history in the Dev Toolz panel for investigation and export. The popup is a capture status and global on/off control; the options page contains capture and site-access controls.

The tightening removed unrelated or misleading surfaces:

- Skool-specific page capture, saved Skool-page history, and download behavior.
- The content script and all page-DOM capture or injection behavior.
- Highlight-page, inject-widget, and generic page-data demos.
- Placeholder theme and notification settings that did not implement the product's core job.
- The generic context-menu action.

Consequently, the extension no longer declares a content script, host permissions, `activeTab`, `scripting`, or `contextMenus`. The deleted implementation paths include `apps/dev-toolz/src/content/index.ts` and `apps/dev-toolz/src/lib/capture.ts`.

## Automatic capture and fallback

The background service worker is the primary capture path:

1. It synchronizes capture on install, browser startup, active-tab changes, completed navigations, settings changes, pause changes, and timed pause expiry.
2. It only attaches to a completed, active `http://` or `https://` tab that is enabled, allowed by the site-access policy, and not paused.
3. It detaches from the previous or loading tab before moving capture, so automatic capture follows the active tab rather than every open tab.
4. It uses `chrome.debugger` with the Chrome DevTools Protocol `Network` domain to observe requests and responses. Fetch/XHR, JSON, and recognized media traffic are retained. Media bodies are omitted while endpoint and transfer metadata remain available.

When Chrome DevTools occupies the inspection connection or the user is already inspecting the page, the DevTools page supplies the fallback. `apps/dev-toolz/src/devtools/devtools-page.ts` listens to `chrome.devtools.network.onRequestFinished`, applies the same API/media selection, and saves compatible exchanges to the same history. Capture in this path still respects the current site's allow/block and pause status.

### Chrome debugging banner limitation

Automatic CDP capture requires `chrome.debugger`. While the extension is attached, Chrome displays its own debugging infobar/banner identifying that an extension started debugging the tab or browser. Chrome controls this security disclosure; Dev Toolz cannot hide or suppress it. Detaching, disabling capture, pausing the site, moving away from an inspectable active tab, or using the DevTools-network fallback ends or avoids the debugger attachment as applicable, but there is no supported silent automatic-debugger mode.

## Persistent history and panel behavior

Captured exchanges are stored in IndexedDB database `dev-toolz`, object store `api-traffic`, with an auto-incrementing sequence. This keeps history across popup closure, panel closure, navigation, and service-worker suspension. History is loaded newest-first in pages of 200 rather than being limited to the current browser session.

Each exchange can include source page, destination URL, method, status, MIME type, timing, transfer size, initiator attribution, redacted headers and URLs, and request/response bodies where available. Sensitive header and query-field names are redacted. Media response bodies are deliberately omitted.

The panel supports:

- Current inspected site or all-sites scope.
- Analysis filters for likely target traffic, focus/discovery signals, writes, failures, all video, direct video, stream manifests, and streaming video.
- Destination-domain, initiator/route attribution, method, status-family, and MIME filters.
- Newest-first pagination and live insertion of matching captures.
- Temporary hiding of endpoints or media streams within the panel session.
- Grouping duplicate requests within a nearby 10-second window, grouping matching endpoint history across the current site, and media-stream grouping in media analysis modes.
- Permanent clear actions for the current site or all sites, with an affected-record count and confirmation.
- JSON export for the current site or the complete database. Export reflects the selected scope, not the transient analysis filters or hidden/grouped presentation.

## Pause behavior

Pauses are stored per hostname in `chrome.storage.local`. A site can be paused for 5 minutes, 15 minutes, 1 hour, or until explicitly resumed. Timed pauses use `chrome.alarms` so capture can resume after service-worker suspension. Pausing the active site detaches automatic debugger capture; resuming re-synchronizes it. The DevTools fallback reads the same pause state and stops saving while paused.

Global enable/disable and allow/deny site-access settings remain separate from per-site pauses. The popup reports disabled, paused, blocked, enabled, or waiting-for-an-inspectable-page state.

## Manifest permissions

The surviving permissions in `apps/dev-toolz/manifest.json` are intentionally limited to the product's capture and persistence requirements:

| Permission | Why it remains |
|---|---|
| `storage` | Stores global capture/site-access settings, per-host pause state, and the currently attached debugger tab in local/session extension storage. |
| `unlimitedStorage` | Prevents the persistent IndexedDB endpoint history from being constrained by the normal extension storage quota as traffic accumulates. |
| `tabs` | Finds and tracks the active tab, reads its URL and load status, responds to activation/navigation/removal, and addresses the inspected tab for status and pause controls. |
| `alarms` | Wakes the service worker when a timed per-site pause expires so capture can be synchronized again. |
| `debugger` | Enables automatic active-tab CDP Network capture without requiring the DevTools panel to remain open. |

There are no host permissions. Dev Toolz observes network metadata through `chrome.debugger` or the DevTools network API; it does not inject into arbitrary pages.

## DevTools panel registration

The DevTools bootstrap page loads `apps/dev-toolz/public/register-panel.js` as a classic script. That file performs only `chrome.devtools.panels.create(...)` for the Dev Toolz panel. The manifest's `web_accessible_resources` entry retains `<all_urls>` matching but narrows the resource list from the prior broad `public/*` pattern to only `public/register-panel.js`. No other public file is declared web-accessible.

## Verification record

Verified on 2026-08-27 from the repository root:

| Command | Result |
|---|---|
| `npm run lint` | Passed; ESLint completed for the Dev Toolz workspace. |
| `npm run typecheck` | Passed; `tsc --noEmit` completed for the Dev Toolz workspace. |
| `npm run build:dev-toolz` | Passed; version synchronization reported `1.1.22`, Vite transformed 46 modules, and the production build completed. Vite also emitted a non-fatal notice that the classic `public/register-panel.js` script is copied rather than bundled because it has no `type="module"`. |
| Inspect `apps/dev-toolz/dist/manifest.json` | Confirmed built version `1.1.22`, the five surviving permissions, and only `public/register-panel.js` under `web_accessible_resources`. |
