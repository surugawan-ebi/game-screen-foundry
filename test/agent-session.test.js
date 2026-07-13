"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  getIterationDir,
  loadSession,
  recordReview,
  recordSnapshot,
  startSession
} = require("../lib/agent-session");

function withTempProject(run) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "gsf-agent-session-"));
  try {
    run(root);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

test("agent session records snapshots and a resumable visual review trail", () => {
  withTempProject((projectRoot) => {
    const session = startSession({
      projectRoot,
      screenId: "home",
      mode: "hybrid",
      maxIterations: 3,
      approvalPolicy: "major_changes",
      sessionId: "home-polish",
      now: new Date("2026-07-14T01:00:00.000Z")
    });
    assert.equal(session.status, "active");
    assert.equal(session.guardrails.allowLayoutChanges, false);

    const sourcePng = path.join(projectRoot, "source.png");
    fs.writeFileSync(sourcePng, Buffer.from("snapshot"));
    const recorded = recordSnapshot({
      projectRoot,
      sessionId: session.sessionId,
      iteration: 1,
      snapshotPath: sourcePng,
      metadata: {
        coverage: {
          assetCount: 4,
          adoptedAssetCount: 3,
          adoptedAssetIds: ["bg", "panel", "button"],
          fallbackAssetIds: ["icon"]
        }
      },
      now: new Date("2026-07-14T01:01:00.000Z")
    });
    assert.equal(recorded.session.iterationCount, 1);
    assert.ok(fs.existsSync(path.join(getIterationDir(projectRoot, session.sessionId, 1), "screen.png")));

    const reviewed = recordReview({
      projectRoot,
      sessionId: session.sessionId,
      iteration: 1,
      review: {
        decision: "continue",
        summary: "CTA contrast needs one targeted retry.",
        findings: [{
          severity: "warn",
          scope: "btn_start",
          message: "The CTA merges with the panel.",
          action: "Increase edge contrast while preserving geometry."
        }],
        preserve: ["layout coordinates", "background"],
        change: ["btn_start edge contrast"],
        nextActions: ["Regenerate btn_start only"]
      },
      now: new Date("2026-07-14T01:02:00.000Z")
    });
    assert.equal(reviewed.session.status, "active");
    assert.equal(reviewed.session.iterations[0].decision, "continue");
    assert.ok(fs.existsSync(reviewed.session.iterations[0].reviewPath));
    assert.equal(loadSession(projectRoot, session.sessionId).iterations.length, 1);
  });
});

test("agent session enforces iteration budgets and stops at the configured limit", () => {
  withTempProject((projectRoot) => {
    const session = startSession({
      projectRoot,
      screenId: "shop",
      maxIterations: 1,
      sessionId: "shop-pass"
    });
    const sourcePng = path.join(projectRoot, "source.png");
    fs.writeFileSync(sourcePng, Buffer.from("snapshot"));
    recordSnapshot({
      projectRoot,
      sessionId: session.sessionId,
      iteration: 1,
      snapshotPath: sourcePng
    });
    const reviewed = recordReview({
      projectRoot,
      sessionId: session.sessionId,
      iteration: 1,
      review: {
        decision: "continue",
        summary: "One more visual change would help, but the budget is exhausted.",
        findings: [],
        preserve: [],
        change: ["secondary panel spacing"],
        nextActions: ["Ask the user before continuing"]
      }
    });
    assert.equal(reviewed.session.status, "max_iterations");
    assert.throws(() => recordSnapshot({
      projectRoot,
      sessionId: session.sessionId,
      iteration: 2,
      snapshotPath: sourcePng
    }), /not writable/u);
  });
});

test("agent review requires an explicit decision and summary", () => {
  withTempProject((projectRoot) => {
    const session = startSession({
      projectRoot,
      screenId: "modal",
      sessionId: "modal-review"
    });
    const sourcePng = path.join(projectRoot, "source.png");
    fs.writeFileSync(sourcePng, Buffer.from("snapshot"));
    recordSnapshot({
      projectRoot,
      sessionId: session.sessionId,
      iteration: 1,
      snapshotPath: sourcePng
    });
    assert.throws(() => recordReview({
      projectRoot,
      sessionId: session.sessionId,
      iteration: 1,
      review: {
        decision: "maybe",
        summary: "",
        findings: [],
        preserve: [],
        change: [],
        nextActions: []
      }
    }), /decision must be/u);
  });
});
