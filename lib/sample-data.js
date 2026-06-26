"use strict";

const fs = require("fs");
const path = require("path");

const demoDir = path.join(__dirname, "..", "examples", "sky-port-home");

function readJson(fileName) {
  return JSON.parse(fs.readFileSync(path.join(demoDir, fileName), "utf8"));
}

function getDemoProject() {
  return {
    screenKv: readJson("screen-kv.json"),
    materialSpecSheet: readJson("material-spec.json"),
    worldPreset: readJson("world-preset.json"),
    revisionMap: {}
  };
}

module.exports = {
  getDemoProject
};
