"use strict";

const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const ignoredDirs = new Set([
  ".git",
  ".reference-quality-profiles",
  "coverage",
  "imagegen-jobs",
  "imagegen-status",
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
    if (entry.isFile() && entry.name.endsWith(".json")) {
      bucket.push(path.join(dirPath, entry.name));
    }
  }
  return bucket;
}

const files = walk(root);
const failures = [];

for (const filePath of files) {
  try {
    JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    failures.push(`${path.relative(root, filePath)}: ${error.message}`);
  }
}

if (failures.length) {
  process.stderr.write(`JSON parse failed:\n${failures.join("\n")}\n`);
  process.exit(1);
}

process.stdout.write(`JSON ok (${files.length} files)\n`);
