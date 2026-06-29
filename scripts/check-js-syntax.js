"use strict";

const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const ignoredDirs = new Set([
  ".git",
  ".github",
  ".reference-quality-profiles",
  "coverage",
  "imagegen-jobs",
  "node_modules",
  "tmp"
]);

function walk(dirPath, bucket = []) {
  for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!ignoredDirs.has(entry.name)) {
        walk(path.join(dirPath, entry.name), bucket);
      }
      continue;
    }
    if (entry.isFile() && entry.name.endsWith(".js")) {
      bucket.push(path.join(dirPath, entry.name));
    }
  }
  return bucket;
}

const files = walk(root);
const failures = [];

for (const filePath of files) {
  const result = spawnSync(process.execPath, ["--check", filePath], {
    cwd: root,
    encoding: "utf8"
  });
  if (result.status !== 0) {
    failures.push({
      filePath: path.relative(root, filePath),
      output: result.stderr || result.stdout
    });
  }
}

if (failures.length) {
  for (const failure of failures) {
    process.stderr.write(`JS syntax check failed: ${failure.filePath}\n${failure.output}\n`);
  }
  process.exit(1);
}

process.stdout.write(`JS syntax ok (${files.length} files)\n`);
