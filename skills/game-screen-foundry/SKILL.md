---
name: game-screen-foundry
description: Build, modify, validate, and review Game Screen Foundry projects and screen folders. Use when an AI agent (Codex or Claude Code) needs to create or edit `screen-kv.json`, `material-spec.json`, `world-preset.json`, `imagegen-assets.json`, `game-creative-project.json`, generated asset workflows, imagegen handoff jobs, regeneration prompts, or quality checks for this local game UI asset workbench.
---

# Game Screen Foundry

Use this skill for Game Screen Foundry project work: creating screen folders, editing assembly specs, preparing imagegen asset workflows, reviewing generated screens, and validating release readiness.

## Start Here

1. Locate the repository root and read `README.md`, `docs/schema.md`, and `docs/release-checklist.md` only as needed.
2. Preserve the three-file screen contract: `screen-kv.json`, `material-spec.json`, `world-preset.json`.
3. Keep generated job output out of Git: never stage generated files under `imagegen-jobs/`, except `imagegen-jobs/.gitkeep`.
4. For purchased/reference assets, derive only a quality profile; never copy proprietary source assets into this repository.
5. Run `npm run release:check` before handing off repo changes.
6. Prefer project-relative paths and screen-folder-relative image paths; avoid machine-local absolute paths in committed JSON.

## Task Routing

- Creating a new project or screen: read `references/project-setup.md`.
- Editing schema files or assembly specs: read `references/file-contract.md`.
- Reviewing generated assets or building regeneration requests: read `references/review-and-regeneration.md`.
- Preparing public release or repo handoff: read `references/release-quality.md`.
- Deriving quality criteria from reference UI assets: read `docs/quality-rubric.md` in the repository, then use `npm run profile:reference -- <reference-root>`.

## Non-Negotiable Rules

- Do not treat this as a general-purpose image generator.
- Do not promise hosted or fully automated image generation. The stable workflow is prompt/job file creation, external image generation, and PNG re-import.
- Do not bake runtime text, values, labels, timers, or notification counts into generated PNGs unless `textHandling.ownership` is explicitly `baked_in_asset`.
- Do not collapse parent frames and child UI into one image when the material spec separates them.
- Do not move layout coordinates while responding to visual feedback unless the task explicitly asks for layout changes.
- Do not commit proprietary external game assets into this tool repository.
- Do not commit full reference profiles that contain machine-local source paths; commit only compact `qualityProfile.referenceDerived` data when needed.

## Imagegen Handoff Execution

- Handoff jobs under `imagegen-jobs/<jobId>.json` are agent-neutral: Codex CLI and Claude Code can both process them. Follow `<jobId>.prompt.md`, generate each asset with the available image generation path, and save each accepted PNG exactly to its `outputPath`.
- Each job asset carries `qualityPlan`, `compositionContexts`, and `layoutContext` (overlap clearances, stacking partners, open layout issues). Respect the canvas coverage rule: fill the asset canvas edge-to-edge and never let artwork spill past it.
- If generation is unavailable, write the blocker sidecar described in the job JSON. Never save placeholder or wireframe images.

## Validation

Before handing back spec edits, run layout and composition checks:

```sh
npm run validate:project -- /path/to/creative [screen-id]
```

This validates renderability, composition groups, and layout quality: overlap padding between stacked assets, text slot fit at the declared font size, and horizontal/vertical guide-line alignment. Fix `fail` checks; treat `warn` checks as review items.

For code, docs, schema, template, or workflow changes, run:

```sh
npm run release:check
```

For a quick project-load sanity check after creating a screen folder, run the app and load the folder:

```sh
npm run dev
```

Then open `http://127.0.0.1:4311`.
