# Changelog

All notable Dev Toolz changes are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and Dev Toolz uses [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.7.16] - 2026-08-28

### Fixed

- DevTools panel registration now runs from the bundled module entrypoint instead of a brittle unbundled public script.

## [1.7.15] - 2026-08-28

### Changed

- Indexed Log Search now runs inside a cancellable Web Worker so history normalization and filtering cannot block DevTools interactions.
- Common metadata queries use lightweight records during scanning and hydrate full extracted fields only for displayed matches.

## [1.7.14] - 2026-08-28

### Added

- Cross-window capture journeys record tab, window, opener, previous-page, attachment-time, and transition metadata for API and Red Team events.
- Log Search shows searchable capture-handoff markers and explicitly warns when initial page requests may predate debugger attachment.

### Changed

- Capture now follows focus into newly opened browser windows while ignoring non-inspectable DevTools windows.

## [1.7.13] - 2026-08-28

### Added

- Log Search now queries timestamp-indexed API and Red Team history, then continuously evaluates new captures against the active query.
- History retention keeps up to 50,000 events per source and prunes bounded oldest batches when extension storage exceeds 250 MB.

### Changed

- Log Search preserves the existing detection syntax while scanning history without loading the full event index into memory.

## [1.7.12] - 2026-08-28

### Changed

- API Traffic domain filters now support `*` wildcards, including patterns such as `*tiktok.com`.
- API Traffic Extracted fields now starts collapsed to preserve workspace space.

## [1.7.11] - 2026-08-28

### Added

- Individual API Traffic and Red Team events can now be starred from their native views or Log Search; stars persist locally across panel reloads.

## [1.7.10] - 2026-08-28

### Changed

- Log Search field facets now start collapsed so the Available fields sidebar stays compact.

## [1.7.9] - 2026-08-28

### Changed

- Log Search Available fields now groups values and matching-event counts under expandable Splunk-style field facets.

## [1.7.8] - 2026-08-28

### Added

- Log Search detection expressions now support vendor-neutral `NOT`, `AND`, `OR`, grouping, implicit `AND`, `EXISTS(field)`, `field CONTAINS value`, equality, inequality, quoted phrases, and wildcards.
- Invalid expressions fail closed with actionable errors and zero results; evaluation remains bounded, local-only, and independent of SIEM vendor languages.

## [1.7.7] - 2026-08-28

### Fixed

- Restored the original live append behavior for captured API Traffic and Red Team events while keeping the same captures streaming into Log Search.

## [1.7.6] - 2026-08-28

### Changed

- Real-time capture messages now refresh only Log Search; API Traffic and Red Team remain snapshot-based until their existing manual reload paths run.

## [1.7.5] - 2026-08-28

### Fixed

- Live capture status now resolves directly from the inspected page and local capture settings instead of depending on a background-message round trip that could leave the control loading indefinitely.

## [1.7.4] - 2026-08-28

### Fixed

- Log Search no longer disables live results when either stored-history source fails to load; available history and new captures remain searchable.
- Added current-site live capture controls directly to Log Search and corrected duplicate Traffic workspace markup.

## [1.7.3] - 2026-08-28

### Added

- Log Search now streams newly captured API and protocol events into the active query, coalesces bursts into one visual update per frame, and retains bounded events captured during initial loading.

## [1.7.2] - 2026-08-28

### Added

- Added a vendor-neutral Boolean detection-expression language with `NOT`, `AND`, `OR`, grouping, equality, inequality, existence, substring, quoted-text, and implicit-AND matching.

## [1.7.1] - 2026-08-28

### Fixed

- Cross-workspace field transfers now include the selected event in the bounded local search cache and reset source/time scopes so the confirmed API or protocol event cannot be silently excluded.

## [1.7.0] - 2026-08-28

### Added

- Added local time presets and validated custom local-time ranges to Log Search.
- Added traffic events to unified results and confirmed cross-workspace field actions that append unlimited AND filters before opening Log Search.
- Added `field=*` existence filters for field-name clicks.

## [1.6.0] - 2026-08-28

### Added

- Added a top-level local log search dashboard across API captures and red-team protocol events, with bounded field queries, source and time filters, event distribution, field facets, and expandable evidence.

### Security

- Search parsing is bounded and declarative; it never evaluates input or sends stored traffic off-device.

## [1.5.0] - 2026-08-28

### Added

- Added connection-chain filtering for observed TCP handshakes, observed QUIC handshakes, and reused or unavailable setup timing.

## [1.4.0] - 2026-08-28

### Added

- Added per-request inferred connection chains using HAR timing data, including TCP three-way handshake, TLS, HTTP/3 QUIC, and reused-connection states.

### Security

- Connection chains are explicitly labeled as inferred and never claim browser access to packet flags or connection-close frames.

## [1.3.1] - 2026-08-28

### Added

- Added loaded-result field extraction with decoded URL parameters, flattened bodies, coverage, top values, collapsible inspection, and `field=value` request filtering with JSON body aliases.

### Security

- Field extraction remains bounded, excludes headers, and reads only already-redacted stored traffic.

## [1.2.0] - 2026-08-28

### Added

- Added a live Protocol Explorer for GraphQL HTTP, WebSocket, SSE, and WebTransport lifecycle traffic.
- Added an observed OpenAPI 3.1 draft exporter with local baseline drift comparison.
- Added locally saved business flows and bounded synchronized Race Lab replay.
- Added parser, IndexedDB migration, spec inference, replay validation, and synchronization tests.

### Security

- Race Lab requires explicit confirmation and only replays captured requests to the inspected page origin.
- Sensitive, redacted, unsupported, oversized, redirected, stale, and disallowed requests fail closed.
- Active runs are manual, limited to 2–10 concurrent requests, cancellable, and response-capped.

### Notes

- Protocol and OpenAPI output is best-effort observed evidence, not proof of API completeness.
- Race Lab is for sites the operator owns or is authorized to test.

## [1.1.23] - 2026-08-28

### Added

- Added a dedicated **Red Team** section with endpoint recon, route grouping, input signals, and expandable captured evidence.

## [1.1.22] - 2026-08-26

### Changed

- Renamed the combined media filter to **All media** and added an ungrouped **Stream endpoints** manifest-only mode.

### Fixed

- Media preflight requests no longer appear as stream endpoints.

## [1.1.21] - 2026-08-26

### Added

- Added **Direct endpoints** and **Streaming traffic** Analysis modes.
- Added derived `mediaKind` and `mediaRole` labels to traffic rows and JSON exports.

## [1.1.20] - 2026-08-26

### Added

- Added session-only signed-URL copy/open actions plus **Copy yt-dlp** and **Copy ffmpeg** commands for live stream manifests.

### Security

- Raw signed manifest URLs exist only in extension session memory for explicit signed-URL and download-command actions.

## [1.1.19] - 2026-08-26

### Added

- Added all-site, deny-list, and allow-list access modes using hostname rules that include subdomains.
- Added per-request **Copy URL** and safe HTTP(S) **Open URL** actions in the traffic inspector.

### Security

- Site access rules fail closed for invalid page URLs, and non-HTTP(S) captured URLs cannot be opened from the inspector.
- Sensitive query values remain redacted in stored, exported, and standard copy/open actions.

## [1.1.18] - 2026-08-26

### Added

- Added metadata-only video detection for direct video and audio files, HLS, MPEG-DASH, Smooth Streaming, manifests, media segments, subtitles, and HLS encryption keys.
- Added a **Videos** analysis mode that groups related stream requests and reports media kind, transfer size, status, timing, route, and initiator.

### Security

- Media response and request bodies are deliberately omitted to prevent large binary payloads or uploaded recordings from bloating persistent history and exports.
- Signed media URL credentials such as signatures, policies, cloud credentials, and key-pair identifiers are redacted before persistence and export.

## [1.1.17] - 2026-08-26

### Added

- Added a **Target signals** analysis mode that hides static media, extension-generated requests, and Sentry envelope telemetry without deleting or excluding those records from exports.

## [1.1.16] - 2026-08-26

### Added

- Added analysis presets for all traffic, non-routine focus signals, external, extension-initiated, or unknown discovery traffic, possible writes, and failures.
- Added a compact HTTP method guide explaining common GET, POST, PUT, PATCH, DELETE, OPTIONS, and HEAD intent.

## [1.1.15] - 2026-08-26

### Added

- Collapsed nearby and site-history duplicate groups now expose the same session-only **Hide endpoint** action as individual request rows.

## [1.1.14] - 2026-08-26

### Added

- Individual request endpoints can be hidden for the current DevTools panel session without stopping capture, deleting history, or excluding them from exports.
- Hidden endpoint matching ignores query parameters, and the header shows how many currently loaded requests are hidden with a one-click restore action.

## [1.1.13] - 2026-08-26

### Added

- Current-site history can group matching method-and-URL requests across all stored time, independent of the 10-second nearby-request window.

### Notes

- Automatic capture still waits for page loading to complete, preserving responsive new-tab navigation at the cost of initial page-load requests.

## [1.1.12] - 2026-08-26

### Added

- Automatic capture records whether CDP identified a request as page-initiated, extension-initiated, or unknown.
- Route filtering can isolate page, extension, and unknown initiators; extension records show the available `chrome-extension://` origin.

### Fixed

- Active capture now detaches while any page loads and resumes only after loading completes, preventing debugger attachment from delaying new-tab navigation or reloads.

### Notes

- Chrome does not expose another extension's display name through tab-level CDP capture, so Dev Toolz can show only the extension origin/ID when available.
- Page-load API calls may be omitted because automatic capture prioritizes responsive navigation and resumes after loading completes.

## [1.1.11] - 2026-08-26

### Added

- Route filtering can isolate any unknown attribution, unknown sources, unknown destinations, or requests that received no response.

### Notes

- Tab capture may include requests injected into the inspected page by another extension, but it does not capture another extension's independent background traffic.
- `Unknown source` means attribution was unavailable; it does not by itself identify another extension.

## [1.1.10] - 2026-08-26

### Added

- Export and clear actions now follow the History scope: `Current site` affects only the inspected hostname, while `All history` affects every stored exchange.
- Scope-specific export filenames identify the current hostname or all stored sites.
- Clear actions count affected exchanges and require confirmation before permanent deletion.

## [1.1.9] - 2026-08-26

### Added

- Current-site capture can be paused for 5 minutes, 15 minutes, 1 hour, or until manually resumed from the Dev Toolz panel.
- Every exchange now labels both request and response domain direction.

### Fixed

- Freshly opened tabs remain excluded from debugger capture until their first user-directed navigation commits.

### Notes

- Chrome owns the browser debugging banner, so pause controls are provided inside the Dev Toolz panel rather than Chrome's banner menu.

## [1.1.8] - 2026-08-26

### Changed

- Renamed the default traffic scope to `Current site` to reflect hostname-based history while navigating within one domain.
- Removed four unused-parameter lint warnings from capture-history projections.

## [1.1.7] - 2026-08-26

### Added

- API traffic defaults to the inspected page while retaining an immediate `All history` switch for persisted traffic from previously active pages.

## [1.1.6] - 2026-08-26

### Fixed

- Debugger capture now waits until a newly opened tab commits its destination, preventing address-bar delays while still capturing the destination's page-load API traffic.

## [1.1.5] - 2026-08-26

### Changed

- Opening a blank new tab no longer starts debugger capture; capture begins after the active tab navigates to an HTTP or HTTPS domain.

## [1.1.4] - 2026-08-26

### Fixed

- Reloading the extension no longer records the expected DevTools `Extension context invalidated` shutdown as an extension error.

## [1.1.3] - 2026-08-26

### Added

- Nearby duplicate requests can be grouped by exact method and URL from the API traffic toolbar.
- Each group has a stable color, request count, and expandable list of its individual exchanges.

### Notes

- Requests join the same group when they start within 10 seconds of the group's newest request.

## [1.1.2] - 2026-08-26

### Added

- Every API exchange now includes a plain-English explanation of the request method, outcome, timing, and likely importance.
- First-party and external API destinations are labeled so connections leaving the current site's domain stand out.

### Notes

- Domain classification uses a lightweight hostname heuristic; uncommon multi-part public suffixes may need manual interpretation.

## [1.1.1] - 2026-08-26

### Changed

- Replaced the placeholder sun artwork with a sharper Dev Toolz code-and-lightning icon that remains recognizable at toolbar sizes.

## [1.1.0] - 2026-08-26

Dev Toolz can now record and inspect active-tab API traffic before DevTools opens.

### Added

- Automatic active-tab capture follows newly opened tabs and normal web navigation.
- Outgoing request methods, URLs, headers, MIME types, and payloads are visible alongside incoming statuses, timings, headers, MIME types, and bodies.
- Captures persist in IndexedDB until cleared, with paged history instead of a request-count cap.
- Domain, method, status-family, and MIME-type filters find matching traffic across retained history.
- JSON responses support syntax highlighting, formatted and minified copying, malformed-response details, and complete JSON export.

### Changed

- Exported traffic redacts common cookies, credentials, passwords, sessions, tokens, and API keys.
- Multipart request bodies are omitted to avoid retaining uploaded files and embedded secrets.

### Notes

- Chrome displays a debugging banner while automatic capture is active.
- Capture follows the active tab only. Opening DevTools temporarily switches to Chrome's DevTools network capture path.

## [1.0.0] - 2026-08-26

### Added

- Initial Dev Toolz Chrome extension with page capture, popup controls, downloads, and extension settings.

[Unreleased]: https://github.com/g-baskin/chrome-extension-boilerplate/compare/v1.1.23...HEAD
[1.1.23]: https://github.com/g-baskin/chrome-extension-boilerplate/compare/v1.1.22...v1.1.23
[1.1.22]: https://github.com/g-baskin/chrome-extension-boilerplate/compare/v1.1.21...v1.1.22
[1.1.21]: https://github.com/g-baskin/chrome-extension-boilerplate/compare/v1.1.20...v1.1.21
[1.1.20]: https://github.com/g-baskin/chrome-extension-boilerplate/compare/v1.1.19...v1.1.20
[1.1.19]: https://github.com/g-baskin/chrome-extension-boilerplate/compare/v1.1.18...v1.1.19
[1.1.18]: https://github.com/g-baskin/chrome-extension-boilerplate/compare/v1.1.17...v1.1.18
[1.1.17]: https://github.com/g-baskin/chrome-extension-boilerplate/compare/v1.1.16...v1.1.17
[1.1.16]: https://github.com/g-baskin/chrome-extension-boilerplate/compare/v1.1.15...v1.1.16
[1.1.15]: https://github.com/g-baskin/chrome-extension-boilerplate/compare/v1.1.14...v1.1.15
[1.1.14]: https://github.com/g-baskin/chrome-extension-boilerplate/compare/v1.1.13...v1.1.14
[1.1.13]: https://github.com/g-baskin/chrome-extension-boilerplate/compare/v1.1.12...v1.1.13
[1.1.12]: https://github.com/g-baskin/chrome-extension-boilerplate/compare/v1.1.11...v1.1.12
[1.1.11]: https://github.com/g-baskin/chrome-extension-boilerplate/compare/v1.1.10...v1.1.11
[1.1.10]: https://github.com/g-baskin/chrome-extension-boilerplate/compare/v1.1.9...v1.1.10
[1.1.9]: https://github.com/g-baskin/chrome-extension-boilerplate/compare/v1.1.8...v1.1.9
[1.1.8]: https://github.com/g-baskin/chrome-extension-boilerplate/compare/v1.1.7...v1.1.8
[1.1.7]: https://github.com/g-baskin/chrome-extension-boilerplate/compare/v1.1.6...v1.1.7
[1.1.6]: https://github.com/g-baskin/chrome-extension-boilerplate/compare/v1.1.5...v1.1.6
[1.1.5]: https://github.com/g-baskin/chrome-extension-boilerplate/compare/v1.1.4...v1.1.5
[1.1.4]: https://github.com/g-baskin/chrome-extension-boilerplate/compare/v1.1.3...v1.1.4
[1.1.3]: https://github.com/g-baskin/chrome-extension-boilerplate/compare/v1.1.2...v1.1.3
[1.1.2]: https://github.com/g-baskin/chrome-extension-boilerplate/compare/v1.1.1...v1.1.2
[1.1.1]: https://github.com/g-baskin/chrome-extension-boilerplate/compare/v1.1.0...v1.1.1
[1.1.0]: https://github.com/g-baskin/chrome-extension-boilerplate/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/g-baskin/chrome-extension-boilerplate/releases/tag/v1.0.0
