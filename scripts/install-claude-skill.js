"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");

const root = path.resolve(__dirname, "..");
const source = path.join(root, "skills", "game-screen-foundry");
const claudeHome = process.env.CLAUDE_CONFIG_DIR
  ? path.resolve(process.env.CLAUDE_CONFIG_DIR)
  : path.join(os.homedir(), ".claude");
const targetRoot = path.join(claudeHome, "skills");
const target = path.join(targetRoot, "game-screen-foundry");

if (!fs.existsSync(source)) {
  process.stderr.write(`Skill source not found: ${source}\n`);
  process.exit(1);
}

fs.mkdirSync(targetRoot, { recursive: true });
fs.rmSync(target, { recursive: true, force: true });
fs.cpSync(source, target, { recursive: true });

process.stdout.write(`Installed Game Screen Foundry skill for Claude Code to ${target}\n`);
