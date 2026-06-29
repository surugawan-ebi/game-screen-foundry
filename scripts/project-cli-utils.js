"use strict";

const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const blankCreativeDir = path.join(root, "templates", "blank-project", "creative");

function printUsage(command, lines) {
  process.stdout.write([
    `Usage: npm run ${command} -- ${lines[0]}`,
    "",
    ...lines.slice(1)
  ].join("\n"));
  process.stdout.write("\n");
}

function parseArgs(argv) {
  const positionals = [];
  const options = {};

  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (!value.startsWith("--")) {
      positionals.push(value);
      continue;
    }

    const key = value.slice(2);
    if (key === "force" || key === "help") {
      options[key] = true;
      continue;
    }

    const next = argv[index + 1];
    if (next === undefined || next.startsWith("--")) {
      throw new Error(`--${key} requires a value`);
    }
    options[key] = next;
    index += 1;
  }

  return {
    positionals,
    options
  };
}

function safeSlug(value, fallback = "screen") {
  const slug = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/gu, "_")
    .replace(/^_+|_+$/gu, "");
  return slug || fallback;
}

function titleFromSlug(value) {
  return safeSlug(value)
    .split(/[_-]+/u)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function ensureEmptyOrForce(targetPath, force) {
  if (!fs.existsSync(targetPath)) {
    return;
  }
  if (!fs.statSync(targetPath).isDirectory()) {
    throw new Error(`Target exists and is not a directory: ${targetPath}`);
  }
  const entries = fs.readdirSync(targetPath);
  if (!entries.length) {
    return;
  }
  if (!force) {
    throw new Error(`Target directory is not empty: ${targetPath}. Use --force to replace it.`);
  }
  fs.rmSync(targetPath, { recursive: true, force: true });
}

function copyBlankCreative(targetPath, force = false) {
  ensureEmptyOrForce(targetPath, force);
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.cpSync(blankCreativeDir, targetPath, {
    recursive: true
  });
}

function moveTemplateScreen(creativeDir, screenId, force = false) {
  const screensDir = path.join(creativeDir, "screens");
  const templateScreenDir = path.join(screensDir, "home");
  const screenDir = path.join(screensDir, screenId);
  if (screenId === "home") {
    return screenDir;
  }
  ensureEmptyOrForce(screenDir, force);
  fs.renameSync(templateScreenDir, screenDir);
  return screenDir;
}

function renameBlankScreenAssets(materialSpec, screenId) {
  const backgroundAssetId = `bg_${screenId}`;
  const backdropPlacementId = `${screenId}_backdrop`;

  for (const placement of materialSpec.placements || []) {
    if (placement.placementId === "home_backdrop") {
      placement.placementId = backdropPlacementId;
    }
    if (placement.assetId === "bg_home") {
      placement.assetId = backgroundAssetId;
    }
  }

  for (const asset of materialSpec.assets || []) {
    if (asset.assetId === "bg_home") {
      asset.assetId = backgroundAssetId;
      asset.purpose = `${titleFromSlug(screenId)} screen background draft.`;
    }
  }

  return {
    backgroundAssetId,
    backdropPlacementId
  };
}

function rewriteScreenFiles(screenDir, {
  projectId,
  projectName,
  screenId,
  screenName,
  screenRole = ""
}) {
  const screenKvPath = path.join(screenDir, "screen-kv.json");
  const materialSpecPath = path.join(screenDir, "material-spec.json");
  const worldPresetPath = path.join(screenDir, "world-preset.json");

  const screenKv = readJson(screenKvPath);
  screenKv.screenId = screenId;
  screenKv.screenName = screenName;
  screenKv.screenRole = screenRole || screenKv.screenRole || screenId;
  screenKv.worldPresetId = `preset_${projectId}_01`;

  const materialSpec = readJson(materialSpecPath);
  materialSpec.screenMeta = {
    ...(materialSpec.screenMeta || {}),
    screenId
  };
  const { backgroundAssetId } = renameBlankScreenAssets(materialSpec, screenId);

  const worldPreset = readJson(worldPresetPath);
  worldPreset.id = `preset_${projectId}_01`;
  worldPreset.name = `${projectName} Default`;
  worldPreset.imagegenWorkflow = {
    ...(worldPreset.imagegenWorkflow || {}),
    targetAssetIds: [backgroundAssetId, "btn_start"]
  };

  writeJson(screenKvPath, screenKv);
  writeJson(materialSpecPath, materialSpec);
  writeJson(worldPresetPath, worldPreset);
}

function readManifest(creativeDir) {
  return readJson(path.join(creativeDir, "game-creative-project.json"));
}

function writeManifest(creativeDir, manifest) {
  writeJson(path.join(creativeDir, "game-creative-project.json"), manifest);
}

module.exports = {
  copyBlankCreative,
  moveTemplateScreen,
  parseArgs,
  printUsage,
  readManifest,
  rewriteScreenFiles,
  safeSlug,
  titleFromSlug,
  writeManifest
};
