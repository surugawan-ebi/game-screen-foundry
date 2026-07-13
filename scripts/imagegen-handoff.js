#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");

const { resolveBundleFromFolder } = require("../lib/folder-loader");
const { prepareImagegenWorkflow } = require("../lib/imagegen-workflow");
const { prepareInput } = require("../lib/spec");

function usage() {
  process.stdout.write([
    "Usage: npm run imagegen:handoff -- /path/to/creative [screen-id] [options]",
    "",
    "Options:",
    "  --assets asset_a,asset_b   Limit the handoff to selected assets.",
    "  --adopt                    Validate existing outputs and update imagegen-assets.json.",
    "",
    "Without --adopt, this writes an agent-neutral imagegen job and prompt only."
  ].join("\n"));
  process.stdout.write("\n");
}

function parseArgs(args) {
  const positional = [];
  const options = { adopt: false };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--adopt") {
      options.adopt = true;
      continue;
    }
    if (arg === "--assets") {
      const value = args[index + 1];
      if (!value || value.startsWith("--")) {
        throw new Error("Missing value for --assets");
      }
      options.assets = value.split(",").map((item) => item.trim()).filter(Boolean);
      index += 1;
      continue;
    }
    if (arg.startsWith("--")) {
      throw new Error(`Unknown option: ${arg}`);
    }
    positional.push(arg);
  }
  return { options, positional };
}

function portablePath(filePath, screenFolderPath) {
  const resolved = path.resolve(filePath);
  const relative = path.relative(screenFolderPath, resolved);
  if (relative && !relative.startsWith("..") && !path.isAbsolute(relative)) {
    return relative.split(path.sep).join("/");
  }
  return resolved;
}

function persistRegistry(screenFolderPath, registry) {
  const entries = Array.isArray(registry)
    ? registry
    : Object.entries(registry || {}).map(([assetId, entry]) => ({ assetId, ...(entry || {}) }));
  const assets = entries
    .filter((entry) => entry && entry.assetId && entry.path)
    .map((entry) => {
      const persisted = {
        assetId: entry.assetId,
        path: portablePath(entry.path, screenFolderPath),
        backend: entry.backend || "codex_cli_imagegen",
        usesImagegen: entry.usesImagegen !== false
      };
      // The full prompt remains in the ignored handoff job. It can contain
      // machine-local reference paths and must not leak into committed manifests.
      for (const key of ["jobId", "notes", "acceptance", "postprocess"]) {
        if (entry[key] !== undefined) {
          persisted[key] = entry[key];
        }
      }
      return persisted;
    })
    .sort((left, right) => left.assetId.localeCompare(right.assetId));
  const manifestPath = path.join(screenFolderPath, "imagegen-assets.json");
  const tempPath = `${manifestPath}.${process.pid}.tmp`;
  fs.writeFileSync(tempPath, `${JSON.stringify({ assets }, null, 2)}\n`);
  fs.renameSync(tempPath, manifestPath);
  return manifestPath;
}

function main() {
  const args = process.argv.slice(2);
  if (args[0] === "--help") {
    usage();
    return;
  }
  const { options, positional } = parseArgs(args);
  const [folderPath, requestedScreenId] = positional;
  if (!folderPath) {
    usage();
    process.exitCode = 1;
    return;
  }

  const loaded = resolveBundleFromFolder(path.resolve(folderPath), {
    screenId: requestedScreenId || ""
  });
  const input = prepareInput(loaded.bundle);
  if (options.assets && options.assets.length) {
    const known = new Set(input.materialSpecSheet.assets.map((asset) => asset.assetId));
    const unknown = options.assets.filter((assetId) => !known.has(assetId));
    if (unknown.length) {
      throw new Error(`Unknown asset id(s): ${unknown.join(", ")}`);
    }
    input.worldPreset.imagegenWorkflow = {
      ...(input.worldPreset.imagegenWorkflow || {}),
      targetAssetIds: options.assets
    };
  }

  const result = prepareImagegenWorkflow(input, {
    run: false,
    writeFiles: true,
    adoptOutputs: options.adopt
  });
  const report = result.report;
  let manifestPath = "";
  if (options.adopt) {
    const registry = Array.isArray(result.nextInput.worldPreset.imagegenAssets)
      ? Object.fromEntries(result.nextInput.worldPreset.imagegenAssets
        .filter((entry) => entry && entry.assetId)
        .map((entry) => [entry.assetId, entry]))
      : { ...(result.nextInput.worldPreset.imagegenAssets || {}) };
    for (const assetId of [...report.rejectedAssetIds, ...report.missingAssetIds]) {
      delete registry[assetId];
    }
    manifestPath = persistRegistry(
      loaded.source.screenFolderPath || loaded.source.folderPath,
      registry
    );
  }
  process.stdout.write([
    options.adopt ? "Imagegen outputs checked" : "Imagegen handoff created",
    `screen: ${input.screenKv.screenId}`,
    `job: ${report.job.jobPath}`,
    `prompt: ${report.job.promptPath}`,
    `output: ${report.job.outputDir}`,
    `status: ${report.handoff.state}`,
    `assets: ${report.job.assets.length}`,
    manifestPath ? `registry: ${manifestPath}` : ""
  ].filter(Boolean).join("\n"));
  process.stdout.write("\n");

  if (options.adopt && (report.missingAssetIds.length || report.rejectedAssetIds.length || report.blockerReports.length)) {
    process.exitCode = 2;
  }
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exit(1);
  }
}

module.exports = {
  persistRegistry,
  portablePath
};
