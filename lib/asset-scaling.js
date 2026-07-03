"use strict";

const fs = require("fs");
const path = require("path");
const { analyzePngFile, parsePng } = require("./png-metrics");
const { auditCraftMetrics, suggestCraftStyle } = require("./craft-baseline");
const { getAssetRenderIntent, getAssetScalingPolicy, getDesignRules } = require("./design-rules");

// Anti-aliased edges and soft drop shadows legitimately reach ~20-25%
// semi-transparent pixels; a body full of ghost blobs or un-flattened effect
// layers sits far above that.
const TRANSLUCENT_FAIL_RATIO = 0.55;
const TRANSLUCENT_WARN_RATIO = 0.35;
const { getOverlayBox, getPlacementBox } = require("./composition-quality");

const MIN_TEXT_CONTRAST = 2.5;

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

function parseHexColor(value) {
  const match = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/iu.exec(String(value || "").trim());
  if (!match) {
    return null;
  }
  const hex = match[1].length === 3
    ? match[1].split("").map((char) => char + char).join("")
    : match[1];
  return [
    parseInt(hex.slice(0, 2), 16),
    parseInt(hex.slice(2, 4), 16),
    parseInt(hex.slice(4, 6), 16)
  ];
}

function relativeLuminance([r, g, b]) {
  const channel = (value) => {
    const c = value / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function contrastRatio(colorA, colorB) {
  const lumA = relativeLuminance(colorA);
  const lumB = relativeLuminance(colorB);
  return (Math.max(lumA, lumB) + 0.05) / (Math.min(lumA, lumB) + 0.05);
}

function averageRegionColor(image, rect) {
  let r = 0;
  let g = 0;
  let b = 0;
  let count = 0;
  const left = Math.max(0, Math.floor(rect.x));
  const top = Math.max(0, Math.floor(rect.y));
  const right = Math.min(image.width, Math.ceil(rect.x + rect.width));
  const bottom = Math.min(image.height, Math.ceil(rect.y + rect.height));
  for (let y = top; y < bottom; y += 1) {
    for (let x = left; x < right; x += 1) {
      const offset = (y * image.width + x) * 4;
      if (image.rgba[offset + 3] > 128) {
        r += image.rgba[offset];
        g += image.rgba[offset + 1];
        b += image.rgba[offset + 2];
        count += 1;
      }
    }
  }
  return count ? [r / count, g / count, b / count] : null;
}

// Samples the generated PNG under each runtime text slot and compares the
// declared text color against the actual backdrop, so unreadable label
// colors are caught before implementation.
function auditTextContrast({ input, assetById, placements, checks, baseDir }) {
  const materialSpec = input.materialSpecSheet || {};
  const overlays = Array.isArray(materialSpec.contentOverlays) ? materialSpec.contentOverlays : [];
  const placementById = new Map(placements.map((placement) => [placement.placementId, placement]));
  const registered = new Map(getRegisteredAssetEntries(input.worldPreset).map((entry) => [entry.assetId, entry]));
  const imageCache = new Map();

  for (const overlay of overlays) {
    if (!overlay.color || !overlay.targetPlacementId || !placementById.has(overlay.targetPlacementId)) {
      continue;
    }
    const textColor = parseHexColor(overlay.color);
    if (!textColor) {
      continue;
    }
    const target = placementById.get(overlay.targetPlacementId);
    const entry = registered.get(target.assetId);
    if (!entry) {
      continue;
    }
    const filePath = resolveAssetPath(entry, baseDir);
    if (!fs.existsSync(filePath) || !filePath.endsWith(".png")) {
      continue;
    }
    let image = imageCache.get(filePath);
    if (image === undefined) {
      try {
        image = parsePng(fs.readFileSync(filePath));
      } catch (error) {
        image = null;
      }
      imageCache.set(filePath, image);
    }
    if (!image) {
      continue;
    }

    // Map the slot rect from placement-local coordinates into PNG pixels.
    const targetBox = getPlacementBox(target);
    const overlayBox = getOverlayBox(overlay, placementById);
    const scaleX = image.width / targetBox.width;
    const scaleY = image.height / targetBox.height;
    const region = {
      x: (overlayBox.left - targetBox.left) * scaleX,
      y: (overlayBox.top - targetBox.top) * scaleY,
      width: overlayBox.width * scaleX,
      height: overlayBox.height * scaleY
    };
    const backdrop = averageRegionColor(image, region);
    if (!backdrop) {
      continue;
    }
    let ratio = contrastRatio(textColor, backdrop);
    const strokeColor = Number(overlay.strokeWidth || 0) >= 1 ? parseHexColor(overlay.strokeColor) : null;
    if (strokeColor) {
      // Outlined text stays readable when the outline carries the contrast.
      ratio = Math.max(ratio, contrastRatio(strokeColor, backdrop));
    }
    if (ratio < MIN_TEXT_CONTRAST) {
      checks.push(createCheck("warn", "text_contrast_low", `${overlay.overlayId} uses ${overlay.color} on ${target.assetId}, whose backdrop under the slot averages rgb(${backdrop.map((v) => Math.round(v)).join(",")}) — contrast ratio ${ratio.toFixed(2)} is below ${MIN_TEXT_CONTRAST}. The label will be hard to read; pick a lighter/darker text color or add a contrasting stroke.`, {
        overlayId: overlay.overlayId,
        targetAssetId: target.assetId,
        color: overlay.color,
        contrastRatio: Math.round(ratio * 100) / 100
      }));
    }
  }
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
    const renderIntent = getAssetRenderIntent(asset);
    if (renderIntent === "raster_art") {
      checks.push(...auditCraftMetrics({ metrics, asset, designRules }).map((check) => ({
        ...check,
        refs: { ...check.refs, path: filePath }
      })));
      // A raster asset whose body is largely semi-transparent is broken
      // output (holes, ghost blobs, un-flattened effects): it will let the
      // layers behind it bleed through when composited.
      if (metrics.semiTransparentPixelRatio > TRANSLUCENT_WARN_RATIO) {
        const severity = metrics.semiTransparentPixelRatio > TRANSLUCENT_FAIL_RATIO ? "fail" : "warn";
        checks.push(createCheck(severity, "asset_interior_translucent", `${entry.assetId}: ${Math.round(metrics.semiTransparentPixelRatio * 100)}% of pixels are semi-transparent, so underlying layers will bleed through when composited. Regenerate with an opaque body, or declare exportRequirements.renderIntent "translucent_effect" if the transparency is intentional.`, {
          assetId: entry.assetId,
          path: filePath,
          semiTransparentPixelRatio: metrics.semiTransparentPixelRatio
        }));
      }
    }
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

  auditTextContrast({ input, assetById, placements, checks, baseDir: options.baseDir || "" });

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

// Measures up to `limit` adopted PNGs and suggests a designRules.craftStyle
// matching the existing art direction. Returns null when craftStyle is
// already declared or there is not enough artwork to sample.
function suggestCraftStyleForInput(input, options = {}) {
  const designRules = getDesignRules(input.worldPreset);
  if (designRules.craftStyle) {
    return null;
  }
  const materialSpec = input.materialSpecSheet || {};
  const assets = Array.isArray(materialSpec.assets) ? materialSpec.assets : [];
  const assetById = new Map(assets.map((asset) => [asset.assetId, asset]));
  const limit = Number(options.limit || 12);
  const metricsList = [];
  for (const entry of getRegisteredAssetEntries(input.worldPreset)) {
    if (metricsList.length >= limit) {
      break;
    }
    const asset = assetById.get(entry.assetId);
    if (!asset || asset.assetType === "background") {
      continue;
    }
    const filePath = resolveAssetPath(entry, options.baseDir || "");
    if (!fs.existsSync(filePath) || !filePath.endsWith(".png")) {
      continue;
    }
    try {
      metricsList.push(analyzePngFile(filePath));
    } catch (error) {
      // Unreadable files simply do not contribute to the sample.
    }
  }
  const suggestion = suggestCraftStyle(metricsList);
  return suggestion
    ? { ...suggestion, sampledCount: metricsList.length }
    : null;
}

module.exports = {
  auditAssetScaling,
  suggestCraftStyleForInput
};
