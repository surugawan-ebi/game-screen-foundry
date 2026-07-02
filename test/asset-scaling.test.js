"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");

const { auditAssetScaling } = require("../lib/asset-scaling");
const { alphaBounds, encodePng, fitRgba, resizeRgba } = require("../lib/png-write");
const { parsePng } = require("../lib/png-metrics");

function makePng({ width, height, artRect = null }) {
  const rgba = Buffer.alloc(width * height * 4);
  const rect = artRect || { x: 0, y: 0, width, height };
  for (let y = rect.y; y < rect.y + rect.height; y += 1) {
    for (let x = rect.x; x < rect.x + rect.width; x += 1) {
      const offset = (y * width + x) * 4;
      rgba[offset] = 180;
      rgba[offset + 1] = 120;
      rgba[offset + 2] = 60;
      rgba[offset + 3] = 255;
    }
  }
  return encodePng({ width, height, rgba });
}

function makeInput({ tempDir, assets, placements, files }) {
  const imagegenAssets = {};
  for (const [assetId, spec] of Object.entries(files)) {
    const filePath = path.join(tempDir, `${assetId}.png`);
    fs.writeFileSync(filePath, makePng(spec));
    imagegenAssets[assetId] = { assetId, path: filePath };
  }
  return {
    screenKv: { screenId: "t", screenName: "T", canvasWidth: 390, canvasHeight: 844 },
    materialSpecSheet: { screenMeta: {}, assets, placements, contentOverlays: [] },
    worldPreset: { imagegenAssets },
    revisionMap: {}
  };
}

function placement(id, assetId, width, height) {
  return { placementId: id, assetId, x: 100, y: 100, width, height, anchor: "center", zIndex: 10 };
}

test("png-write encodes a PNG that parsePng can read back", () => {
  const buffer = makePng({ width: 20, height: 10, artRect: { x: 2, y: 1, width: 16, height: 8 } });
  const image = parsePng(buffer);
  assert.equal(image.width, 20);
  assert.equal(image.height, 10);
  assert.deepEqual(alphaBounds(image), { x: 2, y: 1, width: 16, height: 8 });
  const resized = resizeRgba(image, 10, 5);
  assert.equal(resized.width, 10);
  const fitted = fitRgba(image, 40, 40);
  assert.equal(fitted.width, 40);
});

test("non-uniform stretch fails; native size and declared nine_slice pass", (t) => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "gsf-scaling-"));
  t.after(() => fs.rmSync(tempDir, { recursive: true, force: true }));
  const input = makeInput({
    tempDir,
    assets: [
      { assetId: "a_native", assetType: "button", role: "cta", exportRequirements: {} },
      { assetId: "a_stretched", assetType: "panel", role: "shell", exportRequirements: {} },
      {
        assetId: "a_nine",
        assetType: "panel",
        role: "shell",
        exportRequirements: {
          scalingPolicy: "nine_slice",
          nineSliceInsets: { top: 4, right: 4, bottom: 4, left: 4 }
        }
      }
    ],
    placements: [
      placement("p1", "a_native", 40, 20),
      placement("p2", "a_stretched", 120, 20),
      placement("p3", "a_nine", 120, 40)
    ],
    files: {
      a_native: { width: 40, height: 20 },
      a_stretched: { width: 40, height: 20 },
      a_nine: { width: 40, height: 20 }
    }
  });

  const audit = auditAssetScaling(input);
  const byCode = (code) => audit.checks.filter((check) => check.code === code);
  assert.equal(byCode("asset_native_size").length, 1);
  assert.equal(byCode("asset_stretched").length, 1);
  assert.equal(byCode("asset_stretched")[0].status, "fail");
  assert.equal(byCode("asset_nine_slice").length, 1);
  assert.equal(audit.summary.failCount, 1);
});

test("foundation assets with large transparent gutters warn", (t) => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "gsf-gutter-"));
  t.after(() => fs.rmSync(tempDir, { recursive: true, force: true }));
  const input = makeInput({
    tempDir,
    assets: [
      { assetId: "a_panel", assetType: "panel", role: "shell", exportRequirements: {} },
      { assetId: "a_icon", assetType: "icon", role: "glyph", exportRequirements: {} }
    ],
    placements: [
      placement("p1", "a_panel", 100, 50),
      placement("p2", "a_icon", 32, 32)
    ],
    files: {
      // Panel artwork only covers 60% of the canvas height: defect.
      a_panel: { width: 100, height: 50, artRect: { x: 0, y: 10, width: 100, height: 30 } },
      // Tall glyph with side margin only: acceptable.
      a_icon: { width: 32, height: 32, artRect: { x: 10, y: 0, width: 12, height: 32 } }
    }
  });

  const audit = auditAssetScaling(input);
  const gutterChecks = audit.checks.filter((check) => check.code === "asset_gutter_excessive");
  assert.equal(gutterChecks.length, 1);
  assert.equal(gutterChecks[0].refs.assetId, "a_panel");
});

test("nine_slice placements below the corner band fail", (t) => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "gsf-nine-"));
  t.after(() => fs.rmSync(tempDir, { recursive: true, force: true }));
  const input = makeInput({
    tempDir,
    assets: [
      {
        assetId: "a_nine",
        assetType: "button",
        role: "cta",
        exportRequirements: {
          scalingPolicy: "nine_slice",
          nineSliceInsets: { top: 12, right: 30, bottom: 12, left: 30 }
        }
      }
    ],
    placements: [placement("p1", "a_nine", 50, 40)],
    files: { a_nine: { width: 120, height: 40 } }
  });

  const audit = auditAssetScaling(input);
  assert.ok(audit.checks.some((check) => check.code === "nine_slice_compressed" && check.status === "fail"));
});
