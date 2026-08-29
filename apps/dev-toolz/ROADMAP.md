# Dev Toolz Roadmap

## Candidate — runtime verification pending

### Purple Proof Runs

**User outcome:** Run reviewed same-origin journeys and measure prevention and detection evidence separately.

**Evidence:** Existing Race Lab replay controls, captured traffic, journey lineage, and Log Search.

**Dependency:** Purple Flow storage, bounded runner, and evidence queries.

**Acceptance checklist:**

- [ ] Reviewed same-origin journeys run sequentially and support cancellation.
- [ ] Prevention and detection outcomes appear separately for every step.
- [ ] Matching post-run Log Search events link to detection evidence.
- [ ] Missing evidence, navigation, timeout, redirect, and stale captures are inconclusive.
- [ ] Redacted reports exclude bodies, cookies, and identity secrets.
- [ ] Disallowed sites, changed origins, malformed flows, and concurrent runs fail closed.

### Authorization Matrix

**User outcome:** Compare captured requests across browser, anonymous, and ephemeral named identities.

**Evidence:** Autorize-style response comparison using status, redirect, length, and SHA-256 fingerprints.

**Dependency:** Purple runner and memory-only Authorization values.

**Acceptance checklist:**

- [ ] Browser, anonymous, and at least two ephemeral header identities can be compared.
- [ ] Secret values remain masked, unpersisted, unlogged, and cleared after execution.
- [ ] Results explain status, length, redirect, and fingerprint differences.
- [ ] Similar lower-privilege responses are possible bypasses, never automatic vulnerabilities.
- [ ] Cross-origin, stale, changed-tab, denied-site, malformed-header, timeout, and redirects fail closed.

### Attack Flow

**User outcome:** Inspect journey causality, ATT&CK mappings, outcomes, and linked evidence.

**Evidence:** Attack Flow 2.0 extension objects in STIX 2.1 bundles.

**Dependency:** Purple Flow and Proof Run evidence.

**Acceptance checklist:**

- [ ] Selecting a flow produces a connected ordered graph and accessible details list.
- [ ] ATT&CK tactic and technique metadata is editable without changing captured evidence.
- [ ] Proof outcomes create condition nodes linked to direct evidence.
- [ ] STIX export has stable flow, asset, action, condition, and relationship references.
- [ ] Empty, malformed, cyclic, or dangling graphs fail validation before export.

### Agent Inspector

**User outcome:** Passively inspect evidence-linked MCP and A2A activity without executing it.

**Evidence:** MCP JSON-RPC methods and A2A card, message, task, artifact, REST, and SSE schemas.

**Dependency:** Captured HTTP/SSE traffic and local redaction.

**Acceptance checklist:**

- [ ] MCP and A2A lifecycle events form readable evidence-linked timelines.
- [ ] Unknown JSON-RPC remains ordinary traffic.
- [ ] Capability and risk labels identify their triggering field.
- [ ] Malformed, nested, oversized, binary, and secret-bearing inputs stay bounded and redacted.
- [ ] Inspection never sends traffic, follows references, or executes discovered tools.

### Journey Studio (Arazzo)

**User outcome:** Build, import, export, and review executable journeys as Arazzo 1.1 JSON.

**Evidence:** OpenAPI Initiative Arazzo 1.1 workflows, steps, operation references, and runtime expressions.

**Dependency:** Purple Flow storage, captured requests, and a loaded local OpenAPI baseline.

**Acceptance checklist:**

- [ ] Captures can be added, reordered, named, mapped, saved, reloaded, and run.
- [ ] Supported Arazzo 1.1 JSON imports into the editable flow model.
- [ ] Round trips preserve supported order, mappings, inputs, and expectations.
- [ ] Unsupported versions and features report precise errors without silent loss.
- [ ] Oversized, nested, external, unresolved, and unsafe imports are rejected before storage.
- [ ] Export excludes bodies, credentials, cookies, and ephemeral identity values.

## Backlog

### Detection Forge / portable Sigma packs

**User outcome:** Turn observed traffic and proof evidence into portable detection packs.

**Evidence:** Existing Log Search detection expressions and Sigma’s portable rule model.

**Dependency:** Stable Purple Run evidence schema and explicit field mappings.

**Promotion criteria:** A lossless mapping exists for supported fields, validation, tests, and redacted export.

### Browser-native security findings timeline via CDP Audits

**User outcome:** Correlate browser security findings with captured requests and journey steps.

**Evidence:** Chrome DevTools Protocol Audits events.

**Dependency:** Browser-version compatibility research and durable finding-to-capture linkage.

**Promotion criteria:** Supported events are verified, bounded, deduplicated, and linked without new permissions.

### Security-control regression twin

**User outcome:** Re-run approved controls against stable captured scenarios after application changes.

**Evidence:** Purple Flow expectations, run scoring, and stored compact summaries.

**Dependency:** Stable capture identity, drift detection, scheduling policy, and explicit authorization review.

**Promotion criteria:** Replay freshness and ownership are provable, failures remain explainable, and secrets never persist.
