#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");

const { auditAssetScaling } = require("../lib/asset-scaling");
const {
  getIterationDir,
  loadSession,
  recordSnapshot,
  startSession
} = require("../lib/agent-session");
const { buildCompositionReview } = require("../lib/composition-quality");
const { resolveBundleFromFolder } = require("../lib/folder-loader");
const { buildLayoutReview } = require("../lib/layout-quality");
const { prepareInput } = require("../lib/spec");

function usage() {
  process.stdout.write([
    "Usage: npm run screen:snapshot -- /path/to/creative [screen-id] [options]",
    "",
    "Options:",
    "  --out file.png",
    "  --session auto|SESSION_ID",
    "  --iteration N",
    "  --mode autonomous|hybrid|guided",
    "  --max-iterations N",
    "  --approval major_changes|every_iteration|completion_only",
    "",
    "Renders the assembled generated screen to PNG in a hidden Electron window.",
    "When --session is set, the PNG and metadata are recorded under the project's",
    ".game-creative-generation/agent-sessions directory."
  ].join("\n"));
  process.stdout.write("\n");
}

function parseArgs(args) {
  const options = {};
  const positional = [];
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (!arg.startsWith("--")) {
      positional.push(arg);
      continue;
    }
    const key = arg.slice(2);
    const value = args[index + 1];
    if (!value || value.startsWith("--")) {
      throw new Error(`Missing value for --${key}`);
    }
    options[key] = value;
    index += 1;
  }
  return { options, positional };
}

function resolveElectronBinary() {
  try {
    return require("electron");
  } catch (error) {
    throw new Error("Electron is required for screen snapshots. Run `npm install` first.");
  }
}

function normalizeRegistry(worldPreset) {
  const registry = worldPreset && worldPreset.imagegenAssets ? worldPreset.imagegenAssets : {};
  if (Array.isArray(registry)) {
    return Object.fromEntries(registry.filter((item) => item && item.assetId).map((item) => [item.assetId, item]));
  }
  return registry;
}

function buildCoverage(input) {
  const registry = normalizeRegistry(input.worldPreset);
  const assetIds = input.materialSpecSheet.assets.map((asset) => asset.assetId);
  const adoptedAssetIds = assetIds.filter((assetId) => {
    const entry = registry[assetId];
    return entry && entry.path && fs.existsSync(entry.path) && fs.statSync(entry.path).isFile();
  });
  const adopted = new Set(adoptedAssetIds);
  return {
    assetCount: assetIds.length,
    adoptedAssetCount: adoptedAssetIds.length,
    adoptedAssetIds,
    fallbackAssetIds: assetIds.filter((assetId) => !adopted.has(assetId))
  };
}

function runRenderer({ folderPath, screenId, outputPath }) {
  const electronBinary = resolveElectronBinary();
  const runnerPath = path.join(__dirname, "..", "electron", "snapshot.js");
  const args = [runnerPath, "--folder", folderPath, "--screen", screenId, "--out", outputPath];
  return new Promise((resolve, reject) => {
    const child = spawn(electronBinary, args, {
      stdio: "inherit",
      env: {
        ...process.env,
        ELECTRON_ENABLE_LOGGING: process.env.ELECTRON_ENABLE_LOGGING || "0"
      }
    });
    child.on("error", reject);
    child.on("exit", (code, signal) => {
      if (signal) {
        reject(new Error(`Snapshot renderer stopped with signal ${signal}.`));
        return;
      }
      if (code !== 0) {
        reject(new Error(`Snapshot renderer exited with code ${code}.`));
        return;
      }
      resolve();
    });
  });
}

async function main() {
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

  const resolvedFolder = path.resolve(folderPath);
  const loaded = resolveBundleFromFolder(resolvedFolder, { screenId: requestedScreenId || "" });
  const input = prepareInput(loaded.bundle);
  const projectRoot = loaded.source.projectRoot || loaded.source.screenFolderPath || loaded.source.folderPath;
  const screenId = loaded.source.screenId || input.screenKv.screenId;
  let session = null;

  if (options.session) {
    if (options.session === "auto") {
      session = startSession({
        projectRoot,
        screenId,
        mode: options.mode || "autonomous",
        maxIterations: options["max-iterations"] || 3,
        approvalPolicy: options.approval || "major_changes"
      });
    } else {
      try {
        session = loadSession(projectRoot, options.session);
      } catch (error) {
        if (!/not found/u.test(error.message)) {
          throw error;
        }
        session = startSession({
          projectRoot,
          screenId,
          mode: options.mode || "autonomous",
          maxIterations: options["max-iterations"] || 3,
          approvalPolicy: options.approval || "major_changes",
          sessionId: options.session
        });
      }
    }
    if (session.screenId !== screenId) {
      throw new Error(`Session ${session.sessionId} belongs to screen ${session.screenId}, not ${screenId}.`);
    }
  }

  const iteration = Number(options.iteration || (session ? session.iterationCount + 1 : 1));
  if (!Number.isInteger(iteration) || iteration < 1) {
    throw new Error("--iteration must be a positive integer.");
  }
  if (session && ["completed", "max_iterations"].includes(session.status)) {
    throw new Error(`Session ${session.sessionId} cannot capture another iteration because its status is ${session.status}.`);
  }
  if (session && iteration > session.maxIterations) {
    throw new Error(`Iteration ${iteration} exceeds maxIterations ${session.maxIterations}.`);
  }
  if (session && session.iterations.some((entry) => entry.iteration === iteration)) {
    throw new Error(`Iteration ${iteration} already exists in session ${session.sessionId}.`);
  }
  if (session && iteration > 1) {
    const previous = session.iterations.find((entry) => entry.iteration === iteration - 1);
    if (!previous || previous.decision === "pending") {
      throw new Error(`Record a review for iteration ${iteration - 1} before capturing iteration ${iteration}.`);
    }
  }

  const defaultName = `screen-snapshot_${screenId}.png`;
  const outputPath = options.out
    ? path.resolve(options.out)
    : session
      ? path.join(getIterationDir(projectRoot, session.sessionId, iteration), "screen.png")
      : path.resolve(defaultName);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  await runRenderer({ folderPath: resolvedFolder, screenId, outputPath });

  const coverage = buildCoverage(input);
  const composition = buildCompositionReview(input);
  const layout = buildLayoutReview(input);
  const scaling = auditAssetScaling(input);
  if (session) {
    const recorded = recordSnapshot({
      projectRoot,
      sessionId: session.sessionId,
      iteration,
      snapshotPath: outputPath,
      metadata: {
        renderMode: "generated_with_fallbacks",
        canvas: {
          width: input.screenKv.canvasWidth,
          height: input.screenKv.canvasHeight
        },
        coverage,
        mechanicalReview: {
          composition: composition.summary,
          layout: layout.summary,
          assetScaling: scaling.summary
        }
      }
    });
    session = recorded.session;
  }

  process.stdout.write([
    `Screen snapshot written: ${outputPath}`,
    `screen: ${screenId} (${input.screenKv.canvasWidth}x${input.screenKv.canvasHeight})`,
    `generated asset coverage: ${coverage.adoptedAssetCount}/${coverage.assetCount}`,
    session ? `session: ${session.sessionId}` : "",
    session ? `iteration: ${iteration}/${session.maxIterations}` : ""
  ].filter(Boolean).join("\n"));
  process.stdout.write("\n");
}

main().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exit(1);
});
