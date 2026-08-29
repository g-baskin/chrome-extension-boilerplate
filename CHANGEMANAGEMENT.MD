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

- Current LinkedIn Job Finder candidate: **0.1.8**, build-verified source; Chrome runtime acceptance pending.
- Current Dev Toolz release: **1.8.7**; runtime source commit `fbdf954` on 2026-08-28.
- Release tag: `dev-toolz-v1.8.7`.
- GitHub Release: https://github.com/g-baskin/chrome-extension-boilerplate/releases/tag/dev-toolz-v1.8.7
- Release archive: `releases/dev-toolz-1.8.7.zip`.
- Archive SHA-256: `fd1a0f825b04729c8d7f1813fd77e25201e949597eb97d8f9515aa83ae320746`.
- `apps/dev-toolz/dist` remains ignored; the tracked archive is the recovery artifact.
- Previous rollback source: commit `6ef12d5` for 1.7.19; no packaged 1.7.19 artifact is recorded.

## LinkedIn Job Finder v0.1.8 — 2026-08-29 — Source candidate

### Intent and scope

- Expected outcome: keep the in-page panel and popup snapshot synchronized after visible-card scanning and restoration.
- Suppress observer-driven intermediate renders during scanning, then force one render after the final selection settles.
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
