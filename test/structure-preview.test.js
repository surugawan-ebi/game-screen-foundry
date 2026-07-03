"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildStructureCompositeSvg,
  buildStructureLayerSvg,
  buildStructureOverlaySvg,
  computeStackDepths
} = require("../lib/structure-preview");
const { getDemoProject } = require("../lib/sample-data");
const { prepareInput } = require("../lib/spec");
const { generateRenderModel } = require("../lib/generator");

function placement(id, x, y, width, height, zIndex) {
  return { placementId: id, assetId: `asset_${id}`, x, y, width, height, anchor: "center", zIndex };
}

test("stack depth rises only where placements actually overlap", () => {
  const depths = computeStackDepths([
    placement("bg", 100, 100, 200, 200, 0),
    placement("panel", 100, 100, 120, 120, 10),
    placement("button", 100, 100, 60, 30, 20),
    placement("aside", 400, 400, 60, 30, 30)
  ]);
  assert.equal(depths.get("bg"), 0);
  assert.equal(depths.get("panel"), 1);
  assert.equal(depths.get("button"), 2);
  // No overlap with the pile: stays at the floor even with a high zIndex.
  assert.equal(depths.get("aside"), 0);
});

test("layer svg lightness increases toward the top of the stack", () => {
  const bottom = decodeURIComponent(buildStructureLayerSvg({
    placement: placement("bottom", 100, 100, 100, 40, 0),
    depth: 0,
    maxDepth: 3
  }));
  const top = decodeURIComponent(buildStructureLayerSvg({
    placement: placement("top", 100, 100, 100, 40, 30),
    depth: 3,
    maxDepth: 3
  }));
  const lightness = (svg) => Number(/hsl\(\d+, \d+%, (\d+)%\)/u.exec(svg)[1]);
  assert.ok(lightness(top) > lightness(bottom));
  assert.match(bottom, /bottom/u);
});

test("render model carries structure layer sources for placements", () => {
  const renderModel = generateRenderModel(prepareInput(getDemoProject()));
  const placementLayers = renderModel.screen.layers.filter((layer) => layer.structureSrc);
  assert.ok(placementLayers.length > 0);
  assert.ok(placementLayers.every((layer) => layer.structureSrc.startsWith("data:image/svg+xml")));
  assert.ok(placementLayers.some((layer) => layer.structureDepth > 0));
});

test("declared contentInset renders as a hatched frame band with a content box", () => {
  const withInset = decodeURIComponent(buildStructureLayerSvg({
    placement: placement("dock_shell", 100, 100, 200, 80, 10),
    depth: 1,
    maxDepth: 3,
    contentInset: { top: 8, right: 8, bottom: 8, left: 8 }
  }));
  assert.match(withInset, /pattern id="frame_hatch_dock_shell"/u);
  assert.match(withInset, /fill-rule="evenodd"/u);
  assert.match(withInset, /stroke-dasharray="4 3"/u);

  const withoutInset = decodeURIComponent(buildStructureLayerSvg({
    placement: placement("plain", 100, 100, 200, 80, 10),
    depth: 1,
    maxDepth: 3
  }));
  assert.ok(!/pattern/u.test(withoutInset));

  // With an explicit frameInset the hatch shrinks to the painted band while
  // the dashed content box stays at the (wider) contentInset.
  const separated = decodeURIComponent(buildStructureLayerSvg({
    placement: placement("panel_shell", 100, 100, 200, 120, 10),
    depth: 1,
    maxDepth: 3,
    contentInset: { top: 40, right: 16, bottom: 50, left: 16 },
    frameInset: { top: 12, right: 12, bottom: 12, left: 12 }
  }));
  assert.match(separated, /M12,12 H188 V108 H12 Z/u);
  assert.match(separated, /<rect x="16.5" y="40.5"/u);

  // The demo declares contentInset on the daily mission group root, so the
  // render model layer for that root carries the hatch.
  const renderModel = generateRenderModel(prepareInput(getDemoProject()));
  const rootLayer = renderModel.screen.layers.find((layer) => layer.placementId === "daily_mission_outer");
  assert.match(decodeURIComponent(rootLayer.structureSrc), /frame_hatch_daily_mission_outer/u);
});

test("overlay structure svg marks text regions and flags overflowing sample text", () => {
  const baseOverlay = {
    overlayId: "ov_label",
    kind: "text",
    fontSize: 16,
    align: "center"
  };
  const fitting = buildStructureOverlaySvg({
    overlay: { ...baseOverlay, sampleText: "OK" },
    width: 120,
    height: 24
  });
  assert.equal(fitting.overflow, false);
  assert.match(decodeURIComponent(fitting.src), /stroke="rgba\(255,210,120/u);

  const overflowing = buildStructureOverlaySvg({
    overlay: { ...baseOverlay, sampleText: "とても長いランタイムテキストの例" },
    width: 120,
    height: 24
  });
  assert.equal(overflowing.overflow, true);
  assert.match(decodeURIComponent(overflowing.src), /rgba\(255,92,92/u);
  assert.ok(overflowing.estimatedTextWidth > overflowing.availableWidth);

  // Overlay layers in the render model carry the structure region source.
  const renderModel = generateRenderModel(prepareInput(getDemoProject()));
  const overlayLayers = renderModel.screen.layers.filter((layer) => layer.slot !== undefined || layer.targetPlacementId !== undefined);
  const withStructure = renderModel.screen.layers.filter((layer) => layer.structureSrc && decodeURIComponent(layer.structureSrc).includes("stroke-dasharray"));
  assert.ok(withStructure.length > 0);
  assert.ok(overlayLayers.every((layer) => !layer.structureTextOverflow), "demo sample texts must fit their declared regions");
});

test("composite structure svg renders rectangles and runtime overlay text", () => {
  const svg = buildStructureCompositeSvg(prepareInput(getDemoProject()));
  assert.match(svg, /<svg /u);
  assert.match(svg, /hsl\(212/u);
  // Runtime overlay sample text appears as real text.
  assert.match(svg, /出航する/u);
});
