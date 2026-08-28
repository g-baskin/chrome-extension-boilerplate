# Dev Toolz interface

## Design read

- **Surface:** Data-dense Chrome DevTools panel.
- **Audience:** Authorized red-team operators working under time pressure with keyboard and pointer input.
- **Primary job:** Search captured API and red-team protocol evidence, then move into focused inspection without losing source context.
- **Risk:** Mis-grouped routes or detached evidence can send an operator toward the wrong target.
- **Platform:** Resizable DevTools pane using native browser colors, controls, and local-only data.

## Direction

Log Search is the first top-level workspace and the shared entry point. It uses a bounded, local-only query grammar with free text, quoted phrases, `field=value`, and `field!=value`; a source and time scope remain explicit beside the query. Results preserve timestamp, source, event title, summary, and expandable fields. A compact field-frequency rail supports query construction without hiding the raw event trail. The data-dense direction follows Airtable's aligned filtering and Sentry's evidence-first investigation flow; Miro is the contrast because freeform spatial composition would weaken scan speed here.

API Traffic remains the capture and inspection surface. Red Team is a separate top-level workspace that derives an endpoint inventory from stored exchanges. Route patterns group numeric, UUID, and long hexadecimal identifiers, while every row retains a lazily rendered exact exchange. This pairing keeps reconnaissance compact without replacing the evidence.

## Reused system

- Native `Canvas`, `CanvasText`, `Field`, `ButtonFace`, `Highlight`, and `LinkText` colors.
- Existing 4px controls, 6px data containers, monospace request text, focus outlines, tables, and disclosure controls.
- Existing request/response details and copy behavior for source evidence.

## Interaction and states

- Top-level section buttons expose pressed state and controlled section IDs.
- Log Search supports keyboard submission, clear recovery, source scope, time presets, validated custom local-time boundaries, query validation, loading, empty, and populated states.
- API Traffic and Red Team field controls use a native confirmation before appending `field=value` or `field=*`; confirmed clauses accumulate with AND and move focus to Log Search.
- Search results announce count changes without moving focus; field-value buttons append valid query clauses.
- Recon supports current-site and all-history scopes.
- Loading, empty, unavailable, live-update, and populated states use text announcements.
- Endpoint evidence renders only when opened to avoid formatting every stored body upfront.
- Wide tables scroll inside a keyboard-focusable labelled region.
- Native disclosures, buttons, selects, and focus-visible styles preserve keyboard operation.

## Responsive behavior

The section rail and headers stay visible. Search controls recompose from query-first desktop columns to one-column narrow flow, while result metadata wraps without changing DOM order. Controls wrap, while the inventory preserves data columns through horizontal scrolling instead of collapsing evidence into ambiguous cards.

## Log Search verification

- **Rendered evidence:** `log-search-time-range-wide.png` at 1440×900 and `log-search-time-range-narrow.png` at 390×844.
- **Rubric:** 22/24 after tightening timeline announcements; typography and assistive-technology evidence remain the two one-point criteria.
- **Passed:** Native labels and controls, keyboard submission, visible focus rules, live result status, alert errors, custom-range validation, confirmed cross-workspace field transfer, 390px reflow, bounded parsing, empty/loading/error states, tests, lint, typecheck, and production build.
- **Unverified:** Representative screen-reader traversal, forced-colors rendering, and manual 200% text zoom.
