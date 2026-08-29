# LinkedIn Job Finder Design Record

## Design read

- **Surface:** application UI led by a data-dense saved-jobs dashboard, with a compact browser popup and in-page companion.
- **Audience:** job seekers repeatedly comparing listings under time pressure, using pointer, keyboard, zoom, or assistive technology.
- **Single job:** decide whether the currently open listing fits, then save useful evidence without losing LinkedIn context.
- **Task and risk:** frequent comparison with moderate decision cost. False confidence is avoided by showing literal evidence instead of a score.
- **Content:** variable job titles, companies, locations, long descriptions, three keyword categories, notes, and timestamps.
- **Platform:** Chrome 118+, a 380px popup, a resizable extension tab, and a fixed Shadow DOM panel on LinkedIn Jobs.
- **Constraints:** local-only data, no external fonts or runtime assets, narrow permissions, bounded fields, and LinkedIn's changing DOM.

## Evidence and thesis

Airtable is aligned because repeated records need compact comparison and stable columns. Sentry is aligned because evidence and failure states need stronger hierarchy than decoration. Miro is the contrast: a freeform canvas would slow repeated job comparison.

The extension uses an editorial workspace: warm paper, dark ink, restrained blue actions, compact radii, aligned rails, and a quiet local font stack. First glance is eligibility, second glance is exact evidence, then save or notes. The signature is a match ledger with green, amber, and red edge rules plus text labels. Borders separate persistent records; one shadow is reserved for the panel floating above LinkedIn. Resting screens do not move.

The anti-default review removed gradients, glass, hover lift, equal card tiles, pills, icon medallions, fake metrics, remote fonts, and soft tint-on-tint status treatments. Utility uppercase labels remain only where they identify real extension context.

## Semantic tokens

- Paper and surface: `#fbf7ef`, `#eee7dc`, `#fffdf8`.
- Ink and muted text: `#18212b`, `#535d67`.
- Action: `#1857a4`, darkening to `#0f4486` on hover.
- Evidence: `#17613e` matched, `#7a4d00` missing, `#9c2929` excluded.
- Focus: `#f7b32b`, three-pixel outline with offset.
- Geometry: 4px controls, 8px records/panel, 44px primary targets.
- Motion: 140ms named color and border transitions; near-zero under reduced motion.

## Components and states

- **Match panel:** loading, no open job, eligible, missing required, excluded, saving, saved, and save error.
- **Popup:** loading, load error, no open job, current evidence, saved/pending button, keyword form, and announced save status.
- **Saved jobs:** loading, load error, first-use empty, no filter results, records, note success/error, delete confirmation, and clear-all confirmation.
- **Icons:** one inline stroke vocabulary. Decorative icons are hidden; icon-only controls carry visible-label-equivalent names.
- **Forms:** persistent labels, bounded native textareas/search/select, preserved values, native confirmations for destructive changes.

## Responsive behavior

The popup remains 380px wide inside Chrome and scrolls vertically without fixed content height. The saved page uses one 1120px rail, collapses records from two columns to one below 800px, and uses 12px outer gutters at narrow widths. Evidence rows retain labels beside wrapping terms. Controls remain at least 44px high. Logical borders and spacing support flow-relative layout.

## Accessibility and production scope

Scope includes popup keyword editing and current-job saving, saved-page search/filter/notes/delete/clear, and in-page evidence/save states in Chrome 118+. Native elements provide headings, forms, buttons, links, search, select, and confirmations. Status changes use polite live regions. Keyboard focus uses `:focus-visible`; pointer clicks do not create a persistent custom focus state. Text, status blocks, controls, and focus colors were chosen for AA contrast targets. Reduced motion and forced colors have explicit rules.

No conformance claim is made. Automated accessibility scanning, keyboard completion, screen-reader output, 200% text, 320px reflow, forced colors, authenticated LinkedIn extraction, and browser restart persistence remain unverified until the rendered build and logged-in Chrome smoke test are completed.

## Verification evidence

- `npm install --package-lock-only`: passed; workspace lock entry created. Audit reported 14 existing dependency findings.
- Final verification passed 5 test files (16 tests), lint, typecheck, and a Vite 6.4.1 build.
- The final review corrected comma parsing, stale SPA snapshots, runtime error handling, and target sizing.
- Emitted manifest: version 0.1.0, storage only, narrow LinkedIn Jobs hosts, popup, saved page, worker, and static content script verified.
- Renders: popup at 380px, dashboard at 1440px, and dashboard at 375px captured under `.gg/screenshots/`.
- First rubric score: 22/24. State completeness and accessibility scored 1 because interactive and assistive-technology checks remain unverified; every other criterion scored 2.
- Revision: removed the duplicate popup header action, reducing decoration and strengthening the single action path. Service-worker restart recovery was also added for current-job state.
- Final rubric score: 22/24. Rendered hierarchy, responsive reflow, evidence specificity, content authenticity, and visual consistency passed; unverified checks cannot earn full points.
- Live authenticated LinkedIn extraction, SPA navigation, keyboard flow, screen-reader output, 200% text, forced colors, browser restart persistence, and interaction profiling: pending manual Chrome smoke test.
