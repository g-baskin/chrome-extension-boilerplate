# Dev Toolz interface

## Design read

- **Surface:** Data-dense Chrome DevTools panel.
- **Audience:** Authorized red-team operators working under time pressure with keyboard and pointer input.
- **Primary job:** Move from captured traffic to a defensible target inventory without losing source evidence.
- **Risk:** Mis-grouped routes or detached evidence can send an operator toward the wrong target.
- **Platform:** Resizable DevTools pane using native browser colors, controls, and local-only data.

## Direction

API Traffic remains the capture and inspection surface. Red Team is a separate top-level workspace that derives an endpoint inventory from stored exchanges. Route patterns group numeric, UUID, and long hexadecimal identifiers, while every row retains a lazily rendered exact exchange. This pairing keeps reconnaissance compact without replacing the evidence.

## Reused system

- Native `Canvas`, `CanvasText`, `Field`, `ButtonFace`, `Highlight`, and `LinkText` colors.
- Existing 4px controls, 6px data containers, monospace request text, focus outlines, tables, and disclosure controls.
- Existing request/response details and copy behavior for source evidence.

## Interaction and states

- Top-level section buttons expose pressed state and controlled section IDs.
- Recon supports current-site and all-history scopes.
- Loading, empty, unavailable, live-update, and populated states use text announcements.
- Endpoint evidence renders only when opened to avoid formatting every stored body upfront.
- Wide tables scroll inside a keyboard-focusable labelled region.
- Native disclosures, buttons, selects, and focus-visible styles preserve keyboard operation.

## Responsive behavior

The section rail and headers stay visible. Controls wrap, while the inventory preserves data columns through horizontal scrolling instead of collapsing evidence into ambiguous cards.
