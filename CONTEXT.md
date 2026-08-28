# Glossary

**Monorepo** — One repository containing multiple independently buildable Chrome extensions and reusable packages.

**Extension app** — One Chrome extension with its own manifest, permissions, assets, development server, and release artifact.

**Shared package** — Reusable code consumed by multiple extension apps; it is not independently published or loaded into Chrome.

**Dev Toolz** — The first extension app in this monorepo.

**Detection expression** — A vendor-neutral Boolean rule evaluated against one normalized local log record. It combines field comparisons, text matching, existence checks, grouping, and negation without translating to or depending on a SIEM vendor query language.

**Capture journey** — The searchable handoff between captured tabs, windows, and navigations, including opener context and explicit markers where initial requests may have occurred before debugger attachment.
