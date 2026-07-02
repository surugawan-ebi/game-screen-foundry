"use strict";

// Screen design rules shared by validators and imagegen prompt building.
// Declared in world-preset.json as `designRules`; every field is optional and
// falls back to these defaults.
const DEFAULT_DESIGN_RULES = {
  // Base spacing grid in px. Alignment suggestions snap to this unit.
  spacingUnit: 4,
  // Default thickness of the baked decorative frame band on foundation
  // assets (panels, card frames, buttons, docks, sheets). Layers and text
  // slots closer than this to a foundation root edge sit on the frame.
  frameThickness: 10,
  // Minimum clearance between an icon/text pair and how exactly their
  // horizontal center lines must match.
  iconTextCenterTolerance: 2,
  // Maximum horizontal gap for an icon and a text slot to be treated as one
  // icon+label pair.
  iconTextPairGap: 24,
  // Minimum touch target in px for interactive assets. 0 disables the check.
  minTouchTarget: 0,
  // Default scaling policy for generated raster assets. "fixed" means the
  // PNG must be used at its native pixel size (uniform @2x downscale is
  // allowed); stretching is a defect unless the asset declares
  // exportRequirements.scalingPolicy = "nine_slice" or "tile".
  scalingPolicyDefault: "fixed",
  // Craft style enforced by the PNG craft audit and described in prompts:
  // "" (off), "outlined_cel", "flat_minimal", or "painterly".
  craftStyle: "",
  // Free-form principles injected into every imagegen prompt.
  principles: []
};

function listValues(value) {
  return Array.isArray(value) ? value.filter(Boolean).map(String) : [];
}

function getDesignRules(worldPreset) {
  const raw = worldPreset && typeof worldPreset.designRules === "object" && worldPreset.designRules
    ? worldPreset.designRules
    : {};
  return {
    spacingUnit: Number(raw.spacingUnit || DEFAULT_DESIGN_RULES.spacingUnit),
    frameThickness: Number(raw.frameThickness || DEFAULT_DESIGN_RULES.frameThickness),
    iconTextCenterTolerance: Number(raw.iconTextCenterTolerance || DEFAULT_DESIGN_RULES.iconTextCenterTolerance),
    iconTextPairGap: Number(raw.iconTextPairGap || DEFAULT_DESIGN_RULES.iconTextPairGap),
    minTouchTarget: Number(raw.minTouchTarget !== undefined ? raw.minTouchTarget : DEFAULT_DESIGN_RULES.minTouchTarget),
    scalingPolicyDefault: String(raw.scalingPolicyDefault || DEFAULT_DESIGN_RULES.scalingPolicyDefault),
    craftStyle: String(raw.craftStyle || DEFAULT_DESIGN_RULES.craftStyle),
    principles: listValues(raw.principles)
  };
}

function getAssetScalingPolicy(asset, designRules) {
  const exportRequirements = asset && asset.exportRequirements ? asset.exportRequirements : {};
  const declared = String(exportRequirements.scalingPolicy || "");
  if (declared === "nine_slice" || declared === "tile" || declared === "fixed") {
    return declared;
  }
  return designRules.scalingPolicyDefault;
}

function buildDesignRulesPromptLines(designRules, asset) {
  const scalingPolicy = getAssetScalingPolicy(asset, designRules);
  const lines = [];
  lines.push([
    `Design rules: ${designRules.spacingUnit}px spacing grid;`,
    `decorative frame band stays within the outer ${designRules.frameThickness}px unless a composition contentInset says otherwise;`,
    "icons and text labels in the same lane share one horizontal center line;",
    "interior content surfaces stay calm and free of ornament."
  ].join(" "));
  if (scalingPolicy === "nine_slice") {
    const insets = asset && asset.exportRequirements && asset.exportRequirements.nineSliceInsets
      ? asset.exportRequirements.nineSliceInsets
      : null;
    const insetText = insets
      ? ` Corner/edge band: top ${insets.top || 0} / right ${insets.right || 0} / bottom ${insets.bottom || 0} / left ${insets.left || 0} px.`
      : "";
    lines.push(`Scaling policy: this asset is stretched via 9-slice at runtime. Keep all corner and edge ornament inside the declared slice band, and make the center region a flat, stretch-safe surface with no gradients, motifs, or texture that would smear.${insetText}`);
  } else if (scalingPolicy === "tile") {
    lines.push("Scaling policy: this asset tiles at runtime; the pattern must be seamless on the tiling axes.");
  } else {
    lines.push("Scaling policy: fixed size. This asset is placed at its exact final pixel size and never stretched, so design every detail for that size; do not rely on downstream scaling.");
  }
  if (designRules.principles.length) {
    lines.push(`Design principles: ${designRules.principles.join(" / ")}`);
  }
  return lines;
}

module.exports = {
  DEFAULT_DESIGN_RULES,
  buildDesignRulesPromptLines,
  getAssetScalingPolicy,
  getDesignRules
};
