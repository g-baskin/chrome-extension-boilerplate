# Agent Instructions

## Repository-wide version and change-control synchronization

- Every intentional app change must include a new semantic version and a pending release record in `CHANGEMANAGEMENT.md`; no exceptions, including fixes, tests, documentation, and configuration.
- Default to a patch bump unless the user specifies minor or major.
- For every affected app, synchronize its `package.json`, extension `manifest.json` when present, `package-lock.json` workspace entry, app changelog when present, and `CHANGEMANAGEMENT.md`.
- Never rebuild an app's production `dist` under an unchanged version.
- Run the mandatory pre-build checklist in `CHANGEMANAGEMENT.md`; record exact commands and results.
- Build only after version files and the release record are synchronized.
- After building, verify the emitted manifest version, complete the app's Chrome smoke checklist, and record successes and failures before asking the user to reload.
- Changes spanning multiple apps require a version bump and change-control record for every affected app.
