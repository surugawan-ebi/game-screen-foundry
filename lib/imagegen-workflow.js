"use strict";

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const DEFAULT_CODEX_BIN = "codex";

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function safeSlug(value) {
  return String(value || "asset")
    .replace(/[^a-zA-Z0-9_-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80) || "asset";
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function getBetaRoot() {
  return path.resolve(__dirname, "..");
}

function getImagegenWorkflow(input) {
  const preset = input.worldPreset || {};
  return preset.imagegenWorkflow || {};
}

function getJobDir(input) {
  const workflow = getImagegenWorkflow(input);
  return path.resolve(workflow.jobDir || path.join(getBetaRoot(), "imagegen-jobs"));
}

function getOutputDir(input) {
  const workflow = getImagegenWorkflow(input);
  return path.resolve(workflow.outputDir || path.join(getBetaRoot(), "examples", "sky-port-home", "generated-assets"));
}

function getRegisteredAssetMap(input) {
  const registered = input.worldPreset && input.worldPreset.imagegenAssets
    ? input.worldPreset.imagegenAssets
    : {};
  if (Array.isArray(registered)) {
    return Object.fromEntries(registered
      .filter((item) => item && item.assetId)
      .map((item) => [item.assetId, item]));
  }
  return registered;
}

function getPrimaryPlacement(input, assetId) {
  return input.materialSpecSheet.placements.find((placement) => placement.assetId === assetId) || null;
}

function getTargetAssetIds(input) {
  const workflow = getImagegenWorkflow(input);
  if (workflow.disabled) {
    return [];
  }
  if (Array.isArray(workflow.targetAssetIds)) {
    return unique(workflow.targetAssetIds);
  }

  const kvCritical = input.worldPreset
    && input.worldPreset.kvStyleProfile
    && input.worldPreset.kvStyleProfile.assetPriorities
    && Array.isArray(input.worldPreset.kvStyleProfile.assetPriorities.kvCritical)
    ? input.worldPreset.kvStyleProfile.assetPriorities.kvCritical
    : [];
  const imageBatch = input.materialSpecSheet.assets
    .filter((asset) => asset.generationPlan && asset.generationPlan.backendClass === "image_batch")
    .map((asset) => asset.assetId);
  return unique([...kvCritical, ...imageBatch]);
}

function buildAssetPrompt({ input, asset, placement }) {
  const preset = input.worldPreset || {};
  const exportRequirements = asset.exportRequirements || {};
  const referenceImages = Array.isArray(preset.referenceImages)
    ? preset.referenceImages.map((item) => item.path).filter(Boolean)
    : [];
  const dimensions = placement
    ? `${placement.width}x${placement.height}`
    : Array.isArray(exportRequirements.sizes) && exportRequirements.sizes.length
      ? exportRequirements.sizes[0]
      : "512x512";
  const textOwnership = asset.textHandling && asset.textHandling.ownership === "baked_in_asset"
    ? "Baked text is allowed only for the listed baked text blocks."
    : "Do not include readable text; runtime text will be overlaid by the game.";
  const transparency = exportRequirements.transparent
    ? "Generate as a game asset intended for transparent PNG export. Keep the object isolated from background."
    : "Generate as an opaque background or filled raster asset as specified.";
  const bakedText = asset.textHandling && Array.isArray(asset.textHandling.bakedTextBlocks)
    ? asset.textHandling.bakedTextBlocks.map((block) => block.text).filter(Boolean)
    : [];

  return [
    "Use case: stylized-concept",
    `Asset type: ${dimensions} game UI production asset`,
    `Primary request: Create ${asset.assetId} for ${input.screenKv.screenName}.`,
    `Canvas role: this asset will be placed at ${placement ? `${placement.x},${placement.y} with size ${placement.width}x${placement.height}, zIndex ${placement.zIndex}` : "an unspecified placement"} on a ${input.screenKv.canvasWidth}x${input.screenKv.canvasHeight} screen.`,
    `Purpose: ${asset.purpose}`,
    `Role: ${asset.assetType} / ${asset.role}`,
    `World preset: ${preset.name || preset.id || "game visual preset"}`,
    `Genre: ${preset.genre || ""}`,
    `Mood keywords: ${(preset.moodKeywords || []).join(", ")}`,
    `Material keywords: ${(preset.materialKeywords || []).join(", ")}`,
    referenceImages.length ? `Reference KV image path(s): ${referenceImages.join(" / ")}` : "",
    preset.kvGuidance && Array.isArray(preset.kvGuidance.notes) ? `KV guidance: ${preset.kvGuidance.notes.join(" / ")}` : "",
    `Style notes: ${(asset.styleNotes || []).join(" / ")}`,
    `Function notes: ${(asset.functionNotes || []).join(" / ")}`,
    `Text handling: ${textOwnership}`,
    bakedText.length ? `Baked text, verbatim if reliable: ${bakedText.join(" / ")}` : "Baked text: none",
    `Export: ${transparency}`,
    `Final pixel size: ${dimensions}. Save the final PNG at the outputPath for this asset.`,
    exportRequirements.transparent
      ? "Transparency policy: prefer alpha PNG. If alpha export is unavailable, use a perfectly flat #00ff00 chroma-key background with no shadows or green in the subject."
      : "Transparency policy: opaque raster is acceptable.",
    "Style/medium: polished Japanese mobile RPG UI art, ornate brass-and-blue sky-port fantasy, painterly but crisp, high production value.",
    "Constraints: match the provided KV mood, keep silhouettes readable at target size, avoid flat placeholder geometry, avoid generic vector mockups.",
    `Avoid: ${(preset.negativeKeywords || []).join(", ")}, watermark, extra labels, modern generic web UI.`
  ].filter(Boolean).join("\n");
}

function buildCodexPrompt(job) {
  return [
    "You are generating raster assets for a game production beta.",
    "Use available image generation capability if present. Do not replace this with SVG placeholders.",
    "Save each requested final image exactly to its outputPath.",
    "If direct image generation is unavailable, leave the output file missing and explain the blocker in the final message.",
    "Do not modify files outside the listed output paths and job files.",
    "",
    "Job JSON:",
    JSON.stringify(job, null, 2)
  ].join("\n");
}

function buildImagegenJob(input, options = {}) {
  const targetIds = getTargetAssetIds(input);
  const registered = getRegisteredAssetMap(input);
  const outputDir = getOutputDir(input);
  const jobDir = getJobDir(input);
  const jobId = options.jobId || `imagegen_${new Date().toISOString().replace(/[:.]/g, "-")}`;
  const assetById = new Map(input.materialSpecSheet.assets.map((asset) => [asset.assetId, asset]));
  const assets = targetIds
    .map((assetId) => {
      const asset = assetById.get(assetId);
      if (!asset) {
        return null;
      }
      const placement = getPrimaryPlacement(input, assetId);
      const outputPath = registered[assetId] && registered[assetId].path
        ? path.resolve(registered[assetId].path)
        : path.join(outputDir, `${safeSlug(assetId)}.png`);
      return {
        assetId,
        assetType: asset.assetType,
        role: asset.role,
        purpose: asset.purpose,
        visualPriority: asset.visualPriority,
        width: placement ? placement.width : null,
        height: placement ? placement.height : null,
        outputPath,
        prompt: buildAssetPrompt({ input, asset, placement }),
        status: fs.existsSync(outputPath) ? "exists" : "missing"
      };
    })
    .filter(Boolean);

  const jobPath = path.join(jobDir, `${jobId}.json`);
  const promptPath = path.join(jobDir, `${jobId}.prompt.md`);
  const codexBin = process.env.BETA_CODEX_BIN || DEFAULT_CODEX_BIN;
  const commandHint = [
    codexBin,
    "--ask-for-approval",
    "never",
    "--sandbox",
    "workspace-write",
    "exec",
    "--skip-git-repo-check",
    "--ephemeral",
    "--ignore-rules",
    "-C",
    getBetaRoot(),
    "<",
    promptPath
  ].join(" ");

  return {
    jobId,
    createdAt: new Date().toISOString(),
    screenId: input.screenKv.screenId,
    screenName: input.screenKv.screenName,
    jobDir,
    outputDir,
    jobPath,
    promptPath,
    commandHint,
    assets
  };
}

function writeImagegenJobFiles(job) {
  fs.mkdirSync(job.jobDir, { recursive: true });
  fs.mkdirSync(job.outputDir, { recursive: true });
  fs.writeFileSync(job.jobPath, `${JSON.stringify(job, null, 2)}\n`);
  fs.writeFileSync(job.promptPath, buildCodexPrompt(job));
}

function adoptImagegenOutputs(input, job) {
  const nextInput = clone(input);
  const registered = getRegisteredAssetMap(input);
  if (!nextInput.worldPreset.imagegenAssets || Array.isArray(nextInput.worldPreset.imagegenAssets)) {
    nextInput.worldPreset.imagegenAssets = {
      ...registered
    };
  }

  const adoptedAssetIds = [];
  const missingAssetIds = [];
  for (const assetJob of job.assets) {
    if (fs.existsSync(assetJob.outputPath) && fs.statSync(assetJob.outputPath).isFile()) {
      const existing = registered[assetJob.assetId] || {};
      nextInput.worldPreset.imagegenAssets[assetJob.assetId] = {
        ...existing,
        assetId: assetJob.assetId,
        path: assetJob.outputPath,
        backend: existing.backend || "codex_cli_imagegen",
        usesImagegen: existing.usesImagegen !== false,
        prompt: existing.prompt || assetJob.prompt,
        jobId: existing.jobId || job.jobId,
        notes: existing.notes || "Adopted from imagegen workflow output."
      };
      adoptedAssetIds.push(assetJob.assetId);
    } else {
      missingAssetIds.push(assetJob.assetId);
    }
  }

  return {
    nextInput,
    adoptedAssetIds,
    missingAssetIds
  };
}

function runImagegenJob(job) {
  const mode = process.env.BETA_IMAGEGEN_MODE || "off";
  if (mode === "off") {
    return {
      mode,
      ran: false,
      ok: true,
      message: "BETA_IMAGEGEN_MODE is off. Job files were created for external Codex/imagegen execution."
    };
  }

  let command = "";
  let args = [];
  let options = {
    cwd: getBetaRoot(),
    encoding: "utf8",
    timeout: Number(process.env.BETA_IMAGEGEN_TIMEOUT_MS || 120000),
    maxBuffer: 1024 * 1024 * 8
  };

  if (mode === "mock") {
    command = process.execPath;
    args = [path.join(getBetaRoot(), "scripts", "mock-imagegen-runner.js"), job.jobPath];
  } else if (mode === "codex") {
    command = process.env.BETA_CODEX_BIN || DEFAULT_CODEX_BIN;
    args = [
      "--ask-for-approval",
      "never",
      "--sandbox",
      "workspace-write",
      "exec",
      "--skip-git-repo-check",
      "--ephemeral",
      "--ignore-rules",
      "-C",
      getBetaRoot(),
      fs.readFileSync(job.promptPath, "utf8")
    ];
  } else if (mode === "command") {
    const runner = process.env.BETA_IMAGEGEN_RUNNER;
    if (!runner) {
      return {
        mode,
        ran: false,
        ok: false,
        message: "BETA_IMAGEGEN_RUNNER is required when BETA_IMAGEGEN_MODE=command."
      };
    }
    const result = spawnSync(`${runner} "${job.jobPath}"`, {
      ...options,
      shell: true
    });
    return {
      mode,
      ran: true,
      ok: result.status === 0,
      status: result.status,
      stdout: result.stdout || "",
      stderr: result.stderr || "",
      message: result.status === 0 ? "External imagegen runner completed." : "External imagegen runner failed."
    };
  } else {
    return {
      mode,
      ran: false,
      ok: false,
      message: `Unknown BETA_IMAGEGEN_MODE: ${mode}`
    };
  }

  const result = spawnSync(command, args, options);
  return {
    mode,
    ran: true,
    ok: result.status === 0,
    status: result.status,
    stdout: result.stdout || "",
    stderr: result.stderr || "",
    message: result.status === 0 ? `${mode} imagegen runner completed.` : `${mode} imagegen runner failed.`
  };
}

function prepareImagegenWorkflow(input, { run = false, writeFiles = true } = {}) {
  const job = buildImagegenJob(input);
  if (writeFiles) {
    writeImagegenJobFiles(job);
  }

  const runner = run ? runImagegenJob(job) : {
    mode: process.env.BETA_IMAGEGEN_MODE || "off",
    ran: false,
    ok: true,
    message: "Job created; runner was not executed."
  };
  const adoption = adoptImagegenOutputs(input, job);
  const refreshedJob = {
    ...job,
    assets: job.assets.map((assetJob) => ({
      ...assetJob,
      status: fs.existsSync(assetJob.outputPath) ? "exists" : "missing"
    }))
  };

  return {
    nextInput: adoption.nextInput,
    report: {
      job: refreshedJob,
      runner,
      adoptedAssetIds: adoption.adoptedAssetIds,
      missingAssetIds: adoption.missingAssetIds
    }
  };
}

module.exports = {
  adoptImagegenOutputs,
  buildImagegenJob,
  prepareImagegenWorkflow,
  runImagegenJob,
  writeImagegenJobFiles
};
