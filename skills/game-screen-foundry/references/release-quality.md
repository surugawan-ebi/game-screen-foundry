# Release Quality

Use this when preparing this repository for public handoff, beta release, or external AI adoption.

## Release Gate

Always run:

```sh
npm run release:check
```

This includes:

- JavaScript syntax check.
- JSON parse check.
- loadable project validation.
- node test suite.
- local path leakage check.
- tracked `imagegen-jobs/` output check.

## Repository Hygiene

- Keep `imagegen-jobs/` ignored except `imagegen-jobs/.gitkeep`.
- Do not commit `.env` files.
- Do not commit external game project workspaces.
- Do not commit machine-local absolute paths.
- Keep examples as demo fixtures, not a reusable production asset pack.

## Documentation To Update

Update these when behavior changes:

- `README.md` for user-facing workflow.
- `docs/schema.md` for file contract changes.
- `docs/quality-rubric.md` for commercial asset quality and prompt criteria changes.
- `docs/project-workflow.md` for operational model changes.
- `docs/release-checklist.md` for release gate changes.
- `TODO.md` for roadmap and handoff status.
- `skills/game-screen-foundry` when AI adoption guidance changes.

## CI

GitHub Actions runs `npm run release:check` on Node 20.x and 22.x. If a new script is required for release confidence, include it in `release:check` rather than relying on manual instructions.

## Remaining Production Gaps To Surface

If asked whether the project is "production-ready", distinguish:

- OSS/local-first beta: acceptable when `release:check` passes and docs are current.
- Broad public announcement: add screenshots/GIFs and fresh clone smoke testing.
- Hosted production service: out of scope until permission/session model, persistence, and hosted security are redesigned.
