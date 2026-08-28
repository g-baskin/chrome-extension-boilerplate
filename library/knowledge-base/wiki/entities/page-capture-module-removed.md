---
type: entity
title: "Page Capture Module (Removed)"
entity_type: module
status: evergreen
created: "2026-08-27"
updated: "2026-08-27"
path: "apps/dev-toolz/src/lib/capture.ts"
language: ts
depends_on: []
used_by: []
last_commit_hash: "ef2134c92fb311beaf94a2752e74129ea6f03305"
tested_by: []
tags:
  - entity
  - removed
  - deprecated
  - dev-toolz
related:
  - "[[entities/content-script-removed]]"
  - "[[entities/StorageSchema]]"
  - "[[entities/MessageTypes]]"
sources: []
---

# Page Capture Module (Removed)

> [!key-insight]
> This is a tombstone, not an active module contract. `apps/dev-toolz/src/lib/capture.ts` is deleted in the confirmed working-tree tightening.

## Former responsibility

Before removal, the module defined page-capture metadata, scope, request, response, summary, and stored-entry types (`apps/dev-toolz/src/lib/capture.ts:1-35` at commit `ef2134c92fb311beaf94a2752e74129ea6f03305`). It also exported a capture-history limit of 50 (`apps/dev-toolz/src/lib/capture.ts:37` in that commit).

## Removal treatment

The current [[entities/StorageSchema]] has no capture-history key (`apps/dev-toolz/src/lib/storage.ts:3-10`), and [[entities/MessageTypes]] has no page-capture or capture-history messages (`apps/dev-toolz/src/lib/messaging.ts:1-45`). The tombstone therefore records a deliberately removed contract and must not be treated as an importable module.

## History

- Last committed touch before deletion: `ef2134c92fb311beaf94a2752e74129ea6f03305` by AutomationGod on 2026-08-27.
- Deleted in the current uncommitted tightening diff; no commit hash is fabricated for that working-tree deletion.

## Sources

- `apps/dev-toolz/src/lib/capture.ts:1-37` at commit `ef2134c92fb311beaf94a2752e74129ea6f03305`
- `apps/dev-toolz/src/lib/storage.ts:3-10`
- `apps/dev-toolz/src/lib/messaging.ts:1-45`
