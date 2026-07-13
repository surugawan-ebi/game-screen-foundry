"use strict";

const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const test = require("node:test");

const { processGeneratedAsset } = require("../lib/generated-asset-quality");
const { parsePng } = require("../lib/png-metrics");
const { encodePng } = require("../lib/png-write");

function writePng(filePath, width, height, pixel) {
  const rgba = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const color = pixel(x, y);
      const offset = (y * width + x) * 4;
      rgba[offset] = color[0];
      rgba[offset + 1] = color[1];
      rgba[offset + 2] = color[2];
      rgba[offset + 3] = color[3];
    }
  }
  fs.writeFileSync(filePath, encodePng({ width, height, rgba }));
}

function asset(overrides = {}) {
  return {
    assetId: "test_asset",
    assetType: "icon",
    role: "decorative_icon",
    exportRequirements: {
      format: "png",
      transparent: true
    },
    ...overrides
  };
}

test("generated asset pipeline removes a flat green chroma key before adoption", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "gsf-chroma-"));
  const filePath = path.join(tempDir, "icon.png");
  try {
    writePng(filePath, 16, 12, (x, y) => {
      return x >= 2 && x <= 13 && y >= 2 && y <= 9
        ? [210, 54, 45, 255]
        : [0, 255, 0, 255];
    });

    const report = processGeneratedAsset({
      filePath,
      asset: asset(),
      target: { width: 16, height: 12 },
      apply: true
    });
    const output = parsePng(fs.readFileSync(filePath));

    assert.equal(report.ok, true);
    assert.ok(report.actions.some((action) => action.action === "remove_chroma_key"));
    assert.ok(report.checks.some((check) => check.code === "transparent_alpha_present" && check.status === "pass"));
    assert.equal(output.rgba[3], 0);
    assert.equal(output.rgba[((6 * output.width + 8) * 4) + 3], 255);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test("generated asset pipeline rejects opaque output without a removable key", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "gsf-alpha-reject-"));
  const filePath = path.join(tempDir, "icon.png");
  try {
    writePng(filePath, 8, 8, () => [30, 80, 170, 255]);
    const report = processGeneratedAsset({
      filePath,
      asset: asset(),
      target: { width: 8, height: 8 },
      apply: true
    });

    assert.equal(report.ok, false);
    assert.ok(report.checks.some((check) => check.code === "transparent_alpha_missing" && check.status === "fail"));
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test("generated asset pipeline allows green artwork when native alpha is already valid", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "gsf-native-green-"));
  const filePath = path.join(tempDir, "icon.png");
  try {
    writePng(filePath, 8, 8, (x, y) => {
      return x >= 1 && x <= 6 && y >= 1 && y <= 6
        ? [20, 230, 40, 255]
        : [0, 0, 0, 0];
    });
    const report = processGeneratedAsset({
      filePath,
      asset: asset(),
      target: { width: 8, height: 8 },
      apply: true
    });

    assert.equal(report.ok, true);
    assert.ok(!report.actions.some((action) => action.action === "remove_chroma_key"));
    assert.ok(!report.checks.some((check) => check.code === "chroma_key_residue"));
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test("generated asset pipeline rejects chroma removal that erases the silhouette", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "gsf-empty-chroma-"));
  const filePath = path.join(tempDir, "icon.png");
  try {
    writePng(filePath, 8, 8, () => [0, 255, 0, 255]);
    const report = processGeneratedAsset({
      filePath,
      asset: asset(),
      target: { width: 8, height: 8 },
      apply: true
    });

    assert.equal(report.ok, false);
    assert.ok(report.checks.some((check) => check.code === "asset_silhouette_missing" && check.status === "fail"));
    assert.equal(parsePng(fs.readFileSync(filePath)).rgba[3], 255);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test("generated asset pipeline normalizes an alpha PNG to the generation size", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "gsf-size-normalize-"));
  const filePath = path.join(tempDir, "button.png");
  try {
    writePng(filePath, 20, 10, (x, y) => {
      const dx = (x - 9.5) / 8;
      const dy = (y - 4.5) / 4;
      const inside = dx ** 2 + dy ** 2 <= 1;
      return inside ? [180, 120, 45, 255] : [0, 0, 0, 0];
    });
    const report = processGeneratedAsset({
      filePath,
      asset: asset({ assetType: "button", role: "primary_cta" }),
      target: { width: 10, height: 5 },
      apply: true
    });
    const output = parsePng(fs.readFileSync(filePath));

    assert.equal(report.ok, true);
    assert.equal(`${output.width}x${output.height}`, "10x5");
    assert.ok(report.actions.some((action) => action.action === "normalize_size"));
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});
