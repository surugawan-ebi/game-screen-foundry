"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const SESSION_VERSION = 1;
const SESSION_MODES = new Set(["guided", "autonomous", "hybrid"]);
const APPROVAL_POLICIES = new Set(["major_changes", "every_iteration", "completion_only"]);
const REVIEW_DECISIONS = new Set(["continue", "complete", "needs_user"]);

function sanitizeId(value, fallback = "session") {
  const normalized = String(value || "")
    .trim()
    .replace(/[^a-z0-9_-]+/giu, "-")
    .replace(/^-+|-+$/gu, "")
    .slice(0, 80);
  return normalized || fallback;
}

function assertProjectRoot(projectRoot) {
  const resolved = path.resolve(projectRoot || "");
  if (!projectRoot || !fs.existsSync(resolved) || !fs.statSync(resolved).isDirectory()) {
    throw new Error(`Project root not found: ${resolved}`);
  }
  return resolved;
}

function getSessionsRoot(projectRoot) {
  return path.join(assertProjectRoot(projectRoot), ".game-creative-generation", "agent-sessions");
}

function getSessionDir(projectRoot, sessionId) {
  return path.join(getSessionsRoot(projectRoot), sanitizeId(sessionId));
}

function getIterationDir(projectRoot, sessionId, iteration) {
  const number = Number(iteration);
  if (!Number.isInteger(number) || number < 1) {
    throw new Error("Iteration must be a positive integer.");
  }
  return path.join(getSessionDir(projectRoot, sessionId), "iterations", String(number).padStart(3, "0"));
}

function writeJsonAtomic(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.${process.pid}.tmp`;
  fs.writeFileSync(tempPath, `${JSON.stringify(value, null, 2)}\n`);
  fs.renameSync(tempPath, filePath);
}

function defaultSessionId(screenId, now = new Date()) {
  const timestamp = now.toISOString().replace(/[-:]/gu, "").replace(/\.\d{3}Z$/u, "Z");
  const suffix = crypto.randomBytes(3).toString("hex");
  return sanitizeId(`${screenId || "screen"}-${timestamp}-${suffix}`);
}

function sessionFile(projectRoot, sessionId) {
  return path.join(getSessionDir(projectRoot, sessionId), "session.json");
}

function loadSession(projectRoot, sessionId) {
  const filePath = sessionFile(projectRoot, sessionId);
  if (!fs.existsSync(filePath)) {
    throw new Error(`Agent session not found: ${sanitizeId(sessionId)}`);
  }
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function startSession({
  projectRoot,
  screenId,
  mode = "autonomous",
  maxIterations = 3,
  approvalPolicy = "major_changes",
  sessionId = "",
  now = new Date()
}) {
  const resolvedRoot = assertProjectRoot(projectRoot);
  if (!SESSION_MODES.has(mode)) {
    throw new Error(`Unsupported agent session mode: ${mode}`);
  }
  if (!APPROVAL_POLICIES.has(approvalPolicy)) {
    throw new Error(`Unsupported approval policy: ${approvalPolicy}`);
  }
  const iterationLimit = Number(maxIterations);
  if (!Number.isInteger(iterationLimit) || iterationLimit < 1 || iterationLimit > 20) {
    throw new Error("maxIterations must be an integer between 1 and 20.");
  }

  const id = sessionId ? sanitizeId(sessionId) : defaultSessionId(screenId, now);
  const filePath = sessionFile(resolvedRoot, id);
  if (fs.existsSync(filePath)) {
    throw new Error(`Agent session already exists: ${id}`);
  }
  const timestamp = now.toISOString();
  const session = {
    version: SESSION_VERSION,
    sessionId: id,
    mode,
    status: "active",
    projectRoot: resolvedRoot,
    screenId: String(screenId || ""),
    maxIterations: iterationLimit,
    iterationCount: 0,
    approvalPolicy,
    guardrails: {
      preserveLockedAssets: true,
      requireValidationBeforeGeneration: true,
      requireSnapshotReview: true,
      allowLayoutChanges: false
    },
    iterations: [],
    createdAt: timestamp,
    updatedAt: timestamp
  };
  writeJsonAtomic(filePath, session);
  return session;
}

function ensureWritableSession(session) {
  if (["completed", "max_iterations"].includes(session.status)) {
    throw new Error(`Agent session is not writable because its status is ${session.status}.`);
  }
}

function recordSnapshot({
  projectRoot,
  sessionId,
  iteration,
  snapshotPath,
  metadata = {},
  now = new Date()
}) {
  const resolvedRoot = assertProjectRoot(projectRoot);
  const session = loadSession(resolvedRoot, sessionId);
  ensureWritableSession(session);
  const iterationNumber = Number(iteration);
  if (!Number.isInteger(iterationNumber) || iterationNumber < 1) {
    throw new Error("Iteration must be a positive integer.");
  }
  if (iterationNumber > session.maxIterations) {
    throw new Error(`Iteration ${iterationNumber} exceeds maxIterations ${session.maxIterations}.`);
  }
  if (session.iterations.some((entry) => entry.iteration === iterationNumber)) {
    throw new Error(`Iteration ${iterationNumber} already exists in session ${session.sessionId}.`);
  }

  const sourcePath = path.resolve(snapshotPath || "");
  if (!snapshotPath || !fs.existsSync(sourcePath) || !fs.statSync(sourcePath).isFile()) {
    throw new Error(`Snapshot PNG not found: ${sourcePath}`);
  }
  const iterationDir = getIterationDir(resolvedRoot, session.sessionId, iterationNumber);
  fs.mkdirSync(iterationDir, { recursive: true });
  const targetPath = path.join(iterationDir, "screen.png");
  if (sourcePath !== targetPath) {
    fs.copyFileSync(sourcePath, targetPath);
  }
  const timestamp = now.toISOString();
  const snapshotMetadata = {
    version: 1,
    sessionId: session.sessionId,
    iteration: iterationNumber,
    screenId: session.screenId,
    path: targetPath,
    capturedAt: timestamp,
    ...metadata
  };
  writeJsonAtomic(path.join(iterationDir, "snapshot.json"), snapshotMetadata);

  session.iterations.push({
    iteration: iterationNumber,
    snapshotPath: targetPath,
    snapshotMetadataPath: path.join(iterationDir, "snapshot.json"),
    reviewPath: "",
    decision: "pending",
    capturedAt: timestamp
  });
  session.iterations.sort((left, right) => left.iteration - right.iteration);
  session.iterationCount = Math.max(session.iterationCount, iterationNumber);
  session.updatedAt = timestamp;
  writeJsonAtomic(sessionFile(resolvedRoot, session.sessionId), session);
  return { session, snapshot: snapshotMetadata };
}

function validateReview(review, iteration) {
  if (!review || typeof review !== "object" || Array.isArray(review)) {
    throw new Error("Agent review must be a JSON object.");
  }
  if (!REVIEW_DECISIONS.has(review.decision)) {
    throw new Error("Agent review decision must be continue, complete, or needs_user.");
  }
  if (!String(review.summary || "").trim()) {
    throw new Error("Agent review summary is required.");
  }
  if (review.iteration !== undefined && Number(review.iteration) !== Number(iteration)) {
    throw new Error(`Agent review iteration must be ${iteration}.`);
  }
  for (const key of ["findings", "preserve", "change", "nextActions"]) {
    if (!Array.isArray(review[key])) {
      throw new Error(`Agent review ${key} must be an array.`);
    }
  }
  const severities = new Set(["fail", "warn", "note"]);
  for (const finding of review.findings) {
    if (!finding || typeof finding !== "object" || !severities.has(finding.severity)) {
      throw new Error("Every agent review finding requires severity fail, warn, or note.");
    }
    for (const key of ["scope", "message", "action"]) {
      if (!String(finding[key] || "").trim()) {
        throw new Error(`Every agent review finding requires ${key}.`);
      }
    }
  }
}

function recordReview({ projectRoot, sessionId, iteration, review, now = new Date() }) {
  const resolvedRoot = assertProjectRoot(projectRoot);
  const session = loadSession(resolvedRoot, sessionId);
  ensureWritableSession(session);
  const iterationNumber = Number(iteration);
  const entry = session.iterations.find((item) => item.iteration === iterationNumber);
  if (!entry) {
    throw new Error(`Snapshot iteration ${iterationNumber} does not exist in session ${session.sessionId}.`);
  }
  if (entry.reviewPath) {
    throw new Error(`Review for iteration ${iterationNumber} already exists.`);
  }
  validateReview(review, iterationNumber);

  const timestamp = now.toISOString();
  const storedReview = {
    version: 1,
    sessionId: session.sessionId,
    screenId: session.screenId,
    iteration: iterationNumber,
    reviewedAt: timestamp,
    findings: [],
    preserve: [],
    change: [],
    nextActions: [],
    ...review
  };
  const reviewPath = path.join(getIterationDir(resolvedRoot, session.sessionId, iterationNumber), "review.json");
  writeJsonAtomic(reviewPath, storedReview);
  entry.reviewPath = reviewPath;
  entry.decision = storedReview.decision;
  entry.reviewedAt = timestamp;

  if (storedReview.decision === "complete") {
    session.status = "completed";
  } else if (storedReview.decision === "needs_user") {
    session.status = "awaiting_user";
  } else if (iterationNumber >= session.maxIterations) {
    session.status = "max_iterations";
  } else {
    session.status = "active";
  }
  session.updatedAt = timestamp;
  writeJsonAtomic(sessionFile(resolvedRoot, session.sessionId), session);
  return { session, review: storedReview };
}

module.exports = {
  APPROVAL_POLICIES,
  SESSION_MODES,
  getIterationDir,
  getSessionDir,
  loadSession,
  recordReview,
  recordSnapshot,
  sanitizeId,
  startSession
};
