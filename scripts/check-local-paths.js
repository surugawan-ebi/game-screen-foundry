"use strict";

const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const ignoredDirs = new Set([
  ".git",
  "coverage",
  "imagegen-jobs",
  "node_modules",
  "tmp"
]);
const ignoredExtensions = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".webp",
  ".gif",
  ".ico"
]);
const patterns = [
  /\/Users\//u,
  /private\/tmp/u,
  /app\/neta/u,
  /Applications\/Codex/u
];
const allowedCommandSnippets = [
  "rg -n \"/Users/|private/tmp|app/neta|Applications/Codex\"",
  "rg -n \\\"/Users/|private/tmp|app/neta|Applications/Codex\\\""
];

function walk(dirPath, bucket = []) {
  for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!ignoredDirs.has(entry.name)) {
        walk(path.join(dirPath, entry.name), bucket);
      }
      continue;
    }
    if (entry.isFile() && !ignoredExtensions.has(path.extname(entry.name).toLowerCase())) {
      bucket.push(path.join(dirPath, entry.name));
    }
  }
  return bucket;
}

const findings = [];

for (const filePath of walk(root)) {
  const relativePath = path.relative(root, filePath);
  const text = fs.readFileSync(filePath, "utf8");
  text.split(/\r?\n/u).forEach((line, index) => {
    if (relativePath === "scripts/check-local-paths.js" && index < 32) {
      return;
    }
    if (!patterns.some((pattern) => pattern.test(line))) {
      return;
    }
    if (allowedCommandSnippets.some((snippet) => line.includes(snippet))) {
      return;
    }
    findings.push(`${relativePath}:${index + 1}: ${line.trim()}`);
  });
}

if (findings.length) {
  process.stderr.write(`Local path check failed:\n${findings.join("\n")}\n`);
  process.exit(1);
}

process.stdout.write("Local path check ok\n");
