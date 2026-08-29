# Agent Instructions

## Dev Toolz version and build synchronization

- Any Dev Toolz production rebuild must include a new semantic version; never rebuild `apps/dev-toolz/dist` under an unchanged version.
- Default to a patch bump for fixes and performance changes unless the user specifies minor or major.
- Update `apps/dev-toolz/package.json`, `apps/dev-toolz/manifest.json`, the `apps/dev-toolz` entry in `package-lock.json`, `apps/dev-toolz/CHANGELOG.md`, and the pending release record in `CHANGEMANAGEMENT.MD` together.
- Run the mandatory pre-build checklist in `CHANGEMANAGEMENT.MD`; record exact commands and results.
- Run `npm run build:dev-toolz` only after the version files and release record are synchronized.
- After building, verify `apps/dev-toolz/dist/manifest.json`, complete the Chrome smoke checklist, and record what worked or failed before asking the user to reload.
- Tests, lint, typecheck, and documentation-only changes do not require a version bump unless they also rebuild `dist`.
