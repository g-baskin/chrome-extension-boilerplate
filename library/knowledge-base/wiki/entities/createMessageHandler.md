---
type: entity
title: "createMessageHandler"
entity_type: function
status: developing
created: "2026-08-27"
updated: "2026-08-27"
path: "apps/dev-toolz/src/lib/messaging.ts"
language: ts
depends_on:
  - "[[entities/MessageTypes]]"
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

# createMessageHandler

## Overview

`createMessageHandler` registers one typed `chrome.runtime.onMessage` listener and dispatches known message types to a partial handler map (`apps/dev-toolz/src/lib/messaging.ts:87-101`).

## Signature / Definition

```ts
function createMessageHandler(
  handlers: Partial<{ [K in MessageType]: typed handler }>
): void
```

## Behavior

The listener extracts `type` and `payload`, resolves a handler by type, and only opens the asynchronous response channel when a handler exists (`apps/dev-toolz/src/lib/messaging.ts:95-102`, `apps/dev-toolz/src/lib/messaging.ts:111-115`). Successful handlers produce `{ success: true, data }`; rejected handlers are logged and produce a normalized error response (`apps/dev-toolz/src/lib/messaging.ts:102-110`). Unknown message types return `false` without manufacturing an application response (`apps/dev-toolz/src/lib/messaging.ts:113-115`).

## Connections

- **depends_on:** [[entities/MessageTypes]].
- The background worker supplies the concrete retained handler map at `apps/dev-toolz/src/background/index.ts:21-120`.

## Tested by

No test was identified in this confirmed changed-file scope.

## History

- Last committed touch: `347fd304a2a520e0a6f249848e57cb7a864c2a87` by AutomationGod on 2026-08-27.

## Sources

- `apps/dev-toolz/src/lib/messaging.ts:87-116`
