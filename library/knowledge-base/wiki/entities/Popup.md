---
type: entity
title: "Popup"
entity_type: react-component
status: developing
created: "2026-08-27"
updated: "2026-08-27"
path: "apps/dev-toolz/src/popup/Popup.tsx"
language: tsx
props_summary: ""
is_default_export: false
depends_on:
  - "[[entities/MessageTypes]]"
used_by: []
last_commit_hash: "ef2134c92fb311beaf94a2752e74129ea6f03305"
tested_by: []
tags:
  - entity
  - react-component
  - dev-toolz
related:
  - "[[concepts/automatic-api-traffic-capture-orchestration]]"
sources: []
---

# Popup

## Overview

`Popup` is the toolbar UI for reading automatic-capture settings and active-tab capture status, toggling capture globally, and opening settings (`apps/dev-toolz/src/popup/Popup.tsx:14-58`, `apps/dev-toolz/src/popup/Popup.tsx:78-123`).

## Props

This component accepts no props (`apps/dev-toolz/src/popup/Popup.tsx:14`).

## State and behavior

- On mount it loads settings while querying the current active tab (`apps/dev-toolz/src/popup/Popup.tsx:20-29`).
- If a tab ID exists, it requests `GET_API_CAPTURE_STATUS`; settings and load failures are surfaced in component state (`apps/dev-toolz/src/popup/Popup.tsx:31-45`).
- The toggle sends `TOGGLE_EXTENSION`, updates local state on success, then reloads authoritative data (`apps/dev-toolz/src/popup/Popup.tsx:48-57`).
- The status label distinguishes disabled, paused, blocked, enabled-for-host, and waiting states (`apps/dev-toolz/src/popup/Popup.tsx:60-68`).
- The rendered controls are limited to settings navigation and the automatic-capture toggle (`apps/dev-toolz/src/popup/Popup.tsx:80-116`).

## Connections

- Uses the [[entities/MessageTypes]] contract through `sendToBackground` (`apps/dev-toolz/src/popup/Popup.tsx:2`, `apps/dev-toolz/src/popup/Popup.tsx:27`, `apps/dev-toolz/src/popup/Popup.tsx:38`, `apps/dev-toolz/src/popup/Popup.tsx:51`).

## Tested by

No test was identified in this confirmed changed-file scope.

## History

- Last committed touch: `ef2134c92fb311beaf94a2752e74129ea6f03305` by AutomationGod on 2026-08-27.
- The working-tree tightening removes page capture/download and generic content actions; the current component behavior is bounded by `apps/dev-toolz/src/popup/Popup.tsx:14-123`.

## Sources

- `apps/dev-toolz/src/popup/Popup.tsx:1-125`
