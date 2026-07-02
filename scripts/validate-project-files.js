"use strict";

const fs = require("fs");
const path = require("path");

const { resolveBundleFromFolder } = require("../lib/folder-loader");
const { generateRenderModel } = require("../lib/generator");
const { prepareInput } = require("../lib/spec");

const root = path.resolve(__dirname, "..");
const allowedLayerFits = new Set(["same_canvas", "inside_root", "edge_attached", "decorative_overlap"]);

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function validateProjectManifest(filePath) {
  const manifest = readJson(filePath);
  assert(manifest && typeof manifest === "object" && !Array.isArray(manifest), `${filePath} must be an object`);
  assert(typeof manifest.projectId === "string" && manifest.projectId, `${filePath} projectId is required`);
  assert(typeof manifest.projectName === "string" && manifest.projectName, `${filePath} projectName is required`);
  assert(Array.isArray(manifest.screens) && manifest.screens.length, `${filePath} screens must be a non-empty array`);
  const screenIds = new Set();
  for (const screen of manifest.screens) {
    assert(screen && typeof screen === "object" && !Array.isArray(screen), `${filePath} screen entries must be objects`);
    assert(typeof screen.screenId === "string" && screen.screenId, `${filePath} screens[].screenId is required`);
    assert(!screenIds.has(screen.screenId), `${filePath} duplicate screenId: ${screen.screenId}`);
    screenIds.add(screen.screenId);
    assert(
      typeof (screen.path || screen.folderPath || screen.dir) === "string" && (screen.path || screen.folderPath || screen.dir),
      `${filePath} screen ${screen.screenId} must include path`
    );
  }
  if (manifest.defaultScreenId) {
    assert(screenIds.has(manifest.defaultScreenId), `${filePath} defaultScreenId is not listed in screens`);
  }
}

function normalizeInset(value, prefix) {
  if (value === undefined) {
    return {
      top: 0,
      right: 0,
      bottom: 0,
      left: 0
    };
  }
  if (typeof value === "number") {
    assert(value >= 0, `${prefix} must be non-negative`);
    return {
      top: value,
      right: value,
      bottom: value,
      left: value
    };
  }
  assert(value && typeof value === "object" && !Array.isArray(value), `${prefix} must be a number or inset object`);
  const inset = {
    top: Number(value.top || 0),
    right: Number(value.right || 0),
    bottom: Number(value.bottom || 0),
    left: Number(value.left || 0)
  };
  for (const [key, amount] of Object.entries(inset)) {
    assert(Number.isFinite(amount) && amount >= 0, `${prefix}.${key} must be a non-negative number`);
  }
  return inset;
}

function mergeInsets(left, right) {
  return {
    top: Math.max(left.top, right.top),
    right: Math.max(left.right, right.right),
    bottom: Math.max(left.bottom, right.bottom),
    left: Math.max(left.left, right.left)
  };
}

function getPlacementBox(placement) {
  return {
    left: placement.x - placement.width / 2,
    top: placement.y - placement.height / 2,
    right: placement.x + placement.width / 2,
    bottom: placement.y + placement.height / 2,
    width: placement.width,
    height: placement.height
  };
}

function formatBox(box) {
  return `${Math.round(box.left)},${Math.round(box.top)}-${Math.round(box.right)},${Math.round(box.bottom)}`;
}

function validateCompositionGroups(materialSpecSheet, label) {
  const groups = materialSpecSheet.compositionGroups || [];
  assert(Array.isArray(groups), `${label} compositionGroups must be an array`);
  if (!groups.length) {
    return;
  }

  const placements = materialSpecSheet.placements || [];
  const overlays = materialSpecSheet.contentOverlays || [];
  const assets = materialSpecSheet.assets || [];
  const placementById = new Map(placements.map((placement) => [placement.placementId, placement]));
  const overlayById = new Map(overlays.map((overlay) => [overlay.overlayId, overlay]));
  const assetIds = new Set(assets.map((asset) => asset.assetId));
  const groupIds = new Set();

  for (const group of groups) {
    assert(group && typeof group === "object" && !Array.isArray(group), `${label} compositionGroups[] must be objects`);
    assert(typeof group.groupId === "string" && group.groupId, `${label} compositionGroups[].groupId is required`);
    assert(!groupIds.has(group.groupId), `${label} duplicate composition groupId: ${group.groupId}`);
    groupIds.add(group.groupId);
  }

  for (const group of groups) {
    const prefix = `${label} compositionGroups.${group.groupId}`;
    assert(typeof group.kind === "string" && group.kind, `${prefix}.kind is required`);
    assert(typeof group.rootPlacementId === "string" && group.rootPlacementId, `${prefix}.rootPlacementId is required`);
    assert(placementById.has(group.rootPlacementId), `${prefix}.rootPlacementId does not match a placement: ${group.rootPlacementId}`);
    assert(Array.isArray(group.layerPlacementIds) && group.layerPlacementIds.length, `${prefix}.layerPlacementIds must be a non-empty array`);

    const layerIds = new Set();
    for (const placementId of group.layerPlacementIds) {
      assert(typeof placementId === "string" && placementId, `${prefix}.layerPlacementIds entries must be strings`);
      assert(!layerIds.has(placementId), `${prefix}.layerPlacementIds has duplicate placement: ${placementId}`);
      assert(placementById.has(placementId), `${prefix}.layerPlacementIds references missing placement: ${placementId}`);
      layerIds.add(placementId);
    }
    assert(layerIds.has(group.rootPlacementId), `${prefix}.rootPlacementId must also be listed in layerPlacementIds`);

    const childContentIds = new Set();
    for (const placementId of group.childContentPlacementIds || []) {
      assert(typeof placementId === "string" && placementId, `${prefix}.childContentPlacementIds entries must be strings`);
      assert(!childContentIds.has(placementId), `${prefix}.childContentPlacementIds has duplicate placement: ${placementId}`);
      assert(placementById.has(placementId), `${prefix}.childContentPlacementIds references missing placement: ${placementId}`);
      assert(placementId !== group.rootPlacementId, `${prefix}.childContentPlacementIds cannot include rootPlacementId`);
      assert(!layerIds.has(placementId), `${prefix}.childContentPlacementIds ${placementId} should not also be in layerPlacementIds`);
      childContentIds.add(placementId);
    }

    if (childContentIds.size) {
      assert(
        group.contentInset !== undefined || group.minChildInset !== undefined,
        `${prefix} with childContentPlacementIds must define contentInset or minChildInset`
      );
      const rootPlacement = placementById.get(group.rootPlacementId);
      const rootBox = getPlacementBox(rootPlacement);
      const inset = mergeInsets(
        normalizeInset(group.contentInset, `${prefix}.contentInset`),
        normalizeInset(group.minChildInset, `${prefix}.minChildInset`)
      );
      assert(
        inset.left + inset.right < rootBox.width && inset.top + inset.bottom < rootBox.height,
        `${prefix} inset is larger than root placement ${group.rootPlacementId}`
      );
      const contentBox = {
        left: rootBox.left + inset.left,
        top: rootBox.top + inset.top,
        right: rootBox.right - inset.right,
        bottom: rootBox.bottom - inset.bottom
      };
      const tolerance = 0.5;
      for (const placementId of childContentIds) {
        const childBox = getPlacementBox(placementById.get(placementId));
        assert(
          childBox.left + tolerance >= contentBox.left
            && childBox.top + tolerance >= contentBox.top
            && childBox.right - tolerance <= contentBox.right
            && childBox.bottom - tolerance <= contentBox.bottom,
          `${prefix}.childContentPlacementIds ${placementId} is outside content inset: child ${formatBox(childBox)} content ${formatBox(contentBox)}`
        );
      }
    }

    if (group.outputAssetId !== undefined) {
      assert(typeof group.outputAssetId === "string" && group.outputAssetId, `${prefix}.outputAssetId must be a non-empty string`);
      assert(assetIds.has(group.outputAssetId), `${prefix}.outputAssetId does not match an asset: ${group.outputAssetId}`);
    }

    for (const overlayId of group.protectedOverlayIds || []) {
      assert(typeof overlayId === "string" && overlayId, `${prefix}.protectedOverlayIds entries must be strings`);
      assert(overlayById.has(overlayId), `${prefix}.protectedOverlayIds references missing overlay: ${overlayId}`);
      const overlay = overlayById.get(overlayId);
      if (overlay.targetPlacementId) {
        assert(
          layerIds.has(overlay.targetPlacementId) || childContentIds.has(overlay.targetPlacementId),
          `${prefix}.protectedOverlayIds ${overlayId} targets placement outside the group: ${overlay.targetPlacementId}`
        );
      }
      const groupedPlacementIds = new Set([...layerIds, ...childContentIds]);
      const maxLayerZ = Math.max(...[...groupedPlacementIds].map((placementId) => placementById.get(placementId).zIndex));
      assert(
        typeof overlay.zIndex === "number" && overlay.zIndex > maxLayerZ,
        `${prefix}.protectedOverlayIds ${overlayId} should render above grouped layers`
      );
    }

    for (const childGroupId of group.childGroupIds || []) {
      assert(typeof childGroupId === "string" && childGroupId, `${prefix}.childGroupIds entries must be strings`);
      assert(groupIds.has(childGroupId), `${prefix}.childGroupIds references missing group: ${childGroupId}`);
      assert(childGroupId !== group.groupId, `${prefix}.childGroupIds cannot reference itself`);
    }

    const layerFitRuleIds = new Set();
    for (const rule of group.layerFitRules || []) {
      assert(rule && typeof rule === "object" && !Array.isArray(rule), `${prefix}.layerFitRules entries must be objects`);
      assert(typeof rule.placementId === "string" && rule.placementId, `${prefix}.layerFitRules[].placementId is required`);
      assert(layerIds.has(rule.placementId), `${prefix}.layerFitRules ${rule.placementId} must reference a layerPlacementId`);
      assert(!layerFitRuleIds.has(rule.placementId), `${prefix}.layerFitRules has duplicate placement: ${rule.placementId}`);
      layerFitRuleIds.add(rule.placementId);
      assert(allowedLayerFits.has(rule.fit), `${prefix}.layerFitRules ${rule.placementId} has unsupported fit: ${rule.fit}`);
      if (rule.minInset !== undefined) {
        normalizeInset(rule.minInset, `${prefix}.layerFitRules.${rule.placementId}.minInset`);
      }
      if (rule.allowedOverflow !== undefined) {
        normalizeInset(rule.allowedOverflow, `${prefix}.layerFitRules.${rule.placementId}.allowedOverflow`);
      }
    }

    if (group.qualityChecks !== undefined) {
      assert(Array.isArray(group.qualityChecks), `${prefix}.qualityChecks must be an array`);
      for (const check of group.qualityChecks) {
        assert(typeof check === "string" && check, `${prefix}.qualityChecks entries must be non-empty strings`);
      }
    }
  }
}

function validateScreenFolder(folderPath) {
  const loaded = resolveBundleFromFolder(folderPath);
  const input = prepareInput(loaded.bundle);
  validateCompositionGroups(input.materialSpecSheet, folderPath);
  const model = generateRenderModel(input);
  assert(model.screen.layers.length > 0, `${folderPath} must render at least one layer`);
  assert(model.assets.length === input.materialSpecSheet.assets.length, `${folderPath} asset count mismatch`);
  assert(
    !model.compositionQuality || model.compositionQuality.failCount === 0,
    `${folderPath} composition quality has ${model.compositionQuality.failCount} failing group(s)`
  );
  assert(
    !model.layoutQuality || model.layoutQuality.failCount === 0,
    `${folderPath} layout quality has ${model.layoutQuality ? model.layoutQuality.failCount : 0} failing check(s): ${(model.layoutChecks || []).filter((check) => check.status === "fail").map((check) => check.message).join(" / ")}`
  );
}

function validateProjectFolder(folderPath) {
  const manifestPath = path.join(folderPath, "game-creative-project.json");
  validateProjectManifest(manifestPath);
  const loaded = resolveBundleFromFolder(folderPath);
  const input = prepareInput(loaded.bundle);
  validateCompositionGroups(input.materialSpecSheet, folderPath);
  const model = generateRenderModel(input);
  assert(model.screen.layers.length > 0, `${folderPath} default screen must render layers`);
  assert(
    !model.compositionQuality || model.compositionQuality.failCount === 0,
    `${folderPath} default composition quality has ${model.compositionQuality.failCount} failing group(s)`
  );
  assert(
    !model.layoutQuality || model.layoutQuality.failCount === 0,
    `${folderPath} default layout quality has ${model.layoutQuality ? model.layoutQuality.failCount : 0} failing check(s): ${(model.layoutChecks || []).filter((check) => check.status === "fail").map((check) => check.message).join(" / ")}`
  );
}

function listExampleScreenFolders() {
  const examplesDir = path.join(root, "examples");
  return fs.readdirSync(examplesDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(examplesDir, entry.name));
}

const screenFolders = [
  ...listExampleScreenFolders(),
  path.join(root, "templates", "blank-project", "creative", "screens", "home")
];
const projectFolders = [
  path.join(root, "templates", "blank-project", "creative")
];

try {
  for (const folderPath of screenFolders) {
    validateScreenFolder(folderPath);
  }
  for (const folderPath of projectFolders) {
    validateProjectFolder(folderPath);
  }
  process.stdout.write(`Project file validation ok (${screenFolders.length} screens, ${projectFolders.length} projects)\n`);
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exit(1);
}
