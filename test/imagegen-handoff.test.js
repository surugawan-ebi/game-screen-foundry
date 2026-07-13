"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const { persistRegistry } = require("../scripts/imagegen-handoff");

test("headless adoption writes portable manifests without local generation contracts", () => {
  const screenFolder = fs.mkdtempSync(path.join(os.tmpdir(), "gsf-handoff-manifest-"));
  try {
    const generatedDir = path.join(screenFolder, "generated-assets");
    fs.mkdirSync(generatedDir);
    const imagePath = path.join(generatedDir, "btn_start.png");
    fs.writeFileSync(imagePath, Buffer.from("png"));
    const manifestPath = persistRegistry(screenFolder, {
      btn_start: {
        assetId: "btn_start",
        path: imagePath,
        backend: "codex_cli_imagegen",
        usesImagegen: true,
        prompt: `Use local reference ${path.join(screenFolder, "reference.png")}`,
        generationContract: {
          outputPath: imagePath
        },
        acceptance: {
          checks: [{ status: "pass", code: "final_pixel_size" }]
        }
      }
    });

    const text = fs.readFileSync(manifestPath, "utf8");
    const manifest = JSON.parse(text);
    assert.equal(manifest.assets[0].path, "generated-assets/btn_start.png");
    assert.equal(manifest.assets[0].prompt, undefined);
    assert.equal(manifest.assets[0].generationContract, undefined);
    assert.doesNotMatch(text, new RegExp(screenFolder.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"), "u"));
  } finally {
    fs.rmSync(screenFolder, { recursive: true, force: true });
  }
});
