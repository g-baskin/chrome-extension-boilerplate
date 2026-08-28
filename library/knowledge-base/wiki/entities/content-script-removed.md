---
type: entity
title: "Content Script (Removed)"
entity_type: module
status: evergreen
created: "2026-08-27"
updated: "2026-08-27"
path: "apps/dev-toolz/src/content/index.ts"
language: ts
depends_on: []
used_by: []
last_commit_hash: "347fd304a2a520e0a6f249848e57cb7a864c2a87"
tested_by: []
tags:
  - entity
  - removed
  - deprecated
  - dev-toolz
related:
  - "[[entities/page-capture-module-removed]]"
  - "[[entities/manifest]]"
sources: []
---

# Content Script (Removed)

> [!key-insight]
> This is a tombstone, not an active module contract. `apps/dev-toolz/src/content/index.ts` is deleted in the confirmed working-tree tightening, and the current manifest has no `content_scripts` registration (`apps/dev-toolz/manifest.json:28-38`).

## Former responsibility

Before removal, the module listened for `CONTENT_ACTION`, `CAPTURE_SKILL_PAGE`, extension-state, and tab-info messages (`apps/dev-toolz/src/content/index.ts:9-68` in commit `347fd304a2a520e0a6f249848e57cb7a864c2a87`). It also initiated page capture through `handleCapturePage` (`apps/dev-toolz/src/content/index.ts:70-80` in that commit).

## Removal treatment

No active entity links should depend on this tombstone. The current popup uses background-only settings and capture-status messages (`apps/dev-toolz/src/popup/Popup.tsx:24-39`, `apps/dev-toolz/src/popup/Popup.tsx:48-57`), and the current messaging contract contains no content-script transport (`apps/dev-toolz/src/lib/messaging.ts:1-45`). The tombstone preserves removal history without pretending the file remains loadable.

## History

- Last committed touch before deletion: `347fd304a2a520e0a6f249848e57cb7a864c2a87` by AutomationGod on 2026-08-27.
- Deleted in the current uncommitted tightening diff; no commit hash is fabricated for that working-tree deletion.

## Sources

- `apps/dev-toolz/manifest.json:28-38`
- `apps/dev-toolz/src/content/index.ts:9-80` at commit `347fd304a2a520e0a6f249848e57cb7a864c2a87`
- `apps/dev-toolz/src/lib/messaging.ts:1-45`
