"use strict";

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const tinyPng = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=",
  "base64"
);

function colorForIndex(index) {
  const colors = [
    ["#3c98d8", "#f1c66f"],
    ["#10243b", "#37bad8"],
    ["#2c241a", "#d6a85f"],
    ["#0f6f96", "#efe0c4"],
    ["#7fb6d2", "#c28a2e"]
  ];
  return colors[index % colors.length];
}

function writeFallbackPng(outputPath) {
  fs.writeFileSync(outputPath, tinyPng);
}

function writeMockPng(asset, index) {
  fs.mkdirSync(path.dirname(asset.outputPath), { recursive: true });
  const width = Math.max(Number(asset.width) || 512, 32);
  const height = Math.max(Number(asset.height) || 512, 32);
  const [from, to] = colorForIndex(index);
  const magick = spawnSync("magick", [
    "-size",
    `${width}x${height}`,
    `gradient:${from}-${to}`,
    "-gravity",
    "center",
    "-fill",
    "white",
    "-stroke",
    "black",
    "-strokewidth",
    "1",
    "-pointsize",
    String(Math.max(14, Math.min(42, Math.round(width / 20)))),
    "-annotate",
    "+0+0",
    asset.assetId,
    asset.outputPath
  ], {
    encoding: "utf8"
  });

  if (magick.status !== 0) {
    writeFallbackPng(asset.outputPath);
  }
}

const jobPath = process.argv[2] || process.env.BETA_IMAGEGEN_JOB_PATH;
if (!jobPath) {
  process.stderr.write("Usage: node scripts/mock-imagegen-runner.js <job.json>\n");
  process.exit(2);
}

const job = JSON.parse(fs.readFileSync(jobPath, "utf8"));
job.assets.forEach(writeMockPng);
process.stdout.write(`mock generated ${job.assets.length} assets\n`);
