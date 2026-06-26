"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFile } = require("child_process");
const { promisify } = require("util");

const execFileAsync = promisify(execFile);

const {
  buildHeuristicReview,
  normalizeCommentHeuristically
} = require("./comment-tools");

const DEFAULT_CODEX_BIN = "codex";
const DEFAULT_COMMENT_TIMEOUT_MS = 2500;
const DEFAULT_REVIEW_TIMEOUT_MS = 6000;

function getCodexBin() {
  return process.env.BETA_CODEX_BIN || DEFAULT_CODEX_BIN;
}

function getAiMode() {
  return process.env.BETA_AI_MODE || "auto";
}

function codexAvailable() {
  return fs.existsSync(getCodexBin());
}

function readTimeout(name, fallback) {
  const raw = process.env[name];
  if (!raw) {
    return fallback;
  }
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function getCommentTimeoutMs() {
  return readTimeout("BETA_CODEX_COMMENT_TIMEOUT_MS", DEFAULT_COMMENT_TIMEOUT_MS);
}

function getReviewTimeoutMs() {
  return readTimeout("BETA_CODEX_REVIEW_TIMEOUT_MS", DEFAULT_REVIEW_TIMEOUT_MS);
}

function resolveMode() {
  const mode = getAiMode();
  if (mode === "heuristic" || mode === "mock") {
    return mode;
  }
  if (mode === "codex") {
    return codexAvailable() ? "codex" : "heuristic";
  }
  return codexAvailable() ? "codex" : "heuristic";
}

function hasMeaningfulDirectiveChange(plan) {
  if (!plan || !plan.directives) {
    return false;
  }
  const directives = plan.directives;
  return Boolean(
    directives.brightnessDelta
    || directives.contrastDelta
    || directives.ornamentDelta
    || directives.emphasisDelta
    || directives.roundnessDelta
    || directives.materialHint
    || directives.readabilityBoost
    || directives.moodShift
  );
}

async function runCodexJson({ prompt, schemaFile, timeoutMs }) {
  const mode = resolveMode();
  if (mode !== "codex") {
    throw new Error("Codex mode is not active");
  }

  const outputFile = path.join(
    os.tmpdir(),
    `codex-beta-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}.json`
  );

  const args = [
    "exec",
    "--skip-git-repo-check",
    "--ephemeral",
    "--ignore-rules",
    "--output-schema",
    schemaFile,
    "-o",
    outputFile,
    prompt
  ];

  try {
    await execFileAsync(getCodexBin(), args, {
      cwd: path.resolve(__dirname, ".."),
      timeout: timeoutMs,
      maxBuffer: 1024 * 1024 * 4
    });
    const raw = fs.readFileSync(outputFile, "utf8");
    return JSON.parse(raw);
  } finally {
    if (fs.existsSync(outputFile)) {
      fs.unlinkSync(outputFile);
    }
  }
}

async function normalizeCommentWithAi(context) {
  const mode = resolveMode();
  const heuristic = normalizeCommentHeuristically(context.comment, context.asset);
  if (mode === "heuristic" || mode === "mock") {
    return {
      ai: {
        mode
      },
      plan: heuristic
    };
  }

  const schemaFile = path.join(__dirname, "..", "schemas", "comment-plan.schema.json");
  const prompt = [
    "You are assisting a game asset generation beta tool.",
    "Convert the user's asset feedback into a structured edit plan.",
    "Return JSON only and do not use tools.",
    "",
    "Asset context:",
    JSON.stringify(
      {
        assetId: context.asset.assetId,
        assetType: context.asset.assetType,
        role: context.asset.role,
        purpose: context.asset.purpose,
        styleNotes: context.asset.styleNotes,
        functionNotes: context.asset.functionNotes,
        placement: context.placement,
        latestComment: context.comment,
        previousComments: context.previousComments || []
      },
      null,
      2
    )
  ].join("\n");

  try {
    const plan = await runCodexJson({
      prompt,
      schemaFile,
      timeoutMs: getCommentTimeoutMs()
    });
    const shouldUseHeuristic = (
      (plan.action === "retouch" || plan.action === "regenerate")
      && !hasMeaningfulDirectiveChange(plan)
      && hasMeaningfulDirectiveChange(heuristic)
    );
    return {
      ai: {
        mode: shouldUseHeuristic ? "codex-heuristic-merge" : "codex"
      },
      plan: shouldUseHeuristic ? heuristic : plan
    };
  } catch (error) {
    return {
      ai: {
        mode: "heuristic-fallback",
        error: error.message
      },
      plan: heuristic
    };
  }
}

async function reviewScreenWithAi(context) {
  const mode = resolveMode();
  const heuristic = buildHeuristicReview(context);
  if (mode === "heuristic" || mode === "mock") {
    return {
      ai: {
        mode
      },
      review: heuristic
    };
  }

  const schemaFile = path.join(__dirname, "..", "schemas", "review-plan.schema.json");
  const prompt = [
    "You are acting as an art direction assistant for a game asset generation beta tool.",
    "Review the assembled screen and propose the smallest set of changes that reduces random regeneration.",
    "Prefer lock recommendations and targeted edits over full redraws.",
    "Return JSON only and do not use tools.",
    "",
    "Screen context:",
    JSON.stringify(
      {
        screen: context.renderModel.screen,
        assets: context.renderModel.assets.map((asset) => ({
          assetId: asset.assetId,
          assetType: asset.assetType,
          role: asset.role,
          purpose: asset.purpose,
          locked: asset.locked,
          revisionCount: asset.revisionCount,
          latestComment: asset.latestComment
        }))
      },
      null,
      2
    )
  ].join("\n");

  try {
    const review = await runCodexJson({
      prompt,
      schemaFile,
      timeoutMs: getReviewTimeoutMs()
    });
    return {
      ai: {
        mode: "codex"
      },
      review
    };
  } catch (error) {
    return {
      ai: {
        mode: "heuristic-fallback",
        error: error.message
      },
      review: heuristic
    };
  }
}

module.exports = {
  getAiMode: resolveMode,
  normalizeCommentWithAi,
  reviewScreenWithAi
};
