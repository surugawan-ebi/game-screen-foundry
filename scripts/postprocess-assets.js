#!/usr/bin/env node
"use strict";

// Batch postprocess for generated PNGs: removes a safely detected flat green
// chroma key, validates alpha, trims transparent gutters, and resizes each
// asset to its intended final pixel size.
//
// Usage:
//   npm run postprocess:assets -- /path/to/screen-folder [--apply]
//
// Without --apply the script only reports what it would change.

const fs = require("fs");
const path = require("path");

const { processGeneratedAsset } = require("../lib/generated-asset-quality");
const { getAssetScalingPolicy, getDesignRules } = require("../lib/design-rules");
const { resolveBundleFromFolder } = require("../lib/folder-loader");
const { prepareInput } = require("../lib/spec");

function usage() {
  process.stdout.write([
    "Usage: npm run postprocess:assets -- /path/to/screen-or-project-folder [screen-id] [--apply]",
    "",
    "Removes a detected flat green chroma key, validates required alpha, trims",
    "transparent gutters, and resizes each asset to its target size (primary",
    "placement size, or the declared nine-slice base size). Dry-run by default."
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

    const report = processGeneratedAsset({
      filePath,
      asset,
      target,
      apply,
      allowChromaKey: true,
      normalizeSize: true
    });

    if (!report.ok) {
      const failures = report.checks
        .filter((check) => check.status === "fail")
        .map((check) => `${check.code}: ${check.message}`)
        .join(" / ");
      process.stderr.write(`reject ${entry.assetId}: ${failures}\n`);
      skipped += 1;
      continue;
    }
    if (!report.actions.length) {
      continue;
    }
    const actions = report.actions.map((action) => action.action).join(" + ");
    process.stdout.write(`${apply ? "changed" : "would change"} ${entry.assetId}: ${actions} -> ${report.finalSize}\n`);
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
