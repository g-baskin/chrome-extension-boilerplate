# Copycat Clean-Room Parity Map

Goal: reproduce useful visible Facebook Ad Library workflows with original, local Social Finder behavior. Copycat code, assets, branding, selectors, credentials, private request IDs, network behavior, and prompts are excluded.

| Reference capability | Social Finder equivalent | Classification |
|---|---|---|
| Ad Library launch and keyword search | Validated public search builder | Equivalent |
| Automatic search | Explicit **Collect while I browse** | Intentionally different |
| Accelerated loading and auto-scroll | None | Prohibited |
| Visible ad discovery/counting | Tab/query-scoped rendered-card records | Equivalent |
| Runtime shown on each Ad Library card | Social Finder badge shows computed visible-start-date runtime | Equivalent |
| Runtime/platform/status filters | Deterministic local filters | Equivalent |
| Ad count filter | Visible collected/filtered/advertiser counts only | Intentionally different |
| Impression, spend, reach, popularity | None without rendered evidence | Unavailable |
| Sorting | Stable first-seen/date/runtime/advertiser sorts | Equivalent |
| Per-card open/copy/save/share/download | Native user-gesture actions | Equivalent |
| AI suggestions and analysis | Editable local prompt composition | Intentionally different |
| Saved ads/preferences | Versioned local storage with clear controls | Equivalent |
| Export/import | Bounded Social Finder JSON and safe CSV | Equivalent |
| Media download | Visible HTTPS media only; unavailable otherwise | Equivalent |
| Screenshot/drag | Memory-only capture plus PNG download | Equivalent |
| Accounts, plans, credits, inbox, telemetry | None | Intentionally unavailable |
| Remote boards/sync/integrations | None | Intentionally unavailable |
| Copycat visual identity | Compact Social Finder research rail | Intentionally different |

## Evidence rules

A record requires a visible numeric Library ID. Missing advertiser, status, start date, destination, media, or multiple-version evidence stays unavailable. Runtime is computed only from a visible start date and capture time. Every total and filter result is reproducible from locally held records.

## Safety boundary

No access-control bypass, private GraphQL interception, request patching, React Fiber inspection, automatic clicking/scrolling, unattended collection, remote selector execution, or invented performance facts. Collection is user-started, capped, visible, and stoppable.
