"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");

const { auditAssetScaling, suggestCraftStyleForInput } = require("../lib/asset-scaling");
const { alphaBounds, encodePng, fitRgba, resizeRgba } = require("../lib/png-write");
const { parsePng } = require("../lib/png-metrics");

function makePng({ width, height, artRect = null, painter = null }) {
  const rgba = Buffer.alloc(width * height * 4);
  const rect = artRect || { x: 0, y: 0, width, height };
  for (let y = rect.y; y < rect.y + rect.height; y += 1) {
    for (let x = rect.x; x < rect.x + rect.width; x += 1) {
      const offset = (y * width + x) * 4;
      const color = painter
        ? painter(x - rect.x, y - rect.y, rect.width, rect.height)
        : [180, 120, 60];
      rgba[offset] = color[0];
      rgba[offset + 1] = color[1];
      rgba[offset + 2] = color[2];
      rgba[offset + 3] = color.length > 3 ? color[3] : 255;
    }
  }
  return encodePng({ width, height, rgba });
}

// A crafted cel sprite: dark outline ring, top highlight band, base tone,
// bottom shadow band — mirrors the structure of commercial sprite packs.
// Ghost-blob output: most of the body is semi-transparent.
function translucentPainter() {
  return [230, 220, 190, 120];
}

function celSpritePainter(x, y, width, height) {
  if (x < 3 || y < 3 || x >= width - 3 || y >= height - 3) {
    return [40, 30, 50];
  }
  if (y < height * 0.25) {
    return [235, 200, 140];
  }
  if (y > height * 0.75) {
    return [120, 70, 40];
  }
  return [190, 130, 80];
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

test("low-contrast label colors on the generated backdrop warn", (t) => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "gsf-contrast-"));
  t.after(() => fs.rmSync(tempDir, { recursive: true, force: true }));
  const input = makeInput({
    tempDir,
    assets: [{ assetId: "a_btn", assetType: "button", role: "cta", exportRequirements: {} }],
    placements: [placement("p_btn", "a_btn", 60, 40)],
    // Backdrop fill is rgb(180,120,60); the label uses a near-identical brown.
    files: { a_btn: { width: 60, height: 40 } }
  });
  input.materialSpecSheet.contentOverlays = [
    {
      overlayId: "ov_dark",
      kind: "text",
      sampleText: "配置",
      x: 100,
      y: 100,
      width: 40,
      height: 14,
      anchor: "center",
      zIndex: 20,
      fontSize: 10,
      color: "#8a6a3c",
      targetPlacementId: "p_btn",
      slot: { x: 10, y: 13, width: 40, height: 14 }
    },
    {
      overlayId: "ov_light",
      kind: "text",
      sampleText: "配置",
      x: 100,
      y: 100,
      width: 40,
      height: 14,
      anchor: "center",
      zIndex: 21,
      fontSize: 10,
      color: "#fff1c7",
      targetPlacementId: "p_btn",
      slot: { x: 10, y: 13, width: 40, height: 14 }
    }
  ];

  const audit = auditAssetScaling(input);
  const contrastWarns = audit.checks.filter((check) => check.code === "text_contrast_low");
  assert.equal(contrastWarns.length, 1);
  assert.equal(contrastWarns[0].refs.overlayId, "ov_dark");
});

test("craft audit flags flat fills and missing outlines when craftStyle is declared", (t) => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "gsf-craft-"));
  t.after(() => fs.rmSync(tempDir, { recursive: true, force: true }));
  const input = makeInput({
    tempDir,
    assets: [
      { assetId: "a_crafted", assetType: "button", role: "cta", exportRequirements: {} },
      { assetId: "a_flat", assetType: "button", role: "cta", exportRequirements: {} }
    ],
    placements: [
      placement("p1", "a_crafted", 64, 64),
      placement("p2", "a_flat", 64, 64)
    ],
    files: {
      a_crafted: { width: 64, height: 64, painter: celSpritePainter },
      a_flat: { width: 64, height: 64 }
    }
  });
  input.worldPreset.designRules = { craftStyle: "outlined_cel" };

  const audit = auditAssetScaling(input);
  const craftWarns = audit.checks.filter((check) => /^craft_/u.test(check.code));
  const flatWarns = craftWarns.filter((check) => check.refs.assetId === "a_flat");
  const craftedWarns = craftWarns.filter((check) => check.refs.assetId === "a_crafted");
  assert.ok(flatWarns.some((check) => check.code === "craft_shading_flat"));
  assert.ok(flatWarns.some((check) => check.code === "craft_outline_weak"));
  assert.equal(craftedWarns.length, 0);

  // Without a declared craft style the audit stays silent.
  input.worldPreset.designRules = {};
  const silent = auditAssetScaling(input);
  assert.equal(silent.checks.filter((check) => /^craft_/u.test(check.code)).length, 0);
});

test("largely semi-transparent raster bodies fail unless declared translucent_effect", (t) => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "gsf-translucent-"));
  t.after(() => fs.rmSync(tempDir, { recursive: true, force: true }));
  const makeGhostInput = (renderIntent) => makeInput({
    tempDir,
    assets: [{
      assetId: "a_ghost",
      assetType: "panel",
      role: "surface",
      exportRequirements: renderIntent ? { renderIntent } : {}
    }],
    placements: [placement("p1", "a_ghost", 64, 64)],
    files: { a_ghost: { width: 64, height: 64, painter: translucentPainter } }
  });

  const broken = auditAssetScaling(makeGhostInput(""));
  const failure = broken.checks.find((check) => check.code === "asset_interior_translucent");
  assert.ok(failure);
  assert.equal(failure.status, "fail");

  const declared = auditAssetScaling(makeGhostInput("translucent_effect"));
  assert.ok(!declared.checks.some((check) => check.code === "asset_interior_translucent"));
});

test("craft style suggestion measures adopted PNGs and stays silent once declared", (t) => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "gsf-suggest-"));
  t.after(() => fs.rmSync(tempDir, { recursive: true, force: true }));
  const input = makeInput({
    tempDir,
    assets: [
      { assetId: "a1", assetType: "button", role: "cta", exportRequirements: {} },
      { assetId: "a2", assetType: "panel", role: "shell", exportRequirements: {} }
    ],
    placements: [placement("p1", "a1", 64, 64), placement("p2", "a2", 64, 64)],
    files: {
      a1: { width: 64, height: 64, painter: celSpritePainter },
      a2: { width: 64, height: 64, painter: celSpritePainter }
    }
  });

  const suggestion = suggestCraftStyleForInput(input);
  assert.ok(suggestion);
  assert.equal(suggestion.craftStyle, "outlined_cel");
  assert.equal(suggestion.sampledCount, 2);

  input.worldPreset.designRules = { craftStyle: "outlined_cel" };
  assert.equal(suggestCraftStyleForInput(input), null);
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
