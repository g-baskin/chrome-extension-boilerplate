---
type: entity
title: "Options"
entity_type: react-component
status: developing
created: "2026-08-27"
updated: "2026-08-27"
path: "apps/dev-toolz/src/options/Options.tsx"
language: tsx
props_summary: ""
is_default_export: false
depends_on:
  - "[[entities/MessageTypes]]"
used_by: []
last_commit_hash: "347fd304a2a520e0a6f249848e57cb7a864c2a87"
tested_by: []
tags:
  - entity
  - react-component
  - dev-toolz
related:
  - "[[entities/defaultSettings]]"
sources: []
---

# Options

## Overview

`Options` is the settings page for global automatic capture, site-access mode/rules, and reset-to-default behavior (`apps/dev-toolz/src/options/Options.tsx:17-91`, `apps/dev-toolz/src/options/Options.tsx:105-199`).

## Props

This component accepts no props (`apps/dev-toolz/src/options/Options.tsx:17`).

## State and behavior

- It loads settings through `GET_SETTINGS` and renders the stored site list as newline-separated rules (`apps/dev-toolz/src/options/Options.tsx:23-35`).
- Global enablement updates only the `enabled` setting and reports success/failure in-page (`apps/dev-toolz/src/options/Options.tsx:37-48`).
- Site rules are trimmed, blank lines removed, normalized, rejected on the first invalid rule, deduplicated, sorted, and sent with the selected access mode (`apps/dev-toolz/src/options/Options.tsx:50-77`).
- Reset requires confirmation and writes the local default settings object (`apps/dev-toolz/src/options/Options.tsx:79-91`).
- The UI exposes only automatic capture, site access, and reset controls (`apps/dev-toolz/src/options/Options.tsx:113-189`).

## Connections

- Uses [[entities/MessageTypes]] through `sendToBackground` (`apps/dev-toolz/src/options/Options.tsx:2`, `apps/dev-toolz/src/options/Options.tsx:28`, `apps/dev-toolz/src/options/Options.tsx:40`, `apps/dev-toolz/src/options/Options.tsx:65`).
- Its local defaults match [[entities/defaultSettings]] (`apps/dev-toolz/src/options/Options.tsx:11-15`, `apps/dev-toolz/src/lib/storage.ts:46-50`).

## Tested by

No test was identified in this confirmed changed-file scope.

## History

- Last committed touch: `347fd304a2a520e0a6f249848e57cb7a864c2a87` by AutomationGod on 2026-08-27.
- The working-tree tightening removes theme, notifications, and page-capture history controls; current controls are evidenced at `apps/dev-toolz/src/options/Options.tsx:113-189`.

## Sources

- `apps/dev-toolz/src/options/Options.tsx:1-200`
