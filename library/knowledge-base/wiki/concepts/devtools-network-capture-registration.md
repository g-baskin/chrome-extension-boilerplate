---
type: concept
title: "DevTools Network Capture Registration"
status: developing
created: "2026-08-27"
updated: "2026-08-27"
complexity: advanced
domain: "dev-toolz devtools"
aliases:
  - "DevTools capture listeners"
tags:
  - concept
  - dev-toolz
related:
  - "[[entities/manifest]]"
  - "[[entities/MessageTypes]]"
sources: []
---

# DevTools Network Capture Registration

## Overview

The extension manifest registers `src/devtools/devtools-page.html` as its DevTools page and exposes only the panel-registration script as a web-accessible resource (`apps/dev-toolz/manifest.json:23`, `apps/dev-toolz/manifest.json:33-37`). The DevTools page then registers listeners for inspected-page navigation, storage changes, completed requests, and unload (`apps/dev-toolz/src/devtools/devtools-page.ts:5-24`, `apps/dev-toolz/src/devtools/devtools-page.ts:26`, `apps/dev-toolz/src/devtools/devtools-page.ts:74-78`).

## Registration behavior

- `devtools-page.html` synchronously loads `public/register-panel.js`, which calls `chrome.devtools.panels.create(...)` before the module capture listeners load (`apps/dev-toolz/src/devtools/devtools-page.html:8-9`, `apps/dev-toolz/public/register-panel.js:1-5`).
- Initial inspected-page URL discovery uses `chrome.devtools.inspectedWindow.eval`, then refreshes capture eligibility (`apps/dev-toolz/src/devtools/devtools-page.ts:5-10`).
- Navigation and relevant local-storage changes pessimistically pause capture until background status is refreshed (`apps/dev-toolz/src/devtools/devtools-page.ts:11-24`).
- Finished requests are ignored while paused; API-like or media requests are persisted and announced as `API_TRAFFIC_CAPTURED` (`apps/dev-toolz/src/devtools/devtools-page.ts:26-50`).
- Status refresh asks the background for global enablement and inspected-site eligibility, then rejects disabled, blocked, or paused capture (`apps/dev-toolz/src/devtools/devtools-page.ts:60-72`).
- Unload sends `DEVTOOLS_CLOSED` for the inspected tab (`apps/dev-toolz/src/devtools/devtools-page.ts:78-82`).

## Tightened surface

The current manifest has no `content_scripts` or `host_permissions` declaration and limits permissions to five named APIs (`apps/dev-toolz/manifest.json:28-38`). The web-accessible resource list is narrowed to `public/register-panel.js` (`apps/dev-toolz/manifest.json:33-37`).

## Connections

- [[entities/manifest]] is the non-TS stub for the registration source.
- [[entities/MessageTypes]] defines `GET_API_CAPTURE_STATUS` and `DEVTOOLS_CLOSED` (`apps/dev-toolz/src/lib/messaging.ts:25-40`).

## Sources

- `apps/dev-toolz/manifest.json:23-38`
- `apps/dev-toolz/src/devtools/devtools-page.html:1-11`
- `apps/dev-toolz/public/register-panel.js:1-5`
- `apps/dev-toolz/src/devtools/devtools-page.ts:1-78`