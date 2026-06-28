"use strict";

const { spawnSync } = require("child_process");
const path = require("path");

const root = path.resolve(__dirname, "..");
const result = spawnSync("git", ["ls-files", "imagegen-jobs"], {
  cwd: root,
  encoding: "utf8"
});

if (result.status !== 0) {
  process.stderr.write(result.stderr || "git ls-files imagegen-jobs failed\n");
  process.exit(result.status || 1);
}

const tracked = result.stdout
  .split(/\r?\n/u)
  .map((line) => line.trim())
  .filter(Boolean);
const unexpected = tracked.filter((filePath) => filePath !== "imagegen-jobs/.gitkeep");

if (unexpected.length) {
  process.stderr.write(`Unexpected tracked imagegen output:\n${unexpected.join("\n")}\n`);
  process.exit(1);
}

process.stdout.write("Tracked imagegen outputs ok\n");

