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

- Split more schema documentation from the long product spec into concise user-facing docs.
- Add a CLI helper such as `npm run init-project -- /path/to/game/creative` if the workflow stabilizes.
- Add screenshots or short GIFs to README after the UI settles.
- Audit demo fixture wording and asset notes before a wider announcement.

## Product Roadmap

- Project navigator: choose screens from `game-creative-project.json` inside the UI instead of typing `creative#screenId`.
- Asset inspector: extend the composition panel with source PNG metadata and per-asset provenance.
- Better regeneration queue: persist queue state to a project-local file and support batch grouping by visual family.
- Review history: store adopted versions and comments outside browser memory.
- Shared assets: support a project-level shared registry for common nav buttons, resource icons, and panel families.
- Export report: generate an implementation handoff package for game engineers with layer order, coordinates, text overlays, and asset paths.
- Safer local file permissions: move from process-level allowlist to project session allowlist with explicit UI feedback.
- Schema validation errors: show actionable messages in the browser instead of raw exceptions.
- UI polish: make the workbench usable on smaller laptop screens and add clearer loading/progress states.

## Technical TODO

- Reduce coupling between demo data and app startup.
- Consider replacing ad-hoc HTTP server routing with a small framework only if route complexity keeps growing.

## Completed Handoff Cleanup

- Added `docs/schema.md` with the public file contract for project manifests, screen folders, `screen-kv.json`, `material-spec.json`, `world-preset.json`, and `imagegen-assets.json`.
- Added `schemas/project-manifest.schema.json`.
- Added a minimal loadable blank project template under `templates/blank-project`.
- Added tests for `/api/source-file` allow/deny behavior.
- Added tests that relative inline `imagegenAssets` paths resolve from the loaded screen folder.
- Moved the no-outputDir imagegen fallback away from demo-specific paths.
- Added GitHub Actions for `npm run release:check` on Node 20.x and 22.x.
- Added `docs/release-checklist.md`.
- Added JSON schemas for `screen-kv.json`, `material-spec.json`, `world-preset.json`, and `imagegen-assets.json`.
- Added `npm run lint`, `npm run validate`, `npm run check`, and `npm run release:check`.
- Added bundled Codex skill under `skills/game-screen-foundry`.
- Added `docs/quality-rubric.md` and `worldPreset.qualityProfile` prompt injection for commercial-grade asset quality criteria.
- Added `qualityProfile.layoutAnatomy` and imagegen `qualityPlan` output so panel/card/button assets preserve decorative perimeter, calm content surface, reserved content slots, protected runtime slots, inferred inner content regions, and child-placement zones.
- Added `material-spec.compositionGroups` plus validation checks for grouped placements, protected overlays, child groups, and output assets.
- Added `childContentPlacementIds`, `contentInset`, and `minChildInset` so composition validation can catch child UI that touches or escapes a parent frame.
- Added `layerFitRules` for composition layers, including `same_canvas`, `inside_root`, `edge_attached`, and `decorative_overlap`.
- Added a shared composition quality checker and `/api/composition-quality`.
- Added browser UI for composition group selection, canvas highlights, content inset overlays, protected overlay outlines, and pass/warn/fail summaries.
- Added composition group context to imagegen job JSON and prompts so single-asset generation keeps sibling layers and protected runtime slots in mind.
- Upgraded the Sky Port HOME sample with public-quality composition groups and layer fit rules for the primary CTA, gift CTA, gacha CTA, and daily mission rows.

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
