"use strict";

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const { buildCompositionReview } = require("./composition-quality");
const { buildCraftPromptLines } = require("./craft-baseline");
const { buildDesignRulesPromptLines, getAssetScalingPolicy, getDesignRules } = require("./design-rules");
const { buildLayoutReview, getLayoutChecksForPlacements, getStackingsForPlacements } = require("./layout-quality");
const { getReferencePromptLines } = require("./reference-quality-profile");

const DEFAULT_CODEX_BIN = "codex";
const DEFAULT_FOUNDATION_ASSET_TYPES = ["panel", "card_frame", "button"];
const MAX_PROMPT_ZONE_SUMMARIES = 8;
const HANDOFF_JOB_SCHEMA = "game-screen-foundry.imagegen-handoff.v2";
const HANDOFF_STATUS_SCHEMA = "game-screen-foundry.imagegen-status.v1";

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function safeSlug(value) {
  return String(value || "asset")
    .replace(/[^a-zA-Z0-9_-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80) || "asset";
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function getBetaRoot() {
  return path.resolve(__dirname, "..");
}

function getImagegenWorkflow(input) {
  const preset = input.worldPreset || {};
  return preset.imagegenWorkflow || {};
}

function getJobDir(input) {
  const workflow = getImagegenWorkflow(input);
  return path.resolve(workflow.jobDir || path.join(getBetaRoot(), "imagegen-jobs"));
}

function getOutputDir(input) {
  const workflow = getImagegenWorkflow(input);
  return path.resolve(workflow.outputDir || path.join(getJobDir(input), "generated-assets"));
}

function getStatusDir(jobDir) {
  return path.join(path.dirname(path.resolve(jobDir)), "imagegen-status");
}

function getRegisteredAssetMap(input) {
  const registered = input.worldPreset && input.worldPreset.imagegenAssets
    ? input.worldPreset.imagegenAssets
    : {};
  if (Array.isArray(registered)) {
    return Object.fromEntries(registered
      .filter((item) => item && item.assetId)
      .map((item) => [item.assetId, item]));
  }
  return registered;
}

function getPrimaryPlacement(input, assetId) {
  return input.materialSpecSheet.placements.find((placement) => placement.assetId === assetId) || null;
}

function listValues(value) {
  return Array.isArray(value) ? value.filter(Boolean).map(String) : [];
}

// Spec authors write notes either as arrays or as plain strings.
function noteList(value) {
  if (Array.isArray(value)) {
    return value.filter(Boolean).map(String);
  }
  return value ? [String(value)] : [];
}

function buildStyleMediumLine(preset) {
  const parts = [
    preset.styleMedium,
    preset.visualStyle,
    preset.artDirection,
    preset.genre ? `${preset.genre} game UI art` : "",
    preset.shapeLanguage ? `shape language: ${preset.shapeLanguage}` : "",
    preset.lineTreatment ? `line treatment: ${preset.lineTreatment}` : "",
    preset.lightingStyle ? `lighting: ${preset.lightingStyle}` : "",
    preset.detailDensity ? `detail density: ${preset.detailDensity}` : "",
    preset.uiTone ? `UI tone: ${preset.uiTone}` : ""
  ];

  const moodKeywords = listValues(preset.moodKeywords).slice(0, 6);
  if (moodKeywords.length) {
    parts.push(`mood keywords: ${moodKeywords.join(", ")}`);
  }

  const materialKeywords = listValues(preset.materialKeywords).slice(0, 6);
  if (materialKeywords.length) {
    parts.push(`material keywords: ${materialKeywords.join(", ")}`);
  }

  const line = unique(parts.map((part) => String(part || "").trim()));
  return line.length
    ? line.join("; ")
    : "polished game UI production art; painterly but crisp; high production value";
}

function getAssetPlacements(input, assetId) {
  return input.materialSpecSheet.placements.filter((placement) => placement.assetId === assetId);
}

function getPlacementBox(placement) {
  return {
    left: placement.x - placement.width / 2,
    top: placement.y - placement.height / 2,
    width: placement.width,
    height: placement.height
  };
}

function roundNumber(value) {
  return Math.round(Number(value) * 10) / 10;
}

function resolveLocalRect(slot, targetWidth, targetHeight) {
  const width = Number(slot.width || 0);
  const height = Number(slot.height || 0);
  const x = slot.x !== undefined
    ? Number(slot.x)
    : slot.right !== undefined
      ? targetWidth - Number(slot.right) - width
      : (targetWidth - width) / 2;
  const y = slot.y !== undefined
    ? Number(slot.y)
    : slot.bottom !== undefined
      ? targetHeight - Number(slot.bottom) - height
      : (targetHeight - height) / 2;

  return {
    x: roundNumber(x),
    y: roundNumber(y),
    width: roundNumber(width),
    height: roundNumber(height)
  };
}

function formatRect(rect) {
  return `${rect.x},${rect.y},${rect.width}x${rect.height}`;
}

function formatPercentRect(rect, width, height) {
  if (!width || !height) {
    return "";
  }
  return `${Math.round(rect.x / width * 100)}%,${Math.round(rect.y / height * 100)}%,${Math.round(rect.width / width * 100)}%x${Math.round(rect.height / height * 100)}%`;
}

function getProtectedSlots(input, placements) {
  const placementById = Object.fromEntries(placements.map((placement) => [placement.placementId, placement]));
  const placementIds = new Set(Object.keys(placementById));

  return (input.materialSpecSheet.contentOverlays || [])
    .filter((overlay) => overlay.targetPlacementId && placementIds.has(overlay.targetPlacementId) && overlay.slot)
    .map((overlay) => {
      const placement = placementById[overlay.targetPlacementId];
      const rect = resolveLocalRect(overlay.slot, placement.width, placement.height);
      return {
        overlayId: overlay.overlayId,
        placementId: overlay.targetPlacementId,
        kind: overlay.kind,
        sampleText: overlay.sampleText || "",
        slot: rect,
        targetSize: {
          width: placement.width,
          height: placement.height
        },
        relativeSlot: formatPercentRect(rect, placement.width, placement.height),
        instruction: "Keep this runtime overlay slot visually quiet, empty of baked text, and free of high-contrast ornament."
      };
    });
}

function getChildPlacementZones(input, placements) {
  const parentById = Object.fromEntries(placements.map((placement) => [placement.placementId, placement]));
  const parentIds = new Set(Object.keys(parentById));

  return input.materialSpecSheet.placements
    .filter((placement) => placement.parentId && parentIds.has(placement.parentId))
    .map((child) => {
      const parent = parentById[child.parentId];
      const parentBox = getPlacementBox(parent);
      const childBox = getPlacementBox(child);
      const rect = {
        x: roundNumber(childBox.left - parentBox.left),
        y: roundNumber(childBox.top - parentBox.top),
        width: roundNumber(child.width),
        height: roundNumber(child.height)
      };
      return {
        placementId: child.placementId,
        assetId: child.assetId,
        parentPlacementId: child.parentId,
        slot: rect,
        targetSize: {
          width: parent.width,
          height: parent.height
        },
        relativeSlot: formatPercentRect(rect, parent.width, parent.height),
        instruction: "Reserve this zone for a separate child placement; do not bake the child asset into the parent shell."
      };
    });
}

function expandBounds(bounds, rect) {
  if (!bounds) {
    return {
      x: rect.x,
      y: rect.y,
      right: rect.x + rect.width,
      bottom: rect.y + rect.height
    };
  }
  return {
    x: Math.min(bounds.x, rect.x),
    y: Math.min(bounds.y, rect.y),
    right: Math.max(bounds.right, rect.x + rect.width),
    bottom: Math.max(bounds.bottom, rect.y + rect.height)
  };
}

function buildContentRegions(protectedSlots, childPlacementZones) {
  const regions = new Map();
  const addZone = (key, targetSize, rect, source) => {
    if (!targetSize || !targetSize.width || !targetSize.height) {
      return;
    }
    const current = regions.get(key) || {
      placementId: key,
      targetSize,
      bounds: null,
      sources: []
    };
    current.bounds = expandBounds(current.bounds, rect);
    if (!current.sources.includes(source)) {
      current.sources.push(source);
    }
    regions.set(key, current);
  };

  for (const slot of protectedSlots) {
    addZone(slot.placementId, slot.targetSize, slot.slot, "runtime slot");
  }
  for (const zone of childPlacementZones) {
    addZone(zone.parentPlacementId, zone.targetSize, zone.slot, "child placement");
  }

  return [...regions.values()].map((region) => {
    const rect = {
      x: roundNumber(region.bounds.x),
      y: roundNumber(region.bounds.y),
      width: roundNumber(region.bounds.right - region.bounds.x),
      height: roundNumber(region.bounds.bottom - region.bounds.y)
    };
    return {
      placementId: region.placementId,
      slot: rect,
      relativeSlot: formatPercentRect(rect, region.targetSize.width, region.targetSize.height),
      sources: region.sources,
      instruction: "Treat this combined area as the inner content surface; keep it calm and usable with breathing room around it."
    };
  });
}

function pickAnatomyRule(layoutAnatomy, asset, key, fallback) {
  const assetRules = layoutAnatomy.assetTypeRules && layoutAnatomy.assetTypeRules[asset.assetType]
    ? layoutAnatomy.assetTypeRules[asset.assetType]
    : {};
  const roleRules = layoutAnatomy.roleRules && layoutAnatomy.roleRules[asset.role]
    ? layoutAnatomy.roleRules[asset.role]
    : {};
  return roleRules[key] || assetRules[key] || layoutAnatomy[key] || fallback;
}

function buildAssetQualityPlan({ input, asset, placements }) {
  const preset = input.worldPreset || {};
  const profile = preset.qualityProfile || {};
  const layoutAnatomy = profile.layoutAnatomy || {};
  const foundationTypes = listValues(layoutAnatomy.foundationAssetTypes);
  const foundationAssetTypes = foundationTypes.length ? foundationTypes : DEFAULT_FOUNDATION_ASSET_TYPES;
  const protectedSlots = getProtectedSlots(input, placements);
  const childPlacementZones = getChildPlacementZones(input, placements);
  const contentRegions = buildContentRegions(protectedSlots, childPlacementZones);
  const contentModel = asset.contentModel || {};
  const contentModelSlots = listValues(contentModel.slots);
  const forbiddenBakedElements = listValues(contentModel.forbiddenBakedElements);
  const assetTypeRules = layoutAnatomy.assetTypeRules && layoutAnatomy.assetTypeRules[asset.assetType]
    ? layoutAnatomy.assetTypeRules[asset.assetType]
    : {};
  const roleRules = layoutAnatomy.roleRules && layoutAnatomy.roleRules[asset.role]
    ? layoutAnatomy.roleRules[asset.role]
    : {};
  const foundationAsset = foundationAssetTypes.includes(asset.assetType)
    || /frame_only|foundation_only/u.test(String(contentModel.mode || ""))
    || contentModelSlots.length > 0
    || protectedSlots.length > 0
    || childPlacementZones.length > 0;

  if (!foundationAsset && !Object.keys(assetTypeRules).length && !Object.keys(roleRules).length) {
    return null;
  }

  const baseChecks = foundationAsset
    ? [
      "Separate the decorative perimeter from the calm content surface.",
      "Keep runtime text/content slots empty and readable.",
      "Use bevel, rim light, inset shadow, color step, or material transition to make the boundary understandable."
    ]
    : [];

  return {
    foundationAsset,
    assetType: asset.assetType,
    role: asset.role,
    separationModel: {
      outerDecoration: pickAnatomyRule(
        layoutAnatomy,
        asset,
        "outerDecoration",
        "Use the perimeter, corners, tabs, sockets, and outer rim for ornament and material accents."
      ),
      contentSurface: pickAnatomyRule(
        layoutAnatomy,
        asset,
        "contentSurface",
        "Keep the central or declared content area calmer, lower contrast, and ready for runtime text or child placements."
      ),
      boundaryTreatment: pickAnatomyRule(
        layoutAnatomy,
        asset,
        "boundaryTreatment",
        "Separate frame and content with a readable inner bevel, shadow, rim highlight, or material/color transition."
      )
    },
    contentModel: {
      mode: contentModel.mode || "",
      slots: contentModelSlots,
      forbiddenBakedElements
    },
    protectedSlots,
    childPlacementZones,
    contentRegions,
    checks: unique([
      ...baseChecks,
      ...listValues(layoutAnatomy.checks),
      ...listValues(assetTypeRules.checks),
      ...listValues(roleRules.checks)
    ])
  };
}

function summarizeProtectedSlot(slot) {
  const sample = slot.sampleText ? ` sample "${slot.sampleText}"` : "";
  const relative = slot.relativeSlot ? ` (${slot.relativeSlot})` : "";
  return `${slot.overlayId} on ${slot.placementId} slot ${formatRect(slot.slot)}${relative}${sample}`;
}

function summarizeChildZone(zone) {
  const relative = zone.relativeSlot ? ` (${zone.relativeSlot})` : "";
  return `${zone.placementId}/${zone.assetId} inside ${zone.parentPlacementId} slot ${formatRect(zone.slot)}${relative}`;
}

function summarizeContentRegion(region) {
  const relative = region.relativeSlot ? ` (${region.relativeSlot})` : "";
  const sources = region.sources.length ? ` from ${region.sources.join(" + ")}` : "";
  return `${region.placementId} content surface ${formatRect(region.slot)}${relative}${sources}`;
}

// When one plate hosts several runtime lanes on the same row, generation
// must know the exact lane count so baked segment dividers match the content
// structure instead of being decorative guesses.
function buildLaneStructureLines(protectedSlots) {
  const byPlacement = new Map();
  for (const slot of protectedSlots) {
    if (!byPlacement.has(slot.placementId)) {
      byPlacement.set(slot.placementId, []);
    }
    byPlacement.get(slot.placementId).push(slot);
  }

  const lines = [];
  for (const [placementId, slots] of byPlacement) {
    if (slots.length < 2) {
      continue;
    }
    const sorted = [...slots].sort((a, b) => a.slot.x - b.slot.x);
    const sameRow = sorted.every((slot) => {
      const first = sorted[0];
      const overlap = Math.min(first.slot.y + first.slot.height, slot.slot.y + slot.slot.height)
        - Math.max(first.slot.y, slot.slot.y);
      return overlap >= Math.min(first.slot.height, slot.slot.height) * 0.5;
    });
    if (!sameRow) {
      continue;
    }
    const ranges = sorted.map((slot) => `${Math.round(slot.slot.x)}..${Math.round(slot.slot.x + slot.slot.width)}`);
    const boundaries = sorted.slice(0, -1).map((slot, index) => Math.round((slot.slot.x + slot.slot.width + sorted[index + 1].slot.x) / 2));
    lines.push(`Lane structure: ${placementId} hosts exactly ${sorted.length} runtime lanes on one row at local x-ranges ${ranges.join(" / ")}. If you draw segment dividers, draw exactly ${sorted.length - 1} of them near x=${boundaries.join(", x=")} and none elsewhere; keep every lane the same height and vertical center.`);
  }
  return lines;
}

function buildQualityPlanPromptLines(qualityPlan) {
  if (!qualityPlan) {
    return [];
  }

  const lines = [];
  if (qualityPlan.foundationAsset) {
    lines.push("UI anatomy: foundation/shell asset with explicit separation between decorative perimeter and functional content surface.");
  }

  lines.push([
    "Decoration/content separation:",
    qualityPlan.separationModel.outerDecoration,
    qualityPlan.separationModel.contentSurface,
    qualityPlan.separationModel.boundaryTreatment
  ].join(" "));

  if (qualityPlan.contentModel.mode || qualityPlan.contentModel.slots.length) {
    const slots = qualityPlan.contentModel.slots.length
      ? ` reserved empty slots: ${qualityPlan.contentModel.slots.join(", ")}`
      : "";
    lines.push(`Content model: ${qualityPlan.contentModel.mode || "unspecified"};${slots}. Draw only the holder, frame, dock, socket, or base surface; do not bake the slot contents into this asset.`);
  }

  if (qualityPlan.protectedSlots.length) {
    const shown = qualityPlan.protectedSlots.slice(0, MAX_PROMPT_ZONE_SUMMARIES).map(summarizeProtectedSlot);
    const suffix = qualityPlan.protectedSlots.length > shown.length
      ? `; plus ${qualityPlan.protectedSlots.length - shown.length} more protected slot(s)`
      : "";
    lines.push(`Protected runtime slots: ${shown.join(" / ")}${suffix}.`);
    lines.push(...buildLaneStructureLines(qualityPlan.protectedSlots));
  }

  if (qualityPlan.contentRegions.length) {
    const shown = qualityPlan.contentRegions.slice(0, MAX_PROMPT_ZONE_SUMMARIES).map(summarizeContentRegion);
    const suffix = qualityPlan.contentRegions.length > shown.length
      ? `; plus ${qualityPlan.contentRegions.length - shown.length} more content region(s)`
      : "";
    lines.push(`Inferred inner content surface: ${shown.join(" / ")}${suffix}. Keep this region quieter than the frame and do not place high-frequency ornament behind runtime content.`);
  }

  if (qualityPlan.childPlacementZones.length) {
    const shown = qualityPlan.childPlacementZones.slice(0, MAX_PROMPT_ZONE_SUMMARIES).map(summarizeChildZone);
    const suffix = qualityPlan.childPlacementZones.length > shown.length
      ? `; plus ${qualityPlan.childPlacementZones.length - shown.length} more child zone(s)`
      : "";
    lines.push(`Reserved child placement zones: ${shown.join(" / ")}${suffix}.`);
  }

  if (qualityPlan.contentModel.forbiddenBakedElements.length) {
    lines.push(`Do not bake child elements: ${qualityPlan.contentModel.forbiddenBakedElements.join(", ")}.`);
  }

  if (qualityPlan.checks.length) {
    lines.push(`Anatomy checks: ${qualityPlan.checks.join(" / ")}`);
  }

  return lines;
}

function buildAssetLayoutContext(layoutReview, placements) {
  const placementIds = placements.map((placement) => placement.placementId);
  return {
    issues: getLayoutChecksForPlacements(layoutReview, placementIds).map((check) => ({
      status: check.status,
      code: check.code,
      message: check.message
    })),
    stackings: getStackingsForPlacements(layoutReview, placementIds)
  };
}

function buildLayoutContextPromptLines(layoutContext, placements) {
  if (!layoutContext) {
    return [];
  }
  const placementIds = new Set(placements.map((placement) => placement.placementId));
  const lines = [];
  for (const stacking of layoutContext.stackings.slice(0, MAX_PROMPT_ZONE_SUMMARIES)) {
    if (placementIds.has(stacking.outerPlacementId)) {
      lines.push(`Stacking context: a separate asset ${stacking.innerAssetId} (${stacking.innerPlacementId}) is composited on top of this asset with ${stacking.requiredPadding}px expected clearance (current inset top/right/bottom/left ${stacking.inset.top}/${stacking.inset.right}/${stacking.inset.bottom}/${stacking.inset.left}). Keep the surface under it calm and never paint a fake version of that asset.`);
    } else if (placementIds.has(stacking.innerPlacementId)) {
      lines.push(`Stacking context: this asset is composited on top of ${stacking.outerAssetId} (${stacking.outerPlacementId}) with only ${stacking.requiredPadding}px design clearance. The artwork must stay fully inside its own canvas; no glow, shadow, or protruding part may spill past the canvas edge, or it will visibly stick out of the underlying asset.`);
    }
  }
  if (layoutContext.issues.length) {
    const shown = layoutContext.issues.slice(0, MAX_PROMPT_ZONE_SUMMARIES);
    lines.push(`Open layout review issues involving this asset: ${shown.map((issue) => `${issue.status}:${issue.code} ${issue.message}`).join(" / ")}`);
  }
  return lines;
}

function formatScreenBox(box) {
  if (!box) {
    return "unknown";
  }
  return `${box.left},${box.top},${box.width}x${box.height}`;
}

function summarizeCompositionLayer(layer) {
  const fit = layer.fitRule && layer.fitRule.fit ? ` fit=${layer.fitRule.fit}` : "";
  return `${layer.placementId}/${layer.assetId} ${formatScreenBox(layer.box)} z${layer.zIndex}${fit}`;
}

function summarizeCompositionOverlay(overlay) {
  const sample = overlay.sampleText ? ` sample "${overlay.sampleText}"` : "";
  const slot = overlay.slot ? ` slot ${formatRect({
    x: overlay.slot.x || 0,
    y: overlay.slot.y || 0,
    width: overlay.slot.width || (overlay.box ? overlay.box.width : 0),
    height: overlay.slot.height || (overlay.box ? overlay.box.height : 0)
  })}` : "";
  return `${overlay.overlayId} on ${overlay.targetPlacementId}${slot}${sample}`;
}

function getAssetCompositionContexts(compositionReview, asset, placements) {
  const placementIds = new Set(placements.map((placement) => placement.placementId));
  return compositionReview.groups
    .filter((group) => group.outputAssetId === asset.assetId
      || group.layers.some((layer) => layer.assetId === asset.assetId || placementIds.has(layer.placementId))
      || group.childContent.some((layer) => layer.assetId === asset.assetId || placementIds.has(layer.placementId)))
    .map((group) => {
      const roles = [];
      if (group.outputAssetId === asset.assetId) {
        roles.push("outputAsset");
      }
      for (const layer of group.layers) {
        if (layer.assetId === asset.assetId || placementIds.has(layer.placementId)) {
          roles.push(layer.placementId === group.rootPlacementId ? "rootLayer" : `layer:${layer.placementId}`);
        }
      }
      for (const child of group.childContent) {
        if (child.assetId === asset.assetId || placementIds.has(child.placementId)) {
          roles.push(`childContent:${child.placementId}`);
        }
      }
      return {
        groupId: group.groupId,
        kind: group.kind,
        status: group.status,
        score: group.score,
        roles: unique(roles),
        rootPlacementId: group.rootPlacementId,
        outputAssetId: group.outputAssetId,
        rootBox: group.rootBox,
        contentBox: group.contentBox,
        effectiveInset: group.effectiveInset,
        frameInset: group.frameInset,
        layers: group.layers,
        childContent: group.childContent,
        protectedOverlays: group.protectedOverlays,
        qualityChecks: group.qualityChecks,
        issueChecks: group.checks.filter((check) => check.status !== "pass").map((check) => ({
          status: check.status,
          code: check.code,
          message: check.message
        }))
      };
    });
}

function buildCompositionContextPromptLines(compositionContexts) {
  if (!compositionContexts || !compositionContexts.length) {
    return [];
  }

  const lines = [];
  for (const context of compositionContexts.slice(0, 3)) {
    lines.push(`Composition group context: ${context.groupId} (${context.kind}), role ${context.roles.join(", ") || "member"}, status ${context.status}, score ${context.score}. Root ${context.rootPlacementId} ${formatScreenBox(context.rootBox)}; output asset ${context.outputAssetId || "none"}.`);
    if (context.contentBox) {
      lines.push(`Composition content box: ${formatScreenBox(context.contentBox)} with effective inset top/right/bottom/left ${context.effectiveInset.top}/${context.effectiveInset.right}/${context.effectiveInset.bottom}/${context.effectiveInset.left}. Keep child content inside this quiet area.`);
      if (context.rootBox && context.roles.some((role) => role === "rootLayer" || role === "outputAsset")) {
        // The painted decoration budget is the declared frameInset when
        // present; contentInset may reserve wider bands for other children.
        const band = context.frameInset || context.effectiveInset;
        lines.push(`Decoration budget: at final size ${context.rootBox.width}x${context.rootBox.height}, every frame ornament, bevel, corner piece, and material accent must fit inside the outer band of ${band.top}px top / ${band.right}px right / ${band.bottom}px bottom / ${band.left}px left. The interior beyond that band is reserved for child UI and runtime text: keep it a calm, flat, low-contrast surface with no ornament crossing into it.`);
      }
    }
    if (context.layers.length) {
      lines.push(`Composition layer stack: ${context.layers.map(summarizeCompositionLayer).join(" / ")}.`);
    }
    if (context.childContent.length) {
      lines.push(`Composition child content: ${context.childContent.map(summarizeCompositionLayer).join(" / ")}.`);
    }
    if (context.protectedOverlays.length) {
      lines.push(`Composition protected overlays: ${context.protectedOverlays.map(summarizeCompositionOverlay).join(" / ")}. Keep these runtime text/number slots visually readable and not baked into the raster asset unless explicitly allowed.`);
    }
    if (context.qualityChecks.length) {
      lines.push(`Composition authored checks: ${context.qualityChecks.join(" / ")}`);
    }
    if (context.issueChecks.length) {
      lines.push(`Composition current review issues: ${context.issueChecks.map((check) => `${check.status}:${check.code}`).join(" / ")}`);
    }
  }
  if (compositionContexts.length > 3) {
    lines.push(`Composition group context: plus ${compositionContexts.length - 3} more group(s) omitted from this prompt.`);
  }
  return lines;
}

function buildQualityPromptLines(preset, asset) {
  const profile = preset.qualityProfile || {};
  if (!profile || typeof profile !== "object" || !Object.keys(profile).length) {
    return [];
  }

  const assetTypeChecks = profile.assetTypeChecks && typeof profile.assetTypeChecks === "object"
    ? listValues(profile.assetTypeChecks[asset.assetType])
    : [];
  const roleChecks = profile.roleChecks && typeof profile.roleChecks === "object"
    ? listValues(profile.roleChecks[asset.role])
    : [];
  const lines = [];

  if (profile.targetLevel) {
    lines.push(`Quality target: ${profile.targetLevel}`);
  }
  if (profile.sourcePolicy) {
    lines.push(`Reference policy: ${profile.sourcePolicy}`);
  }

  const principles = listValues(profile.principles);
  if (principles.length) {
    lines.push(`Commercial quality principles: ${principles.join(" / ")}`);
  }

  const productionChecks = listValues(profile.productionChecks);
  if (productionChecks.length) {
    lines.push(`Production-readiness checks: ${productionChecks.join(" / ")}`);
  }

  if (assetTypeChecks.length) {
    lines.push(`Asset-type quality checks: ${assetTypeChecks.join(" / ")}`);
  }

  if (roleChecks.length) {
    lines.push(`Role-specific quality checks: ${roleChecks.join(" / ")}`);
  }

  const additions = listValues(profile.promptAdditions);
  if (additions.length) {
    lines.push(`Quality prompt additions: ${additions.join(" / ")}`);
  }

  const referenceLines = getReferencePromptLines(profile.referenceDerived, asset);
  if (referenceLines.length) {
    lines.push(`Reference-derived quality profile: ${referenceLines.join(" / ")}`);
  }

  const avoid = listValues(profile.avoid);
  if (avoid.length) {
    lines.push(`Quality avoid: ${avoid.join(", ")}`);
  }

  return lines;
}

function getTargetAssetIds(input) {
  const workflow = getImagegenWorkflow(input);
  if (workflow.disabled) {
    return [];
  }
  if (Array.isArray(workflow.targetAssetIds)) {
    return unique(workflow.targetAssetIds);
  }

  const kvCritical = input.worldPreset
    && input.worldPreset.kvStyleProfile
    && input.worldPreset.kvStyleProfile.assetPriorities
    && Array.isArray(input.worldPreset.kvStyleProfile.assetPriorities.kvCritical)
    ? input.worldPreset.kvStyleProfile.assetPriorities.kvCritical
    : [];
  const imageBatch = input.materialSpecSheet.assets
    .filter((asset) => asset.generationPlan && asset.generationPlan.backendClass === "image_batch")
    .map((asset) => asset.assetId);
  return unique([...kvCritical, ...imageBatch]);
}

function getGenerationDimensions(asset, placement, designRules) {
  const exportRequirements = asset.exportRequirements || {};
  const declaredSize = Array.isArray(exportRequirements.sizes) && exportRequirements.sizes.length
    ? exportRequirements.sizes[0]
    : "";
  // 9-slice/tile assets are generated at their declared base size, which is
  // intentionally different from the placement sizes they stretch onto.
  if (getAssetScalingPolicy(asset, designRules) !== "fixed" && declaredSize) {
    return declaredSize;
  }
  if (placement) {
    return `${placement.width}x${placement.height}`;
  }
  return declaredSize || "512x512";
}

function buildAssetPrompt({ input, asset, placement, qualityPlan, compositionContexts = [], layoutContext = null, placements = [] }) {
  const preset = input.worldPreset || {};
  const exportRequirements = asset.exportRequirements || {};
  const designRules = getDesignRules(preset);
  const referenceImages = Array.isArray(preset.referenceImages)
    ? preset.referenceImages.map((item) => item.path).filter(Boolean)
    : [];
  const dimensions = getGenerationDimensions(asset, placement, designRules);
  const textOwnership = asset.textHandling && asset.textHandling.ownership === "baked_in_asset"
    ? "Baked text is allowed only for the listed baked text blocks."
    : "Do not include readable text; runtime text will be overlaid by the game.";
  const transparency = exportRequirements.transparent
    ? "Generate as a game asset intended for transparent PNG export. Keep the object isolated from background."
    : "Generate as an opaque background or filled raster asset as specified.";
  const bakedText = asset.textHandling && Array.isArray(asset.textHandling.bakedTextBlocks)
    ? asset.textHandling.bakedTextBlocks.map((block) => block.text).filter(Boolean)
    : [];
  const qualityLines = buildQualityPromptLines(preset, asset);
  const qualityPlanLines = buildQualityPlanPromptLines(qualityPlan);
  const compositionContextLines = buildCompositionContextPromptLines(compositionContexts);
  const layoutContextLines = buildLayoutContextPromptLines(layoutContext, placements);
  const designRulesLines = buildDesignRulesPromptLines(designRules, asset);
  const craftLines = buildCraftPromptLines(designRules, asset, placement);
  const canvasCoverage = exportRequirements.transparent
    ? `Canvas coverage: draw the artwork edge-to-edge — the opaque silhouette must span at least 96% of the ${dimensions} canvas in both width and height. The placement box already includes all breathing room, so do not shrink the subject inside extra transparent padding, and never let any part, glow, or shadow extend past the canvas.`
    : `Canvas coverage: the artwork must cover the full ${dimensions} canvas with no letterboxing, borders, or unpainted margins.`;
  const avoidTerms = [
    ...(preset.negativeKeywords || []),
    ...(preset.qualityProfile && Array.isArray(preset.qualityProfile.avoid) ? preset.qualityProfile.avoid : []),
    "watermark",
    "extra labels",
    "modern generic web UI"
  ].filter(Boolean);

  return [
    "Use case: stylized-concept",
    `Asset type: ${dimensions} game UI production asset`,
    `Primary request: Create ${asset.assetId} for ${input.screenKv.screenName}.`,
    `Canvas role: this asset will be placed at ${placement ? `${placement.x},${placement.y} with size ${placement.width}x${placement.height}, zIndex ${placement.zIndex}` : "an unspecified placement"} on a ${input.screenKv.canvasWidth}x${input.screenKv.canvasHeight} screen.`,
    `Purpose: ${asset.purpose}`,
    `Role: ${asset.assetType} / ${asset.role}`,
    `World preset: ${preset.name || preset.id || "game visual preset"}`,
    `Genre: ${preset.genre || ""}`,
    `Mood keywords: ${(preset.moodKeywords || []).join(", ")}`,
    `Material keywords: ${(preset.materialKeywords || []).join(", ")}`,
    referenceImages.length ? `Reference KV image path(s): ${referenceImages.join(" / ")}` : "",
    preset.kvGuidance && Array.isArray(preset.kvGuidance.notes) ? `KV guidance: ${preset.kvGuidance.notes.join(" / ")}` : "",
    `Style notes: ${noteList(asset.styleNotes).join(" / ")}`,
    `Function notes: ${noteList(asset.functionNotes).join(" / ")}`,
    ...qualityLines,
    ...qualityPlanLines,
    ...compositionContextLines,
    ...layoutContextLines,
    ...designRulesLines,
    ...craftLines,
    canvasCoverage,
    `Text handling: ${textOwnership}`,
    bakedText.length ? `Baked text, verbatim if reliable: ${bakedText.join(" / ")}` : "Baked text: none",
    `Export: ${transparency}`,
    `Final pixel size: ${dimensions}. Save the final PNG at the outputPath for this asset.`,
    exportRequirements.transparent
      ? "Transparency policy: prefer alpha PNG. If alpha export is unavailable, use a perfectly flat #00ff00 chroma-key background with no shadows or green in the subject."
      : "Transparency policy: opaque raster is acceptable.",
    `Style/medium: ${buildStyleMediumLine(preset)}.`,
    "Constraints: match the provided KV mood, keep silhouettes readable at target size, avoid flat placeholder geometry, avoid generic vector mockups.",
    `Avoid: ${avoidTerms.join(", ")}.`
  ].filter(Boolean).join("\n");
}

function buildCodexPrompt(job) {
  return [
    "You are an AI agent (Codex CLI, Claude Code, or a similar local agent) processing a Game Screen Foundry local imagegen handoff job.",
    "",
    `Read and follow this local job JSON file: ${job.jobPath}`,
    "Use the available image generation path: Codex built-in imagegen, an image-generation MCP tool, or another local image workflow.",
    "Create real raster game UI production assets. Never replace the request with SVG, canvas, geometric, wireframe, mock, diagram, or placeholder output.",
    "Save each accepted final image exactly to its outputPath.",
    "If image generation is unavailable, blocked by policy/safety, or cannot produce a usable final asset, do not create a fake image.",
    "For blocked assets, write a small JSON sidecar to the asset blockerPath or to the job-level blocker sidecar path. Use the blocker schema in the job JSON.",
    "Do not modify files outside the listed output paths, blocker sidecars, job files, or status files.",
    "Do not run repository cleanup or git commands for this handoff job.",
    "",
    "Job JSON:",
    JSON.stringify(job, null, 2)
  ].join("\n");
}

function buildImagegenJob(input, options = {}) {
  const targetIds = getTargetAssetIds(input);
  const registered = getRegisteredAssetMap(input);
  const outputDir = getOutputDir(input);
  const jobDir = getJobDir(input);
  const jobId = options.jobId || `imagegen_${new Date().toISOString().replace(/[:.]/g, "-")}`;
  const statusDir = getStatusDir(jobDir);
  const assetById = new Map(input.materialSpecSheet.assets.map((asset) => [asset.assetId, asset]));
  const compositionReview = buildCompositionReview(input);
  const layoutReview = buildLayoutReview(input);
  const designRules = getDesignRules(input.worldPreset);
  const assets = targetIds
    .map((assetId) => {
      const asset = assetById.get(assetId);
      if (!asset) {
        return null;
      }
      const placements = getAssetPlacements(input, assetId);
      const placement = placements[0] || getPrimaryPlacement(input, assetId);
      const qualityPlan = buildAssetQualityPlan({ input, asset, placements });
      const compositionContexts = getAssetCompositionContexts(compositionReview, asset, placements);
      const layoutContext = buildAssetLayoutContext(layoutReview, placements);
      const outputPath = registered[assetId] && registered[assetId].path
        ? path.resolve(registered[assetId].path)
        : path.join(outputDir, `${safeSlug(assetId)}.png`);
      const blockerPath = path.join(outputDir, `${safeSlug(assetId)}.blocked.json`);
      return {
        assetId,
        assetType: asset.assetType,
        role: asset.role,
        purpose: asset.purpose,
        visualPriority: asset.visualPriority,
        width: placement ? placement.width : null,
        height: placement ? placement.height : null,
        scalingPolicy: getAssetScalingPolicy(asset, designRules),
        generationSize: getGenerationDimensions(asset, placement, designRules),
        outputPath,
        blockerPath,
        qualityPlan,
        qualityGate: {
          finalRasterRequired: true,
          placeholderPolicy: "blocked-sidecar-only",
          checks: [
            "Final output is a PNG/JPEG/WebP raster asset, not a placeholder or wireframe.",
            "Runtime text slots and child placement slots remain empty unless the asset explicitly owns baked text.",
            "The asset matches the target placement size and composition context closely enough for the assembled screen."
          ]
        },
        compositionContexts,
        layoutContext,
        prompt: buildAssetPrompt({ input, asset, placement, qualityPlan, compositionContexts, layoutContext, placements }),
        status: fs.existsSync(outputPath) ? "exists" : "missing"
      };
    })
    .filter(Boolean);

  const jobPath = path.join(jobDir, `${jobId}.json`);
  const promptPath = path.join(jobDir, `${jobId}.prompt.md`);
  const statusPath = path.join(statusDir, `${jobId}.json`);
  const jobBlockerPath = path.join(outputDir, `${jobId}.blocked.json`);
  const codexBin = process.env.BETA_CODEX_BIN || DEFAULT_CODEX_BIN;
  const commandHint = [
    codexBin,
    "--ask-for-approval",
    "never",
    "--sandbox",
    "workspace-write",
    "exec",
    "--skip-git-repo-check",
    "--ephemeral",
    "--ignore-rules",
    "-C",
    getBetaRoot(),
    "<",
    promptPath
  ].join(" ");
  const claudeCommandHint = `claude -p "$(cat ${JSON.stringify(promptPath)})"`;

  return {
    schema: HANDOFF_JOB_SCHEMA,
    kind: "game-screen-foundry.imagegen-handoff",
    workflowMode: "game-screen-asset-generation",
    jobId,
    createdAt: new Date().toISOString(),
    screenId: input.screenKv.screenId,
    screenName: input.screenKv.screenName,
    jobDir,
    outputDir,
    jobPath,
    promptPath,
    statusPath,
    jobBlockerPath,
    returnTo: {
      outputDir,
      expected: ["png", "jpg", "jpeg", "webp"],
      registry: "imagegen-assets.json"
    },
    blockerSidecar: {
      path: jobBlockerPath,
      schema: {
        status: "blocked",
        reasonKind: "policy_or_safety | imagegen_unavailable | runner_failed | no_image_returned | unknown",
        userMessage: "Short user-safe reason.",
        suggestion: "Short retry suggestion."
      }
    },
    productBoundary: {
      localFirst: true,
      appCallsOpenAiApiDirectly: false,
      noModelWeightsInRepo: true,
      expectedProcessor: "Codex CLI, Claude Code, user, or another local image workflow"
    },
    commandHint,
    commandHints: {
      codex: commandHint,
      claudeCode: claudeCommandHint
    },
    assets
  };
}

function writeImagegenJobFiles(job) {
  fs.mkdirSync(job.jobDir, { recursive: true });
  fs.mkdirSync(job.outputDir, { recursive: true });
  fs.mkdirSync(path.dirname(job.statusPath), { recursive: true });
  fs.writeFileSync(job.jobPath, `${JSON.stringify(job, null, 2)}\n`);
  fs.writeFileSync(job.promptPath, buildCodexPrompt(job));
  writeImagegenStatus(job, {
    state: "created",
    message: "Imagegen handoff job files were created.",
    runner: {
      mode: process.env.BETA_IMAGEGEN_MODE || "off",
      ran: false,
      ok: true
    },
    adoptedAssetIds: [],
    missingAssetIds: job.assets.map((asset) => asset.assetId),
    blockerReports: []
  });
}

function adoptImagegenOutputs(input, job) {
  const nextInput = clone(input);
  const registered = getRegisteredAssetMap(input);
  if (!nextInput.worldPreset.imagegenAssets || Array.isArray(nextInput.worldPreset.imagegenAssets)) {
    nextInput.worldPreset.imagegenAssets = {
      ...registered
    };
  }

  const adoptedAssetIds = [];
  const missingAssetIds = [];
  const blockerReports = [];
  for (const assetJob of job.assets) {
    if (fs.existsSync(assetJob.outputPath) && fs.statSync(assetJob.outputPath).isFile()) {
      const existing = registered[assetJob.assetId] || {};
      nextInput.worldPreset.imagegenAssets[assetJob.assetId] = {
        ...existing,
        assetId: assetJob.assetId,
        path: assetJob.outputPath,
        backend: existing.backend || "codex_cli_imagegen",
        usesImagegen: existing.usesImagegen !== false,
        prompt: existing.prompt || assetJob.prompt,
        jobId: existing.jobId || job.jobId,
        notes: existing.notes || "Adopted from imagegen workflow output."
      };
      adoptedAssetIds.push(assetJob.assetId);
    } else {
      const blocker = readBlockerSidecar(job, assetJob);
      if (blocker) {
        blockerReports.push(blocker);
      }
      missingAssetIds.push(assetJob.assetId);
    }
  }

  return {
    nextInput,
    adoptedAssetIds,
    missingAssetIds,
    blockerReports
  };
}

function uniquePaths(paths) {
  return [...new Set(paths.map((item) => path.resolve(item)).filter(Boolean))];
}

function blockerPathCandidates(job, assetJob) {
  const outputBase = assetJob.outputPath
    ? assetJob.outputPath.replace(/\.[^.]+$/u, "")
    : path.join(job.outputDir, safeSlug(assetJob.assetId));
  return uniquePaths([
    assetJob.blockerPath,
    `${outputBase}.blocked.json`,
    path.join(job.outputDir, `${safeSlug(assetJob.assetId)}.blocked.json`),
    path.join(job.outputDir, `${job.jobId}-${safeSlug(assetJob.assetId)}.blocked.json`),
    job.jobBlockerPath,
    path.join(job.jobDir, `${job.jobId}-${safeSlug(assetJob.assetId)}.blocked.json`),
    path.join(job.jobDir, `${job.jobId}.blocked.json`)
  ]);
}

function readJsonFileSafe(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    return {
      status: "blocked",
      reasonKind: "unknown",
      userMessage: `Blocker sidecar could not be parsed: ${error.message}`,
      suggestion: "Open the sidecar file and rewrite it as valid JSON."
    };
  }
}

function normalizeBlockerSidecar(raw) {
  const reasonKind = String(raw.reasonKind || raw.reason || "unknown");
  return {
    status: String(raw.status || "blocked"),
    reasonKind,
    userMessage: String(raw.userMessage || raw.message || "Image generation did not return a usable asset."),
    suggestion: raw.suggestion ? String(raw.suggestion) : ""
  };
}

function readBlockerSidecar(job, assetJob) {
  const foundPath = blockerPathCandidates(job, assetJob).find((candidate) => {
    return fs.existsSync(candidate) && fs.statSync(candidate).isFile();
  });
  if (!foundPath) {
    return null;
  }
  return {
    assetId: assetJob.assetId,
    path: foundPath,
    ...normalizeBlockerSidecar(readJsonFileSafe(foundPath))
  };
}

function classifyHandoffState({ job, runner, adoptedAssetIds, missingAssetIds, blockerReports }) {
  const total = job.assets.length;
  if (!total) {
    return "no_targets";
  }
  if (runner.ran && !runner.ok) {
    return "runner_failed";
  }
  if (adoptedAssetIds.length === total) {
    return "ready";
  }
  if (blockerReports.length && adoptedAssetIds.length === 0) {
    return "blocked";
  }
  if (adoptedAssetIds.length > 0 && missingAssetIds.length > 0) {
    return blockerReports.length ? "partial_blocked" : "partial";
  }
  return runner.ran ? "missing_outputs" : "waiting";
}

function buildHandoffReport(job, runner, adoption) {
  const state = classifyHandoffState({
    job,
    runner,
    adoptedAssetIds: adoption.adoptedAssetIds,
    missingAssetIds: adoption.missingAssetIds,
    blockerReports: adoption.blockerReports
  });
  const messages = {
    no_targets: "No target assets were selected for imagegen.",
    ready: "All target assets have usable output files.",
    blocked: "Image generation returned blocker sidecars instead of usable assets.",
    partial_blocked: "Some assets were adopted and some returned blocker sidecars.",
    partial: "Some assets were adopted; remaining outputs are still missing.",
    runner_failed: "The configured imagegen runner failed.",
    missing_outputs: "The runner completed or was attempted, but output files are missing.",
    waiting: "Job files are ready for Codex or another local image workflow."
  };
  return {
    schema: HANDOFF_STATUS_SCHEMA,
    jobId: job.jobId,
    state,
    message: messages[state],
    updatedAt: new Date().toISOString(),
    counts: {
      total: job.assets.length,
      adopted: adoption.adoptedAssetIds.length,
      missing: adoption.missingAssetIds.length,
      blockers: adoption.blockerReports.length
    },
    paths: {
      jobPath: job.jobPath,
      promptPath: job.promptPath,
      outputDir: job.outputDir,
      statusPath: job.statusPath,
      jobBlockerPath: job.jobBlockerPath
    },
    commandHint: job.commandHint,
    runner,
    adoptedAssetIds: adoption.adoptedAssetIds,
    missingAssetIds: adoption.missingAssetIds,
    blockerReports: adoption.blockerReports
  };
}

function writeImagegenStatus(job, handoff) {
  fs.mkdirSync(path.dirname(job.statusPath), { recursive: true });
  fs.writeFileSync(job.statusPath, `${JSON.stringify(handoff, null, 2)}\n`);
}

function runImagegenJob(job) {
  const mode = process.env.BETA_IMAGEGEN_MODE || "off";
  if (mode === "off") {
    return {
      mode,
      ran: false,
      ok: true,
      message: "BETA_IMAGEGEN_MODE is off. Job files were created for external Codex/imagegen execution."
    };
  }

  let command = "";
  let args = [];
  let options = {
    cwd: getBetaRoot(),
    encoding: "utf8",
    timeout: Number(process.env.BETA_IMAGEGEN_TIMEOUT_MS || 120000),
    maxBuffer: 1024 * 1024 * 8
  };

  if (mode === "mock") {
    command = process.execPath;
    args = [path.join(getBetaRoot(), "scripts", "mock-imagegen-runner.js"), job.jobPath];
  } else if (mode === "codex") {
    command = process.env.BETA_CODEX_BIN || DEFAULT_CODEX_BIN;
    args = [
      "--ask-for-approval",
      "never",
      "--sandbox",
      "workspace-write",
      "exec",
      "--skip-git-repo-check",
      "--ephemeral",
      "--ignore-rules",
      "-C",
      getBetaRoot(),
      fs.readFileSync(job.promptPath, "utf8")
    ];
  } else if (mode === "claude") {
    command = process.env.BETA_CLAUDE_BIN || "claude";
    args = [
      "-p",
      "--permission-mode",
      "acceptEdits",
      fs.readFileSync(job.promptPath, "utf8")
    ];
  } else if (mode === "command") {
    const runner = process.env.BETA_IMAGEGEN_RUNNER;
    if (!runner) {
      return {
        mode,
        ran: false,
        ok: false,
        message: "BETA_IMAGEGEN_RUNNER is required when BETA_IMAGEGEN_MODE=command."
      };
    }
    const result = spawnSync(`${runner} "${job.jobPath}"`, {
      ...options,
      shell: true
    });
    return {
      mode,
      ran: true,
      ok: result.status === 0,
      status: result.status,
      stdout: result.stdout || "",
      stderr: result.stderr || "",
      message: result.status === 0 ? "External imagegen runner completed." : "External imagegen runner failed."
    };
  } else {
    return {
      mode,
      ran: false,
      ok: false,
      message: `Unknown BETA_IMAGEGEN_MODE: ${mode}`
    };
  }

  const result = spawnSync(command, args, options);
  return {
    mode,
    ran: true,
    ok: result.status === 0,
    status: result.status,
    stdout: result.stdout || "",
    stderr: result.stderr || "",
    message: result.status === 0 ? `${mode} imagegen runner completed.` : `${mode} imagegen runner failed.`
  };
}

function prepareImagegenWorkflow(input, { run = false, writeFiles = true } = {}) {
  const job = buildImagegenJob(input);
  if (writeFiles) {
    writeImagegenJobFiles(job);
  }

  const runner = run ? runImagegenJob(job) : {
    mode: process.env.BETA_IMAGEGEN_MODE || "off",
    ran: false,
    ok: true,
    message: "Job created; runner was not executed."
  };
  const adoption = adoptImagegenOutputs(input, job);
  const blockersByAssetId = new Map(adoption.blockerReports.map((blocker) => [blocker.assetId, blocker]));
  const refreshedJob = {
    ...job,
    assets: job.assets.map((assetJob) => ({
      ...assetJob,
      status: fs.existsSync(assetJob.outputPath)
        ? "exists"
        : blockersByAssetId.has(assetJob.assetId)
          ? "blocked"
          : "missing",
      blocker: blockersByAssetId.get(assetJob.assetId) || null
    }))
  };
  const handoff = buildHandoffReport(refreshedJob, runner, adoption);
  if (writeFiles) {
    writeImagegenStatus(refreshedJob, handoff);
  }

  return {
    nextInput: adoption.nextInput,
    report: {
      job: refreshedJob,
      runner,
      adoptedAssetIds: adoption.adoptedAssetIds,
      missingAssetIds: adoption.missingAssetIds,
      blockerReports: adoption.blockerReports,
      handoff
    }
  };
}

module.exports = {
  adoptImagegenOutputs,
  buildImagegenJob,
  prepareImagegenWorkflow,
  runImagegenJob,
  writeImagegenJobFiles
};
