# File Contract

Use this when creating or editing Game Screen Foundry JSON files.

## Required Screen Files

Every screen folder should include:

- `screen-kv.json`
- `material-spec.json`
- `world-preset.json`

Optional files:

- `key-visual.png`
- `imagegen-assets.json`
- `generated-assets/`
- `bundle.json`

When split JSON files are present, the loader prefers them over `bundle.json`.

## `screen-kv.json`

Required:

- `screenId`
- `screenName`
- `screenRole`
- `canvasWidth`
- `canvasHeight`

Recommended:

- `baseResolution`
- `worldPresetId`
- `uiDensity`
- `safeAreas`
- `stateVariantKeys`

## `material-spec.json`

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

Required overlay fields:

- `overlayId`
- `kind`
- `x`
- `y`
- `width`
- `height`
- `anchor`
- `zIndex`

Recommended composition group fields:

- `groupId`
- `kind`
- `rootPlacementId`
- `layerPlacementIds`
- `childContentPlacementIds`
- `contentInset`
- `minChildInset`
- `protectedOverlayIds`
- `childGroupIds`
- `outputAssetId`
- `qualityChecks`

## Assembly Rules

- Use separate placements for parent frames, headers, rows, buttons, icons, progress tracks, progress fills, badges, and text overlays.
- Keep runtime text in `contentOverlays`, ideally with `targetPlacementId` and local `slot`.
- Use `compositionGroups` when multiple placements form one intended UI object
  such as a layered button, CTA card, nav tab, or panel. Treat the group as the
  quality review unit while keeping each placement independently replaceable.
- Use `layerPlacementIds` for same-object visual layers or intentional
  decorative accents. Use `childContentPlacementIds` for child UI placed inside
  a parent frame; those placements must fit inside `contentInset` or
  `minChildInset`.
- Size text slots so sample text fits without runtime auto-shrink.
- Put major sibling overlap exceptions in `assemblyPolicy.layoutSafetyPolicy.allowedOverlaps`.
- Do not bake child elements into parent frames unless the asset explicitly owns baked content.

## `world-preset.json`

Required:

- `id`
- `name`
- `palette`

Recommended:

- `genre`
- `moodKeywords`
- `negativeKeywords`
- `shapeLanguage`
- `materialKeywords`
- `referenceImages`
- `kvGuidance`
- `kvStyleProfile`
- `qualityProfile`
- `imagegenWorkflow`
- `imagegenAssets`

When a screen folder is loaded, missing workflow paths are filled automatically:

- `imagegenWorkflow.outputDir`: `<screen-folder>/generated-assets`
- `imagegenWorkflow.jobDir`: `<project-root>/.game-creative-generation/imagegen-jobs`

Use `qualityProfile` to express commercial-grade asset criteria derived from
licensed references without copying their specific art style. Keep the criteria
structural: silhouette readability, clean functional lanes, edge separation,
material clarity, controlled ornament density, and clean alpha.

Use `qualityProfile.layoutAnatomy` for foundation assets. It should describe
where outer decoration belongs, how the inner content surface remains calm, and
how the boundary between the two is made readable. The imagegen workflow derives
protected runtime slots from `contentOverlays[].targetPlacementId + slot` and
reserved child zones from `placements[].parentId`, then writes them into each
asset's `qualityPlan`.

## `imagegen-assets.json`

Use this shape:

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

If no manifest is present, files named `generated-assets/<assetId>.png` are auto-registered when the screen folder is loaded.

## Schemas

Use repository schemas for detailed validation and documentation:

- `schemas/project-manifest.schema.json`
- `schemas/screen-kv.schema.json`
- `schemas/material-spec.schema.json`
- `schemas/world-preset.schema.json`
- `schemas/imagegen-assets.schema.json`
