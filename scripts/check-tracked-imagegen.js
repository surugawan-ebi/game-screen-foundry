"use strict";

const { spawnSync } = require("child_process");
const path = require("path");

const root = path.resolve(__dirname, "..");
const runtimeDirs = ["imagegen-jobs", "imagegen-status"];
const tracked = [];

for (const runtimeDir of runtimeDirs) {
  const result = spawnSync("git", ["ls-files", runtimeDir], {
    cwd: root,
    encoding: "utf8"
  });

  if (result.status !== 0) {
    process.stderr.write(result.stderr || `git ls-files ${runtimeDir} failed\n`);
    process.exit(result.status || 1);
  }

  tracked.push(...result.stdout
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean));
}

const allowedTracked = new Set(["imagegen-jobs/.gitkeep"]);
const unexpected = tracked.filter((filePath) => !allowedTracked.has(filePath));

if (unexpected.length) {
  process.stderr.write(`Unexpected tracked imagegen output:\n${unexpected.join("\n")}\n`);
  process.exit(1);
}

process.stdout.write("Tracked imagegen outputs ok\n");
