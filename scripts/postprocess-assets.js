#!/usr/bin/env node
"use strict";

// Batch postprocess for generated PNGs: trims transparent gutters and
// resizes each asset to its intended final pixel size so the artwork fills
// its placement box instead of rendering smaller than its slot.
//
// Usage:
//   npm run postprocess:assets -- /path/to/screen-folder [--apply]
//
// Without --apply the script only reports what it would change.

const fs = require("fs");
const path = require("path");

const { parsePng } = require("../lib/png-metrics");
const { alphaBounds, cropRgba, encodePng, fitRgba, resizeRgba } = require("../lib/png-write");

const FOUNDATION_ASSET_TYPES = ["panel", "card_frame", "button"];
const FLOAT_COVERAGE_FLOOR = 0.7;
const { getAssetScalingPolicy, getDesignRules } = require("../lib/design-rules");
const { resolveBundleFromFolder } = require("../lib/folder-loader");
const { prepareInput } = require("../lib/spec");

function usage() {
  process.stdout.write([
    "Usage: npm run postprocess:assets -- /path/to/screen-or-project-folder [screen-id] [--apply]",
    "",
    "Trims transparent gutters from registered generated PNGs and resizes each",
    "asset to its target size (primary placement size, or the declared",
    "exportRequirements size for nine_slice assets). Dry-run by default."
  ].join("\n"));
  process.stdout.write("\n");
}

function parseSize(value) {
  const match = /^(\d+)x(\d+)$/u.exec(String(value || ""));
  return match ? { width: Number(match[1]), height: Number(match[2]) } : null;
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

function main() {
  const args = process.argv.slice(2).filter((arg) => arg !== "--apply");
  const apply = process.argv.includes("--apply");
  const [folderPath, screenId] = args;
  if (!folderPath || folderPath === "--help") {
    usage();
    process.exitCode = folderPath ? 0 : 1;
    return;
  }

  const loaded = resolveBundleFromFolder(path.resolve(folderPath), { screenId: screenId || "" });
  const input = prepareInput(loaded.bundle);
  const designRules = getDesignRules(input.worldPreset);
  const assetById = new Map(input.materialSpecSheet.assets.map((asset) => [asset.assetId, asset]));
  const placementsByAsset = new Map();
  for (const placement of input.materialSpecSheet.placements) {
    if (!placementsByAsset.has(placement.assetId)) {
      placementsByAsset.set(placement.assetId, []);
    }
    placementsByAsset.get(placement.assetId).push(placement);
  }

  let changed = 0;
  let skipped = 0;
  for (const entry of getRegisteredAssetEntries(input.worldPreset)) {
    const asset = assetById.get(entry.assetId);
    const filePath = path.isAbsolute(entry.path) ? entry.path : path.resolve(entry.path);
    if (!asset || !fs.existsSync(filePath) || !filePath.endsWith(".png")) {
      continue;
    }
    if (/fill/u.test(String(asset.role || ""))) {
      skipped += 1;
      continue;
    }

    const scalingPolicy = getAssetScalingPolicy(asset, designRules);
    const placements = placementsByAsset.get(entry.assetId) || [];
    const declaredSize = asset.exportRequirements && Array.isArray(asset.exportRequirements.sizes)
      ? parseSize(asset.exportRequirements.sizes[0])
      : null;
    const target = scalingPolicy === "nine_slice"
      ? declaredSize
      : placements[0]
        ? { width: Math.round(placements[0].width), height: Math.round(placements[0].height) }
        : declaredSize;
    if (!target) {
      skipped += 1;
      continue;
    }

    let image;
    try {
      image = parsePng(fs.readFileSync(filePath));
    } catch (error) {
      process.stderr.write(`skip ${entry.assetId}: ${error.message}\n`);
      skipped += 1;
      continue;
    }
    const bounds = alphaBounds(image);
    if (!bounds) {
      skipped += 1;
      continue;
    }

    const isFoundation = FOUNDATION_ASSET_TYPES.includes(asset.assetType);
    const resizeNeeded = image.width !== target.width || image.height !== target.height;
    const coverageW = bounds.width / image.width;
    const coverageH = bounds.height / image.height;
    // Foundation surfaces must fill their box on both axes; other assets are
    // only reworked when they float small on both axes or need a new size.
    const gutterProblem = isFoundation
      ? bounds.width < image.width - 2 || bounds.height < image.height - 2
      : coverageW < FLOAT_COVERAGE_FLOOR && coverageH < FLOAT_COVERAGE_FLOOR;
    if (!resizeNeeded && !gutterProblem) {
      continue;
    }

    // Foundation surfaces stretch edge-to-edge; icons and decor keep their
    // glyph aspect and are centered in the target canvas.
    const mode = isFoundation ? "stretch" : "fit";
    const label = `${entry.assetId}: ${image.width}x${image.height} (art ${bounds.width}x${bounds.height}) -> trim + ${mode} to ${target.width}x${target.height}`;
    if (!apply) {
      process.stdout.write(`would change ${label}\n`);
      changed += 1;
      continue;
    }
    const trimmed = gutterProblem || isFoundation ? cropRgba(image, bounds) : image;
    const resized = mode === "stretch"
      ? resizeRgba(trimmed, target.width, target.height)
      : fitRgba(trimmed, target.width, target.height);
    fs.writeFileSync(filePath, encodePng(resized));
    process.stdout.write(`changed ${label}\n`);
    changed += 1;
  }

  process.stdout.write(`${apply ? "changed" : "would change"} ${changed} file(s), skipped ${skipped}.\n`);
  if (!apply && changed) {
    process.stdout.write("Re-run with --apply to write the files.\n");
  }
}

try {
  main();
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exit(1);
}
