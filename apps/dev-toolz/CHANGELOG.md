# Changelog

All notable Dev Toolz changes are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and Dev Toolz uses [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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

[Unreleased]: https://github.com/KenKaiii/kens-chrome-extension/compare/v1.1.6...HEAD
[1.1.6]: https://github.com/KenKaiii/kens-chrome-extension/compare/v1.1.5...v1.1.6
[1.1.5]: https://github.com/KenKaiii/kens-chrome-extension/compare/v1.1.4...v1.1.5
[1.1.4]: https://github.com/KenKaiii/kens-chrome-extension/compare/v1.1.3...v1.1.4
[1.1.3]: https://github.com/KenKaiii/kens-chrome-extension/compare/v1.1.2...v1.1.3
[1.1.2]: https://github.com/KenKaiii/kens-chrome-extension/compare/v1.1.1...v1.1.2
[1.1.1]: https://github.com/KenKaiii/kens-chrome-extension/compare/v1.1.0...v1.1.1
[1.1.0]: https://github.com/KenKaiii/kens-chrome-extension/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/KenKaiii/kens-chrome-extension/releases/tag/v1.0.0
