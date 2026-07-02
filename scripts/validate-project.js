#!/usr/bin/env node
"use strict";

const path = require("path");

const { auditAssetScaling, suggestCraftStyleForInput } = require("../lib/asset-scaling");
const { buildCompositionReview } = require("../lib/composition-quality");
const { buildLayoutReview } = require("../lib/layout-quality");
const { generateRenderModel } = require("../lib/generator");
const { resolveBundleFromFolder } = require("../lib/folder-loader");
const { prepareInput } = require("../lib/spec");

function usage() {
  process.stdout.write([
    "Usage: npm run validate:project -- /path/to/creative [screen-id]",
    "",
    "Validates a Game Screen Foundry project folder or direct screen folder."
  ].join("\n"));
  process.stdout.write("\n");
}

function main() {
  const [folderPath, screenId] = process.argv.slice(2);
  if (!folderPath || folderPath === "--help") {
    usage();
    process.exitCode = folderPath ? 0 : 1;
    return;
  }

  const loaded = resolveBundleFromFolder(path.resolve(folderPath), {
    screenId: screenId || ""
  });
  const input = prepareInput(loaded.bundle);
  const renderModel = generateRenderModel(input);
  const compositionReview = buildCompositionReview(input);
  const layoutReview = buildLayoutReview(input);
  const failCount = compositionReview.summary ? compositionReview.summary.failCount : 0;
  const layoutFailures = layoutReview.checks.filter((check) => check.status === "fail");
  const layoutWarnings = layoutReview.checks.filter((check) => check.status === "warn");

  if (!renderModel.screen.layers.length) {
    throw new Error("Screen renders no layers.");
  }
  if (failCount > 0) {
    throw new Error(`Composition quality has ${failCount} failing group(s).`);
  }
  if (layoutFailures.length > 0) {
    throw new Error([
      `Layout quality has ${layoutFailures.length} failing check(s):`,
      ...layoutFailures.map((check) => `- [${check.code}] ${check.message}`)
    ].join("\n"));
  }
  for (const warning of layoutWarnings) {
    process.stderr.write(`layout warn [${warning.code}] ${warning.message}\n`);
  }

  const scalingAudit = auditAssetScaling(input);
  const scalingFailures = scalingAudit.checks.filter((check) => check.status === "fail");
  for (const warning of scalingAudit.checks.filter((check) => check.status === "warn")) {
    process.stderr.write(`asset warn [${warning.code}] ${warning.message}\n`);
  }
  if (scalingFailures.length > 0) {
    throw new Error([
      `Asset scaling audit has ${scalingFailures.length} failing check(s):`,
      ...scalingFailures.map((check) => `- [${check.code}] ${check.message}`)
    ].join("\n"));
  }

  const craftSuggestion = suggestCraftStyleForInput(input);
  if (craftSuggestion) {
    process.stderr.write(`hint [craft_style_unset] designRules.craftStyle is not declared, so the craft quality audit is off. Based on ${craftSuggestion.sampledCount} adopted PNG(s), "${craftSuggestion.craftStyle}" fits this project: ${craftSuggestion.reason}. Add it to world-preset.json designRules.\n`);
  }

  process.stdout.write([
    "Project validation ok",
    `source: ${loaded.source.projectRoot || loaded.source.screenFolderPath || loaded.source.folderPath}`,
    `screen: ${renderModel.screen.screenId} / ${renderModel.screen.screenName}`,
    `size: ${renderModel.screen.width}x${renderModel.screen.height}`,
    `assets: ${renderModel.assets.length}`,
    `layers: ${renderModel.screen.layers.length}`,
    `composition: ${compositionReview.summary.status} ${compositionReview.summary.score}`,
    `layout: ${layoutReview.summary.status} ${layoutReview.summary.score} (fail ${layoutReview.summary.failCount} / warn ${layoutReview.summary.warnCount})`,
    `asset scaling: ${scalingAudit.summary.status} (${scalingAudit.summary.auditedCount} PNG audited / fail ${scalingAudit.summary.failCount} / warn ${scalingAudit.summary.warnCount})`
  ].join("\n"));
  process.stdout.write("\n");
}

try {
  main();
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exit(1);
}
