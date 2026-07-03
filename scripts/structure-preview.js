#!/usr/bin/env node
"use strict";

// Writes a structure preview SVG for a screen: every placement as a colored
// rectangle (lighter = higher in the stack) and runtime overlays as real
// text. Use it to review the screen structure before generating any images.

const fs = require("fs");
const path = require("path");

const { buildStructureCompositeSvg } = require("../lib/structure-preview");
const { resolveBundleFromFolder } = require("../lib/folder-loader");
const { prepareInput } = require("../lib/spec");

function usage() {
  process.stdout.write([
    "Usage: npm run structure:preview -- /path/to/creative [screen-id] [--out file.svg]",
    "",
    "Renders the screen structure as flat colored rectangles (lightness rises",
    "with stacking depth) plus runtime overlay text, without any generated art."
  ].join("\n"));
  process.stdout.write("\n");
}

function main() {
  const args = process.argv.slice(2);
  const outIndex = args.indexOf("--out");
  const outPath = outIndex >= 0 ? args[outIndex + 1] : "";
  const positional = args.filter((arg, index) => arg !== "--out" && index !== outIndex + 1);
  const [folderPath, screenId] = positional;
  if (!folderPath || folderPath === "--help") {
    usage();
    process.exitCode = folderPath ? 0 : 1;
    return;
  }

  const loaded = resolveBundleFromFolder(path.resolve(folderPath), { screenId: screenId || "" });
  const input = prepareInput(loaded.bundle);
  const svg = buildStructureCompositeSvg(input);
  const target = outPath
    ? path.resolve(outPath)
    : path.resolve(`structure-preview_${input.screenKv.screenId || "screen"}.svg`);
  fs.writeFileSync(target, `${svg}\n`);
  process.stdout.write([
    `Structure preview written: ${target}`,
    `screen: ${input.screenKv.screenId} (${input.screenKv.canvasWidth}x${input.screenKv.canvasHeight})`,
    `placements: ${input.materialSpecSheet.placements.length} / overlays: ${(input.materialSpecSheet.contentOverlays || []).length}`
  ].join("\n"));
  process.stdout.write("\n");
}

try {
  main();
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exit(1);
}
