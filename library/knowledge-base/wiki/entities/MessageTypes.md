---
type: entity
title: "MessageTypes"
entity_type: data-model
status: developing
created: "2026-08-27"
updated: "2026-08-27"
path: "apps/dev-toolz/src/lib/messaging.ts"
language: ts
schema_library: typescript
fields:
  - TOGGLE_EXTENSION
  - GET_SETTINGS
  - UPDATE_SETTINGS
  - DEVTOOLS_CLOSED
  - GET_API_CAPTURE_STATUS
  - SET_API_CAPTURE_PAUSE
depends_on: []
used_by:
  - "[[entities/createMessageHandler]]"
  - "[[entities/Popup]]"
  - "[[entities/Options]]"
last_commit_hash: "347fd304a2a520e0a6f249848e57cb7a864c2a87"
tested_by: []
tags:
  - entity
  - data-model
  - dev-toolz
related:
  - "[[concepts/devtools-network-capture-registration]]"
sources: []
---

# MessageTypes

## Overview

`MessageTypes` is the request/response contract for the six retained background messages: extension toggling, settings read/update, DevTools closure, capture-status read, and capture pause update (`apps/dev-toolz/src/lib/messaging.ts:1-46`).

## Signature / Definition

```ts
interface MessageTypes {
  TOGGLE_EXTENSION: ...;
  GET_SETTINGS: ...;
  UPDATE_SETTINGS: ...;
  DEVTOOLS_CLOSED: ...;
  GET_API_CAPTURE_STATUS: ...;
  SET_API_CAPTURE_PAUSE: ...;
}
```

## Behavior

Settings responses expose only `enabled`, `siteAccessMode`, and `siteAccessSites`; updates accept a partial form of that same contract (`apps/dev-toolz/src/lib/messaging.ts:7-23`). Capture status includes global enablement, hostname, pause state/deadline, site permission, and access mode (`apps/dev-toolz/src/lib/messaging.ts:30-40`). The global `enabled` field lets the DevTools fallback stop persistence when capture is disabled. Pause requests accept only resume, three fixed durations, or indefinite pause (`apps/dev-toolz/src/lib/messaging.ts:42-45`). `Message`, `MessageResponse`, and the sender/handler generics derive payload types from this map (`apps/dev-toolz/src/lib/messaging.ts:48-64`, `apps/dev-toolz/src/lib/messaging.ts:88-100`).

## Connections

- Enforced by [[entities/createMessageHandler]].
- Used by [[entities/Popup]] and [[entities/Options]].
- DevTools lifecycle/status usage is described by [[concepts/devtools-network-capture-registration]].

## Tested by

No test was identified in this confirmed changed-file scope.

## History

- Last committed touch: `347fd304a2a520e0a6f249848e57cb7a864c2a87` by AutomationGod on 2026-08-27.
- The current working-tree contract no longer contains tab-info, content-action, page-capture, or capture-history messages; the retained map is `apps/dev-toolz/src/lib/messaging.ts:1-45`.

## Sources

- `apps/dev-toolz/src/lib/messaging.ts:1-58`
