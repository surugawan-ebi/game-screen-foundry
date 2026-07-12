"use strict";

const { spawn } = require("node:child_process");
const path = require("node:path");

function resolveElectronBinary() {
  try {
    return require("electron");
  } catch (error) {
    process.stderr.write([
      "Electron is not installed.",
      "Run `npm install` first, then retry `npm run desktop`.",
      ""
    ].join("\n"));
    process.exit(1);
  }
}

const electronBinary = resolveElectronBinary();
const mainPath = path.join(__dirname, "..", "electron", "main.js");
const child = spawn(electronBinary, [mainPath, ...process.argv.slice(2)], {
  stdio: "inherit",
  env: {
    ...process.env,
    ELECTRON_ENABLE_LOGGING: process.env.ELECTRON_ENABLE_LOGGING || "1"
  }
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code || 0);
});
