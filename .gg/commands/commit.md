---
name: commit
description: Run checks, agent code review, commit with AI message, and push
---

1. Run quality checks:
   - `npm run lint`
   - `npm run typecheck`
   Fix ALL errors before continuing. Use available auto-fix commands where appropriate.

2. Review changes with `git status`, `git diff --staged`, and `git diff`.

3. Fast review gate: spawn ONE subagent with the full diff. Tell it: review ONLY the diff for real bugs, regressions, leftover debug code, and unintended changes. Score each issue 0-100 confidence; pre-existing issues and stylistic nitpicks are false positives and score low. Report ONLY issues scoring >= 80 with `file:line` and a one-line fix. If none, reply `CLEAR`. Be fast; this is not a deep audit.

4. If `CLEAR`, proceed directly and push without asking anything. If issues scored >= 80, STOP and ask exactly:
   "Want me to fix this first, or commit and push anyway?
   A) Fix it first, then commit & push
   B) Commit & push anyway"
   On A, fix and re-run step 1, then continue without re-review. On B, continue unchanged.

5. Stage relevant files using specific `git add` paths, never `git add -A`.

6. Generate a concise commit message, preferably one line, beginning with Add, Update, Fix, Remove, or Refactor.

7. Commit and push without another confirmation: `git commit -m "<generated message>" && git push`.
