"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");

const root = path.resolve(__dirname, "..");
const source = path.join(root, "skills", "game-screen-foundry");
const codexHome = process.env.CODEX_HOME
  ? path.resolve(process.env.CODEX_HOME)
  : path.join(os.homedir(), ".codex");
const targetRoot = path.join(codexHome, "skills");
const target = path.join(targetRoot, "game-screen-foundry");

if (!fs.existsSync(source)) {
  process.stderr.write(`Skill source not found: ${source}\n`);
  process.exit(1);
}

fs.mkdirSync(targetRoot, { recursive: true });
fs.rmSync(target, { recursive: true, force: true });
fs.cpSync(source, target, { recursive: true });

process.stdout.write(`Installed Game Screen Foundry skill to ${target}\n`);

