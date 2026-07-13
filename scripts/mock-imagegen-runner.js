"use strict";

const fs = require("fs");
const path = require("path");
const { encodePng } = require("../lib/png-write");

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

function parseHex(value) {
  return [
    Number.parseInt(value.slice(1, 3), 16),
    Number.parseInt(value.slice(3, 5), 16),
    Number.parseInt(value.slice(5, 7), 16)
  ];
}

function writeMockPng(asset, index) {
  fs.mkdirSync(path.dirname(asset.outputPath), { recursive: true });
  const sizeMatch = /^(\d+)x(\d+)$/u.exec(String(asset.generationSize || ""));
  const width = Math.max(sizeMatch ? Number(sizeMatch[1]) : Number(asset.width) || 512, 32);
  const height = Math.max(sizeMatch ? Number(sizeMatch[2]) : Number(asset.height) || 512, 32);
  const [from, to] = colorForIndex(index);
  const start = parseHex(from);
  const end = parseHex(to);
  const transparent = Boolean(asset.transparencyPlan && asset.transparencyPlan.required);
  const radius = Math.max(2, Math.min(12, Math.round(Math.min(width, height) * 0.12)));
  const rgba = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    const mix = height === 1 ? 0 : y / (height - 1);
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      rgba[offset] = Math.round(start[0] * (1 - mix) + end[0] * mix);
      rgba[offset + 1] = Math.round(start[1] * (1 - mix) + end[1] * mix);
      rgba[offset + 2] = Math.round(start[2] * (1 - mix) + end[2] * mix);
      const cornerX = x < radius ? radius - x : x >= width - radius ? x - (width - radius - 1) : 0;
      const cornerY = y < radius ? radius - y : y >= height - radius ? y - (height - radius - 1) : 0;
      const outsideRoundedCorner = cornerX && cornerY && Math.sqrt(cornerX ** 2 + cornerY ** 2) > radius;
      rgba[offset + 3] = transparent && outsideRoundedCorner ? 0 : 255;
    }
  }
  fs.writeFileSync(asset.outputPath, encodePng({ width, height, rgba }));
}

const jobPath = process.argv[2] || process.env.BETA_IMAGEGEN_JOB_PATH;
if (!jobPath) {
  process.stderr.write("Usage: node scripts/mock-imagegen-runner.js <job.json>\n");
  process.exit(2);
}

const job = JSON.parse(fs.readFileSync(jobPath, "utf8"));
job.assets.forEach(writeMockPng);
process.stdout.write(`mock generated ${job.assets.length} assets\n`);
