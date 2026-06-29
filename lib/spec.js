"use strict";

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function assertObject(value, name) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${name} must be an object`);
  }
}

function assertArray(value, name) {
  if (!Array.isArray(value)) {
    throw new Error(`${name} must be an array`);
  }
}

function requireFields(object, name, fields) {
  for (const field of fields) {
    if (object[field] === undefined || object[field] === null || object[field] === "") {
      throw new Error(`${name}.${field} is required`);
    }
  }
}

function validateScreenKv(screenKv) {
  assertObject(screenKv, "screenKv");
  requireFields(screenKv, "screenKv", [
    "screenId",
    "screenName",
    "screenRole",
    "canvasWidth",
    "canvasHeight"
  ]);
  return screenKv;
}

function validateWorldPreset(worldPreset) {
  assertObject(worldPreset, "worldPreset");
  requireFields(worldPreset, "worldPreset", ["id", "name", "palette"]);
  assertObject(worldPreset.palette, "worldPreset.palette");
  return worldPreset;
}

function validateMaterialSpecSheet(materialSpecSheet) {
  assertObject(materialSpecSheet, "materialSpecSheet");
  requireFields(materialSpecSheet, "materialSpecSheet", ["screenMeta", "placements", "assets"]);
  assertObject(materialSpecSheet.screenMeta, "materialSpecSheet.screenMeta");
  assertArray(materialSpecSheet.placements, "materialSpecSheet.placements");
  assertArray(materialSpecSheet.assets, "materialSpecSheet.assets");
  if (materialSpecSheet.contentOverlays !== undefined) {
    assertArray(materialSpecSheet.contentOverlays, "materialSpecSheet.contentOverlays");
  }
  if (materialSpecSheet.compositionGroups !== undefined) {
    assertArray(materialSpecSheet.compositionGroups, "materialSpecSheet.compositionGroups");
  }

  for (const placement of materialSpecSheet.placements) {
    requireFields(placement, "placement", [
      "placementId",
      "assetId",
      "x",
      "y",
      "width",
      "height",
      "anchor",
      "zIndex"
    ]);
  }

  for (const asset of materialSpecSheet.assets) {
    requireFields(asset, "asset", [
      "assetId",
      "assetType",
      "role",
      "purpose",
      "renderGroup",
      "visualPriority",
      "styleNotes",
      "functionNotes",
      "exportRequirements"
    ]);
  }

  for (const overlay of materialSpecSheet.contentOverlays || []) {
    requireFields(overlay, "overlay", [
      "overlayId",
      "kind",
      "x",
      "y",
      "width",
      "height",
      "anchor",
      "zIndex"
    ]);
  }

  return materialSpecSheet;
}

function prepareInput(payload) {
  const input = clone(payload || {});
  input.screenKv = validateScreenKv(input.screenKv);
  input.worldPreset = validateWorldPreset(input.worldPreset);
  input.materialSpecSheet = validateMaterialSpecSheet(input.materialSpecSheet);
  input.revisionMap = input.revisionMap && typeof input.revisionMap === "object" ? input.revisionMap : {};
  return input;
}

function buildLookup(items, key) {
  return Object.fromEntries(items.map((item) => [item[key], item]));
}

module.exports = {
  buildLookup,
  clone,
  prepareInput
};
