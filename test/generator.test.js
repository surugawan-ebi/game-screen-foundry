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
