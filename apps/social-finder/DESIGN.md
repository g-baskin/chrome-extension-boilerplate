# Social Finder Research Workspace Design

## Design read

- **Surface:** compact, data-dense Chrome side-panel workspace.
- **Audience:** advertisers repeatedly reviewing rendered Meta Ad Library evidence by keyboard or pointer.
- **Single job:** turn visible cards into a trustworthy local shortlist.
- **Risk:** missing facts must stay unknown; query, tab, or extension text must never contaminate records.
- **Platform:** resizable Chrome side panel, 320 CSS pixels upward, 200% text, forced colors, and reduced motion.

## Thesis

Keep Social Finder's dark green identity while using aligned borders, neutral surface steps, persistent labels, and repeatable card anatomy. Search and collection state appear first; filters explain their effect second; evidence and actions remain together. No floating overlays, generic card lift, glass, emoji, hidden labels, or automation controls.

## Evidence and reuse

The approved application references support stable controls and quick state recognition; data-tool references support aligned rows, explicit units, and visible applied filters. Copycat is behavior contrast only. Existing colors, native controls, focus ring, screenshot flow, and text actions are reused.

## Visible data contract

An Ad Library record requires a visible numeric Library ID. It may contain only bounded rendered facts: advertiser, status, visible start date, computed runtime, platform labels, text, HTTPS destination/media references, and visible multiple-version state. Missing or malformed facts are `null` or empty. Each record carries schema version, page key, capture time, and diagnostics.

## Interaction and states

Search navigation occurs only after **Open search**. **Collect while I browse** observes rendered cards but never scrolls or clicks. Totals are labelled visible collected ads, filtered results, and unique advertisers. Loading, unsupported, empty, no-match, cap, clipboard, storage, media, import, and destructive states retain user context and expose recovery.

## Responsive and accessibility scope

Search, collection, filters, cards, saved records, export/import, screenshots, and confirmations use native controls, persistent names, logical focus order, visible focus, live summary status, and native dialog focus behavior. Controls reflow at 320 CSS pixels without two-dimensional page scrolling. Drag has a download alternative. Status never relies on color. No ADA or WCAG conformance claim is made from automated checks.

## Data and privacy boundary

Rendered DOM, imported JSON, URLs, clipboard, and storage are hostile inputs. React renders text; HTTPS URLs are allowlisted and bounded. No private API, page-world injection, automated browsing, remote service, telemetry, screenshot persistence, or HTML persistence exists. Screenshots remain memory-only.
