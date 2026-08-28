---
type: entity
title: "defaultSettings"
entity_type: data-model
status: developing
created: "2026-08-27"
updated: "2026-08-27"
path: "apps/dev-toolz/src/lib/storage.ts"
language: ts
schema_library: typescript
fields:
  - enabled
  - siteAccessMode
  - siteAccessSites
depends_on:
  - "[[entities/StorageSchema]]"
used_by:
  - "[[entities/initializeStorage]]"
  - "[[entities/syncApiTrafficCapture]]"
last_commit_hash: "347fd304a2a520e0a6f249848e57cb7a864c2a87"
tested_by: []
tags:
  - entity
  - data-model
  - dev-toolz
related: []
sources: []
---

# defaultSettings

## Overview

`defaultSettings` is the exported baseline capture policy typed as `StorageSchema["settings"]` (`apps/dev-toolz/src/lib/storage.ts:46-50`).

## Signature / Definition

```ts
const defaultSettings = {
  enabled: true,
  siteAccessMode: "all",
  siteAccessSites: [],
};
```

## Behavior

The default enables automatic capture, permits all sites, and starts with no explicit site rules (`apps/dev-toolz/src/lib/storage.ts:46-50`). The initializer uses these defaults when persisted enablement is invalid or missing, while invalid access modes normalize to `all` and invalid site lists normalize to an empty list (`apps/dev-toolz/src/lib/storage.ts:54-64`).

## Connections

- Typed by [[entities/StorageSchema]].
- Consumed by [[entities/initializeStorage]] and the background capture policy (`apps/dev-toolz/src/background/index.ts:2`, `apps/dev-toolz/src/background/index.ts:40`, `apps/dev-toolz/src/background/index.ts:189`).

## Tested by

No test was identified in this confirmed changed-file scope.

## History

- Last committed touch: `347fd304a2a520e0a6f249848e57cb7a864c2a87` by AutomationGod on 2026-08-27.
- The working-tree tightening removes theme and notification defaults; the retained values are at `apps/dev-toolz/src/lib/storage.ts:46-50`.

## Sources

- `apps/dev-toolz/src/lib/storage.ts:46-52`
