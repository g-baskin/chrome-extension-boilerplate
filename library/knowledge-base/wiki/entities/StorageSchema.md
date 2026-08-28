---
type: entity
title: "StorageSchema"
entity_type: data-model
status: developing
created: "2026-08-27"
updated: "2026-08-27"
path: "apps/dev-toolz/src/lib/storage.ts"
language: ts
schema_library: typescript
fields:
  - settings
  - apiTrafficPauses
depends_on: []
used_by:
  - "[[entities/defaultSettings]]"
  - "[[entities/initializeStorage]]"
last_commit_hash: "347fd304a2a520e0a6f249848e57cb7a864c2a87"
tested_by: []
tags:
  - entity
  - data-model
  - dev-toolz
related: []
sources: []
---

# StorageSchema

## Overview

`StorageSchema` is the type contract for the two retained `chrome.storage.local` keys: capture settings and per-host API traffic pauses (`apps/dev-toolz/src/lib/storage.ts:3-10`).

## Signature / Definition

```ts
interface StorageSchema {
  settings: {
    enabled: boolean;
    siteAccessMode: SiteAccessMode;
    siteAccessSites: string[];
  };
  apiTrafficPauses: Record<string, number | null>;
}
```

## Behavior

The settings shape contains only global enablement and site-access policy (`apps/dev-toolz/src/lib/storage.ts:4-8`). Pause values are keyed by hostname and hold either a timestamp or `null` (`apps/dev-toolz/src/lib/storage.ts:9`). The generic storage helpers derive their allowed keys and values from this interface (`apps/dev-toolz/src/lib/storage.ts:12-17`, `apps/dev-toolz/src/lib/storage.ts:30-33`).

## Connections

- [[entities/defaultSettings]] provides the settings defaults.
- [[entities/initializeStorage]] normalizes persisted values to this contract.

## Tested by

No test was identified in this confirmed changed-file scope.

## History

- Last committed touch: `347fd304a2a520e0a6f249848e57cb7a864c2a87` by AutomationGod on 2026-08-27.
- The working-tree tightening removes theme, notifications, user data, and page-capture history from this schema; the current contract is evidenced at `apps/dev-toolz/src/lib/storage.ts:3-10`.

## Sources

- `apps/dev-toolz/src/lib/storage.ts:3-13`
