---
type: concept
title: "Automatic API Traffic Capture Orchestration"
status: developing
created: "2026-08-27"
updated: "2026-08-27"
complexity: advanced
domain: "dev-toolz capture"
aliases:
  - "active-tab capture synchronization"
tags:
  - concept
  - dev-toolz
related:
  - "[[entities/syncApiTrafficCapture]]"
  - "[[entities/stopSynchronizedApiTrafficCapture]]"
  - "[[entities/stopApiTrafficCaptureForActiveTab]]"
sources: []
---

# Automatic API Traffic Capture Orchestration

## Overview

The background worker synchronizes debugger-backed API traffic capture with extension startup, active-tab activation, tab loading/completion, pause alarms, global enablement, site access, and URL inspectability (`apps/dev-toolz/src/background/index.ts:11`, `apps/dev-toolz/src/background/index.ts:123`, `apps/dev-toolz/src/background/index.ts:136`, `apps/dev-toolz/src/background/index.ts:151`, `apps/dev-toolz/src/background/index.ts:182`).

## Flow

1. Installation and browser startup initialize storage, then synchronize capture (`apps/dev-toolz/src/background/index.ts:11-19`).
2. Activating a complete tab synchronizes immediately; activating a loading tab increments a per-tab status revision and requests a guarded stop (`apps/dev-toolz/src/background/index.ts:123-133`).
3. Tab status changes stop capture on `loading` and synchronize on `complete` (`apps/dev-toolz/src/background/index.ts:136-145`).
4. The synchronizer rejects disabled, missing, incomplete, non-HTTP(S), paused, or site-blocked targets before calling `captureTab` (`apps/dev-toolz/src/background/index.ts:182-220`).
5. A monotonic capture revision prevents stale asynchronous work from becoming current (`apps/dev-toolz/src/background/index.ts:160-163`, `apps/dev-toolz/src/background/index.ts:186`, `apps/dev-toolz/src/background/index.ts:211`).

## Connections

- [[entities/syncApiTrafficCapture]] owns the eligibility and attach path.
- [[entities/stopSynchronizedApiTrafficCapture]] invalidates current work before detaching.
- [[entities/stopApiTrafficCaptureForActiveTab]] guards loading-state detachment against stale tab events.

## Sources

- `apps/dev-toolz/src/background/index.ts:7-9`
- `apps/dev-toolz/src/background/index.ts:11-19`
- `apps/dev-toolz/src/background/index.ts:123-224`
