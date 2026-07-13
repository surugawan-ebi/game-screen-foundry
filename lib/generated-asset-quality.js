"use strict";

const fs = require("fs");
const path = require("path");

const { parsePng } = require("./png-metrics");
const { alphaBounds, cropRgba, encodePng, fitRgba, resizeRgba } = require("./png-write");

const FOUNDATION_ASSET_TYPES = new Set(["panel", "card_frame", "button"]);
const GREEN_KEY = { red: 0, green: 255, blue: 0 };
const KEY_DETECTION_DISTANCE = 42;
const KEY_BORDER_RATIO = 0.8;
const KEY_TRANSPARENT_DISTANCE = 22;
const KEY_SOFT_DISTANCE = 86;
const ALPHA_THRESHOLD = 12;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function colorDistance(red, green, blue, key) {
  return Math.sqrt(
    (red - key.red) ** 2
    + (green - key.green) ** 2
    + (blue - key.blue) ** 2
  );
}

function borderPixelOffsets(image) {
  const offsets = [];
  for (let x = 0; x < image.width; x += 1) {
    offsets.push(x * 4);
    if (image.height > 1) {
      offsets.push(((image.height - 1) * image.width + x) * 4);
    }
  }
  for (let y = 1; y < image.height - 1; y += 1) {
    offsets.push((y * image.width) * 4);
    if (image.width > 1) {
      offsets.push((y * image.width + image.width - 1) * 4);
    }
  }
  return offsets;
}

function detectGreenChromaKey(image) {
  const offsets = borderPixelOffsets(image);
  if (!offsets.length) {
    return null;
  }
  let matching = 0;
  let red = 0;
  let green = 0;
  let blue = 0;
  for (const offset of offsets) {
    const distance = colorDistance(
      image.rgba[offset],
      image.rgba[offset + 1],
      image.rgba[offset + 2],
      GREEN_KEY
    );
    if (distance <= KEY_DETECTION_DISTANCE && image.rgba[offset + 3] > ALPHA_THRESHOLD) {
      matching += 1;
      red += image.rgba[offset];
      green += image.rgba[offset + 1];
      blue += image.rgba[offset + 2];
    }
  }
  if (matching / offsets.length < KEY_BORDER_RATIO) {
    return null;
  }
  return {
    red: Math.round(red / matching),
    green: Math.round(green / matching),
    blue: Math.round(blue / matching),
    borderRatio: matching / offsets.length
  };
}

function removeChromaKey(image, key) {
  const rgba = Buffer.from(image.rgba);
  for (let offset = 0; offset < rgba.length; offset += 4) {
    const distance = colorDistance(rgba[offset], rgba[offset + 1], rgba[offset + 2], key);
    if (distance > KEY_SOFT_DISTANCE) {
      continue;
    }
    const matte = clamp(
      (distance - KEY_TRANSPARENT_DISTANCE) / (KEY_SOFT_DISTANCE - KEY_TRANSPARENT_DISTANCE),
      0,
      1
    );
    rgba[offset + 3] = Math.round(rgba[offset + 3] * matte);
    if (rgba[offset + 3] <= ALPHA_THRESHOLD) {
      rgba[offset] = 0;
      rgba[offset + 1] = 0;
      rgba[offset + 2] = 0;
      rgba[offset + 3] = 0;
      continue;
    }
    const nonGreen = Math.max(rgba[offset], rgba[offset + 2]);
    if (rgba[offset + 1] > nonGreen) {
      rgba[offset + 1] = Math.round(nonGreen + (rgba[offset + 1] - nonGreen) * matte);
    }
  }
  return {
    width: image.width,
    height: image.height,
    rgba
  };
}

function summarizeAlpha(image) {
  let transparentPixels = 0;
  let semiTransparentPixels = 0;
  let greenResiduePixels = 0;
  const pixelCount = image.width * image.height;
  for (let offset = 0; offset < image.rgba.length; offset += 4) {
    const alpha = image.rgba[offset + 3];
    if (alpha <= ALPHA_THRESHOLD) {
      transparentPixels += 1;
    } else if (alpha < 250) {
      semiTransparentPixels += 1;
    }
    if (
      alpha > ALPHA_THRESHOLD
      && image.rgba[offset] < 55
      && image.rgba[offset + 1] > 220
      && image.rgba[offset + 2] < 55
    ) {
      greenResiduePixels += 1;
    }
  }
  const cornerOffsets = [
    0,
    Math.max(0, image.width - 1) * 4,
    Math.max(0, (image.height - 1) * image.width) * 4,
    Math.max(0, image.width * image.height - 1) * 4
  ];
  const transparentCorners = cornerOffsets.filter((offset) => image.rgba[offset + 3] <= ALPHA_THRESHOLD).length;
  return {
    transparentPixelRatio: pixelCount ? transparentPixels / pixelCount : 0,
    semiTransparentPixelRatio: pixelCount ? semiTransparentPixels / pixelCount : 0,
    visiblePixelRatio: pixelCount ? (pixelCount - transparentPixels) / pixelCount : 0,
    greenResidueRatio: pixelCount ? greenResiduePixels / pixelCount : 0,
    transparentCorners
  };
}

function normalizeToTarget(image, asset, target) {
  if (!target || !target.width || !target.height) {
    return image;
  }
  const bounds = alphaBounds(image);
  if (!bounds) {
    return image;
  }
  const isFoundation = FOUNDATION_ASSET_TYPES.has(asset.assetType);
  const coverageWidth = bounds.width / image.width;
  const coverageHeight = bounds.height / image.height;
  const gutterProblem = isFoundation
    ? bounds.width < image.width - 2 || bounds.height < image.height - 2
    : coverageWidth < 0.7 && coverageHeight < 0.7;
  const source = gutterProblem || isFoundation ? cropRgba(image, bounds) : image;
  if (source.width === target.width && source.height === target.height) {
    return source;
  }
  return isFoundation
    ? resizeRgba(source, target.width, target.height)
    : fitRgba(source, target.width, target.height);
}

function createCheck(status, code, message, details = {}) {
  return { status, code, message, details };
}

function processGeneratedAsset({
  filePath,
  asset,
  target = null,
  apply = true,
  allowChromaKey = true,
  normalizeSize = true
}) {
  const resolved = path.resolve(filePath);
  const checks = [];
  const actions = [];
  if (path.extname(resolved).toLowerCase() !== ".png") {
    return {
      ok: false,
      assetId: asset.assetId,
      path: resolved,
      actions,
      checks: [createCheck("fail", "final_png_required", "The accepted game asset must be a PNG.")]
    };
  }

  let image;
  try {
    image = parsePng(fs.readFileSync(resolved));
    checks.push(createCheck("pass", "png_readable", "PNG decoded successfully."));
  } catch (error) {
    return {
      ok: false,
      assetId: asset.assetId,
      path: resolved,
      actions,
      checks: [createCheck("fail", "png_unreadable", error.message)]
    };
  }

  const transparentRequired = Boolean(asset.exportRequirements && asset.exportRequirements.transparent);
  let alpha = summarizeAlpha(image);
  if (transparentRequired && alpha.transparentPixelRatio === 0) {
    const key = allowChromaKey ? detectGreenChromaKey(image) : null;
    if (key) {
      image = removeChromaKey(image, key);
      actions.push({
        action: "remove_chroma_key",
        key: `rgb(${key.red},${key.green},${key.blue})`,
        borderRatio: Math.round(key.borderRatio * 1000) / 1000
      });
      alpha = summarizeAlpha(image);
    } else {
      checks.push(createCheck("fail", "transparent_alpha_missing", "This asset requires transparency, but no transparent pixels or removable green chroma-key border were found."));
    }
  }

  if (normalizeSize && target) {
    const before = `${image.width}x${image.height}`;
    const normalized = normalizeToTarget(image, asset, target);
    const changed = normalized.width !== image.width
      || normalized.height !== image.height
      || !normalized.rgba.equals(image.rgba);
    image = normalized;
    if (changed) {
      actions.push({ action: "normalize_size", from: before, to: `${image.width}x${image.height}` });
    }
  }

  alpha = summarizeAlpha(image);
  if (transparentRequired) {
    if (alpha.transparentPixelRatio > 0) {
      checks.push(createCheck("pass", "transparent_alpha_present", "Transparent pixels are present.", alpha));
    } else if (!checks.some((check) => check.code === "transparent_alpha_missing" || check.code === "chroma_key_needs_processing")) {
      checks.push(createCheck("fail", "transparent_alpha_missing", "This asset requires transparency, but the final PNG is fully opaque.", alpha));
    }
    if (alpha.transparentCorners > 0) {
      checks.push(createCheck("pass", "transparent_corner_present", `${alpha.transparentCorners} transparent canvas corner(s) detected.`, alpha));
    } else {
      checks.push(createCheck("fail", "transparent_corner_missing", "A transparent asset must leave at least one canvas corner transparent.", alpha));
    }
    if (alpha.visiblePixelRatio < 0.05) {
      checks.push(createCheck("fail", "asset_silhouette_missing", "Fewer than 5% of pixels remain visible after transparency processing.", alpha));
    }
    const chromaRemoved = actions.some((action) => action.action === "remove_chroma_key");
    if (chromaRemoved && alpha.greenResidueRatio > 0.002) {
      checks.push(createCheck("fail", "chroma_key_residue", "Green chroma-key residue remains in visible pixels.", alpha));
    }
  }

  if (target) {
    if (image.width === target.width && image.height === target.height) {
      checks.push(createCheck("pass", "final_pixel_size", `Final size is ${target.width}x${target.height}.`));
    } else {
      checks.push(createCheck("fail", "final_pixel_size_mismatch", `Expected ${target.width}x${target.height}, got ${image.width}x${image.height}.`));
    }
  }

  const ok = !checks.some((check) => check.status === "fail");
  if (apply && actions.length && ok) {
    fs.writeFileSync(resolved, encodePng(image));
  }
  return {
    ok,
    assetId: asset.assetId,
    path: resolved,
    finalSize: `${image.width}x${image.height}`,
    alpha,
    actions,
    checks
  };
}

module.exports = {
  detectGreenChromaKey,
  processGeneratedAsset,
  removeChromaKey,
  summarizeAlpha
};
