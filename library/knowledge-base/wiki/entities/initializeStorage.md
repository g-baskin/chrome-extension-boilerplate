---
type: entity
title: "initializeStorage"
entity_type: function
status: developing
created: "2026-08-27"
updated: "2026-08-27"
path: "apps/dev-toolz/src/lib/storage.ts"
language: ts
depends_on:
  - "[[entities/StorageSchema]]"
  - "[[entities/defaultSettings]]"
used_by: []
last_commit_hash: "347fd304a2a520e0a6f249848e57cb7a864c2a87"
tested_by: []
tags:
  - entity
  - function
  - dev-toolz
related:
  - "[[concepts/automatic-api-traffic-capture-orchestration]]"
sources: []
---

# initializeStorage

## Overview

`initializeStorage` rewrites capture settings into the tightened schema and ensures the pause map exists (`apps/dev-toolz/src/lib/storage.ts:54-72`).

## Signature / Definition

```ts
async function initializeStorage(): Promise<void>
```

## Behavior

- Persisted `enabled` is retained only when it is boolean; otherwise the default is used (`apps/dev-toolz/src/lib/storage.ts:55-58`).
- Access mode retains only `allow` or `deny`; every other value becomes `all` (`apps/dev-toolz/src/lib/storage.ts:59-60`).
- Site rules retain only string array members; non-arrays become empty arrays (`apps/dev-toolz/src/lib/storage.ts:61-64`).
- The normalized settings are always written, and a failed write throws (`apps/dev-toolz/src/lib/storage.ts:65-67`).
- A missing pause map is initialized to `{}`, with write failure also surfaced as an error (`apps/dev-toolz/src/lib/storage.ts:69-72`).

## Connections

- Normalizes [[entities/StorageSchema]] using [[entities/defaultSettings]].
- Runs on extension installation and startup (`apps/dev-toolz/src/background/index.ts:11-19`).

## Tested by

No test was identified in this confirmed changed-file scope.

## History

- Last committed touch: `347fd304a2a520e0a6f249848e57cb7a864c2a87` by AutomationGod on 2026-08-27.

## Sources

- `apps/dev-toolz/src/lib/storage.ts:54-73`
