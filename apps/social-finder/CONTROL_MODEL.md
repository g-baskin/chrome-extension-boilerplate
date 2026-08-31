# Social Finder Engineering Control Model

## Objective
Turn rendered Facebook Ad Library cards into a bounded, reproducible local research workspace while preserving Feed, Marketplace, and user-triggered screenshot behavior.

## Source of truth
Priority: approved plan, rendered Facebook DOM, pure tests, repository change control, then behavioral references. Third-party code and private Facebook APIs are never authoritative.

## Allowed
Exact Facebook content scripts; semantic rendered-card reads; active-tab/query-scoped messages; manual collection capped at 500; schema-versioned local saved ads/preferences; explicit HTTPS open, copy, share, download, import/export, and visible-tab capture actions.

## Prohibited
No copied code/assets/selectors/prompts, private requests, React internals, page-world injection, automatic scrolling/clicking, unattended crawling, hidden timers, remote storage/model calls, telemetry, screenshot persistence, invented metrics, or unrelated app edits.

## Ownership and limits
Facebook owns page content. Social Finder owns bounded local records, deterministic reductions, badges, preferences, saved records, and one memory-only screenshot. Missing facts remain unknown. Collection resets when the active tab or normalized query changes.

## Verification
For each candidate: synchronize version and pending release record, run focused and full tests, lint, typecheck, dependency audit, diff check, production build, emitted-manifest checks, then isolated Chrome smoke. Security review precedes quality review.

## Stop and recovery
Stop when rendered facts are unavailable, permissions broaden beyond declared gestures, data may be lost, checks fail three corrections, or authenticated acceptance is required. Preserve the last runtime-verified candidate as rollback and never mutate saved data during failed import/migration.

## Success
Counts reproduce from local records; keyboard and pointer workflows complete; screenshots remain memory-only; no extension-driven browsing or egress occurs; Chrome reports no new extension errors. Record runtime facts without claiming legal or accessibility conformance.
