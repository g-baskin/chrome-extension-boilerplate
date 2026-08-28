# Chrome Extensions Monorepo

An npm-workspaces monorepo for independently buildable Chrome extensions and shared packages.

## Requirements

- Node.js 18+
- npm
- Google Chrome

## Install

```bash
npm install
```

## Extensions

| Extension | Workspace | Build output |
| --- | --- | --- |
| Dev Toolz | `@chrome-extensions/dev-toolz` | `apps/dev-toolz/dist` |

## Commands

```bash
npm run dev                 # Develop Dev Toolz
npm run build               # Build every extension
npm run build:dev-toolz     # Build only Dev Toolz
npm run lint                # Lint every extension
npm run typecheck           # Type-check every extension
```

To target a workspace directly:

```bash
npm run dev --workspace @chrome-extensions/dev-toolz
```

## Repository Layout

```text
apps/
  dev-toolz/                # One complete Manifest V3 extension
    public/
    scripts/
    src/
    CHANGELOG.md
    manifest.json
    package.json
    vite.config.ts
packages/                   # Add reusable packages when two apps need shared code
package.json                # Workspace commands and membership
```

Each extension owns its manifest, permissions, assets, source, configuration, and `dist` output. Add another extension as a sibling under `apps/` with its own unique workspace name and development port.

## Dev Toolz capabilities

- Inspect persistent HTTP, GraphQL, WebSocket, SSE, WebTransport, and media traffic.
- Export a conservative observed OpenAPI 3.1 draft and compare a local JSON baseline.
- Send Recon-captured same-origin or cross-origin HTTP(S) API requests into Race Lab.
- Manually run a 2–10 request synchronized race with redirect and response-size limits.
- Keep redaction enabled by default for sensitive URLs, headers, bodies, and protocol payloads.
- Temporarily disable redaction in **Options → Redaction coverage** to inspect raw new captures.
- Use active testing only on sites you own or are authorized to assess.

## Load Dev Toolz in Chrome

1. Run `npm run dev` or `npm run build:dev-toolz`.
2. Open `chrome://extensions/`.
3. Enable **Developer mode**.
4. Click **Load unpacked**.
5. Select `apps/dev-toolz/dist`.

## Recon → Race Lab

1. Open DevTools on your SaaS app and select **Dev Toolz**.
2. Let Recon capture the API request you want to verify.
3. Expand the request and click **Add to flow**.
4. Open **Race Lab**, choose the race step and concurrency, then run it.

Cross-origin API requests are accepted only when they came from captured traffic on the inspected page. Edited steps and non-HTTP(S) targets are rejected. Browser CORS and cookie policies still apply.

## Redaction coverage

Redaction is enabled by default and applies before new traffic reaches local extension storage. Disable it only while inspecting test data you control. Raw mode may store passwords, tokens, cookies, personal data, multipart bodies, and protocol payloads in plaintext. Re-enable redaction after verification; changing the toggle does not rewrite earlier captures.

## Shared Code

Create a package under `packages/` only after multiple extensions need the same code. Declare it as a workspace dependency in each consuming extension rather than importing across app folders.

## Versioning

Each extension versions independently with Semantic Versioning. Every user-visible release must update its workspace `package.json`, Chrome `manifest.json`, and `CHANGELOG.md`, then run `npm install --package-lock-only`. Dev Toolz builds fail when the package, manifest, lockfile, and latest changelog versions disagree.

```bash
npm run check:version --workspace @chrome-extensions/dev-toolz
```

## Publishing

Build the target extension, publish its changelog entry, zip its `dist` directory, and upload that archive through the Chrome Web Store Developer Dashboard.

## License

Copyright © 2026 [Greg Baskin](https://backroomsoftware.com).

Licensed under the [GNU Affero General Public License v3.0](LICENSE).
