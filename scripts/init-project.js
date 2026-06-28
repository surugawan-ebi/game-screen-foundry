#!/usr/bin/env node
"use strict";

const path = require("path");

const {
  copyBlankCreative,
  moveTemplateScreen,
  parseArgs,
  printUsage,
  rewriteScreenFiles,
  safeSlug,
  titleFromSlug,
  writeManifest
} = require("./project-cli-utils");

function usage() {
  printUsage("init-project", [
    "/path/to/game/creative [--project-id id] [--project-name name] [--screen-id home] [--screen-name HOME] [--force]",
    "",
    "Creates a loadable Game Screen Foundry creative project from the blank template."
  ]);
}

function main() {
  const { positionals, options } = parseArgs(process.argv.slice(2));
  if (options.help) {
    usage();
    return;
  }
  if (positionals.length !== 1) {
    usage();
    process.exitCode = 1;
    return;
  }

  const creativeDir = path.resolve(positionals[0]);
  const projectId = safeSlug(options["project-id"] || path.basename(path.dirname(creativeDir)) || "game_project", "game_project");
  const projectName = options["project-name"] || titleFromSlug(projectId);
  const screenId = safeSlug(options["screen-id"] || "home", "home");
  const screenName = options["screen-name"] || titleFromSlug(screenId).toUpperCase();

  copyBlankCreative(creativeDir, Boolean(options.force));
  const screenDir = moveTemplateScreen(creativeDir, screenId, Boolean(options.force));
  rewriteScreenFiles(screenDir, {
    projectId,
    projectName,
    screenId,
    screenName,
    screenRole: screenId
  });
  writeManifest(creativeDir, {
    projectId,
    projectName,
    defaultScreenId: screenId,
    screens: [
      {
        screenId,
        name: screenName,
        path: `screens/${screenId}`
      }
    ]
  });

  process.stdout.write([
    `Created Game Screen Foundry project: ${creativeDir}`,
    `Default screen: ${screenId} (${screenName})`,
    "Load in browser:",
    creativeDir
  ].join("\n"));
  process.stdout.write("\n");
}

try {
  main();
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exit(1);
}
