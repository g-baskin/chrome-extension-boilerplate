# Documentation Framework

> Category: Standard | Version: 1.0 | Date: August 2026 | Status: Active

This repository uses the canonical library schema v2 for maintained documentation.

**Related:**
- [Repository library](../../../README.md)

## Rules

- Put customer-facing material under `library/knowledge/public/` and internal engineering material under `library/knowledge/private/`.
- Put queued, active, and completed product requirements under the corresponding `library/requirements/` lifecycle directory.
- Put GitHub-backed issue records under the corresponding `library/issues/` lifecycle directory.
- Agents must never create or modify content under `library/notes/`; that directory is exclusively human-owned.
- Do not create content in schema v1 paths or derived wiki mirrors.
- Engineering documentation must cite the related repository code paths.
