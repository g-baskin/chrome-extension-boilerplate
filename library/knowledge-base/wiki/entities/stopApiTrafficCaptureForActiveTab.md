---
type: entity
title: "stopApiTrafficCaptureForActiveTab"
entity_type: function
status: developing
created: "2026-08-27"
updated: "2026-08-27"
path: "apps/dev-toolz/src/background/index.ts"
language: ts
depends_on:
  - "[[entities/stopSynchronizedApiTrafficCapture]]"
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

# stopApiTrafficCaptureForActiveTab

## Overview

`stopApiTrafficCaptureForActiveTab` conditionally stops capture for a tab-loading event only if that event still describes the active tab (`apps/dev-toolz/src/background/index.ts:165-180`).

## Signature / Definition

```ts
async function stopApiTrafficCaptureForActiveTab(
  expectedTabId: number,
  expectedStatusRevision: number
): Promise<void>
```

## Behavior

The function reads the active tab and the expected tab concurrently (`apps/dev-toolz/src/background/index.ts:169-172`). It delegates to [[entities/stopSynchronizedApiTrafficCapture]] only when the expected tab remains active, remains in `loading` state, and its stored status revision still matches the event revision (`apps/dev-toolz/src/background/index.ts:173-179`). This rejects stale loading events after later tab status changes.

## Connections

- **depends_on:** [[entities/stopSynchronizedApiTrafficCapture]].
- Related flow: [[concepts/automatic-api-traffic-capture-orchestration]].

## Tested by

No test was identified in this confirmed changed-file scope.

## History

- Last committed touch: `347fd304a2a520e0a6f249848e57cb7a864c2a87` by AutomationGod on 2026-08-27.

## Sources

- `apps/dev-toolz/src/background/index.ts:165-180`
