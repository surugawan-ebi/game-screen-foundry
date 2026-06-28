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
  `same_canvas`, `inside_root`, `edge_attached`, and `decorative_overlap`
  layers, and to declare `minInset` or `allowedOverflow`.
- `childContentPlacementIds`: placements that must stay inside the root
  placement's usable content area.
- `contentInset`: root-local inset object `{ "top", "right", "bottom", "left" }`
  defining the safe area for `childContentPlacementIds`.
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
- If `imagegen-assets.json` is absent, files named
  `generated-assets/<assetId>.png` are auto-registered when the screen folder is
  loaded.

`world-preset.json` may also include `imagegenAssets` directly. For folder
loads, relative inline paths are resolved from the loaded screen folder when
that file exists there. Repository-root relative demo paths remain supported for
the bundled examples.
