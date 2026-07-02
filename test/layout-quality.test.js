"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { buildLayoutReview } = require("../lib/layout-quality");

function makeInput({ placements = [], assets = [], contentOverlays = [], compositionGroups = [], assemblyPolicy = {} } = {}) {
  return {
    screenKv: {
      screenId: "test",
      screenName: "Test",
      canvasWidth: 1280,
      canvasHeight: 720
    },
    materialSpecSheet: {
      screenMeta: {},
      placements,
      assets,
      contentOverlays,
      compositionGroups,
      assemblyPolicy
    },
    worldPreset: {},
    revisionMap: {}
  };
}

function placement(id, assetId, x, y, width, height, extra = {}) {
  return {
    placementId: id,
    assetId,
    x,
    y,
    width,
    height,
    anchor: "center",
    zIndex: extra.zIndex || 10,
    ...extra
  };
}

function asset(id, assetType = "button", role = "cta") {
  return { assetId: id, assetType, role };
}

function codes(review, status) {
  return review.checks.filter((check) => !status || check.status === status).map((check) => check.code);
}

test("undeclared partial sibling overlap fails under explicit_overlap_only", () => {
  const review = buildLayoutReview(makeInput({
    placements: [
      placement("a", "asset_a", 100, 100, 100, 50),
      placement("b", "asset_b", 160, 100, 100, 50)
    ],
    assets: [asset("asset_a"), asset("asset_b")]
  }));
  assert.ok(codes(review, "fail").includes("overlap_undeclared"));
  assert.equal(review.summary.status, "fail");
});

test("declared overlap passes", () => {
  const review = buildLayoutReview(makeInput({
    placements: [
      placement("a", "asset_a", 100, 100, 100, 50),
      placement("b", "asset_b", 160, 100, 100, 50)
    ],
    assets: [asset("asset_a"), asset("asset_b")],
    assemblyPolicy: {
      layoutSafetyPolicy: {
        allowedOverlaps: [{ source: "a", target: "b", reason: "test" }]
      }
    }
  }));
  assert.ok(codes(review, "pass").includes("overlap_declared"));
  assert.ok(!codes(review, "fail").includes("overlap_undeclared"));
});

test("stacked asset touching the base edge fails, tight clearance warns", () => {
  const touching = buildLayoutReview(makeInput({
    placements: [
      placement("base", "asset_base", 200, 200, 200, 100),
      placement("top", "asset_top", 150, 200, 100, 100, { zIndex: 12 })
    ],
    assets: [asset("asset_base", "panel", "shell"), asset("asset_top", "icon", "icon")]
  }));
  assert.ok(codes(touching, "fail").includes("overlap_padding_missing"));

  const tight = buildLayoutReview(makeInput({
    placements: [
      placement("base", "asset_base", 200, 200, 200, 100),
      placement("top", "asset_top", 200, 200, 100, 94, { zIndex: 12 })
    ],
    assets: [asset("asset_base", "panel", "shell"), asset("asset_top", "icon", "icon")]
  }));
  assert.ok(codes(tight, "warn").includes("overlap_padding_tight"));

  const ok = buildLayoutReview(makeInput({
    placements: [
      placement("base", "asset_base", 200, 200, 200, 100),
      placement("top", "asset_top", 200, 200, 100, 60, { zIndex: 12 })
    ],
    assets: [asset("asset_base", "panel", "shell"), asset("asset_top", "icon", "icon")]
  }));
  assert.ok(codes(ok, "pass").includes("overlap_padding"));
  assert.equal(ok.summary.failCount, 0);
});

test("progress fill sitting flush on its track is allowed", () => {
  const review = buildLayoutReview(makeInput({
    placements: [
      placement("track", "asset_track", 200, 200, 200, 20),
      placement("fill", "asset_fill", 160, 200, 120, 14, { zIndex: 12 })
    ],
    assets: [asset("asset_track", "panel", "progress_track"), asset("asset_fill", "panel", "progress_fill")]
  }));
  assert.ok(codes(review, "pass").includes("overlap_fill_layer"));
  assert.equal(review.summary.failCount, 0);
});

test("child overflowing its parent warns unless declared", () => {
  const base = {
    placements: [
      placement("parent", "asset_parent", 300, 300, 300, 200),
      placement("child", "asset_child", 300, 190, 100, 40, { parentId: "parent", zIndex: 12 })
    ],
    assets: [asset("asset_parent", "panel", "shell"), asset("asset_child", "badge", "ribbon")]
  };
  const review = buildLayoutReview(makeInput(base));
  assert.ok(codes(review, "warn").includes("child_overflows_parent"));

  const declared = buildLayoutReview(makeInput({
    ...base,
    assemblyPolicy: {
      layoutSafetyPolicy: {
        allowedOverlaps: [{ source: "child", target: "parent", reason: "intentional overhang" }]
      }
    }
  }));
  assert.ok(!codes(declared, "warn").includes("child_overflows_parent"));
});

test("sample text wider than the slot fails with a suggested font size", () => {
  const review = buildLayoutReview(makeInput({
    placements: [placement("btn", "asset_btn", 200, 200, 120, 40)],
    assets: [asset("asset_btn")],
    contentOverlays: [{
      overlayId: "ov_label",
      kind: "text",
      sampleText: "とても長いボタンラベル",
      x: 200,
      y: 200,
      width: 100,
      height: 24,
      anchor: "center",
      zIndex: 20,
      fontSize: 20,
      targetPlacementId: "btn",
      slot: { x: 10, y: 8, width: 100, height: 24 }
    }]
  }));
  const failure = review.checks.find((check) => check.code === "text_overflow_x");
  assert.ok(failure);
  assert.ok(failure.refs.suggestedFontSize < 20);
});

test("single-line text matching the slot height passes", () => {
  const review = buildLayoutReview(makeInput({
    placements: [placement("btn", "asset_btn", 200, 200, 220, 60)],
    assets: [asset("asset_btn")],
    contentOverlays: [{
      overlayId: "ov_label",
      kind: "text",
      sampleText: "出撃",
      x: 200,
      y: 200,
      width: 180,
      height: 24,
      anchor: "center",
      zIndex: 20,
      fontSize: 24,
      targetPlacementId: "btn",
      slot: { x: 20, y: 18, width: 180, height: 24 }
    }]
  }));
  assert.ok(codes(review, "pass").includes("text_fit"));
  assert.ok(!codes(review, "fail").includes("text_overflow_y"));
});

test("overlay extending past its target placement fails", () => {
  const review = buildLayoutReview(makeInput({
    placements: [placement("btn", "asset_btn", 200, 200, 100, 40)],
    assets: [asset("asset_btn")],
    contentOverlays: [{
      overlayId: "ov_label",
      kind: "text",
      sampleText: "OK",
      x: 200,
      y: 200,
      width: 140,
      height: 24,
      anchor: "center",
      zIndex: 20,
      fontSize: 16,
      targetPlacementId: "btn",
      slot: { x: -20, y: 8, width: 140, height: 24 }
    }]
  }));
  assert.ok(codes(review, "fail").includes("overlay_outside_target"));
});

test("near-miss alignment between row siblings warns, exact alignment passes", () => {
  const near = buildLayoutReview(makeInput({
    placements: [
      placement("btn_a", "asset_a", 200, 100, 100, 40),
      placement("btn_b", "asset_b", 400, 102, 100, 40)
    ],
    assets: [asset("asset_a"), asset("asset_b")]
  }));
  assert.ok(codes(near, "warn").includes("alignment_near_miss_y"));

  const aligned = buildLayoutReview(makeInput({
    placements: [
      placement("btn_a", "asset_a", 200, 100, 100, 40),
      placement("btn_b", "asset_b", 400, 100, 100, 40)
    ],
    assets: [asset("asset_a"), asset("asset_b")]
  }));
  assert.ok(codes(aligned, "pass").includes("alignment"));
  assert.equal(aligned.summary.warnCount, 0);
});

test("same asset placed at nearly identical sizes warns", () => {
  const review = buildLayoutReview(makeInput({
    placements: [
      placement("nav_1", "asset_nav", 200, 600, 100, 40),
      placement("nav_2", "asset_nav", 400, 660, 102, 40)
    ],
    assets: [asset("asset_nav")]
  }));
  assert.ok(codes(review, "warn").includes("size_near_miss"));
});

test("icon and text lanes on the same shell must share a center line", () => {
  const base = {
    placements: [
      placement("shell", "asset_shell", 200, 50, 360, 80),
      placement("coin_icon", "asset_icon", 60, 46, 18, 18, { parentId: "shell", zIndex: 15 })
    ],
    assets: [asset("asset_shell", "panel", "hud_shell"), asset("asset_icon", "icon", "resource_icon")],
    contentOverlays: [{
      overlayId: "ov_value",
      kind: "text",
      sampleText: "920G",
      x: 120,
      y: 41,
      width: 80,
      height: 22,
      anchor: "center",
      zIndex: 20,
      fontSize: 14,
      targetPlacementId: "shell",
      slot: { x: 60, y: 20, width: 80, height: 22 }
    }]
  };
  const misaligned = buildLayoutReview(makeInput(base));
  assert.ok(codes(misaligned, "warn").includes("icon_text_center_mismatch"));

  const aligned = JSON.parse(JSON.stringify(base));
  aligned.contentOverlays[0].slot.y = 26;
  const review = buildLayoutReview(makeInput(aligned));
  assert.ok(!codes(review, "warn").includes("icon_text_center_mismatch"));
});

test("backdrop placements are excluded from overlap checks", () => {
  const review = buildLayoutReview(makeInput({
    placements: [
      placement("bg", "asset_bg", 640, 360, 1280, 720, { zIndex: 0 }),
      placement("btn", "asset_btn", 200, 100, 100, 40)
    ],
    assets: [asset("asset_bg", "background", "ambient_backdrop"), asset("asset_btn")]
  }));
  assert.ok(!codes(review).includes("overlap_undeclared"));
  assert.equal(review.summary.failCount, 0);
});
