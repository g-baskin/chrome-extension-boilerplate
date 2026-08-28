# Dev Toolz — Chrome Web Store Submission

Prepared for version 1.7.16 on 28 August 2026.

> This is practical publishing guidance, not legal advice. Confirm every privacy answer against the submitted build and your actual business practices before submission.

## Upload

Upload this file in the Chrome Web Store Developer Dashboard:

`/Users/dellcbyerllc/projects/chrome-extension-boilerplate/apps/dev-toolz/dev-toolz-1.7.16.zip`

## Store listing

### Product name

Dev Toolz

### Summary

Inspect, search, and export local API traffic from Chrome DevTools for authorized development and security testing.

### Category

Developer Tools

### Language

English (United States)

### Detailed description

Dev Toolz adds a focused API inspection workspace to Chrome DevTools. It helps developers and authorized security testers capture, search, compare, and export browser API traffic without sending captured data to an external service.

KEY FEATURES

• Search local HTTP, GraphQL, WebSocket, Server-Sent Events, WebTransport, and media traffic.
• Filter indexed history by source, time range, fields, values, and free text.
• Inspect grouped endpoints while keeping the exact source exchange available.
• Star important API and protocol events for later review.
• Track capture journeys across tabs and windows.
• Export a conservative OpenAPI 3.1 draft from observed traffic.
• Compare observed traffic with a local OpenAPI JSON baseline.
• Save same-origin request flows and run synchronized race checks.
• Control capture by site, including wildcard domain rules.
• Keep bounded history locally with automatic retention controls.

PRIVACY BY DESIGN

Captured traffic and settings are processed and stored locally in Chrome. Sensitive header, URL, and JSON field names are redacted before storage. Dev Toolz does not include advertising, analytics, tracking pixels, or an external account service. Data leaves the extension only when the user exports it or deliberately replays an authorized same-origin request.

AUTHORIZED USE ONLY

Use active testing and request replay only on systems you own or are explicitly authorized to assess. Dev Toolz is a developer aid, not authorization to test third-party systems.

### Website

https://backroomsoftware.com

### Support URL

Use a real public support page before submission. Recommended:

https://backroomsoftware.com/dev-toolz/support

Do not enter this URL until that page exists. A contact page on the same domain is acceptable temporarily.

### Privacy policy URL

Publish the draft below at:

https://backroomsoftware.com/dev-toolz/privacy

Do not submit that URL until the page is publicly accessible without signing in.

### Mature content

No.

### Distribution

Start with **Unlisted** for controlled testing. Switch to **Public** after installation, permissions, privacy text, and support links are verified from the store build.

Select only countries where you are prepared to support users. Worldwide distribution increases privacy-law scope.

## Graphic assets

### Required

- Store icon: 128 × 128 PNG. Use `apps/dev-toolz/public/icons/icon-128.png`.
- At least one screenshot: 1280 × 800 or 640 × 400, PNG or JPEG.

### Recommended screenshot set

1. Log Search with the field facets and populated results.
2. API Traffic with request and response details expanded.
3. Protocol traffic showing WebSocket or SSE events.
4. Endpoint inventory or OpenAPI comparison.
5. Saved flow and authorized race-run controls.

Use real-looking test data only. Remove tokens, cookies, personal data, private hostnames, and customer information.

### Optional promotional images

- Small promotional tile: 440 × 280.
- Marquee promotional tile: 1400 × 560.

Use the current Chrome Web Store dashboard dimensions if it displays different requirements.

## Privacy practices

### Single purpose

Dev Toolz helps developers and authorized security testers inspect, search, export, and safely replay browser API traffic from a local Chrome DevTools workspace.

### Data-use categories

Use the cautious disclosure and select:

- **Web history** — URLs, origins, routes, navigation context, and timestamps may appear in captured traffic.
- **User activity** — capture actions, saved events, filters, and request-flow actions are stored locally.
- **Website content** — request and response metadata or bodies may contain page and API content.

Do not select personally identifiable information, health information, financial information, personal communications, location, or authentication information unless your actual release intentionally stores those categories. The current code redacts common credential fields, but redaction cannot guarantee that arbitrary response content contains none of these data types.

### Data handling explanation

All captured traffic, searchable history, starred events, settings, and saved flows are stored locally in the user's Chrome profile. Dev Toolz has no external analytics, advertising, account, or telemetry service. The extension does not sell user data. Data is transmitted only when the user exports it or deliberately runs an authorized same-origin request replay against the original site.

### Required certifications

Check these only while they remain true:

- I do not sell or transfer user data to third parties outside approved use cases.
- I do not use or transfer user data for purposes unrelated to Dev Toolz's single purpose.
- I do not use or transfer user data for creditworthiness or lending decisions.

### Remote code

Select **No, I am not using remote code**.

Explanation if requested:

Dev Toolz ships all executable JavaScript inside the extension package and does not download or execute remote JavaScript or WebAssembly.

## Permission justifications

### `storage`

Stores user settings, site capture rules, starred events, saved request flows, and bounded searchable traffic history in the user's local Chrome profile.

### `unlimitedStorage`

Stores user-generated API and protocol history that can exceed the default extension storage quota during authorized debugging sessions. Dev Toolz applies bounded retention and storage-pressure cleanup locally.

### `tabs`

Identifies the active inspected tab, follows user-selected capture across tab and window transitions, and keeps captured events associated with the correct page context.

### `alarms`

Resumes temporarily paused capture rules and performs scheduled local capture-state maintenance without requiring the popup to remain open.

### `debugger`

Uses the Chrome DevTools Protocol, after the user enables capture, to inspect HTTP and supported protocol traffic for the selected tab. This is the extension's core function.

### `scripting`

Runs user-requested same-origin request-flow checks in the selected tab so requests use that page's browser context. Replay is restricted to authorized, user-initiated flows.

### Host permission: `<all_urls>`

Allows Dev Toolz to inspect API traffic on whichever site the user explicitly chooses to debug. The extension cannot predict development or test domains in advance; users can restrict capture with site rules.

## Reviewer notes

Dev Toolz is a local developer tool. To test it:

1. Open a normal webpage or local development application.
2. Open Chrome DevTools and select the **Dev Toolz** panel.
3. Enable capture for the current site.
4. Trigger an API request on the page.
5. Inspect the event in **API Traffic** or **Log Search**.

The `debugger` permission is required to access Chrome DevTools Protocol network events. Captured data remains local. Request replay is same-origin, user-initiated, strips sensitive headers, rejects redacted inputs, blocks redirects, and limits response handling.

No account, payment, license key, external server, or special reviewer credential is required.

## Privacy policy draft

Publish this text only after replacing `[SUPPORT EMAIL]` and confirming the facts.

---

# Dev Toolz Privacy Policy

**Effective date:** 28 August 2026

Dev Toolz is provided by Greg Baskin, backroomsoftware.com. This policy explains how the Dev Toolz Chrome extension handles information.

## Information Dev Toolz handles

When you enable capture, Dev Toolz may process browser API traffic associated with the selected site. This can include URLs, request and response metadata, request and response bodies, protocol events, timestamps, page context, saved flows, starred events, and extension settings.

Dev Toolz attempts to redact common sensitive headers, URL parameters, and JSON fields, including authorization values, cookies, passwords, secrets, tokens, API keys, sessions, and signatures. Automated redaction cannot identify every sensitive value. Do not capture systems or data you are not authorized to inspect.

## How information is used

Information is used only to provide local API inspection, search, export, specification comparison, capture history, and user-initiated same-origin request testing.

## Storage and sharing

Dev Toolz stores captured data and settings locally in your Chrome profile. Dev Toolz does not operate an external analytics, advertising, telemetry, or account service and does not sell captured data.

Information leaves the extension only when you deliberately export it or initiate an authorized same-origin request replay. A replay sends the selected request to the original site in your browser context.

## Retention and deletion

Dev Toolz applies bounded local retention and storage-pressure cleanup. You can delete captured history and saved extension data through Dev Toolz or by removing the extension and its Chrome storage. Exported files are controlled by you and are not deleted automatically.

## Security

Dev Toolz redacts common credential fields before local storage and restricts active request replay. No technical control can guarantee that captured website content contains no sensitive information. Use Dev Toolz only with data and systems you are authorized to inspect.

## Children's privacy

Dev Toolz is a professional developer tool and is not directed to children.

## Changes

This policy may change when Dev Toolz's data practices change. The effective date above will be updated when material changes are published.

## Contact

Questions or privacy requests: [SUPPORT EMAIL]

Website: https://backroomsoftware.com

---

## Before pressing Submit for Review

- Replace `[SUPPORT EMAIL]` and publish the privacy and support pages.
- Confirm the ZIP still reports version 1.7.16.
- Verify every permission explanation matches the uploaded package.
- Confirm screenshots contain no real secrets or personal data.
- Test installation from the dashboard's trusted-tester or unlisted flow.
- Keep the initial release unlisted until the store build is manually verified.
