"use strict";

const fs = require("fs");
const path = require("path");
const { analyzePngFile } = require("./png-metrics");
const { getAssetScalingPolicy, getDesignRules } = require("./design-rules");

const ASPECT_TOLERANCE = 0.02;
// Foundation surfaces must fill their canvas almost completely; icons and
// decorative pieces legitimately keep some glyph margin.
const GUTTER_FOUNDATION_FLOOR = 0.92;
const GUTTER_DEFAULT_FLOOR = 0.7;
const FOUNDATION_ASSET_TYPES = ["panel", "card_frame", "button"];

function round(value) {
  return Math.round(Number(value) * 100) / 100;
}

function createCheck(status, code, message, refs = {}) {
  return { status, code, message, refs };
}

function getRegisteredAssetEntries(worldPreset) {
  const registered = worldPreset && worldPreset.imagegenAssets ? worldPreset.imagegenAssets : {};
  if (Array.isArray(registered)) {
    return registered.filter((item) => item && item.assetId && item.path);
  }
  return Object.entries(registered)
    .map(([assetId, item]) => ({ assetId, ...(item || {}) }))
    .filter((item) => item.path);
}

function resolveAssetPath(entry, baseDir) {
  if (path.isAbsolute(entry.path)) {
    return entry.path;
  }
  return baseDir ? path.resolve(baseDir, entry.path) : path.resolve(entry.path);
}

function nineSliceMinimums(insets) {
  const normalized = insets || {};
  return {
    width: Number(normalized.left || 0) + Number(normalized.right || 0),
    height: Number(normalized.top || 0) + Number(normalized.bottom || 0)
  };
}

// Compares generated PNG pixel sizes against the placements that use them.
// Fixed assets must be used at native size (uniform @2x downscale allowed);
// stretching is only legal when the asset explicitly declares
// exportRequirements.scalingPolicy = "nine_slice" (with nineSliceInsets) or
// "tile".
function auditAssetScaling(input, options = {}) {
  const checks = [];
  const materialSpec = input.materialSpecSheet || {};
  const assets = Array.isArray(materialSpec.assets) ? materialSpec.assets : [];
  const placements = Array.isArray(materialSpec.placements) ? materialSpec.placements : [];
  const assetById = new Map(assets.map((asset) => [asset.assetId, asset]));
  const designRules = getDesignRules(input.worldPreset);
  const placementsByAsset = new Map();
  for (const placement of placements) {
    if (!placementsByAsset.has(placement.assetId)) {
      placementsByAsset.set(placement.assetId, []);
    }
    placementsByAsset.get(placement.assetId).push(placement);
  }

  let auditedCount = 0;
  for (const entry of getRegisteredAssetEntries(input.worldPreset)) {
    const asset = assetById.get(entry.assetId);
    if (!asset) {
      continue;
    }
    const filePath = resolveAssetPath(entry, options.baseDir || "");
    if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
      continue;
    }
    let metrics;
    try {
      metrics = analyzePngFile(filePath);
    } catch (error) {
      checks.push(createCheck("warn", "asset_unreadable", `${entry.assetId}: PNG could not be analyzed (${error.message}).`, {
        assetId: entry.assetId,
        path: filePath
      }));
      continue;
    }
    auditedCount += 1;
    const scalingPolicy = getAssetScalingPolicy(asset, designRules);
    const isFillLayer = /fill/u.test(String(asset.role || ""));
    const refsBase = {
      assetId: entry.assetId,
      path: filePath,
      nativeSize: `${metrics.width}x${metrics.height}`,
      scalingPolicy
    };

    for (const placement of placementsByAsset.get(entry.assetId) || []) {
      const refs = {
        ...refsBase,
        placementId: placement.placementId,
        placementSize: `${placement.width}x${placement.height}`
      };
      const exact = Math.abs(metrics.width - placement.width) <= 1
        && Math.abs(metrics.height - placement.height) <= 1;
      if (exact) {
        checks.push(createCheck("pass", "asset_native_size", `${entry.assetId} is used at native size on ${placement.placementId}.`, refs));
        continue;
      }
      if (isFillLayer) {
        // Progress/gauge fills legally render at variable width/height.
        checks.push(createCheck("pass", "asset_fill_variable", `${entry.assetId} is a fill layer with runtime-variable size on ${placement.placementId}.`, refs));
        continue;
      }
      if (scalingPolicy === "tile") {
        checks.push(createCheck("pass", "asset_tiled", `${entry.assetId} tiles onto ${placement.placementId}.`, refs));
        continue;
      }
      if (scalingPolicy === "nine_slice") {
        const minimums = nineSliceMinimums(asset.exportRequirements && asset.exportRequirements.nineSliceInsets);
        if (!minimums.width && !minimums.height) {
          checks.push(createCheck("warn", "nine_slice_insets_missing", `${entry.assetId} declares nine_slice but has no exportRequirements.nineSliceInsets; slice safety cannot be verified.`, refs));
        } else if (placement.width + 0.5 < minimums.width || placement.height + 0.5 < minimums.height) {
          checks.push(createCheck("fail", "nine_slice_compressed", `${entry.assetId} on ${placement.placementId} is smaller than its 9-slice corner band (${minimums.width}x${minimums.height} minimum); corners will be crushed.`, {
            ...refs,
            minimums
          }));
        } else {
          checks.push(createCheck("pass", "asset_nine_slice", `${entry.assetId} stretches onto ${placement.placementId} via declared 9-slice.`, refs));
        }
        continue;
      }
      const nativeAspect = metrics.width / metrics.height;
      const placementAspect = placement.width / placement.height;
      const uniform = Math.abs(placementAspect / nativeAspect - 1) <= ASPECT_TOLERANCE;
      if (uniform && placement.width <= metrics.width + 1) {
        checks.push(createCheck("pass", "asset_uniform_downscale", `${entry.assetId} downscales uniformly (${metrics.width}x${metrics.height} -> ${placement.width}x${placement.height}) on ${placement.placementId}.`, refs));
        continue;
      }
      if (uniform) {
        checks.push(createCheck("warn", "asset_upscaled", `${entry.assetId} is upscaled beyond native size on ${placement.placementId} (${metrics.width}x${metrics.height} -> ${placement.width}x${placement.height}); it will blur. Regenerate at the placement size.`, refs));
        continue;
      }
      checks.push(createCheck("fail", "asset_stretched", `${entry.assetId} is stretched non-uniformly on ${placement.placementId} (native ${metrics.width}x${metrics.height} -> ${placement.width}x${placement.height}). Stretching degrades the artwork: regenerate at the placement size, or declare exportRequirements.scalingPolicy "nine_slice" with nineSliceInsets if this asset family is designed for it.`, refs));
    }

    // Excessive transparent gutters make the asset render smaller than its
    // declared box (the "asset looks too small in its slot" defect).
    const bounds = metrics.nonTransparentBounds;
    if (bounds && metrics.width && metrics.height && !isFillLayer) {
      const coverageW = bounds.width / metrics.width;
      const coverageH = bounds.height / metrics.height;
      // Foundation surfaces must fill the box on both axes; icons and decor
      // are only a problem when they float small on both axes (a tall or
      // wide glyph with margin on one axis is normal).
      const isFoundation = FOUNDATION_ASSET_TYPES.includes(asset.assetType);
      // A couple of pixels of margin is always acceptable (anti-aliased rims
      // on small assets), regardless of the ratio.
      const gutterW = coverageW < GUTTER_FOUNDATION_FLOOR && metrics.width - bounds.width > 2;
      const gutterH = coverageH < GUTTER_FOUNDATION_FLOOR && metrics.height - bounds.height > 2;
      const floatW = coverageW < GUTTER_DEFAULT_FLOOR && metrics.width - bounds.width > 2;
      const floatH = coverageH < GUTTER_DEFAULT_FLOOR && metrics.height - bounds.height > 2;
      const gutterProblem = isFoundation ? gutterW || gutterH : floatW && floatH;
      if (metrics.hasAlpha && gutterProblem) {
        checks.push(createCheck("warn", "asset_gutter_excessive", `${entry.assetId} artwork covers only ${Math.round(coverageW * 100)}% x ${Math.round(coverageH * 100)}% of its canvas; it will look smaller than its slot. Trim the transparent gutter or regenerate filling the canvas.`, {
          ...refsBase,
          coverage: {
            width: round(coverageW),
            height: round(coverageH)
          }
        }));
      }
    }
  }

  const failCount = checks.filter((check) => check.status === "fail").length;
  const warnCount = checks.filter((check) => check.status === "warn").length;
  return {
    summary: {
      auditedCount,
      checkCount: checks.length,
      failCount,
      warnCount,
      passCount: checks.length - failCount - warnCount,
      status: failCount ? "fail" : warnCount ? "warn" : "pass"
    },
    checks
  };
}

module.exports = {
  auditAssetScaling
};
