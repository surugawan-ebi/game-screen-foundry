#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");

const { loadSession, recordReview, startSession } = require("../lib/agent-session");
const { resolveBundleFromFolder } = require("../lib/folder-loader");

function usage() {
  process.stdout.write([
    "Usage:",
    "  npm run agent:session -- start /path/to/creative [screen-id] [options]",
    "  npm run agent:session -- review /path/to/creative <session-id> --iteration N --file review.json",
    "  npm run agent:session -- show /path/to/creative <session-id>",
    "",
    "Start options:",
    "  --mode autonomous|hybrid|guided",
    "  --max-iterations N",
    "  --approval major_changes|every_iteration|completion_only",
    "  --session SESSION_ID"
  ].join("\n"));
  process.stdout.write("\n");
}

function parseOptions(args) {
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

function resolveProject(folderPath, screenId = "") {
  const loaded = resolveBundleFromFolder(path.resolve(folderPath), { screenId });
  return {
    projectRoot: loaded.source.projectRoot || loaded.source.screenFolderPath || loaded.source.folderPath,
    screenId: loaded.source.screenId || loaded.bundle.screenKv.screenId
  };
}

function printSession(session) {
  process.stdout.write(`${JSON.stringify(session, null, 2)}\n`);
}

function main() {
  const [command, ...rest] = process.argv.slice(2);
  if (!command || command === "--help") {
    usage();
    process.exitCode = command ? 0 : 1;
    return;
  }
  const { options, positional } = parseOptions(rest);

  if (command === "start") {
    const [folderPath, requestedScreenId] = positional;
    if (!folderPath) {
      throw new Error("Project folder is required.");
    }
    const project = resolveProject(folderPath, requestedScreenId || "");
    const session = startSession({
      ...project,
      mode: options.mode || "autonomous",
      maxIterations: options["max-iterations"] || 3,
      approvalPolicy: options.approval || "major_changes",
      sessionId: options.session || ""
    });
    printSession(session);
    return;
  }

  if (command === "show") {
    const [folderPath, sessionId] = positional;
    if (!folderPath || !sessionId) {
      throw new Error("Project folder and session id are required.");
    }
    const project = resolveProject(folderPath);
    printSession(loadSession(project.projectRoot, sessionId));
    return;
  }

  if (command === "review") {
    const [folderPath, sessionId] = positional;
    if (!folderPath || !sessionId || !options.iteration || !options.file) {
      throw new Error("Review requires project folder, session id, --iteration, and --file.");
    }
    const project = resolveProject(folderPath);
    const reviewPath = path.resolve(options.file);
    const review = JSON.parse(fs.readFileSync(reviewPath, "utf8"));
    const result = recordReview({
      projectRoot: project.projectRoot,
      sessionId,
      iteration: Number(options.iteration),
      review
    });
    printSession(result.session);
    return;
  }

  throw new Error(`Unknown agent session command: ${command}`);
}

try {
  main();
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exit(1);
}
