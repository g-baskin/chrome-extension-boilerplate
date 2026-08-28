---
type: entity
title: "syncApiTrafficCapture"
entity_type: function
status: developing
created: "2026-08-27"
updated: "2026-08-27"
path: "apps/dev-toolz/src/background/index.ts"
language: ts
depends_on:
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
  - "[[entities/stopSynchronizedApiTrafficCapture]]"
sources: []
---

# syncApiTrafficCapture

## Overview

`syncApiTrafficCapture` reconciles automatic capture against the currently active tab and the stored capture policy (`apps/dev-toolz/src/background/index.ts:182-184`).

## Signature / Definition

```ts
async function syncApiTrafficCapture(expectedTabId?: number): Promise<void>
```

## Behavior

- It ignores a request scoped to a tab that is no longer active (`apps/dev-toolz/src/background/index.ts:183-184`).
- It advances the global revision, then stops capture when the feature is disabled, the tab is absent or incomplete, or the URL is not HTTP(S) (`apps/dev-toolz/src/background/index.ts:186-195`, `apps/dev-toolz/src/background/index.ts:223-225`).
- It also stops capture for paused or site-disallowed URLs (`apps/dev-toolz/src/background/index.ts:198-207`).
- Before attaching, it re-reads the tab and verifies revision, active state, completion state, and unchanged URL; only then does it call `captureTab` (`apps/dev-toolz/src/background/index.ts:210-220`).

## Connections

- Related flow: [[concepts/automatic-api-traffic-capture-orchestration]].
- Stop path: [[entities/stopSynchronizedApiTrafficCapture]].

## Tested by

No test was identified in this confirmed changed-file scope.

## History

- Last committed touch: `347fd304a2a520e0a6f249848e57cb7a864c2a87` by AutomationGod on 2026-08-27.
- The current working-tree tightening preserves this function while removing unrelated page-capture orchestration from the background handler (`apps/dev-toolz/src/background/index.ts:21-120`).

## Sources

- `apps/dev-toolz/src/background/index.ts:182-225`
