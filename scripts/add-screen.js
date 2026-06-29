#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");

const {
  parseArgs,
  printUsage,
  readManifest,
  rewriteScreenFiles,
  safeSlug,
  titleFromSlug,
  writeManifest
} = require("./project-cli-utils");

const root = path.resolve(__dirname, "..");
const blankScreenDir = path.join(root, "templates", "blank-project", "creative", "screens", "home");

function usage() {
  printUsage("add-screen", [
    "/path/to/game/creative screen-id [--screen-name NAME] [--screen-role role] [--force]",
    "",
    "Adds a loadable screen folder to an existing Game Screen Foundry creative project."
  ]);
}

function main() {
  const { positionals, options } = parseArgs(process.argv.slice(2));
  if (options.help) {
    usage();
    return;
  }
  if (positionals.length !== 2) {
    usage();
    process.exitCode = 1;
    return;
  }

  const creativeDir = path.resolve(positionals[0]);
  const screenId = safeSlug(positionals[1], "screen");
  const screenName = options["screen-name"] || titleFromSlug(screenId).toUpperCase();
  const screenRole = options["screen-role"] || screenId;
  const manifestPath = path.join(creativeDir, "game-creative-project.json");
  if (!fs.existsSync(manifestPath)) {
    throw new Error(`Project manifest not found: ${manifestPath}`);
  }

  const manifest = readManifest(creativeDir);
  manifest.screens = Array.isArray(manifest.screens) ? manifest.screens : [];
  const existing = manifest.screens.find((screen) => screen.screenId === screenId);
  if (existing && !options.force) {
    throw new Error(`Screen already exists in manifest: ${screenId}. Use --force to replace its folder entry.`);
  }

  const screensDir = path.join(creativeDir, "screens");
  const screenDir = path.join(screensDir, screenId);
  fs.mkdirSync(screensDir, { recursive: true });
  if (fs.existsSync(screenDir)) {
    if (!options.force) {
      throw new Error(`Screen folder already exists: ${screenDir}. Use --force to replace it.`);
    }
    fs.rmSync(screenDir, { recursive: true, force: true });
  }
  fs.cpSync(blankScreenDir, screenDir, { recursive: true });

  rewriteScreenFiles(screenDir, {
    projectId: manifest.projectId || "game_project",
    projectName: manifest.projectName || "Game Project",
    screenId,
    screenName,
    screenRole
  });

  manifest.screens = [
    ...manifest.screens.filter((screen) => screen.screenId !== screenId),
    {
      screenId,
      name: screenName,
      path: `screens/${screenId}`
    }
  ];
  if (!manifest.defaultScreenId) {
    manifest.defaultScreenId = screenId;
  }
  writeManifest(creativeDir, manifest);

  process.stdout.write([
    `Added screen: ${screenId} (${screenName})`,
    `Project: ${creativeDir}`,
    "Load in browser:",
    `${creativeDir}#${screenId}`
  ].join("\n"));
  process.stdout.write("\n");
}

try {
  main();
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exit(1);
}
