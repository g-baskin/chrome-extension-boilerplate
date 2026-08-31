# Change Management

## Purpose

This is the internal release and recovery record for every app in this repository.

- Each app's changelog, when present, explains user-visible behavior.
- `CHANGEMANAGEMENT.md` records release identity, evidence, failures, recovery, and permanent guardrails for all apps.
- Git records source history. It does not prove that a build was produced, loaded, or smoke-tested.
- This file is append-only for released versions. Correct an old record with a dated note; never rewrite the incident away.

## Evidence levels

| Level | Meaning |
|---|---|
| Runtime verified | The exact built version was loaded in Chrome and the recorded smoke checks passed. |
| Build verified | The production build and built-manifest checks passed, but Chrome runtime behavior was not fully exercised. |
| Git verified | Package, manifest, lockfile, changelog, and commit history agree. No runtime claim. |
| Changelog record | The version is documented, but no corresponding commit, tag, archive, or build evidence was found. |
| Working-tree candidate | The version exists only in uncommitted work and must not be described as released. |

## Current repository state

- Current Social Finder candidate: **0.2.4**, build and automated fresh-query, unsupported-tab, and cross-site screenshot runtime verified.
- Current LinkedIn Job Finder candidate: **0.1.11**, uncommitted build-verified source; Chrome runtime acceptance pending.
- Current Dev Toolz release: **1.8.7**; runtime source commit `fbdf954` on 2026-08-28.
- Release tag: `dev-toolz-v1.8.7`.
- GitHub Release: https://github.com/g-baskin/chrome-extension-boilerplate/releases/tag/dev-toolz-v1.8.7
- Release archive: `releases/dev-toolz-1.8.7.zip`.
- Archive SHA-256: `fd1a0f825b04729c8d7f1813fd77e25201e949597eb97d8f9515aa83ae320746`.
- `apps/dev-toolz/dist` remains ignored; the tracked archive is the recovery artifact.
- Previous rollback source: commit `6ef12d5` for 1.7.19; no packaged 1.7.19 artifact is recorded.

## Social Finder v0.7.1 — 2026-08-31 — On-card running days and review corrections

### Intent and scope

- Show computed running days directly in each detected Ad Library card's Social Finder badge, matching the visible Copycat workflow without private APIs or invented dates.
- Reconcile badge text/kind every scan and remove stale badges from roots no longer detected.
- Keep import previews open when storage writes fail; existing saved ads remain unchanged.
- Preserve all 0.7.0 encrypted backup, collection, filtering, saved-ad, export, and screenshot behavior.
- Rollback target: build-verified 0.7.0. Package, manifest, and lockfile target 0.7.1.
- Fast-review corrections: failed storage writes now keep import preview open; badge kind/text is reconciled and stale undetected-root badges are removed.
- Verification: 47 tests passed across 15 files; repository lint/typecheck, production audit, and diff check passed.
- Build: Vite transformed 46 modules; emitted manifest version 0.7.1 verified.
- Isolated Brave Nike Ad Library runtime: 30 visible Library IDs produced running-day badges; sampled labels included 167, 28, 69, 33, 40, 101, 104, 437, and 115 days.
- Screenshot: `.gg/screenshots/social-finder-0.7.1-running-days.png` shows the running-day label directly above each source card.
- Runtime is computed only from Meta's visible start date and current capture time; unavailable dates retain the existing badge without an invented value.
- Verdict: automated and public Ad Library runtime verified; not released.

## Social Finder v0.7.0 — 2026-08-31 — Encrypted cross-profile backup

### Intent and scope

- Add user-triggered encrypted backup and validated decrypt-preview-merge for saved ads across Chrome profiles.
- Use native Web Crypto only: PBKDF2-HMAC-SHA-256 with 600,000 iterations, random 16-byte salt, AES-256-GCM, random 12-byte IV, and authenticated format metadata.
- Never store or log passphrases; clear the in-memory UI value after successful encryption or decryption.
- Preserve existing saved ads on duplicate keys, validate decrypted plaintext before explicit merge, and leave the current store unchanged on every failure.
- Rollback target: build-verified 0.6.6. Package, manifest, and lockfile target 0.7.0.
- Focused verification: encrypted round-trip, wrong-passphrase/unsupported-envelope rejection, passphrase bounds, and duplicate-preserving merge tests passed.
- Full verification: 45 tests passed across 14 files; workspace lint/typecheck, production audit, and diff check passed.
- Build: Vite transformed 46 modules; emitted manifest version 0.7.0 verified; no dependency or permission was added.
- Isolated Brave UI: encrypted-backup controls rendered at 420 and 320 CSS pixels with no horizontal overflow, a password input, explicit decrypt-preview action, and local-only disclosure. Screenshots: `.gg/screenshots/social-finder-0.7.0-backup-desktop.png` and `.gg/screenshots/social-finder-0.7.0-backup-narrow.png`.
- Durability: decrypt and validate complete before preview; merge is explicit; existing duplicate records win; failures do not call storage writes.
- Cryptography reference checked 2026-08-31: OWASP Password Storage Cheat Sheet recommends PBKDF2-HMAC-SHA-256 with 600,000 or more iterations where PBKDF2 is used. AES-GCM format parameters are authenticated as additional data.
- Recovery limit: a forgotten passphrase cannot be recovered; no escrow or remote copy exists. Cross-profile file transfer and browser download/import acceptance remain manually unverified.
- Verdict: automated crypto/data-preservation checks and isolated UI verified; not released.

## Social Finder v0.6.6 — 2026-08-31 — Fingerprint memory bound

### Intent and scope

- Bound cached link and media fingerprint components to the same 2,048-character URL ceiling as extraction.
- Preserve 0.6.5 cache behavior and prevent hostile rendered attributes from inflating retained fingerprints.
- Rollback target: build-verified 0.6.3. Package, manifest, and lockfile target 0.6.6.
- Verification: 41 tests passed across 13 files; workspace lint/typecheck, production audit, and diff check passed.
- Build: Vite transformed 45 modules; emitted manifest version 0.6.6 verified.
- Performance evidence remains the immediately preceding isolated 0.6.5 run: cached GET 15.025 ms/call versus explicit RESCAN 160.085 ms/call across 200 calls, a 10.65x ratio. This patch changes only fingerprint bounds.
- Cache ceiling per live card: normalized text 6,000 characters, at most 100 link components and 48 media components capped at 2,048 characters each; weak keys permit detached cards to be collected.
- Authenticated large-result timing and long-session heap behavior remain unverified. Verdict: measured behavior retained with bounded fingerprints; not released.

## Social Finder v0.6.5 — 2026-08-31 — Superseded cache freshness candidate

### Intent and scope

- Preserve pre-cache freshness by bypassing the snapshot cache whenever an external page mutation is awaiting its debounced scan.
- Keep clean ordinary reads cached; explicit rescans and dirty reads still scan exactly once.
- Rollback target: build-verified 0.6.3. Package, manifest, and lockfile target 0.6.5.
- Root cause: `GET_SOCIAL_FINDINGS` ignored the cached snapshot and invoked the full DOM scan; each scan also repeated unchanged card extraction, and rendered badges scheduled a second debounced scan.
- Focused regression: 4 scan-cache tests passed, including clean/dirty GET behavior and a 200-card five-pass guard reducing extractor calls from the uncached 1,000 to 200.
- Full verification: 41 tests passed across 13 files; workspace lint/typecheck, production audit, and diff check passed.
- Build: Vite transformed 45 modules; emitted manifest version 0.6.5 verified.
- Isolated Brave runtime on the same logged-out Ad Library page, 200 calls each: clean cached GET 15.025 ms/call versus explicit RESCAN 160.085 ms/call, a 10.65x ratio. This includes extension-message overhead and is not authenticated-card performance.
- Memory bound: card entries use weak DOM keys, so detached page nodes are not retained by the cache.
- Authenticated large-result performance and long-session heap behavior remain unverified. Verdict: measured clean-read improvement with dirty-read freshness preserved; not released.

## Social Finder v0.6.4 — 2026-08-31 — Superseded scan-cache candidate

### Intent and scope

- Make the existing snapshot cache serve ordinary reads instead of rescanning the full rendered page.
- Cache unchanged card extraction by weak DOM identity and a bounded visible-content fingerprint; refresh on changed text, links, or media.
- Ignore Social Finder badge-only mutations so badge rendering cannot schedule a redundant scan.
- Preserve explicit rescan, visible-card collection, page-change reset, extraction bounds, and all user-facing behavior.
- Rollback target: build-verified 0.6.3. Version 0.6.4 passed 41 tests, lint, typecheck, production audit, diff, and build checks.
- Isolated 200-call measurement: clean GET 10.842 ms/call versus RESCAN 129.683 ms/call, an 11.96x ratio.
- Candidate superseded before release because GET needed to bypass cache while an external mutation was pending.

## Social Finder v0.6.3 — 2026-08-31 — Collect-visible regression coverage

### Intent and scope

- Extract the one-shot collect-visible boundary for focused regression testing without changing its UI contract.
- Prove exactly one rescan, immediate stop, no scroll/click side effects, and disabled guidance outside Ad Library.
- Rollback target: build-verified 0.6.2. Package, manifest, and lockfile target 0.6.3.
- Focused verification: `workspace.test.ts` passed 5 tests covering one rescan, immediate stop, no scroll/click, and disabled guidance.
- Separate Social Finder typecheck and lint commands passed.
- Full verification: 37 tests passed across 12 files; production audit and diff check passed.
- Build: Vite transformed 44 modules; emitted manifest version 0.6.3 verified.
- Isolated Brave screenshots passed at 420 and 320 CSS pixels with no horizontal overflow: `.gg/screenshots/social-finder-0.6.3-desktop.png` and `.gg/screenshots/social-finder-0.6.3-narrow.png`.
- Runtime DOM checks confirmed the button label, disabled state, title guidance, and no-scroll/no-click help at both widths.
- Authenticated enabled-state collection remains unverified. Verdict: focused behavior and visual states verified, not released.

## Social Finder v0.6.2 — 2026-08-31 — Collect visible ads shortcut

### Intent and scope

- Add a large **Collect visible ads** action inside Ad Library search.
- The action rescans once, collects only currently rendered Ad Library cards, stops immediately, and never scrolls or clicks.
- Rollback target: build-verified 0.6.1. Package, manifest, and lockfile target 0.6.2.
- Verification: 35 tests passed across 12 files; workspace lint/typecheck, production audit, and diff check passed.
- Build: Vite transformed 44 modules; emitted manifest version 0.6.2 verified.
- Authenticated visible-card acceptance remains unverified. Verdict: build verified, not released.

## Social Finder v0.6.1 — 2026-08-31 — Phase 4 narrow-width correction

### Intent and scope

- Correct horizontal overflow found by isolated Brave runtime at a 320 CSS-pixel viewport.
- Preserve all 0.6.0 behavior; rollback target remains build-verified 0.5.0 until this correction is verified.
- Target version: 0.6.1; package, manifest, and lockfile synchronized.

### Verification evidence

- `npm test --workspace @chrome-extensions/social-finder`: 35 tests passed across 12 files.
- Workspace lint/typecheck, production audit, and `git diff --check`: passed.
- `npm run build:social-finder`: passed; Vite transformed 44 modules.
- Emitted manifest: 0.6.1, exact Facebook content matches, approved `activeTab`/`downloads`/`sidePanel`/`storage` plus user-triggered screenshot host boundary, and unchanged CSP verified.
- Isolated Brave runtime: extension 0.6.1 loaded; public Nike Ad Library reached its logged-out state; no authenticated ad cards were available.
- 320 CSS-pixel runtime: document and body widths were 305 CSS pixels after scrollbar allocation with no horizontal overflow. Screenshot: `.gg/screenshots/social-finder-0.6.1-320px.png`.
- Chrome Web Store engineering review: current official Limited Use, permissions, data handling, and side-panel quality pages require disclosed single purpose, browsing data only for prominent user-facing functionality, and narrow permissions. Local-only rendered-card research aligns; `<all_urls>` requires prominent screenshot disclosure and store-review justification.
- Meta legal pages rejected automated retrieval in this environment. Distribution policy review remains unresolved and is not legal advice.
- Security review: hostile nested messages/storage/imports, URLs, screenshot replacement, permissions, XSS sinks, automation, hidden egress, and exports reviewed; no raw HTML, private request, or unattended browsing path remained.
- Quality review corrections: added ad type, Saved search, nested preference validation, 44-pixel repeated targets, merge feedback, and narrow-width correction.
- Authenticated Nike/Adidas, restart persistence, browser share/download, cross-site screenshot, 200% text, forced-colors, and representative screen-reader acceptance remain unverified.
- Rollback target: build-verified 0.5.0. Verdict: automated and isolated narrow runtime verified; not released.

## Social Finder v0.6.0 — 2026-08-31 — Superseded Phase 4 candidate

### Intent and scope

- Add local search ideas, evidence-only analysis prompts, preferences, validated own-format import, and final responsive/accessibility/state closure.
- No remote request, model call, telemetry, or prompt persistence beyond explicit preferences.
- Previous build-verified candidate: 0.5.0. Version 0.6.0 synchronized and built after 35 tests, lint, typecheck, production audit, diff, emitted-manifest, CSP, permissions, and exact-match checks passed.
- Isolated 320 CSS-pixel Brave runtime found horizontal overflow from the body minimum width. Candidate superseded by 0.6.1 without release.

## Social Finder v0.5.0 — 2026-08-31 — Pending Phase 3 candidate

### Intent and scope

- Add versioned local saved ads/preferences, safe JSON/CSV export, validated card actions, Saved view, retention controls, and destructive confirmation.
- Add only `storage` and `downloads`; screenshots and transient collection remain memory-only.
- Previous build-verified candidate: 0.4.0. Package, manifest, and lockfile target 0.5.0.
- Verification: 30 tests passed across 10 files; workspace lint/typecheck, production audit, and diff check passed.
- Build: Vite transformed 42 modules; emitted 0.5.0 includes `storage` and `downloads`, unchanged CSP, and exact Facebook matches.
- Chrome restart/action smoke remains unverified; verdict is build verified, not released.

## Social Finder v0.4.0 — 2026-08-31 — Pending Phase 2 candidate

### Intent and scope

- Add explicit bounded manual collection, stable deduplication, honest counts, deterministic filters/sorts, and query reset behavior.
- Collection never scrolls or clicks; default and absolute caps are 500 unique records.
- Previous build-verified candidate: 0.3.0. Package, manifest, and lockfile target 0.4.0.
- Verification: 26 tests passed across 8 files; workspace lint/typecheck, production audit, and diff check passed.
- Build: Vite transformed 40 modules; emitted version 0.4.0 and exact Facebook matches verified.
- Chrome authenticated manual-scroll smoke remains unverified; verdict is build verified, not released.

## Social Finder v0.3.0 — 2026-08-31 — Pending Phase 1 candidate

### Intent and scope

- Approved clean-room scope: extract bounded facts from rendered Meta Ad Library cards, keep Feed and Marketplace unchanged, scope updates to the active tab and query, add explicit public-search controls, and replace the result list with a compact research workspace.
- Data boundary: visible DOM facts only; no private API interception, automatic scrolling/clicking, remote service, copied selector, credential, identifier, asset, prompt, or style.
- Stored-data implications: none in Phase 1; records and screenshots remain memory-only.
- SemVer rationale: minor candidate adds a user-visible Ad Library record contract and search workflow.
- Target version: 0.3.0. Package, manifest, and lockfile synchronized.

### Verification evidence

- `npm test --workspace @chrome-extensions/social-finder`: 23 tests passed across 7 files.
- Workspace lint and typecheck: passed for all three workspaces.
- Production dependency audit: 0 vulnerabilities; `git diff --check`: passed.
- `npm run build:social-finder`: passed; Vite transformed 39 modules.
- Emitted manifest: version 0.3.0, exact Facebook content-script matches, unchanged CSP, and `activeTab`/`sidePanel` permissions verified.
- Chrome authenticated smoke: unverified in this automated environment; 0.2.4 remains the runtime rollback candidate.
- Verdict: build verified, not released.

### Recovery and stop conditions

- Rollback target: runtime-verified Social Finder 0.2.4; no data migration.
- Stop when visible facts cannot be extracted deterministically, permissions broaden, checks fail repeatedly, or authenticated acceptance is required.

## Social Finder v0.2.4 — 2026-08-31 — Source correction

### Intent and scope

- Expected outcome: unsupported rescans show Facebook-only guidance, new Ad Library searches replace stale side-panel results, and screenshots work after navigating to external ad destinations.
- Root causes: rescans messaged unsupported tabs; the detector observed only child-list mutations and the side panel received no push updates; persistent side panels lost temporary `activeTab` grants after cross-origin navigation.
- Exact fixes: validate tab eligibility, key scans by normalized Facebook URL/query, observe text mutations, poll SPA URL changes, push bounded snapshots to the side panel, and grant `<all_urls>` only for user-triggered visible-tab capture.
- Explicitly out of scope: non-Facebook content scripts, remote screenshot upload/storage, private APIs, new dependencies, or unrelated cleanup.
- SemVer rationale: patch correction for three connected real-Chrome workflow failures.

### Release identity

- Previous candidate: 0.2.3, Facebook detection verified; unsupported rescans, stale-query updates, and cross-site screenshot capture rejected.
- Package, source manifest, and lockfile target 0.2.4.
- Builder/owner: GG Coder on `feature/social-finder`; protected environments untouched.

### Pre-build evidence

- Intended diff: tab eligibility, query identity/reset, mutation and URL refresh, push updates, screenshot permission, regression tests, synchronized files, and release evidence.
- Permission decision: replace exact host permissions with `<all_urls>` for reliable user-triggered capture; content scripts remain exact-Facebook and no network/storage path is added.
- Dependency decision: unchanged.
- Version synchronization: package, source manifest, and lockfile comparison passed for 0.2.4.
- `npm test --workspace @chrome-extensions/social-finder`: 16 tests passed across 4 files.
- `npm run lint` and `npm run typecheck`: passed for all 3 workspaces.
- `git diff --check`: passed.
- Final security review: no confirmed findings; `<all_urls>` is confined to deliberate capture, content injection remains Facebook-only, and no egress/persistence path exists.
- Final quality review: runtime fixes passed; exact user-profile Chrome reload and full release checklist remain blockers, with integration-test coverage tracked as follow-up.

### Build and runtime evidence

- Production build: `npm run build:social-finder` passed; Vite transformed 36 modules and emitted version 0.2.4.
- Emitted manifest: `<all_urls>` host access verified; content-script matches remained exact Facebook hosts.
- Fresh-query runtime: Nike had 29 findings; navigating to Adidas produced 30 findings with a new first Library ID and only 1 overlapping ID.
- Push-update runtime: the open side panel automatically changed to 30 Adidas-query results and advertiser titles without reopening.
- Unsupported Nike runtime: initial load and **Rescan visible page** both showed `Ad rescanning works only on Meta Ad Library, Facebook Feed, or Marketplace.`; no raw receiver error appeared.
- Cross-site screenshot runtime: Nike capture succeeded without a permission error, produced a 735,654-character PNG data URL, and rendered the in-memory preview/download.
- Screenshot evidence: `.gg/screenshots/social-finder-0.2.4-fresh-adidas-query-brave.png` and `.gg/screenshots/social-finder-0.2.4-unsupported-nike-capture-brave.png`.
- Existing Library-ID classification, no-egress behavior, and clear/close memory ownership remain unchanged.

### Verdict

**Build and automated runtime verified; not released.** Fresh searches, unsupported rescans, push updates, and cross-site screenshots passed; user-profile Chrome reload remains.

### Recovery and prevention

- Rollback target: unload 0.2.4 and return to 0.2.3; no persisted data exists.
- Permanent guardrails: never message unsupported tabs; query changes clear stale state before delayed rescanning; all-tab access is used only for deliberate visible-tab capture and never for content injection or egress.

## Social Finder v0.2.3 — 2026-08-31 — Source correction

### Intent and scope

- Expected outcome: preserve v0.2.2 Ad Library behavior and make **Take screen snapshot** work from the real Chrome side panel.
- Root cause: declarative `openPanelOnActionClick` opened the panel without retaining the temporary `activeTab` grant required by `captureVisibleTab`; Chrome returned `Either the '<all_urls>' or 'activeTab' permission is required.`
- Exact fix: disable declarative action opening and open the side panel inside `chrome.action.onClicked`, where the toolbar click grants `activeTab` to that tab.
- Explicitly out of scope: broad `<all_urls>` permission, new features, dependencies, private APIs, or unrelated cleanup.
- SemVer rationale: patch correction after user-profile Chrome acceptance exposed the capture permission failure.

### Release identity

- Previous candidate: 0.2.2, Ad Library verified but screenshot capture runtime rejected.
- Package, source manifest, and lockfile target 0.2.3.
- Builder/owner: GG Coder on `feature/social-finder`; protected environments untouched.

### Pre-build evidence

- Intended diff: one background action-flow correction plus synchronized version and release files.
- Permission/dependency decision: unchanged; keep exact Facebook hosts, `activeTab`, and `sidePanel`; add nothing.
- Version synchronization: package, source manifest, and lockfile comparison passed for 0.2.3.
- `npm test --workspace @chrome-extensions/social-finder`: 12 tests passed across 3 files.
- `npm run lint` and `npm run typecheck`: passed for all 3 workspaces.
- `git diff --check`: passed.

### Build and runtime evidence

- Production build: `npm run build:social-finder` passed; Vite transformed 35 modules and emitted version 0.2.3.
- Emitted manifest: version 0.2.3 verified with background, side-panel, popup, and content assets.
- User-profile Chrome rerun: Facebook snapshot preview appeared after extension reload and toolbar click (user-confirmed).
- External-navigation evidence: opening a Nike destination revoked Chrome's temporary `activeTab` grant, so capture correctly failed closed until the user clicks Social Finder's toolbar icon again on that page.
- Existing Ad Library detection evidence remains valid because detector code is unchanged.

### Verdict

**Build and Facebook snapshot preview verified; not released.** External destinations intentionally require a fresh toolbar click; drag/download and remaining release smoke are pending.

### Recovery and prevention

- Rollback target: unload 0.2.3 and return to 0.2.2; no persisted data exists.
- Permanent guardrail: screenshot capture keeps least privilege; never replace the toolbar grant with `<all_urls>`.

## Social Finder v0.2.2 — 2026-08-31 — Runtime-rejected capture candidate

### Intent and scope

- Expected outcome: preserve live Ad Library detection while showing the advertiser name instead of the generic “Sponsored” label in side-panel result titles.
- Root cause: generic heading extraction selected Meta's repeated placement label before the advertiser name.
- Exact fix: derive the advertiser from the bounded visible `See ad details … Sponsored` segment and strip zero-width formatting characters during normalization.
- Explicitly out of scope: any additional parity feature, private API, automation, or unrelated cleanup.
- SemVer rationale: patch correction after 0.2.1 runtime acceptance exposed weak result titles.

### Release identity

- Previous candidate: 0.2.1, live Ad Library detection verified but title quality rejected.
- Package, source manifest, and lockfile target 0.2.2.
- Builder/owner: GG Coder on `feature/social-finder`; protected environments untouched.

### Pre-build evidence

- Intended diff: one pure extraction correction, its fixture assertion, synchronized version files, and release evidence.
- Dependency/permission decision: unchanged.
- Version synchronization: package, source manifest, and lockfile comparison passed for 0.2.2.
- `npm test --workspace @chrome-extensions/social-finder`: 12 tests passed across 3 files.
- `npm run lint` and `npm run typecheck`: passed for all 3 workspaces.
- `npm audit --omit=dev --workspace @chrome-extensions/social-finder`: 0 vulnerabilities.
- `git diff --check`: passed.
- Final security review: no confirmed findings across DOM trust boundaries, messaging, links, capture, drag/download, permissions, egress, and dependency scope.
- Final quality review: deterministic gates and focused Ad Library objective passed; authenticated Feed, toolbar-granted capture, navigation/reset, accessibility, unsupported-page, and final-candidate network smoke remain pre-release checks.

### Build and runtime evidence

- Production build: `npm run build:social-finder` passed; Vite transformed 35 modules and emitted version 0.2.2.
- Live Nike Ad Library: 29 visible Library IDs produced 29 badges and 29 unique findings.
- Diagnostics: 30 candidates, 1 rejected candidate, 29 detected, 0 render failures, 0 extension-text pollution, and no observed runtime exception.
- Advertiser correction: sampled titles resolved to `Nike`, `Flipkart`, `Nike`, `Nike`, and `Nike`; canonical Library-ID links matched.
- Side panel: rendered all 29 live findings with matching total, advertiser titles, result links, no alert, and the screenshot action present.
- Screenshot evidence: `.gg/screenshots/social-finder-0.2.2-ad-library-brave.png` and `.gg/screenshots/social-finder-0.2.2-ad-library-side-panel-brave.png`.
- Marketplace and snapshot capture/drag/clear behavior were previously runtime verified; their built popup bundle remained unchanged.
- Authenticated Facebook Feed detection and the exact toolbar-granted `activeTab` capture path still require the user's loaded profile.

### Verdict

**Ad Library verified; screenshot capture runtime rejected; never release 0.2.2.** Real Chrome showed the action-opened panel lacked the temporary `activeTab` grant.

### Recovery and prevention

- Rollback target: unload 0.2.2 and return to 0.2.1; no persisted data exists.
- Permanent guardrail: Ad Library fixture coverage asserts both authoritative ID and advertiser title.

## Social Finder v0.2.1 — 2026-08-31 — Runtime-rejected title candidate

### Intent and scope

- Expected outcome: detect visible Meta Ad Library cards by authoritative numeric Library ID, badge them, and list canonical detail links in the side panel.
- User direction: Facebook Ads and Copycat-visible workflows are primary; Marketplace is secondary.
- Exact implementation: add the Ad Library route, bounded visible-text candidate discovery, Library-ID classification/deduplication, labels, tests, and screenshot-backed parity priorities.
- Explicitly out of scope: private GraphQL interception, React Fiber reads, copied Copycat code/assets, unattended auto-scroll, media download, remote services, and later parity rows.
- Primary risks: localized Library-ID labels, nested cards containing multiple IDs, Meta DOM drift, and false card boundaries.
- Stored-data implications: unchanged; findings and one optional screenshot remain memory-only.
- SemVer rationale: patch because 0.2.0 was built before the user narrowed initial product focus to Meta Ad Library.

### Release identity

- Previous candidate: 0.2.0, side-panel screenshot runtime verified under the capture harness.
- Package, source manifest, and lockfile target 0.2.1.
- Builder/owner: GG Coder on `feature/social-finder`.
- Protected environments: untouched.

### Pre-build evidence

- Intended diff: one Ad Library adapter path, detector and route tests, parity/docs updates, and synchronized release files.
- Dependency/permission decision: no new package or permission.
- Version synchronization: package, source manifest, and lockfile comparison passed for 0.2.1.
- `npm test --workspace @chrome-extensions/social-finder`: 12 tests passed across 3 files.
- `npm run lint` and `npm run typecheck`: passed for all 3 workspaces.
- `npm audit --omit=dev --workspace @chrome-extensions/social-finder`: 0 vulnerabilities.
- `git diff --check`: passed.

### Build and runtime evidence

- Production build: `npm run build:social-finder` passed; Vite transformed 35 modules and emitted version 0.2.1.
- Live Meta Ad Library: Nike search loaded over 50,000 results without an authenticated profile; 29 visible cards were badged.
- Content snapshot: 30 candidates, 29 unique findings, 1 rejected candidate, 0 render failures, and 0 extension-text pollution.
- Identity evidence: all 29 findings used unique visible Library IDs and canonical `?id=<library-id>` links.
- Runtime title rejection: sampled findings used generic `Sponsored` titles instead of Nike/Flipkart advertiser names.
- Screenshot evidence: `.gg/screenshots/social-finder-0.2.1-ad-library-brave.png`.
- Existing Marketplace and side-panel capture behavior remained unchanged by the Ad Library adapter.

### Verdict

**Detection verified; title quality rejected; never release 0.2.1.** Ad Library identification worked, but side-panel titles were not useful enough.

### Recovery and prevention

- Rollback target: unload 0.2.1 and return to 0.2.0; no persisted data or migration exists.
- Permanent guardrail: an Ad Library finding requires an explicit visible numeric Library ID and fails closed otherwise.

## Social Finder v0.2.0 — 2026-08-31 — Runtime-verified candidate

### Intent and scope

- Expected outcome: replace the transient popup with a persistent action-opened side panel, capture the active Facebook viewport on a deliberate click, and expose a draggable/downloadable PNG for GG Coder handoff.
- Copycat direction: persist a clean-room parity matrix covering every code-observed capability and mark authenticated interaction details that require screenshots.
- Explicitly out of scope: remote screenshot sending/storage, copied Copycat code/assets/branding/backend behavior, private Facebook APIs, unattended automation, authentication, billing, and implementation of later parity rows.
- Primary risks: capturing personal screen content without clear intent, oversized data URLs, stale in-memory screenshots, incorrect active-tab selection, broken drag payloads, and added host-permission drift.
- Stored-data implications: one bounded PNG data URL exists only in side-panel memory until replaced, cleared, or closed.
- SemVer rationale: minor bump for a new persistent workspace and screenshot handoff capability.

### Release identity

- Previous candidate: 0.1.1, Marketplace runtime verified but Feed-auth blocked.
- Package, source manifest, and lockfile target 0.2.0.
- Builder/owner: GG Coder on `feature/social-finder`.
- Protected environments: untouched; local source and isolated Chromium only.

### Pre-build evidence

- Intended diff: side-panel manifest/background wiring, screenshot capture/validation/drag UI, tests, clean-room parity map, docs, and synchronized release files.
- Permission decision: add only exact Facebook host access and `sidePanel`; retain `activeTab`; add no `tabs`, downloads, clipboard, storage, or network permission.
- Dependency decision: no new package.
- Version synchronization: package, source manifest, and lockfile comparison passed for 0.2.0.
- `npm test --workspace @chrome-extensions/social-finder`: 11 tests passed across 3 files.
- `npm run lint` and `npm run typecheck`: passed for all 3 workspaces.
- `npm audit --omit=dev --workspace @chrome-extensions/social-finder`: 0 vulnerabilities.
- `git diff --check`: passed.

### Build and runtime evidence

- Production build: `npm run build:social-finder` passed; Vite transformed 35 modules and emitted version 0.2.0.
- Side-panel behavior: `chrome.sidePanel.getPanelBehavior()` returned `openPanelOnActionClick: true`.
- Marketplace regression: 18 live findings rendered with 18 candidates, 0 rejected, and 0 render failures.
- Shipping-permission automation limit: headless/programmatic extension pages do not receive the toolbar action's temporary `activeTab` grant.
- Capture harness: an isolated runtime-only manifest copy added `<all_urls>` solely to exercise the same built capture code; shipping source retained exact Facebook hosts plus `activeTab`.
- Screenshot capture: produced a validated 2400×1466 PNG data URL (2,283,126 characters), rendered its preview, and exposed a download.
- Drag handoff: emitted `DownloadURL` and `text/uri-list` payloads with a timestamped PNG filename.
- Clear action: removed the in-memory snapshot; no alert or runtime exception was observed.
- Screenshot evidence: `.gg/screenshots/social-finder-0.2.0-side-panel-snapshot-brave.png`.
- Feed detection acceptance remains blocked by authentication until the side-panel handoff runs from the user's profile.

### Verdict

**Runtime verified; superseded by 0.2.1 before release.** Detection, side-panel rendering, capture, drag/download payload, and clear behavior worked; the exact toolbar-granted `activeTab` path remains for user-profile smoke.

### Recovery and prevention

- Rollback target: unload 0.2.0 and return to the 0.1.1 source candidate; no persisted screenshots or migrations exist.
- Permanent guardrails: user gesture before capture, exact Facebook hosts, PNG type/size validation, one in-memory image, explicit clear, no upload path, and parity work one version at a time.

## Social Finder v0.1.1 — 2026-08-31 — Source correction

### Intent and scope

- Expected outcome: preserve v0.1.0 detection while excluding extension-owned badge text from subsequent extraction snapshots.
- Root cause: observer-driven rescans read the prepended Social Finder badge through `innerText`, contaminating Marketplace titles and snippets.
- Exact fix: ignore badge elements during label collection and remove badge text before title/snippet normalization.
- Explicitly out of scope: Copycat feature parity, screenshot capture, drag-and-drop, persistence, private APIs, other apps, and unrelated cleanup.
- SemVer rationale: patch correction after v0.1.0 runtime acceptance exposed polluted extracted text.

### Release identity

- Previous candidate: 0.1.0, runtime rejected.
- Package, source manifest, and lockfile target 0.1.1.
- Builder/owner: GG Coder on `feature/social-finder`.
- Protected environments: untouched; isolated Brave profile only.

### Pre-build evidence

- Intended diff reviewed: one extraction correction, synchronized Social Finder release files, and `.gg/runtime/` ignore coverage for isolated browser profiles.
- Dependency decision: no new package.
- Version synchronization: package, source manifest, and lockfile comparison passed for 0.1.1.
- `npm test --workspace @chrome-extensions/social-finder`: 8 tests passed across 2 files.
- `npm run lint` and `npm run typecheck`: passed for all 3 workspaces.
- `git diff --check`: passed.

### Build and runtime evidence

- Production build: `npm run build:social-finder` passed; Vite transformed 33 modules.
- Emitted manifest: version 0.1.1 verified with popup and content-script JS/CSS assets present.
- Automated runtime: Brave 145 loaded the unpacked extension from `apps/social-finder/dist`; branded Google Chrome 151 rejected command-line extension loading.
- Marketplace page: 20 visible item cards produced 20 badges; content snapshot reported 20 candidates, 20 findings, 0 rejected, and 0 render failures.
- Correction acceptance: all 20 titles/snippets excluded Social Finder badge text; two sampled canonical URLs and IDs matched their cards.
- Popup harness: rendered all 20 live findings, matched the content count, exposed result links, and reported no alert or observed runtime exception.
- Screenshot evidence: `.gg/screenshots/social-finder-0.1.1-marketplace-brave.png` and `.gg/screenshots/social-finder-0.1.1-popup-marketplace-brave.png`.
- Facebook Feed acceptance: blocked by Facebook authentication in the isolated browser profile; the login-only screenshot is `.gg/screenshots/social-finder-facebook-feed.png`.

### Verdict

**Marketplace runtime verified; not released.** The v0.1.0 extraction defect is corrected. Authenticated Facebook Feed sponsored-post acceptance remains blocked.

### Recovery and prevention

- Rollback target: remove the unpacked 0.1.1 build and return to source before this candidate; no stored data requires migration.
- Permanent guardrail: extension-owned UI must never become detector input.

## Social Finder v0.1.0 — 2026-08-31 — Runtime-rejected candidate

### Intent and scope

- Expected outcome: badge visible sponsored Facebook Feed posts, Marketplace listings, and visibly promoted Marketplace listings; show bounded current-page results and diagnostics in the popup.
- Explicitly out of scope: private Facebook APIs, request interception, React internals, automated scrolling/clicking, remote upload, persistence, media download, Ads Library, other social networks, and other repository apps.
- Primary risks: Facebook DOM and localization drift, false paid-placement labels, duplicate Marketplace anchors, content-script mutation cost, broad data collection, and version drift.
- Stored-data implications: none; v0.1.0 keeps findings in content-script memory and clears them on navigation or refresh.
- SemVer rationale: initial application version 0.1.0.

### Release identity

- Previous version: none.
- Package, source manifest, and lockfile target 0.1.0.
- Builder/owner: GG Coder on `feature/social-finder`.
- Protected environments: untouched; local repository and unpacked Chrome candidate only.

### Pre-build evidence

- Intended diff reviewed: Social Finder app, root workspace scripts, lock metadata, and this release record only.
- Dependency decision: no new package; reuse the repository's pinned React, Vite, TypeScript, Vitest, ESLint, and CRXJS toolchain.
- Version synchronization: `node -e` package/manifest/lock comparison passed for 0.1.0.
- Tests: `npm test --workspace @chrome-extensions/social-finder` passed, 8 tests across 2 files.
- Repository lint: `npm run lint` passed for all 3 workspaces.
- Repository typecheck: `npm run typecheck` passed for all 3 workspaces.
- `git diff --check`: passed.
- Production dependency audit: `npm audit --omit=dev --workspace @chrome-extensions/social-finder` passed with 0 vulnerabilities.
- Security review: no confirmed findings; runtime Facebook behavior and Chrome errors remain unchecked.
- Quality review: conditional pass; real DOM acceptance and browser-level integration coverage remain pending.

### Build and Chrome evidence

- Production build: `npm run build:social-finder` passed; Vite transformed 33 modules.
- Built manifest verification: `apps/social-finder/dist/manifest.json` matches source version 0.1.0.
- Required popup and content-script assets: verified in `dist` (popup HTML/JS/CSS and content JS/CSS).
- Automated Google Chrome 151 acceptance: blocked because branded Chrome no longer honors command-line unpacked-extension loading.
- Automated Brave 145 Marketplace smoke: extension loaded; content script activated; 20 visible listings were badged with zero observed runtime errors.
- Popup harness smoke: content-script message returned 18 current listings with 18 candidates, 0 rejected, and 0 render failures; popup rendered all 18.
- Runtime rejection: observer rescans included extension-owned badge text in every Marketplace title/snippet.
- Facebook Feed smoke: blocked by Facebook authentication in the isolated profile; only the login page was reachable.
- Screenshots: `.gg/screenshots/social-finder-facebook-feed.png`, `.gg/screenshots/social-finder-marketplace-badges-brave.png`, and `.gg/screenshots/social-finder-popup-marketplace-brave.png`.

### Verdict

**Runtime rejected; never release or rebuild 0.1.0.** Marketplace detection worked, but extracted result text was polluted by extension-owned badges; authenticated Feed acceptance was unavailable.

### Recovery and prevention

- Rollback target: remove the unpacked Social Finder extension and discard `feature/social-finder`; no stored data requires migration.
- Permanent guardrails: strict Facebook URL parsing, bounded scans, exact paid-label evidence, no private request interception, no remote data path, fixture tests, and the app control model.

## LinkedIn Job Finder v0.1.11 — 2026-08-29 — Source candidate

### Intent and scope

- Expected outcome: discover visible split-pane list cards outside LinkedIn's `<main>` element while refusing recommendation-page navigation.
- Require a readable current detail-pane job before collecting document-wide `/jobs/view/` and `currentJobId` anchors.
- Preserve the 10-job cap, sequential scanning, restoration, no “Show all,” no auto-save, narrow permissions, and untouched Dev Toolz.
- Primary risks: LinkedIn SPA timing and unrelated job anchors on supported split-pane pages.
- SemVer rationale: forward patch because Chrome showed five visible cards while 0.1.10 discovered only the detail-title anchor.

### Release identity

- Previous candidate: 0.1.10, build verified but runtime rejected for incomplete card discovery.
- Package, source manifest, and lockfile target 0.1.11.
- `npm test --workspace @chrome-extensions/linkedin-job-finder` passed: 21 tests across 5 files.
- `npm run lint` and `npm run typecheck` passed for both workspaces.
- Version synchronization and `git diff --check` passed.
- `npm run build:linkedin-job-finder` passed: 43 modules transformed.
- `apps/linkedin-job-finder/dist/manifest.json` matches source version 0.1.11.

### Verdict

**Build verified; runtime pending.** Reload the exact 0.1.11 build and rescan the same split-pane results.

## LinkedIn Job Finder v0.1.10 — 2026-08-29 — Runtime-rejected candidate

### Intent and scope

- Expected outcome: explain that recommendation pages cannot support safe same-pane scanning and direct users to LinkedIn search results.
- Preserve the bounded search-results scanner; do not navigate away, click “Show all,” broaden permissions, or touch Dev Toolz.
- Primary risk: users may mistake rendered recommendation links for supported split-pane results.
- SemVer rationale: forward patch because 0.1.9 was built before final review rejected its unsafe selector broadening.

### Release identity

- Previous usable candidate: 0.1.8, build verified; runtime acceptance remains pending on a supported search-results page.
- Package, source manifest, and lockfile target 0.1.10.
- `npm test --workspace @chrome-extensions/linkedin-job-finder` passed: 21 tests across 5 files.
- `npm run typecheck --workspace @chrome-extensions/linkedin-job-finder` passed.
- `npm run lint` and `npm run typecheck` passed for both workspaces.
- Package, source manifest, and lockfile synchronization passed for 0.1.10.
- `git diff --check` passed.
- `npm run build:linkedin-job-finder` passed: 43 modules transformed.
- `apps/linkedin-job-finder/dist/manifest.json` matches source version 0.1.10.
- Built popup contains the supported-page guidance.
- Chrome partial smoke passed: 0.1.10 popup opened and displayed the supported-page guidance for a recommendation page with zero scanned cards.
- Chrome split-pane smoke discovered one visible card and reported `0 eligible of 1 scanned`.
- Chrome confirmed `0 could not be read`; the discovered card was extracted and evaluated successfully.
- LinkedIn reported 88 total results, which are intentionally outside the bounded visible-card scope.
- Chrome screenshot showed five visible list cards, confirming incomplete discovery.
- Source commit: `9aaca93` (`Update LinkedIn scan guidance`).

### Verdict

**Runtime rejected.** The exact build read its single discovered anchor, but missed four visible list cards outside `<main>`.

## LinkedIn Job Finder v0.1.9 — 2026-08-29 — Superseded build candidate

### Verdict

**Superseded before runtime.** A broad document-wide card selector was built, then rejected because recommendation-card clicks can navigate away and terminate the same-pane scan. Never load or rebuild 0.1.9.

## LinkedIn Job Finder v0.1.8 — 2026-08-29 — Build-verified candidate

### Intent and scope

- Expected outcome: keep the in-page panel and popup snapshot synchronized after visible-card scanning and restoration.
- Suppress observer-driven intermediate renders during scanning, then force one render after the final selection settles.
- Explicitly out of scope: hidden-result crawling, “Show all,” auto-saving, permissions, storage schema, and Dev Toolz.
- Primary risks: LinkedIn SPA timing, failed restoration, stale snapshots, and concurrent scan requests.
- SemVer rationale: forward patch because final review found stale current-job state after the 0.1.7 build.

### Release identity

- Previous candidate: 0.1.7, build verified but not runtime tested.
- Implementation commit: `9ea1ffc` (`feat(linkedin): scan visible jobs`).
- Package, source manifest, and lockfile target 0.1.8.
- Built extension targets 0.1.8.
- `npm test --workspace @chrome-extensions/linkedin-job-finder` passed: 21 tests across 5 files.
- `npm run lint` passed for both workspaces.
- `npm run typecheck` passed for both workspaces.
- Package, source manifest, and lockfile synchronization check passed for 0.1.8.
- `git diff --check` passed.
- `npm run build:linkedin-job-finder` passed: 43 modules transformed.
- `apps/linkedin-job-finder/dist/manifest.json` matches source version 0.1.8.
- Popup, saved-jobs page, service worker, content-script loader, icons, and production assets exist.
- Evidence level: build verified; runtime acceptance pending.

### Verdict

**Build verified; runtime pending.** Reload only the exact 0.1.8 build for Chrome acceptance.

## LinkedIn Job Finder v0.1.7 — 2026-08-29 — Superseded build candidate

### Intent and scope

- Expected outcome: scan up to 10 currently rendered LinkedIn job cards without clicking “Show all,” then return ephemeral eligible matches.
- The scan is user-triggered, sequential, same-pane, visible-card-only, bounded by timeout, restores the original selection when possible, and never auto-saves.
- SemVer rationale: forward patch because this is a backward-compatible user-requested capability after the 0.1.6 build.

### Release identity

- Previous candidate: 0.1.6, build verified but not runtime tested.
- Source state: uncommitted working tree based on `f7fc862`.
- Package, source manifest, and lockfile target 0.1.7.
- Tag, archive, checksum, and source commit: pending.
- Evidence level: build verified.

### Pre-build evidence

- Visible-link collection regression failed before implementation and passed afterward: 6 extraction tests.
- Runtime request and bounded scan-result guards are covered by 3 message tests.
- `npm test --workspace @chrome-extensions/linkedin-job-finder` passed: 21 tests across 5 files.
- `npm run lint` and `npm run typecheck` passed without modifying Dev Toolz.
- Package, source manifest, and lockfile synchronization check passed for 0.1.7.
- `git diff --check` passed.
- `npm run build:linkedin-job-finder` passed: 43 modules transformed.
- `apps/linkedin-job-finder/dist/manifest.json` matches source version 0.1.7.
- Popup fixture rendered at 380px with the scan control, saved-rules warning, and existing primary actions visible.
- Chrome runtime acceptance: pending.

### Verdict

**Superseded before runtime acceptance.** Final review found stale current-job state after scanning, moving the forward candidate to 0.1.8.

## LinkedIn Job Finder v0.1.6 — 2026-08-29 — Superseded build candidate

### Intent and scope

- Expected outcome: cover common “eligible to obtain” requirements while preserving explicit “No TS/SCI required” exclusions.
- SemVer rationale: forward patch because final review found two bounded clearance-language gaps after the 0.1.5 build.

### Release identity

- Previous candidate: 0.1.5, build verified but not runtime tested.
- Source state: uncommitted working tree based on `f7fc862`.
- Package, source manifest, and lockfile target 0.1.6.
- Tag, archive, checksum, and source commit: pending.
- Evidence level: build verified.

### Pre-build evidence

- Focused clearance-language regressions failed before implementation and passed afterward: 6 matcher tests.
- `npm test --workspace @chrome-extensions/linkedin-job-finder` passed: 19 tests across 5 files.
- `npm run lint` and `npm run typecheck` passed without modifying Dev Toolz.
- Package, source manifest, and lockfile synchronization check passed for 0.1.6.
- `git diff --check` passed.
- `npm run build:linkedin-job-finder` passed: 43 modules transformed.
- `apps/linkedin-job-finder/dist/manifest.json` matches source version 0.1.6.
- Chrome runtime acceptance: pending.

### Verdict

**Superseded before runtime acceptance.** The requested visible-listing scan moved the forward candidate to 0.1.7.

## LinkedIn Job Finder v0.1.5 — 2026-08-29 — Superseded build candidate

### Intent and scope

- Expected outcome: exclude any job requiring a security clearance, whether already active or obtainable after hiring.
- Detect active/current clearances plus requirements to obtain, maintain, hold, or qualify for one; continue allowing explicit “no clearance required” language.
- SemVer rationale: forward patch because the user broadened the filter after the 0.1.4 build.

### Release identity

- Previous candidate: 0.1.4, build verified but not runtime tested.
- Source state: uncommitted working tree based on `f7fc862`.
- Package, source manifest, and lockfile target 0.1.5.
- Tag, archive, checksum, and source commit: pending.
- Evidence level: build verified.

### Pre-build evidence

- Focused future-clearance regression failed before implementation and passed afterward: 6 matcher tests.
- Settings migration from the 0.1.4 checkbox is covered by normalization tests.
- `npm test --workspace @chrome-extensions/linkedin-job-finder` passed: 19 tests across 5 files.
- `npm run lint` and `npm run typecheck` passed without modifying Dev Toolz.
- Package, source manifest, and lockfile synchronization check passed for 0.1.5.
- `git diff --check` passed.
- `npm run build:linkedin-job-finder` passed: 43 modules transformed.
- `apps/linkedin-job-finder/dist/manifest.json` matches source version 0.1.5.
- Chrome runtime acceptance: pending.

### Verdict

**Superseded before runtime acceptance.** Final review found two common clearance-language gaps, moving the forward candidate to 0.1.6.

## LinkedIn Job Finder v0.1.4 — 2026-08-29 — Superseded build candidate

### Intent and scope

- Expected outcome: let users exclude jobs requiring an active security clearance without maintaining fragile phrase lists.
- Add one explicit popup checkbox backed by bounded, constant clearance-requirement patterns; do not reject “no clearance required” or “ability to obtain” language alone.
- SemVer rationale: forward patch because this backward-compatible filter was requested after 0.1.3 runtime acceptance.

### Release identity

- Previous candidate: 0.1.3, runtime verified but not committed.
- Source state: uncommitted working tree based on `f7fc862`.
- Package, source manifest, and lockfile target 0.1.4.
- Tag, archive, checksum, and source commit: pending.
- Evidence level: build verified.

### Pre-build evidence

- Focused clearance regression failed before implementation and passed afterward: 6 matcher tests.
- `npm test --workspace @chrome-extensions/linkedin-job-finder` passed: 19 tests across 5 files.
- `npm run lint` and `npm run typecheck` passed without modifying Dev Toolz.
- Package, source manifest, and lockfile synchronization check passed for 0.1.4.
- `git diff --check` passed.
- `npm run build:linkedin-job-finder` passed: 43 modules transformed.
- `apps/linkedin-job-finder/dist/manifest.json` matches source version 0.1.4.
- Chrome runtime acceptance: pending.

### Verdict

**Superseded before runtime acceptance.** The user clarified that future-clearance requirements must also be excluded, moving the forward candidate to 0.1.5.

## LinkedIn Job Finder v0.1.3 — 2026-08-29 — Superseded runtime-verified candidate

### Intent and scope

- Expected outcome: extract the active SDUI job title from its confirmed `/jobs/view/<id>/` anchor so matching can start.
- Use the validated numeric current job ID to avoid selecting another result's title.
- SemVer rationale: forward patch because built candidate 0.1.2 still failed runtime extraction.

### Release identity

- Previous candidate: 0.1.2, build verified but runtime rejected.
- Source state: uncommitted working tree based on `f7fc862`.
- Package, source manifest, and lockfile target 0.1.3.
- Tag, archive, checksum, and source commit: pending.
- Evidence level: runtime verified.

### Pre-build evidence

- User-provided DevTools evidence confirmed the current title is an anchor whose `href` contains `/jobs/view/<currentJobId>/`.
- Focused title regression failed before the fix and passed after it: 5 tests.
- `npm test --workspace @chrome-extensions/linkedin-job-finder` passed: 17 tests across 5 files.
- `npm run lint` and `npm run typecheck` passed without modifying Dev Toolz.
- Package, source manifest, and lockfile synchronization check passed for 0.1.3.
- `git diff --check` passed.
- `npm run build:linkedin-job-finder` passed: 43 modules transformed.
- `apps/linkedin-job-finder/dist/manifest.json` matches source version 0.1.3.
- Chrome runtime acceptance passed: the panel displayed `SIEM Engineer`, eligible status, 2 of 2 positive keywords, matched `splunk` and `cybersecurity`, no missing or excluded terms, and an enabled save action.

### Verdict

**Superseded after runtime acceptance.** The title and description fix passed, then the requested clearance filter moved the forward candidate to 0.1.4.

### Release closeout

- Outcome: runtime verified candidate.
- What worked: popup availability, SDUI title extraction, SDUI description extraction, keyword matching, evidence display, and save-action availability.
- What failed: 0.1.1 missed the SDUI description; 0.1.2 missed the SDUI anchor title; both were superseded before release.
- Detection method: user-provided LinkedIn runtime output plus focused selector regressions.
- Rollback target: committed 0.1.0 source at `f7fc862`; forward candidate 0.1.3 is preferred.
- Permanent guardrail: inspect active LinkedIn SDUI markup before adding selectors, and require a forward patch after every built runtime failure.

## LinkedIn Job Finder v0.1.2 — 2026-08-29 — Superseded build candidate

### Intent and scope

- Expected outcome: extract the visible job description from LinkedIn's confirmed SDUI `aboutTheJob` component.
- Replace speculative broad fallbacks with the exact inspected component selector while preserving legacy selectors.
- SemVer rationale: forward patch because built candidate 0.1.1 failed runtime extraction.

### Release identity

- Previous candidate: 0.1.1, build verified but runtime rejected.
- Source state: uncommitted working tree based on `f7fc862`.
- Package, source manifest, and lockfile target 0.1.2.
- Tag, archive, checksum, and source commit: pending.
- Evidence level: build verified.

### Pre-build evidence

- User-provided DevTools evidence confirmed `data-sdui-component="com.linkedin.sdui.generated.jobseeker.dsl.impl.aboutTheJob"` contains the job description.
- Focused selector regression failed before the fix and passed after it: 5 tests.
- `npm test --workspace @chrome-extensions/linkedin-job-finder` passed: 17 tests across 5 files.
- `npm run lint` and `npm run typecheck` passed without modifying Dev Toolz.
- Package, source manifest, and lockfile synchronization check passed for 0.1.2.
- `git diff --check` passed.
- `npm run build:linkedin-job-finder` passed: 43 modules transformed.
- `apps/linkedin-job-finder/dist/manifest.json` matches source version 0.1.2.
- Chrome runtime acceptance for 0.1.2 failed: the confirmed description selector matched, but the panel remained at “Reading the open job…” because the SDUI title is not a heading.

### Verdict

**Superseded after runtime failure.** LinkedIn's active SDUI title is a job-link anchor absent from 0.1.2.

## LinkedIn Job Finder v0.1.1 — 2026-08-29 — Superseded build candidate

### Intent and scope

- Expected outcome: extract descriptions from LinkedIn's current job-detail container so the in-page panel advances beyond “Reading the open job…”.
- Added a focused selector regression without changing permissions, storage, matching rules, or saved-job behavior.
- SemVer rationale: patch release for backward-compatible LinkedIn DOM compatibility.

### Release identity

- Previous version: 0.1.0 at source commit `f7fc862`.
- Source state: uncommitted working tree based on `f7fc862`.
- Package, source manifest, and lockfile target 0.1.1.
- Tag, archive, checksum, and source commit: pending.
- Evidence level: build verified.

### Pre-build evidence

- User confirmed the 0.1.0 panel injected on LinkedIn, but it remained at “Reading the open job…”.
- A regression test reproduced the missing `.jobs-description-content__text` selector and passed after the fix.
- `npm test --workspace @chrome-extensions/linkedin-job-finder` passed: 17 tests across 5 files.
- `npm run lint` passed for Dev Toolz 1.8.7 and LinkedIn Job Finder 0.1.1.
- `npm run typecheck` passed for Dev Toolz 1.8.7 and LinkedIn Job Finder 0.1.1.
- Package, source manifest, and lockfile synchronization check passed for 0.1.1.
- `git diff --check` passed.
- `npm run build:linkedin-job-finder` passed: 43 modules transformed.
- `apps/linkedin-job-finder/dist/manifest.json` matches source version 0.1.1.
- Chrome runtime acceptance for 0.1.1 failed: panel injected, but remained at “Reading the open job…” after the description was visible.

### Verdict

**Superseded after runtime failure.** LinkedIn's active SDUI markup uses an `aboutTheJob` data component absent from 0.1.1.

## Dev Toolz v1.8.7 — 2026-08-28 — Released

### Intent and scope

- Expected outcome: retain structural Red/Purple candidate matching while showing the complete original Purple flow in its existing order and format.
- Candidate additions use one inspected-origin lookup, append only after review, reject duplicates, and bound all supported request-body representations.
- Explicitly out of scope: automatic flow mutation, fuzzy semantic matching, IndexedDB schema, capture formats, and permissions.
- SemVer rationale: forward patch because 1.8.6 was already built before final review found correctness and bounded-input gaps.

### Release identity

- Previous candidate: 1.8.6, superseded before runtime acceptance or release.
- Source commit: `fbdf954`.
- Release tag: `dev-toolz-v1.8.7`.
- GitHub Release assets: `dev-toolz-1.8.7.zip` and `dev-toolz-1.8.7.zip.sha256` at https://github.com/g-baskin/chrome-extension-boilerplate/releases/tag/dev-toolz-v1.8.7
- Release archive: `releases/dev-toolz-1.8.7.zip`.
- Archive SHA-256: `fd1a0f825b04729c8d7f1813fd77e25201e949597eb97d8f9515aa83ae320746`; `shasum -a 256 -c` passed.
- Evidence level: runtime verified.

### Pre-build evidence

- Package, source manifest, lockfile, changelog, and this record target 1.8.7.
- `npm run lint` passed.
- `npm run typecheck` passed.
- `npm test --workspace @chrome-extensions/dev-toolz` passed: 120 tests across 25 files.
- `npm run check:version --workspace @chrome-extensions/dev-toolz` passed: version 1.8.7 synchronized.
- `git diff --check` passed.
- `npm run build:dev-toolz` passed once after final source verification: 66 modules transformed.
- `apps/dev-toolz/dist/manifest.json` reports 1.8.7.
- Chrome runtime acceptance confirmed by the user: fresh install, upgrade/data preservation, popup, capture/log behavior, controls, Chrome Errors, panel stability, candidate highlighting, complete original Purple flow review, and candidate adding passed.

### Verdict

**Released.** Runtime source, production archive, checksum, Chrome acceptance, and release tag are recorded.

### Release closeout

- Outcome: Released.
- What worked: build identity, fresh install, upgrade/data preservation, popup, capture/log paths, controls, DevTools stability, and Red/Purple candidate workflows.
- What failed: no release-blocking failure reported during final Chrome acceptance.
- Detection method: automated checks plus user-confirmed Chrome smoke testing.
- Rollback target: tracked 1.8.7 archive for exact recovery; previous source fallback remains 1.7.19 at `6ef12d5`.
- Permanent guardrail owner: repository maintainers must preserve version synchronization, immutable archives, checksums, and runtime acceptance evidence.

## v1.8.6 — 2026-08-28 — Superseded build candidate

### Intent and scope

- Expected outcome: Red Team Recon visibly marks captured calls matching saved Purple logic before evidence is opened.
- Matching requires the same origin, method, normalized path, query names, and request-body shape while ignoring dynamic values.
- Candidate review shows unchanged original Purple steps; adding appends one new captured step only after explicit review.
- Explicitly out of scope: automatic flow mutation, fuzzy semantic matching, IndexedDB schema, capture formats, and permissions.
- Primary risks: false candidate matches, malformed captured data, expensive matching, accidental duplicate steps, and version synchronization.
- SemVer rationale: patch release for backward-compatible Red/Purple workflow guidance.

### Release identity

- Previous candidate: 1.8.5 at `03b1829`, built but not runtime-accepted or released.
- Source state: uncommitted working tree based on repository `HEAD` `03b1829`.
- Tag, archive, checksum, source commit, and production build: pending.
- Evidence level: working-tree candidate.

### Pre-build evidence

- Package, source manifest, lockfile, changelog, and this record target 1.8.6.
- `npm test --workspace @chrome-extensions/dev-toolz` passed: 120 tests across 25 files.
- Targeted Purple candidate tests passed after the final body-size hardening: 4 tests.
- `npm run typecheck --workspace @chrome-extensions/dev-toolz` passed.
- `npm run lint --workspace @chrome-extensions/dev-toolz` passed.
- `npm run check:version --workspace @chrome-extensions/dev-toolz` passed: version 1.8.6 synchronized.
- `git diff --check` passed.
- Matching fails closed for malformed URLs/bodies, excludes already-added captures, caps input and result work, and never interprets captured values as markup.
- `npm run build:dev-toolz` passed once after final source verification: 66 modules transformed.
- `apps/dev-toolz/dist/manifest.json` reports 1.8.6; built assets contain the candidate badge and original-step review paths.
- Chrome runtime acceptance: pending.

### Verdict

**Superseded before release.** Final review moved the complete original-step display and bounded text-body path into 1.8.7.

## v1.8.5 — 2026-08-28 — Build-verified candidate

### Intent and scope

- Expected outcome: retain the bounded 1.8.4 Agent Inspector behavior without showing cached current-site results for the wrong inspected page.
- Returning to a dirty cached inspector now shows the refresh notice; current-site navigation resets and cancels the previous scan.
- Explicitly out of scope: IndexedDB schema, capture formats, permissions, and release claims without Chrome acceptance.
- SemVer rationale: forward patch because 1.8.4 was already built before final review found these correctness gaps.

### Release identity

- Previous candidate: 1.8.4, superseded before release.
- Source commit: `03b1829`.
- Tag, archive, and checksum: pending.
- Evidence level: build-verified candidate.

### Pre-build evidence

- Package, source manifest, lockfile, changelog, and this record target 1.8.5.
- `npm test --workspace @chrome-extensions/dev-toolz` passed: 116 tests across 24 files.
- `npm run typecheck --workspace @chrome-extensions/dev-toolz` passed.
- `npm run lint --workspace @chrome-extensions/dev-toolz` passed.
- `npm run check:version --workspace @chrome-extensions/dev-toolz` passed: version 1.8.5 synchronized.
- `git diff --check` passed.
- `npm run build:dev-toolz` passed after final source verification: 65 modules transformed.
- `apps/dev-toolz/dist/manifest.json` reports 1.8.5 and required panel, worker, popup, options, service-worker, and icon assets are present.
- Chrome runtime acceptance: pending.

### Verdict

**Build verified; runtime pending.** Do not call 1.8.5 released before Chrome acceptance and release identity are recorded.

## v1.8.4 — 2026-08-28 — Superseded build candidate

### Intent and scope

- Expected outcome: Purple Team opens immediately while Agent Inspector preserves cached results and explicit full-history inspection.
- Automatic inspection is limited to 500 records from each traffic source; explicit refresh retains the 50,000-record safety boundary.
- Explicitly out of scope: IndexedDB schema, capture formats, permissions, and release claims without Chrome acceptance.
- Primary risks: stale-result messaging, worker cancellation, record-bound pagination, and version synchronization.
- SemVer rationale: patch release for a backward-compatible performance fix.

### Release identity

- Previous candidate: 1.8.3, not released.
- Source state: uncommitted working tree based on repository `HEAD` `08c16ce685c7`.
- Tag, archive, checksum, and source commit: pending.
- Evidence level: working-tree candidate.

### Pre-build evidence

- Intended diff reviewed: the candidate contains the Purple Team feature set and its startup, capture, and latency fixes; unrelated behavior was not added.
- Package, source manifest, lockfile, changelog, and this record target 1.8.4.
- `npm run check:version --workspace @chrome-extensions/dev-toolz` passed: version 1.8.4 synchronized.
- `npm test --workspace @chrome-extensions/dev-toolz` passed: 116 tests across 24 files.
- Targeted Agent Inspector tests passed: 6 tests across 2 files.
- `npm run lint --workspace @chrome-extensions/dev-toolz` passed.
- `npm run typecheck --workspace @chrome-extensions/dev-toolz` passed.
- `git diff --check` passed.
- Security implications reviewed: no permission, message trust-boundary, persisted-data, or secret-handling changes.
- `npm run build:dev-toolz` passed once after source and version synchronization: 65 modules transformed.
- `apps/dev-toolz/dist/manifest.json` reports 1.8.4.
- Toolbar icons, popup, options, DevTools registration, panel markup, service worker, and Agent Inspector worker assets are present.
- Built bundles contain the bounded-scan and stale-cache messaging paths.
- Chrome runtime acceptance: pending.

### Verdict

**Superseded before release.** Final review found stale-result notice and inspected-page navigation gaps; do not load or distribute the 1.8.4 build.

## v1.8.3 — 2026-08-28 — Superseded candidate review

### Intent and scope

- Expected outcome: Purple Team workflows, capture/startup repairs, and responsive Agent Inspector navigation.
- Explicitly out of scope: declaring release success without Chrome runtime acceptance.
- Primary risks: panel startup contracts, IndexedDB migration, capture continuity, worker cancellation, secrets, and tab responsiveness.

### Release identity

- Previous committed version: 1.7.19 at `6ef12d5`.
- Source state: uncommitted working tree based on repository `HEAD` `08c16ce685c7`.
- Tag: none.
- Archive and SHA-256: not created.
- Evidence level: working-tree candidate.

### Pre-build evidence collected

- Version synchronization: `npm run check:version --workspace @chrome-extensions/dev-toolz` passed for 1.8.3.
- Complete pre-review suite: `npm test --workspace @chrome-extensions/dev-toolz` passed 110 tests across 23 files.
- Automated blocker regressions: six targeted panel-contract and worker-lifecycle tests passed.
- Lint: `npm run lint --workspace @chrome-extensions/dev-toolz` passed before and after the regression additions.
- Typecheck: `npm run typecheck --workspace @chrome-extensions/dev-toolz` passed before and after the regression additions.
- Diff whitespace validation: `git diff --check` passed.
- Security review: read-only auditor and skeptic review found no high-confidence exploitable issue; runtime areas remain pending.
- QA report: superseded with the current 1.8.3 candidate verdict and evidence.
- Production build: deliberately not rerun during release review.
- Chrome runtime: operator confirmed on 2026-08-28 that Dev Toolz 1.8.3 is working again after reload; individual smoke scenarios were not separately attested.

### Review findings and blockers

- **Blocker:** 1.8.3 has no source commit, tag, release archive, or checksum.
- **Blocker:** the operator confirmed general runtime recovery, but fresh install, upgrade preservation, feature-by-feature behavior, responsiveness, and Chrome Errors checks remain individually unrecorded.
- **Resolved:** roadmap status now says Candidate with unchecked runtime acceptance items.
- **Resolved:** the panel regression suite validates every runtime-required DOM ID and required element type, plus unique IDs.
- **Resolved:** Agent Inspector client tests cover worker results, progress, abort, errors, and termination.
- **Hardening gap:** internal worker responses rely on the packaged worker and TypeScript contracts rather than runtime response-schema validation; no attacker-controlled message path was found.

### Verdict

**Not ready for release.** Pre-build static checks pass, but runtime acceptance and release identity are incomplete. Do not rebuild, tag, archive, or call 1.8.3 released until the blockers above are resolved.

## Repository-wide non-negotiable change-control invariant

1. Every intentional app change requires a semantic version bump and a release record in this file; no exceptions.
2. Synchronize each affected app's package, extension manifest when present, lockfile workspace entry, and changelog when present before building or committing.
3. Changes spanning apps require a version and release record for each affected app.
4. Never build an app's production `dist` under an unchanged version.
5. Record check, build, emitted-version, and runtime evidence honestly for the exact candidate.

## Dev Toolz release invariants

1. Never rebuild `apps/dev-toolz/dist` under an unchanged version.
2. Default fixes and performance changes to a patch bump unless minor or major is explicitly selected.
3. Synchronize these before building:
   - `apps/dev-toolz/package.json`
   - `apps/dev-toolz/manifest.json`
   - `package-lock.json` entry for `apps/dev-toolz`
   - `apps/dev-toolz/CHANGELOG.md`
   - the pending release record in this file
4. Run tests, lint, typecheck, and version checks before the production build.
5. Build once after source and version files are final.
6. Verify `apps/dev-toolz/dist/manifest.json` matches the source version.
7. Load the exact built directory in Chrome and run the smoke checklist before calling it released.
8. Record failures honestly. A successful build is not successful runtime verification.
9. Never rebuild or silently replace an already-recorded release. Use a new version for a forward fix.
10. Never ask for repeated Chrome reloads during iterative debugging. Reload only a finished candidate.

## Repository-wide mandatory release checklist

### Before build

- [ ] Intended diff, user-visible outcome, non-goals, risks, and SemVer rationale recorded.
- [ ] Every affected app's package, extension manifest when present, lockfile entry, changelog when present, and release record agree.
- [ ] App tests, repository lint, repository typecheck, version synchronization, and `git diff --check` pass.

### Build and package

- [ ] Build runs only after source, version files, and release evidence are final.
- [ ] Emitted manifest or package metadata matches the source version.
- [ ] Required entry points and production assets exist.

### App smoke test

- [ ] Fresh install and upgrade from the prior version work without errors or data loss.
- [ ] Primary entry points, target-site integration, storage, and destructive controls work.
- [ ] Chrome's extension Errors page contains no new exception.

### Release closeout

- [ ] Outcome, failures, detection method, rollback target, and permanent guardrail recorded.
- [ ] Source commit and release artifact identity recorded when the candidate is released.

## Mandatory Dev Toolz release checklist

### Before build

- [ ] Intended diff reviewed; unrelated work excluded.
- [ ] User-visible outcome and explicit non-goals recorded.
- [ ] Risk areas identified: startup, capture, IndexedDB migration, permissions, messaging, secrets, workers, and exports.
- [ ] SemVer rationale recorded.
- [ ] Package, source manifest, lockfile, changelog, and this record agree.
- [ ] `npm run check:version --workspace @chrome-extensions/dev-toolz` passes.
- [ ] Tests pass; exact command and result recorded.
- [ ] Lint passes; exact command and result recorded.
- [ ] Typecheck passes; exact command and result recorded.
- [ ] Security-sensitive changes have focused regression coverage.

### Build and package

- [ ] `npm run build:dev-toolz` runs only after the checks above.
- [ ] Built manifest equals the source version.
- [ ] Toolbar icons, popup, options page, DevTools page, panel markup, service worker, and worker assets exist.
- [ ] Release archive created from the exact built output.
- [ ] Archive SHA-256 recorded.
- [ ] Source commit and release tag recorded.

### Chrome smoke test

- [ ] Fresh unpacked install succeeds without extension errors.
- [ ] Upgrade from the previous version preserves local data.
- [ ] Toolbar action appears in the Extensions menu; pinning behavior is documented as Chrome profile state.
- [ ] Popup opens and shows the expected version.
- [ ] DevTools panel registers and initializes without a perpetual loading state.
- [ ] API traffic captures a normal page request.
- [ ] Log Search loads stored history and receives a new live event.
- [ ] Red Team opens and its existing workflows remain usable.
- [ ] Purple Team opens; every required markup control exists.
- [ ] Switching top-level and Purple subtabs remains responsive.
- [ ] Site access, pause/resume, clear, export, and redaction controls behave as documented.
- [ ] Chrome Errors page contains no new extension exception.

### Release closeout

- [ ] Outcome marked Released, Rolled back, or Superseded.
- [ ] What worked and what failed recorded.
- [ ] Detection method and affected versions recorded.
- [ ] Rollback or forward-fix target recorded.
- [ ] Permanent guardrail and owner recorded.
- [ ] Public changelog remains user-focused and links back to stable release evidence where available.

## Recovery playbook

1. Preserve the Chrome error, stack, bundle filename, affected version, and reproduction steps.
2. Stop distributing or rebuilding the affected version.
3. Decide between rollback and forward fix based on data compatibility.
4. Prefer the last recorded known-good archive. If none exists, use the recorded source commit and label the rebuilt artifact as a new version.
5. Never rebuild the failed version number.
6. Verify IndexedDB schema compatibility before loading an older build.
7. Run the full Chrome smoke checklist on the recovery candidate.
8. Record the failure, root cause, missing guard, and superseding version here.

## Known failure and recovery record

| Version/change | What worked | What failed or drifted | Recovery and permanent guard |
|---|---|---|---|
| 1.1.18 startup repair (`2138e13`) | API traffic analysis and media detection remained available. | DevTools panel startup required a follow-up registration repair without a version bump. | Later registration moved to the bundled module entrypoint; startup controls must be covered by a markup/startup smoke test. |
| 1.1.22 endpoint refactor (`a4696d6`) | Endpoint discovery architecture advanced. | Runtime behavior changed while the version and changelog stayed unchanged. | Every production rebuild now requires a new synchronized version and release record. |
| 1.7.5 | Capture status stopped depending on a background-message round trip. | Earlier versions could leave the current-site control loading indefinitely. | Inspected-page and local-storage startup paths must be bounded and smoke-tested. |
| 1.7.6 → 1.7.7 | Log Search-only live updates reduced work. | Snapshot-only API Traffic and Red Team behavior broke expected live append behavior. | 1.7.7 restored live append; performance fixes must preserve visible behavior and receive regression coverage. |
| 1.7.15 | Log history moved to a cancellable worker. | No failure recorded for the worker release. | Reuse bounded workers, cancellation, and result caps for expensive history analysis. |
| 1.7.18 transition (`081234b`–`dceb580`) | CSP and security hardening shipped. | Manifest moved to 1.7.18 while package and lock remained 1.7.17 across two commits. | `dceb580` synchronized all version sources; the version gate is mandatory before build. |
| 1.8.0 working-tree candidate | Purple Team feature set was implemented. | Startup, capture, and responsiveness regressions escaped the initial implementation pass. Repeated iterative rebuilds disrupted the loaded unpacked extension workflow. | Split fixes into new patch versions, stop rebuilding during diagnosis, and require runtime smoke evidence before release. |
| 1.8.1 working-tree candidate | Missing HAR protocol metadata no longer crashed API capture; startup lookups became bounded. | The panel still failed startup because required review-button markup did not match the TypeScript contract. | Add a panel-markup contract test and verify the built panel before Chrome reload. |
| 1.8.2 working-tree candidate | `purple-review-start` restored panel initialization. | Agent Inspector still scanned retained history on the UI thread, creating tab-switch latency. | Move heavy history work off-thread; require cancellation, pagination, caching, and responsiveness smoke checks. |
| 1.8.3 working-tree candidate | Agent Inspector now uses a cancellable worker, paginated reads, cached results, and bounded output. | Runtime Chrome acceptance remains unrecorded; this is not yet a released version. | Do not call 1.8.3 released until the complete smoke checklist and release identity are recorded. |

## Complete recorded version ledger

The ledger includes every version documented in `apps/dev-toolz/CHANGELOG.md`. “Changelog record” does not prove a separate build occurred. Git first contains the app at 1.1.6; several later commits backfilled multiple version entries at once.

| Version | Date | Evidence | Primary recorded outcome |
|---|---|---|---|
| 1.0.0 | 2026-08-26 | Changelog record | Initial extension, page capture, popup, downloads, and settings. |
| 1.1.0 | 2026-08-26 | Changelog record | Automatic active-tab and navigation capture. |
| 1.1.1 | 2026-08-26 | Changelog record | Recognizable toolbar icon replacement. |
| 1.1.2 | 2026-08-26 | Changelog record | Plain-English API exchange explanations. |
| 1.1.3 | 2026-08-26 | Changelog record | Nearby duplicate grouping. |
| 1.1.4 | 2026-08-26 | Changelog record | Expected extension-reload shutdown stopped surfacing as an error. |
| 1.1.5 | 2026-08-26 | Changelog record | Blank tabs no longer triggered debugger capture. |
| 1.1.6 | 2026-08-26 | Git verified at `ef2134c` | Capture waited for destination commit before attaching. |
| 1.1.7 | 2026-08-26 | Git verified at `cf42f05` | Current-page filtering with retained all-history access. |
| 1.1.8 | 2026-08-26 | Changelog record | Current-site naming clarified hostname-based history. |
| 1.1.9 | 2026-08-26 | Changelog record | Timed and manual capture pause. |
| 1.1.10 | 2026-08-26 | Changelog record | Export and clear respected history scope. |
| 1.1.11 | 2026-08-26 | Changelog record | Route filters exposed unknown attribution and missing responses. |
| 1.1.12 | 2026-08-26 | Changelog record | CDP initiator attribution added. |
| 1.1.13 | 2026-08-26 | Changelog record | Current-site method-and-URL grouping across history. |
| 1.1.14 | 2026-08-26 | Changelog record | Session-only endpoint hiding. |
| 1.1.15 | 2026-08-26 | Changelog record | Hidden-endpoint action added to duplicate groups. |
| 1.1.16 | 2026-08-26 | Changelog record | Analysis presets for focus, writes, failures, and attribution. |
| 1.1.17 | 2026-08-26 | Changelog record | Target-signals analysis mode. |
| 1.1.18 | 2026-08-26 | Git verified at `9f63c32`; startup follow-up `2138e13` | Media detection expanded; startup repair followed without a bump. |
| 1.1.19 | 2026-08-26 | Changelog record | Site allow-list and deny-list access modes. |
| 1.1.20 | 2026-08-26 | Changelog record | Signed URL, yt-dlp, and ffmpeg actions. |
| 1.1.21 | 2026-08-26 | Changelog record | Direct-endpoint and streaming analysis modes. |
| 1.1.22 | 2026-08-26 | Git verified at `347fd30`; unchanged refactor `a4696d6` | Site access and media endpoint tools; later unversioned refactor. |
| 1.1.23 | 2026-08-28 | Git verified at `1730c4c` | Red Team endpoint recon workspace. |
| 1.2.0 | 2026-08-28 | Git verified at `bdd88fb` | Protocol Explorer and bounded Race Lab. |
| 1.3.1 | 2026-08-28 | Git verified at `a16abec` | Field extraction, coverage, and request filtering. |
| 1.4.0 | 2026-08-28 | Changelog record | Inferred connection chains from HAR timing. |
| 1.5.0 | 2026-08-28 | Changelog record | Connection-chain filtering. |
| 1.6.0 | 2026-08-28 | Changelog record | Top-level local Log Search. |
| 1.7.0 | 2026-08-28 | Changelog record | Local and custom time ranges. |
| 1.7.1 | 2026-08-28 | Changelog record | Cross-workspace field transfer preserved selected evidence. |
| 1.7.2 | 2026-08-28 | Changelog record | Boolean detection-expression language. |
| 1.7.3 | 2026-08-28 | Changelog record | Coalesced live Log Search updates. |
| 1.7.4 | 2026-08-28 | Changelog record | Partial history failures no longer disabled live search. |
| 1.7.5 | 2026-08-28 | Changelog record | Capture status removed a hanging background dependency. |
| 1.7.6 | 2026-08-28 | Changelog record; superseded | Snapshot-only native views reduced updates but regressed expected live behavior. |
| 1.7.7 | 2026-08-28 | Changelog record | Restored live append to API Traffic and Red Team. |
| 1.7.8 | 2026-08-28 | Changelog record | Expanded detection-expression syntax. |
| 1.7.9 | 2026-08-28 | Changelog record | Splunk-style field facets. |
| 1.7.10 | 2026-08-28 | Changelog record | Field facets defaulted collapsed. |
| 1.7.11 | 2026-08-28 | Changelog record | Persistent starring across native and Log Search views. |
| 1.7.12 | 2026-08-28 | Changelog record | Wildcard domain filters. |
| 1.7.13 | 2026-08-28 | Changelog record | Indexed stored-history queries plus active live evaluation. |
| 1.7.14 | 2026-08-28 | Changelog record | Cross-window capture lineage. |
| 1.7.15 | 2026-08-28 | Changelog record | Cancellable Log Search worker. |
| 1.7.16 | 2026-08-28 | Git verified at `58438ef` | Bundled DevTools registration and searchable history. |
| 1.7.17 | 2026-08-28 | Git verified at `7a82830` | Domain grouping and protocol port filtering. |
| 1.7.18 | 2026-08-28 | Git verified after sync at `dceb580` | Security hardening; temporary manifest/package version drift occurred. |
| 1.7.19 | 2026-08-28 | Git verified at `6ef12d5` | Explicit redaction control and cross-origin recon race support. |
| 1.8.0 | 2026-08-28 | Working-tree candidate | Purple Team tools; startup, capture, and latency regressions followed. |
| 1.8.1 | 2026-08-28 | Working-tree candidate | HAR capture and indefinite-loading fixes; startup markup mismatch remained. |
| 1.8.2 | 2026-08-28 | Working-tree candidate | Review-dialog startup contract restored; latency remained. |
| 1.8.3 | 2026-08-28 | Superseded working-tree candidate | Worker isolation and caching landed; automatic history rescans remained slow. |
| 1.8.4 | 2026-08-28 | Superseded build candidate | Bounded automatic inspection landed; final review found stale current-site cache gaps. |
| 1.8.5 | 2026-08-28 | Build-verified candidate | Correct current-site invalidation and visible dirty-cache refresh state. |
| 1.8.6 | 2026-08-28 | Superseded build candidate | Structural matching landed; final review found partial original-step display and an unbounded text-body path. |
| 1.8.7 | 2026-08-28 | Released | Complete original flow display, bounded candidate matching, Chrome acceptance, archive, checksum, and tag recorded. |

## Release record template

Copy this section before any production build.

```md
## vX.Y.Z — YYYY-MM-DD — Candidate | Released | Rolled back | Superseded

### Intent and scope
- Expected user-visible outcome:
- Explicitly out of scope:
- Risk areas and stored-data implications:

### Release identity
- Previous version:
- Source commit:
- Tag:
- Builder/owner:
- Chrome version and platform:
- Archive path:
- Archive SHA-256:

### Evidence
- Version synchronization command/result:
- Tests command/result:
- Lint command/result:
- Typecheck command/result:
- Production build command/result:
- Built-manifest verification:
- Chrome smoke scenarios/results:

### Outcome
- What worked:
- What failed or regressed:
- Detection method:
- Affected versions, users, or data:

### Recovery
- Immediate containment:
- Rollback or forward-fix version:
- Exact recovery steps:
- Data/schema compatibility:
- Verification after recovery:

### Prevention
- Root cause:
- Missing test or check:
- Permanent guardrail:
- Owner and follow-up:
```

## Anti-patterns

- Dumping raw commit logs into a release record.
- Claiming “released” from a successful build alone.
- Recording tests without commands and results.
- Rebuilding `dist` under an unchanged version.
- Changing runtime behavior without a version and changelog entry.
- Combining multiple attempted releases into one retrospective record.
- Hiding failed assumptions or scope reductions.
- Claiming rollback without naming a known-good artifact and data-compatibility decision.
- Fixing the symptom without adding the missing regression guard.
