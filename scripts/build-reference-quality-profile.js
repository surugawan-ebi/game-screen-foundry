#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");

const {
  UI_CATEGORIES,
  buildReferenceQualityProfile,
  compactReferenceQualityProfile
} = require("../lib/reference-quality-profile");

function printUsage() {
  process.stdout.write([
    "Usage: npm run profile:reference -- <reference-root> [--out profile.json] [--compact] [--max-files 500] [--max-files-per-asset 2] [--categories ui-button,ui-panel]",
    "",
    "Builds a reference-derived quality profile from local purchased/reference UI assets.",
    "The command reads PNG metrics only; it does not copy source assets."
  ].join("\n"));
}

function parseArgs(argv) {
  const args = {
    rootPath: "",
    outPath: "",
    compact: false,
    maxFiles: 500,
    maxFilesPerAsset: 2,
    categories: UI_CATEGORIES
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help" || arg === "-h") {
      args.help = true;
    } else if (arg === "--out") {
      args.outPath = argv[index + 1] || "";
      index += 1;
    } else if (arg === "--compact") {
      args.compact = true;
    } else if (arg === "--max-files") {
      args.maxFiles = Number(argv[index + 1] || args.maxFiles);
      index += 1;
    } else if (arg === "--max-files-per-asset") {
      args.maxFilesPerAsset = Number(argv[index + 1] || args.maxFilesPerAsset);
      index += 1;
    } else if (arg === "--categories") {
      args.categories = String(argv[index + 1] || "")
        .split(",")
        .map((item) => item.trim())
        .filter((item) => UI_CATEGORIES.includes(item));
      index += 1;
    } else if (!args.rootPath) {
      args.rootPath = arg;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  if (!args.categories.length) {
    args.categories = UI_CATEGORIES;
  }
  return args;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printUsage();
    return;
  }
  if (!args.rootPath) {
    printUsage();
    process.exitCode = 1;
    return;
  }

  const profile = buildReferenceQualityProfile(args.rootPath, {
    categories: args.categories,
    maxFiles: Number.isFinite(args.maxFiles) ? args.maxFiles : 500,
    maxFilesPerAsset: Number.isFinite(args.maxFilesPerAsset) ? args.maxFilesPerAsset : 2
  });
  const payload = args.compact ? compactReferenceQualityProfile(profile) : profile;
  const json = `${JSON.stringify(payload, null, 2)}\n`;

  if (args.outPath) {
    const resolvedOut = path.resolve(args.outPath);
    fs.mkdirSync(path.dirname(resolvedOut), { recursive: true });
    fs.writeFileSync(resolvedOut, json);
    process.stdout.write(`Reference quality profile written: ${resolvedOut}\n`);
    process.stdout.write(`Analyzed ${profile.source.analyzed}/${profile.source.candidates} PNGs in ${profile.source.elapsedMs}ms\n`);
    return;
  }

  process.stdout.write(json);
}

try {
  main();
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exit(1);
}
