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

test("composition quality warns when a stacked child layer touches root edges without a fit rule", () => {
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

  assert.equal(badGroup.status, "warn");
  assert.ok(badGroup.checks.some((check) => check.code === "layer_fit_default_tight"));
  assert.match(
    badGroup.checks.find((check) => check.code === "layer_fit_default_tight").message,
    /touches an edge/u
  );
});
