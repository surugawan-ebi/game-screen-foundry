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
- Add screenshots or short GIFs to README after the UI settles.
- Audit demo fixture wording and asset notes before a wider announcement.

## Product Roadmap

- Asset inspector: add filters, asset-family grouping, and direct jump from validation diagnostics.
- Better regeneration queue: support batch grouping by visual family and history-aware requeueing.
- Review history: store adopted versions and comments outside browser memory.
- Structured spec editor: expand the current placement/inset editor into asset, overlay, and composition group editors.
- Shared assets: support a project-level shared registry for common nav buttons, resource icons, and panel families.
- Safer local file permissions: move from process-level allowlist to project session allowlist with explicit UI feedback.
- UI polish: make the workbench usable on smaller laptop screens and add clearer loading/progress states.
- Image postprocess: batch trim transparent gutters, normalize alpha edges, resize to declared final pixel size, and write adoption notes.
- 9-slice specs: separate generation base size from placement size, and validate fixed-size vs stretchable UI parts.
- Modal/bottom-sheet templates: add explicit screen templates for fixed-height and content-following modal behavior.
- Runtime style assets: distinguish `imageAsset`, `runtimeStyleToken`, and `proceduralEffect` so scrims/barriers are not forced into PNG assets.
- State variants: validate representative overlay sets per `stateVariant` so shared screens reveal density differences.

## Technical TODO

- Reduce coupling between demo data and app startup.
- Consider replacing ad-hoc HTTP server routing with a small framework only if route complexity keeps growing.
- Extend validation from placement boxes to PNG alpha bbox, transparent gutter thresholds, CTA count, and child count. (Safe label lanes, runtime text fit, and max lines are now covered by the layout quality review.)
- Add a clean-start/reset generated assets command for applying the tool to repos that already contain manually produced assets.

## Completed Handoff Cleanup

- Added a shared layout quality checker (`lib/layout-quality.js`): overlap padding between stacked assets, undeclared sibling overlap detection, parent-overflow warnings, font-size-aware text slot fit with CJK-aware width estimation, overlay slot padding, and horizontal/vertical guide-line alignment near-miss detection. Wired into the render model, `/api/composition-quality`, the browser spec check panel, `npm run validate`, and `npm run validate:project`.
- Injected layout context into imagegen jobs and prompts: per-asset stacking clearances, open layout findings, an explicit canvas coverage rule (fill edge-to-edge, never spill past the canvas), and a decoration budget computed from composition `contentInset` so frame ornament stays in the outer band and the content surface stays calm.
- Made imagegen handoff jobs agent-neutral: `commandHints` for Codex CLI and Claude Code, `BETA_IMAGEGEN_MODE=claude`, `BETA_CLAUDE_BIN`, and `npm run skill:install:claude` for installing the bundled skill into `~/.claude/skills`.
- Cleaned the Sky Port HOME demo against the new layout review: resolved a real coin-capsule/mail-button overlap, snapped top bar / CTA row / mission row / profile tile guide lines, declared intentional decorative overhangs in `allowedOverlaps`, and enlarged the mission reward value slot to a readable font size.

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
- Added a project screen navigator so users can load `game-creative-project.json` once and switch screens without typing `creative#screenId`.
- Added an implementation handoff report with layer order, runtime overlays, asset generation sources, and composition quality summary.
- Added an in-browser spec check panel for editor JSON parse errors, renderability, and composition quality diagnostics.
- Added `npm run init-project`, `npm run add-screen`, and `npm run validate:project` for external project onboarding.
- Added a browser structured spec editor for placement coordinates and composition content insets.
- Added project-local regeneration queue save/load.
- Added asset inspector provenance rows for placement details, composition references, and adopted source images.
- Removed demo-specific sky-port style leakage from external imagegen prompts and heuristic reviews.
- Added recursive `generated-assets/**/<assetId>.png` auto-registration for loaded screen folders.
- Resolved relative external `imagegenWorkflow.outputDir` from the screen folder and relative `jobDir` from the project root when a manifest is used.
- Documented external repo `.gitignore` guidance and `commandHint` absolute-path caveats.

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
