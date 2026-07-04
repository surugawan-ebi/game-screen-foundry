"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { getDemoProject } = require("../lib/sample-data");
const { prepareInput } = require("../lib/spec");
const { generateRenderModel } = require("../lib/generator");

test("generateRenderModel assembles screen layers and asset previews", () => {
  const input = prepareInput(getDemoProject());
  const renderModel = generateRenderModel(input);

  assert.equal(renderModel.screen.width, 1280);
  assert.equal(renderModel.screen.height, 720);
  assert.equal(
    renderModel.screen.layers.length,
    input.materialSpecSheet.placements.length + input.materialSpecSheet.contentOverlays.length
  );
  assert.equal(renderModel.assets.length, input.materialSpecSheet.assets.length);
  assert.match(renderModel.assets[0].previewSrc, /^data:image\/svg\+xml/);
  assert.equal(renderModel.compositionQuality.groupCount, 4);
  assert.equal(renderModel.compositionQuality.status, "pass");
  assert.equal(renderModel.compositionGroups[0].groupId, "primary_sortie_cta");
  assert.ok(renderModel.compositionGroups[0].protectedOverlays.some((overlay) => overlay.overlayId === "ov_sortie_cta"));
});

test("revision directives affect generated asset revisions", () => {
  const payload = getDemoProject();
  payload.revisionMap.btn_start_sortie = {
    locked: false,
    revisionCount: 2,
    comments: ["もっと目立たせる", "少し豪華に"],
    normalizedComments: ["increase emphasis", "increase ornament"],
    directives: {
      brightnessDelta: 12,
      contrastDelta: 14,
      ornamentDelta: 1,
      emphasisDelta: 1,
      roundnessDelta: 0,
      materialHint: "brass",
      readabilityBoost: 1,
      moodShift: ""
    }
  };
  const renderModel = generateRenderModel(prepareInput(payload));
  const button = renderModel.assets.find((asset) => asset.assetId === "btn_start_sortie");

  assert.equal(button.revisionCount, 2);
  assert.equal(button.latestComment, "少し豪華に");
  assert.equal(button.directives.ornamentDelta, 1);
});

test("composition quality fails when a stacked layer sits flush on a foundation root", () => {
  const payload = getDemoProject();
  payload.materialSpecSheet.placements.push({
    placementId: "bad_same_width_layer",
    assetId: "btn_start_sortie",
    x: 640,
    y: 536,
    width: 392,
    height: 60,
    anchor: "center",
    zIndex: 30,
    blendMode: "normal",
    opacity: 1,
    stateVisibility: {
      normal: true
    },
    parentId: "sortie_button_base"
  });
  payload.materialSpecSheet.compositionGroups.push({
    groupId: "bad_same_width_stack",
    kind: "layered_button",
    rootPlacementId: "sortie_button_base",
    layerPlacementIds: ["sortie_button_base", "bad_same_width_layer"],
    qualityChecks: ["child layer should leave horizontal breathing room"]
  });

  const renderModel = generateRenderModel(prepareInput(payload));
  const badGroup = renderModel.compositionGroups.find((group) => group.groupId === "bad_same_width_stack");

  assert.equal(badGroup.status, "fail");
  assert.ok(badGroup.checks.some((check) => check.code === "layer_fit_flush_frame"));
  assert.match(
    badGroup.checks.find((check) => check.code === "layer_fit_flush_frame").message,
    /touches the edge/u
  );
});

test("composition quality supports independent sibling layers beside a root", () => {
  const payload = getDemoProject();
  const root = payload.materialSpecSheet.placements.find((placement) => placement.placementId === "sortie_button_base");
  const siblingWidth = 80;
  payload.materialSpecSheet.placements.push({
    placementId: "beside_sortie_button",
    assetId: "btn_start_sortie",
    x: root.x + root.width / 2 + 12 + siblingWidth / 2,
    y: root.y,
    width: siblingWidth,
    height: 52,
    anchor: "center",
    zIndex: 35,
    blendMode: "normal",
    opacity: 1,
    stateVisibility: {
      normal: true
    }
  });
  payload.materialSpecSheet.compositionGroups.push({
    groupId: "sortie_with_adjacent_cta",
    kind: "runtime_panel_with_adjacent_cta",
    rootPlacementId: "sortie_button_base",
    layerPlacementIds: ["sortie_button_base", "beside_sortie_button"],
    layerFitRules: [
      {
        placementId: "sortie_button_base",
        fit: "same_canvas"
      },
      {
        placementId: "beside_sortie_button",
        fit: "sibling",
        minGap: 8
      }
    ],
    qualityChecks: ["adjacent CTA should not overlap the root"]
  });

  const renderModel = generateRenderModel(prepareInput(payload));
  const group = renderModel.compositionGroups.find((candidate) => candidate.groupId === "sortie_with_adjacent_cta");

  assert.equal(group.status, "pass");
  assert.ok(group.checks.some((check) => check.code === "layer_fit_sibling"));
});
