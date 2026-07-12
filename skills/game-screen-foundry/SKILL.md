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
- Do not bake functional surfaces (world maps, boards, list surfaces, tap targets) into background assets. Split the backdrop and the functional surface into separate assets, give the functional surface its own frame, and place tokens/markers on the surface asset.
- Do not rely on runtime stretching. Generate every raster at its final placement pixel size. Declare `exportRequirements.scalingPolicy: "nine_slice"` with `nineSliceInsets` only when the asset family is genuinely designed for slicing; otherwise the scaling audit fails the asset.
- Do not add `allowedOverlaps`, `layerFitRules` with `minInset: 0`, or other declarations merely to make validation pass. Declarations must describe real visual intent; a layer that sits flush on a foundation root fails regardless of the declared minInset.
- Foundation shells (docks, bottom sheets, panels, HUD plates) must declare a composition group `contentInset` matching their baked frame thickness, so the decoration budget and child-content checks reflect the real usable area. The declared inset must match the frame actually painted in the PNG — if the generated art grew a wider frame, regenerate it with the decoration budget or raise the inset and re-place children.
- Sibling runtime lanes on one shell (HUD values, row counters) must share one lane template: same slot height, same vertical center, one font scale per rank. Intentional hierarchy (title + meta) needs a 1.4x+ font ratio. The `lane_rhythm_inconsistent` check enforces this, and the imagegen prompt declares the exact lane count so baked segment dividers match the content structure.
- Functional surfaces (maps, boards) are full raster art at key-visual detail density — never simplified vector-style diagrams, even when generated separately from the backdrop.
- Runtime text colors must survive on the generated backdrop; the scaling audit samples the PNG under each slot and warns below a 2.5 contrast ratio (`text_contrast_low`).
- Raster asset bodies must be opaque inside the silhouette; largely semi-transparent output fails (`asset_interior_translucent`). Intentionally translucent assets (scrims, glows) declare `exportRequirements.renderIntent: "translucent_effect"`, which also exempts them from the craft audit. Never declare it just to silence a broken generation.
- Do not move layout coordinates while responding to visual feedback unless the task explicitly asks for layout changes.
- Do not commit proprietary external game assets into this tool repository.
- Do not commit full reference profiles that contain machine-local source paths; commit only compact `qualityProfile.referenceDerived` data when needed.

## Design Rules

Screen design constraints live in `world-preset.json` under `designRules` and are enforced by the validators and injected into imagegen prompts:

- `spacingUnit` (default 4): layout coordinates snap to this grid.
- `frameThickness` (default 10): baked decorative frame budget on foundation assets; layers and text slots must stay inside it.
- `iconTextCenterTolerance` (default 2): icons and text labels forming one lane must share a horizontal center line within this many px.
- `minTouchTarget` (default 0 = off): minimum interactive size for buttons.
- `scalingPolicyDefault` (default `fixed`): assets are used at native pixel size; stretching requires an explicit per-asset `nine_slice`/`tile` declaration.
- `craftStyle`: opt-in craft target (`outlined_cel` / `flat_minimal` / `painterly`). Declaring it injects a craft spec into every prompt (outline treatment, cel band counts, palette restraint, family consistency) and makes the PNG audit measure each generated asset: weak silhouette outlines (`craft_outline_weak`), flat placeholder/vector fills (`craft_shading_flat`), muddy soft gradients (`craft_shading_muddy`), and busy foundation interiors (`craft_interior_busy`).

### Choosing craftStyle (do this when creating or first validating a project)

Pick the value that matches the key visual / world preset art direction. Look at the KV (or existing adopted assets) and decide:

| Signal in the KV / assets | craftStyle |
| --- | --- |
| Sprites have a visible dark contour line around every shape; shading is flat color steps (cel/pixel-art game look, like commercial 2D asset packs) | `outlined_cel` |
| Flat single-color shapes, uniform thin strokes, modern minimal mobile UI, no textures | `flat_minimal` |
| Painted/brushy rendering, soft lit materials, rich tonal ranges, no hard contour line (painterly fantasy UI) | `painterly` |

Rules of thumb:

- If the project has adopted PNGs and no declared craftStyle, `npm run validate:project` prints a `craft_style_unset` hint with a measured suggestion — use it as the default answer unless the user states a different art direction.
- Declare exactly one craftStyle per world preset; all screens sharing that preset inherit it, keeping the whole game one family.
- If many `craft_*` warnings appear right after declaring a style, first re-check the style choice (a `painterly` project audited as `outlined_cel` floods outline warnings). Only after the style is confirmed should you treat the warnings as regeneration work.
- Do not leave craftStyle unset in real projects: unset means the craft audit is off and prompts carry no craft spec.
- `principles`: free-text design principles added to every generation prompt.

For richer, project-specific targets, run `npm run profile:reference -- <purchased-asset-root>` and apply the compact profile to `worldPreset.qualityProfile.referenceDerived`; the profile now also captures outline coverage/contrast and luminance band counts from the reference set.

After importing generated PNGs, run `npm run postprocess:assets -- <screen-folder> --apply` to trim transparent gutters and normalize each PNG to its target pixel size (foundation surfaces are stretched edge-to-edge; icons are uniform-fitted and centered).

## Imagegen Handoff Execution

- Handoff jobs under `imagegen-jobs/<jobId>.json` are agent-neutral: Codex CLI and Claude Code can both process them. Follow `<jobId>.prompt.md`, generate each asset with the available image generation path, and save each accepted PNG exactly to its `outputPath`.
- Each job asset carries `qualityPlan`, `compositionContexts`, and `layoutContext` (overlap clearances, stacking partners, open layout issues). Respect the canvas coverage rule: fill the asset canvas edge-to-edge and never let artwork spill past it.
- If generation is unavailable, write the blocker sidecar described in the job JSON. Never save placeholder or wireframe images.

## Structure Preview (before generating images)

Review the screen structure visually before any imagegen work:

```sh
npm run structure:preview -- /path/to/creative [screen-id] --out structure.svg
```

Every placement renders as a flat colored rectangle whose lightness rises with stacking depth (topmost = lightest), runtime overlays render as real text, and placement ids are labeled. Composition-group roots with a declared `contentInset` additionally show the decorative frame band as diagonal hatching and the content surface as a dashed box — a root without hatching is a shell whose contentInset is still undeclared. When the shell hosts functional children between the frame and the child-content area (header strips, footer buttons), declare `frameInset` for the painted frame band: the hatch then shrinks to the real decoration, the dashed box stays at the contentInset, and the un-marked band between them is where those children live. If the whole contentInset band shows hatched but contains functional children, that is the signal to add `frameInset`. Runtime text overlays render inside their declared text region (`slot` / `width`/`height`) as a dashed box; a red box + red tint means the `sampleText` overflows the region width (same CJK-aware estimation as `text_overflow_x`), so fix the slot, font size, or copy before generating. Check that the pile depths, paddings, frame bands, and text slots look right here first; fixing the spec at this stage is far cheaper than regenerating art. The browser exposes this workflow as ワイヤーフレーム作成, with ワイヤーフレーム as the view-mode button.

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
