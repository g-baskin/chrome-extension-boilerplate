---
type: entity
title: "stopSynchronizedApiTrafficCapture"
entity_type: function
status: developing
created: "2026-08-27"
updated: "2026-08-27"
path: "apps/dev-toolz/src/background/index.ts"
language: ts
depends_on: []
used_by:
  - "[[entities/stopApiTrafficCaptureForActiveTab]]"
last_commit_hash: "347fd304a2a520e0a6f249848e57cb7a864c2a87"
tested_by: []
tags:
  - entity
  - function
  - dev-toolz
related:
  - "[[concepts/automatic-api-traffic-capture-orchestration]]"
  - "[[entities/syncApiTrafficCapture]]"
sources: []
---

# stopSynchronizedApiTrafficCapture

## Overview

`stopSynchronizedApiTrafficCapture` invalidates in-flight capture work and then delegates detachment to `stopApiTrafficCapture` (`apps/dev-toolz/src/background/index.ts:160-163`).

## Signature / Definition

```ts
async function stopSynchronizedApiTrafficCapture(): Promise<void>
```

## Behavior

The function increments `apiTrafficCaptureRevision` before awaiting the stop operation, allowing revision checks in the synchronization path to reject stale asynchronous work (`apps/dev-toolz/src/background/index.ts:160-163`, `apps/dev-toolz/src/background/index.ts:211-214`). It is used when global capture is disabled, when an active host is paused, and when guarded tab-loading logic requests a stop (`apps/dev-toolz/src/background/index.ts:64-65`, `apps/dev-toolz/src/background/index.ts:112-115`, `apps/dev-toolz/src/background/index.ts:178`).

## Connections

- Used by [[entities/stopApiTrafficCaptureForActiveTab]].
- Coordinates with [[entities/syncApiTrafficCapture]].
- Part of [[concepts/automatic-api-traffic-capture-orchestration]].

## Tested by

No test was identified in this confirmed changed-file scope.

## History

- Last committed touch: `347fd304a2a520e0a6f249848e57cb7a864c2a87` by AutomationGod on 2026-08-27.

## Sources

- `apps/dev-toolz/src/background/index.ts:160-163`
