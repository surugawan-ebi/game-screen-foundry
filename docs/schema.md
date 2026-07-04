# Data Schema

This page is the concise public contract for project files used by Game Screen
Foundry. The app accepts a screen folder directly, or a project folder with a
`game-creative-project.json` manifest that points to one or more screen folders.

## Project Manifest

File: `game-creative-project.json`

Purpose: list the screens in a creative project and choose the default screen.

Required fields:

- `projectId`: stable machine-readable project id.
- `projectName`: human-readable project name.
- `screens`: array of screen entries.
- `screens[].screenId`: stable id used in `creative#screenId`.
- `screens[].path`: relative path from the manifest folder to the screen folder.

Optional fields:

- `defaultScreenId`: screen id loaded when no hash is provided.
- `screens[].name`: human-readable screen label.

Compatibility aliases:

- `screens[].folderPath` and `screens[].dir` are accepted by the loader, but
  new projects should use `screens[].path`.

JSON Schema: [schemas/project-manifest.schema.json](../schemas/project-manifest.schema.json)

Example:

```json
{
  "projectId": "sample_game",
  "projectName": "Sample Game",
  "defaultScreenId": "home",
  "screens": [
    {
      "screenId": "home",
      "name": "HOME",
      "path": "screens/home"
    }
  ]
}
```

## Screen Folder

Required files:

- `screen-kv.json`
- `material-spec.json`
- `world-preset.json`

Optional files:

- `key-visual.png`
- `imagegen-assets.json`
- `generated-assets/`
- `bundle.json`

If the split JSON files are present, they are preferred over `bundle.json`.

## `screen-kv.json`

Purpose: identify the screen and fix its base canvas.

JSON Schema: [schemas/screen-kv.schema.json](../schemas/screen-kv.schema.json)

Required fields:

- `screenId`
- `screenName`
- `screenRole`
- `canvasWidth`
- `canvasHeight`

Recommended fields:

- `baseResolution`
- `worldPresetId`
- `uiDensity`
- `safeAreas`
- `stateVariantKeys`

Example:

```json
{
  "screenId": "home",
  "screenName": "Home",
  "screenRole": "home",
  "canvasWidth": 1280,
  "canvasHeight": 720,
  "baseResolution": "1280x720",
  "worldPresetId": "preset_sample_01",
  "uiDensity": "medium",
  "safeAreas": {
    "top": 24,
    "right": 24,
    "bottom": 24,
    "left": 24
  },
  "stateVariantKeys": ["normal"]
}
```

## `material-spec.json`

Purpose: describe enough layers, assets, runtime text slots, and safety rules to
rebuild the screen preview.

JSON Schema: [schemas/material-spec.schema.json](../schemas/material-spec.schema.json)

Required top-level fields:

- `screenMeta`
- `placements`
- `assets`

Optional top-level fields:

- `contentOverlays`
- `compositionGroups`
- `assemblyPolicy`

Required placement fields:

- `placementId`
- `assetId`
- `x`
- `y`
- `width`
- `height`
- `anchor`
- `zIndex`

Recommended placement fields:

- `parentId`
- `blendMode`
- `opacity`
- `stateVisibility`
- `slot`
- `padding`
- `notes`

Required asset fields:

- `assetId`
- `assetType`
- `role`
- `purpose`
- `renderGroup`
- `visualPriority`
- `styleNotes`
- `functionNotes`
- `exportRequirements`

Recommended asset fields:

- `generationPlan`
- `textHandling`
- `contentModel`
- `negativeNotes`
- `referenceAssets`

Required overlay fields:

- `overlayId`
- `kind`
- `x`
- `y`
- `width`
- `height`
- `anchor`
- `zIndex`

Recommended overlay fields:

- `targetPlacementId`
- `slot`
- `sampleText`
- `fontSize`
- `align`
- `valign`
- `color`
- `strokeColor`
- `strokeWidth`

Recommended composition group fields:

- `groupId`: stable id for a reusable visual composition.
- `kind`: composition type such as `layered_button`, `layered_card_cta`,
  `runtime_labeled_button`, or `layered_panel`.
- `rootPlacementId`: primary/root placement for the group.
- `layerPlacementIds`: placements that form the grouped visual, in addition to
  their normal `zIndex` order. These are visual layers or decorative accents;
  they are not checked against child-content inset rules.
- `layerFitRules`: optional per-layer placement intent. Use it to distinguish
  `same_canvas`, `inside_root`, `sibling`, `edge_attached`, and
  `decorative_overlap` layers, and to declare `minInset`, `minGap`, or
  `allowedOverflow`.
- `childContentPlacementIds`: placements that must stay inside the root
  placement's usable content area.
- `contentInset`: root-local inset object `{ "top", "right", "bottom", "left" }`
  defining the safe area for `childContentPlacementIds`.
- `frameInset`: optional root-local inset describing the painted decorative
  frame band of the root asset. Distinct from `contentInset`: the band between
  `frameInset` and `contentInset` may host other functional children (header
  strips, footer buttons) and is neither decoration nor child-content area.
  When declared it drives the imagegen decoration budget, the structure
  preview hatching, and per-side layer frame checks; without it the whole
  `contentInset` band is treated as decoration. Declaring a `frameInset` wider
  than `contentInset` warns (`frame_inset_exceeds_content`).
- `minChildInset`: shorthand minimum inset. It can be a number or an inset
  object. When both `contentInset` and `minChildInset` are present, the stricter
  edge value is used.
- `protectedOverlayIds`: runtime overlays whose slots must stay readable when
  the group is composed.
- `childGroupIds`: optional nested composition group ids.
- `outputAssetId`: optional asset id that represents the main/generated base of
  the group.
- `qualityChecks`: group-level checks used by humans and AI reviewers.
- `notes`: short human-readable implementation notes.

Important rules:

- Runtime text, numbers, labels, timers, and notification counts should be
  represented as `contentOverlays`, not baked into generated PNGs.
- Parent frames should not bake child buttons, headers, rows, icons, or runtime
  labels unless the asset explicitly says `textHandling.ownership` is
  `baked_in_asset`.
- Use `compositionGroups` when several placements form one intended UI object,
  such as a layered button, CTA card, nav tab, or panel shell. This gives the
  format checker and AI review a stable unit for quality checks.
- Use `layerFitRules` for visual/decorative layers. A child layer that is
  narrower than the root should usually be `inside_root` with `minInset`; a
  badge or gem that crosses an edge should be `edge_attached` or
  `decorative_overlap` with explicit `allowedOverflow`.
- Use `childContentPlacementIds` plus `contentInset` or `minChildInset` for
  objects placed inside a parent frame. Do not use it for intentional decorative
  overhangs such as badges, gems, wing ornaments, or sockets that are meant to
  cross the frame boundary.
- Major sibling overlaps should be explicit in
  `assemblyPolicy.layoutSafetyPolicy.allowedOverlaps`.

### `assemblyPolicy.layoutSafetyPolicy`

The layout safety policy drives the automated layout quality review (overlap
padding, text slot fit, and guide-line alignment). All fields are optional:

- `mode`: `explicit_overlap_only` (default) makes undeclared partial sibling
  overlaps fail; other values downgrade them to warnings.
- `siblingOverlapDefault`: `forbidden` (default) or `allowed`.
- `allowedOverlaps`: array of `{ "source", "target", "reason", "minPadding" }`
  entries. `source`/`target` accept placement ids or asset ids, in either
  order. Declared pairs are exempt from undeclared-overlap failures,
  parent-overflow warnings, and alignment near-miss warnings. Optional
  `minPadding` overrides the required clearance for contained overlaps.
- `overlapPaddingDefault` (falls back to `parentPaddingDefault`, default 8):
  minimum clearance in px required when one asset is stacked fully inside
  another asset's box. A stacked asset touching the underlying edge fails; a
  clearance below this value warns.
- `overlaySlotPaddingDefault` (default 4): minimum clearance between a runtime
  overlay slot and its target placement edge. Slots that span the full target
  on an axis are treated as intentional full-bleed lanes.
- `alignmentTolerance` (default 4): near-miss window in px. Sibling placements
  (same parent, or both top-level) that share a row or column and miss a shared
  top/bottom/left/right/center line by up to this value produce a warning with
  the suggested snap values.
- `minFontSize` (default 10): readability floor for resolved overlay font
  sizes at 1x.

Overlays that declare both `targetPlacementId`+`slot` (which the renderer
uses) and absolute `x`/`y`/`width`/`height` are checked for agreement:
`overlay_xy_slot_mismatch` warns with the recomputed absolute values when
they diverge, so external implementations reading either representation stay
consistent.

Layout quality review codes include `overlap_undeclared`, `overlap_sticks_out`,
`overlap_padding_missing`, `overlap_padding_tight`, `child_overflows_parent`,
`overlay_outside_target`, `overlay_slot_padding_tight`, `text_overflow_x`,
`text_overflow_y`, `text_tight_x`, `text_max_lines`, `text_font_small`,
`text_sample_missing`, `alignment_near_miss_x`, `alignment_near_miss_y`, and
`size_near_miss`. Text fit is estimated from `sampleText`, `fontSize`,
`lineHeight`, and `letterSpacing` with CJK-aware character widths, so give each
text overlay a representative worst-case `sampleText`. The review runs in
`npm run validate`, `npm run validate:project`, the browser spec check panel,
and `/api/composition-quality`, and per-asset findings are injected into
imagegen job prompts.

Example:

```json
{
  "compositionGroups": [
    {
      "groupId": "primary_cta_button",
      "kind": "layered_button",
      "rootPlacementId": "button_content_surface",
      "layerPlacementIds": [
        "button_content_surface",
        "button_outer_frame",
        "button_gem_accents"
      ],
      "layerFitRules": [
        {
          "placementId": "button_content_surface",
          "fit": "same_canvas"
        },
        {
          "placementId": "button_gem_accents",
          "fit": "inside_root",
          "minInset": 12
        }
      ],
      "protectedOverlayIds": ["ov_runtime_label_lane"],
      "qualityChecks": [
        "center label lane stays readable",
        "frame does not bake center fill",
        "all layers align on the same canvas"
      ]
    }
  ]
}
```

Inset-checked child content example:

```json
{
  "compositionGroups": [
    {
      "groupId": "mission_rows_area",
      "kind": "inset_child_content_stack",
      "rootPlacementId": "mission_panel_frame",
      "layerPlacementIds": ["mission_panel_frame"],
      "childContentPlacementIds": [
        "mission_row_1",
        "mission_row_2",
        "mission_row_3"
      ],
      "contentInset": {
        "top": 48,
        "right": 18,
        "bottom": 76,
        "left": 18
      },
      "qualityChecks": [
        "child rows stay inside the panel content area",
        "child rows do not touch the decorative frame"
      ]
    }
  ]
}
```

## `world-preset.json`

Purpose: define the visual style, palette, references, and imagegen workflow.

JSON Schema: [schemas/world-preset.schema.json](../schemas/world-preset.schema.json)

Required fields:

- `id`
- `name`
- `palette`

Recommended fields:

- `genre`
- `moodKeywords`
- `negativeKeywords`
- `shapeLanguage`
- `materialKeywords`
- `lineTreatment`
- `lightingStyle`
- `detailDensity`
- `uiTone`
- `backgroundPolicy`
- `referenceImages`
- `kvGuidance`
- `kvStyleProfile`
- `qualityProfile`
- `imagegenWorkflow`
- `imagegenAssets`

`palette` should include stable color keys used by the renderer, for example:

- `primary`
- `secondary`
- `accent`
- `danger`
- `success`
- `neutralDark`
- `neutralLight`

### `designRules`

Screen design constraints enforced by the validators and injected into every
imagegen prompt. All fields are optional:

- `spacingUnit` (default 4): base layout grid in px.
- `frameThickness` (default 10): baked decorative frame budget on foundation
  assets (panel / card_frame / button). A layer whose measured inset from a
  foundation root edge is under 2px **fails** (`layer_fit_flush_frame`), and
  an inset below `frameThickness` warns unless the group declares
  `contentInset`. Declared `layerFitRules.minInset` values cannot silence
  these checks.
- `iconTextCenterTolerance` (default 2): side-by-side icon + text lanes must
  share a horizontal center line within this many px
  (`icon_text_center_mismatch`). The same tolerance governs sibling lane
  rhythm (`lane_rhythm_inconsistent`): runtime lanes sharing one row on one
  shell (or on repeated instances of one asset) must share one vertical
  center, comparable slot heights, and one font scale — a 1.4x+ font ratio is
  treated as intentional title/meta hierarchy.
- `frameThickness` also applies to discrete children: an icon/badge/token
  child placed closer than the frame band to its foundation parent's edge
  warns (`child_in_frame_band`).
- `iconTextPairGap` (default 24): max horizontal gap for an icon and text slot
  to count as one lane.
- `minTouchTarget` (default 0 = disabled): minimum button placement size
  (`touch_target_small`).
- `scalingPolicyDefault` (default `fixed`): see the asset scaling audit below.
- `craftStyle` (default off): opt-in craft quality target enforced by the PNG
  audit and described in every generation prompt. Values:
  - `outlined_cel`: commercial 2D asset pack language — consistent dark
    outline along the whole silhouette, 3-6 decisive cel shading bands, a
    darker bottom thickness band, restrained palette, calm interiors.
    Baselines are derived from measured distributions of purchased sprite
    packs (outline coverage p25 ≈ 0.7-0.95, luminance bands 3-10, quantized
    colors 3-17).
  - `flat_minimal`: clean flat GUI kit — uniform strokes, flat fills, one
    accent system, no outlines/textures.
  - `painterly`: painted UI production art — organized value groupings,
    detail at focal points, crisp alpha edges.
  Audit codes: `craft_outline_weak`, `craft_shading_flat` (placeholder/vector
  fills — also catches non-imagegen output), `craft_shading_muddy` (soft AI
  gradients), `craft_interior_busy`.
  When `craftStyle` is not declared and adopted PNGs exist,
  `npm run validate:project` and the browser spec check emit a
  `craft_style_unset` hint with a measured suggestion (median outline
  coverage, band count, and color count of the sampled artwork). Declare the
  suggested value — or the one matching the intended art direction — in
  `designRules.craftStyle`; the skill contains the selection table.
- `principles`: free-text design principles appended to generation prompts.

### Asset scaling audit

`exportRequirements.scalingPolicy` declares how a generated PNG may be used:

- `fixed` (default): the PNG must be used at its native pixel size. A uniform
  downscale (e.g. @2x source) passes; a uniform upscale warns
  (`asset_upscaled`); a non-uniform stretch **fails** (`asset_stretched`).
- `nine_slice`: requires `exportRequirements.nineSliceInsets`
  (`{top,right,bottom,left}`). Placements smaller than the corner band fail
  (`nine_slice_compressed`). Generation uses `exportRequirements.sizes[0]` as
  the base size instead of the placement size, and prompts instruct a
  stretch-safe center.
- `tile`: the asset tiles; prompts require a seamless pattern.

`exportRequirements.renderIntent` declares how the pixels are meant to
render:

- `raster_art` (default): the body inside the silhouette must be effectively
  opaque. Assets whose semi-transparent pixel ratio exceeds 35% warn and 55%
  fail (`asset_interior_translucent`) — this catches ghost blobs, holes, and
  un-flattened effect layers that let underlying layers bleed through.
- `translucent_effect`: intentional semi-transparency (scrims, glows,
  vignettes). Exempt from the translucency and craft audits; prompts state
  that the alpha gradient is part of the design.

The audit also samples the generated PNG under each runtime text slot and
warns when the declared text color (or its stroke) falls below a 2.5
contrast ratio against the actual backdrop (`text_contrast_low`).

The audit also flags excessive transparent gutters
(`asset_gutter_excessive`): foundation assets must cover ≥92% of their canvas
on both axes; icons/decor only warn when the artwork floats small on both
axes (<70%). Progress fill roles are exempt. Run the audit through
`npm run validate:project`, the spec check panel, or fix files in bulk with:

```sh
npm run postprocess:assets -- /path/to/screen-folder --apply
```

This trims transparent gutters and normalizes each PNG to its target size
(foundation surfaces stretch edge-to-edge; icons uniform-fit and center).

`imagegenWorkflow` fields:

- `outputDir`: where generated PNGs should be saved.
- `jobDir`: where generated job JSON and prompt files should be saved.
- `targetAssetIds`: optional subset for imagegen job creation.
- `disabled`: set to `true` to skip imagegen job planning.

`qualityProfile` fields:

- `targetLevel`: short label such as `commercial-grade mobile game asset`.
- `sourcePolicy`: licensing-safe statement about using references for quality
  criteria rather than direct imitation.
- `principles`: reusable quality principles for all assets.
- `productionChecks`: implementation-readiness checks.
- `promptAdditions`: extra prompt clauses injected into imagegen jobs.
- `avoid`: quality-related negative terms.
- `assetTypeChecks`: asset-type-specific checks keyed by `assetType`.
- `roleChecks`: role-specific checks keyed by `role`.
- `layoutAnatomy`: structural guidance for foundation assets such as panels,
  card frames, and buttons. This is used to distinguish decorative perimeter,
  calm content surface, readable boundary treatment, protected runtime slots,
  and reserved child-placement zones.

`layoutAnatomy` fields:

- `foundationAssetTypes`: asset types that should be treated as reusable UI
  bases, normally `panel`, `card_frame`, and `button`.
- `outerDecoration`: where ornament, bevels, sockets, and silhouette detail
  should live.
- `contentSurface`: how the inner area should stay readable for runtime text or
  child content.
- `boundaryTreatment`: how to visually separate frame decoration from usable
  content.
- `checks`: shared anatomy checks injected into imagegen prompts.
- `assetTypeRules`: overrides keyed by `assetType`.
- `roleRules`: overrides keyed by `role`.

Imagegen job assets also include a computed `qualityPlan` when the asset is a
foundation/shell asset or has runtime overlays/child placements. The plan lists
reserved content-model slots, protected text slots, inferred inner content
regions, and child-placement zones so generation and review can keep those
areas empty instead of baking fake UI into the PNG.

See [docs/quality-rubric.md](quality-rubric.md) for the full quality rubric.

When loading an external project folder, missing `outputDir` and `jobDir` are
filled automatically:

- `outputDir`: `<screen-folder>/generated-assets`
- `jobDir`: `<project-root>/.game-creative-generation/imagegen-jobs`

If these fields are present but relative, `outputDir` is resolved from the
loaded screen folder. `jobDir` is resolved from the project root when a project
manifest is used, otherwise from the loaded screen folder.

## `imagegen-assets.json`

Purpose: register generated PNG files that should replace SVG previews.

JSON Schema: [schemas/imagegen-assets.schema.json](../schemas/imagegen-assets.schema.json)

Shape:

```json
{
  "assets": [
    {
      "assetId": "btn_start",
      "path": "generated-assets/btn_start.png",
      "backend": "codex_cli_imagegen",
      "usesImagegen": true,
      "prompt": "Prompt or adoption notes"
    }
  ]
}
```

Rules:

- `assetId` must match an asset in `material-spec.json`.
- Relative `path` values are resolved from the folder containing
  `imagegen-assets.json`.
- The browser's PNG re-import rescans the screen folder and appends newly
  found `generated-assets/**/<assetId>.png` files to this manifest
  automatically (screen-folder-relative paths), so manually generated PNGs do
  not need hand registration.
- If `imagegen-assets.json` is absent, files named
  `generated-assets/<assetId>.png` or `generated-assets/**/<assetId>.png` are
  auto-registered when the screen folder is loaded. The filename basename must
  match an asset in `material-spec.json`.

`world-preset.json` may also include `imagegenAssets` directly. For folder
loads, relative inline paths are resolved from the loaded screen folder when
that file exists there. Repository-root relative demo paths remain supported for
the bundled examples.
