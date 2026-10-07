# chromadex

A fun-first named-color picker web app: explore color values, see where they live on a 2D color map, and find human-friendly names for them.

## Git hygiene

- Before committing, inspect `git status` and the staged diff.
- Stage explicit file paths; do not use `git add .` or `git add -A`.
- Commit only files changed for the current task.
- Never commit credentials, `.env` files, sessions, logs, caches, or runtime artifacts.
- Do not modify or add agent configuration unless the task explicitly requires it.

## Agent skills

### Issue tracker

Issues live as local markdown files under `.scratch/<feature>/`. See `docs/agents/issue-tracker.md`.

### Triage labels

Default canonical triage role strings (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `CONTEXT.md` + `docs/adr/` at the repo root. See `docs/agents/domain.md`.
