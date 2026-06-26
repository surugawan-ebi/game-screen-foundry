# TODO / Roadmap

This file is the handoff note for the public beta. The current repository is usable as a local proof-of-workbench, but the next work should focus on making the workflow safer, clearer, and easier to adopt in real game projects.

## Current Status

- Local Node/browser app with no external web service.
- Demo screen loads on startup.
- Screen assembly supports layered assets, runtime text overlays, z-order, layout safety tests, generated PNG adoption, and wireframe preview.
- Multi-screen project folders are supported through `game-creative-project.json`.
- Codex/imagegen integration is currently a prompt/job-file workflow, not a fully automated hosted generation pipeline.
- Public repo has MIT license, README, product notes, test suite, and demo fixtures.

## Near-Term Cleanup

- Split schema documentation from the long product spec into concise user-facing docs.
- Add `docs/schema.md` with canonical definitions for `screen-kv.json`, `material-spec.json`, `world-preset.json`, and `imagegen-assets.json`.
- Add a minimal blank project template under `templates/`.
- Add a CLI helper such as `npm run init-project -- /path/to/game/creative` if the workflow stabilizes.
- Add screenshots or short GIFs to README after the UI settles.
- Audit demo fixture wording and asset notes before a wider announcement.

## Product Roadmap

- Project navigator: choose screens from `game-creative-project.json` inside the UI instead of typing `creative#screenId`.
- Asset inspector: show placement box, text slots, allowed overlaps, and source PNG metadata in one panel.
- Better regeneration queue: persist queue state to a project-local file and support batch grouping by visual family.
- Review history: store adopted versions and comments outside browser memory.
- Shared assets: support a project-level shared registry for common nav buttons, resource icons, and panel families.
- Export report: generate an implementation handoff package for game engineers with layer order, coordinates, text overlays, and asset paths.
- Safer local file permissions: move from process-level allowlist to project session allowlist with explicit UI feedback.
- Schema validation errors: show actionable messages in the browser instead of raw exceptions.
- UI polish: make the workbench usable on smaller laptop screens and add clearer loading/progress states.

## Technical TODO

- Add a real JSON schema for the project manifest.
- Add tests for `/api/source-file` allow/deny behavior.
- Add tests that relative `imagegenAssets` paths stay portable after cloning the repository.
- Reduce coupling between demo data and app startup.
- Move demo-specific defaults out of `lib/imagegen-workflow.js`.
- Add a lightweight release checklist.
- Add GitHub Actions for `npm test`.
- Add `npm run lint` or a minimal formatter policy.
- Consider replacing ad-hoc HTTP server routing with a small framework only if route complexity keeps growing.

## Public Beta Boundaries

- Do not present this as a general AI image generator.
- Do not promise automated image generation. The stable workflow is currently "create prompt/job files, generate externally, re-import PNGs."
- Do not treat bundled demo assets as a reusable production asset pack.
- Keep the tool local-first until the local file and project permission model is mature.

## Release Checklist

- `npm test`
- Confirm `rg -n "/Users/|private/tmp|app/neta|Applications/Codex" .` returns no accidental local paths, except intentional documentation examples if any.
- Confirm `imagegen-jobs/` contains only `.gitkeep` as a tracked file.
- Confirm README Quick Start works from a fresh clone.
- Confirm examples load and generated PNG previews are visible.
- Tag beta releases only after the current schema is documented.
