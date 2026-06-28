"use strict";

process.env.BETA_AI_MODE = "mock";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");

const { dispatchApi, resolveSourceFileRequest } = require("../server");
const { getDemoProject } = require("../lib/sample-data");
const { prepareInput } = require("../lib/spec");
const { generateRenderModel } = require("../lib/generator");
const { buildImagegenJob } = require("../lib/imagegen-workflow");

function estimateTextWidth(value, fontSize) {
  return [...String(value || "")].reduce((total, char) => {
    if (/\s/u.test(char)) {
      return total + fontSize * 0.34;
    }
    if (/[.,:;/\\|!]/u.test(char)) {
      return total + fontSize * 0.34;
    }
    if (/[0-9A-Za-z]/u.test(char)) {
      return total + fontSize * 0.66;
    }
    if (/[\u3040-\u30ff\u3400-\u9fff]/u.test(char)) {
      return total + fontSize * 0.98;
    }
    return total + fontSize * 0.72;
  }, 0);
}

function layerBox(layer) {
  return {
    left: layer.left,
    top: layer.top,
    right: layer.left + layer.width,
    bottom: layer.top + layer.height,
    width: layer.width,
    height: layer.height
  };
}

function overlapArea(left, right) {
  return Math.max(0, Math.min(left.right, right.right) - Math.max(left.left, right.left))
    * Math.max(0, Math.min(left.bottom, right.bottom) - Math.max(left.top, right.top));
}

test("source-file only serves repository or explicitly loaded project images", async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "gcgt-source-file-"));
  const externalImage = path.join(tempDir, "external.png");
  const projectImage = path.join(tempDir, "local-ref.png");
  const project = getDemoProject();

  fs.writeFileSync(externalImage, "fake external image");
  fs.writeFileSync(projectImage, "fake project image");
  fs.writeFileSync(path.join(tempDir, "screen-kv.json"), JSON.stringify(project.screenKv, null, 2));
  fs.writeFileSync(path.join(tempDir, "material-spec.json"), JSON.stringify(project.materialSpecSheet, null, 2));
  fs.writeFileSync(path.join(tempDir, "world-preset.json"), JSON.stringify(project.worldPreset, null, 2));

  try {
    const repoImage = path.join(__dirname, "..", "examples", "sky-port-home", "key-visual.png");
    const repoResponse = resolveSourceFileRequest(repoImage);
    assert.equal(repoResponse.statusCode, 200);
    assert.equal(repoResponse.filePath, repoImage);

    const deniedResponse = resolveSourceFileRequest(externalImage);
    assert.equal(deniedResponse.statusCode, 403);
    assert.match(deniedResponse.body, /outside allowed project roots/u);

    const loadResponse = await dispatchApi("POST", "/api/load-from-folder", {
      folderPath: tempDir
    });
    assert.equal(loadResponse.statusCode, 200);
    assert.equal(loadResponse.payload.ok, true);

    const projectResponse = resolveSourceFileRequest(projectImage);
    assert.equal(projectResponse.statusCode, 200);
    assert.equal(projectResponse.filePath, projectImage);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test("blank project template loads through the project manifest", async () => {
  const templateRoot = path.join(__dirname, "..", "templates", "blank-project", "creative");
  const loadResponse = await dispatchApi("POST", "/api/load-from-folder", {
    folderPath: templateRoot
  });

  assert.equal(loadResponse.statusCode, 200);
  assert.equal(loadResponse.payload.ok, true);
  assert.equal(loadResponse.payload.source.projectId, "blank_project");
  assert.equal(loadResponse.payload.source.screenId, "home");
  assert.equal(loadResponse.payload.bundle.screenKv.screenId, "home");
  assert.equal(
    loadResponse.payload.bundle.worldPreset.imagegenWorkflow.outputDir,
    path.join(templateRoot, "screens", "home", "generated-assets")
  );

  const draftResponse = await dispatchApi("POST", "/api/render-draft", loadResponse.payload.bundle);
  assert.equal(draftResponse.statusCode, 200);
  assert.equal(draftResponse.payload.ok, true);
  assert.equal(draftResponse.payload.renderModel.screen.layers.length, 3);
  assert.equal(draftResponse.payload.renderModel.assets.length, 2);
});

test("inline relative imagegenAssets paths resolve from each loaded screen folder", async () => {
  const writeScreen = (screenDir) => {
    const project = getDemoProject();
    project.worldPreset.imagegenAssets = {
      bg_sky_port_home: {
        assetId: "bg_sky_port_home",
        path: "generated-assets/bg_sky_port_home.png",
        backend: "portable_test",
        usesImagegen: true,
        prompt: "portable path test"
      }
    };
    project.worldPreset.imagegenWorkflow = {};

    fs.mkdirSync(path.join(screenDir, "generated-assets"), { recursive: true });
    fs.writeFileSync(path.join(screenDir, "screen-kv.json"), JSON.stringify(project.screenKv, null, 2));
    fs.writeFileSync(path.join(screenDir, "material-spec.json"), JSON.stringify(project.materialSpecSheet, null, 2));
    fs.writeFileSync(path.join(screenDir, "world-preset.json"), JSON.stringify(project.worldPreset, null, 2));
    fs.writeFileSync(path.join(screenDir, "generated-assets", "bg_sky_port_home.png"), "fake generated image");
  };

  const firstDir = fs.mkdtempSync(path.join(os.tmpdir(), "gcgt-portable-a-"));
  const secondDir = fs.mkdtempSync(path.join(os.tmpdir(), "gcgt-portable-b-"));
  writeScreen(firstDir);
  writeScreen(secondDir);

  try {
    const firstResponse = await dispatchApi("POST", "/api/load-from-folder", {
      folderPath: firstDir
    });
    const secondResponse = await dispatchApi("POST", "/api/load-from-folder", {
      folderPath: secondDir
    });

    assert.equal(firstResponse.statusCode, 200);
    assert.equal(secondResponse.statusCode, 200);
    assert.equal(
      firstResponse.payload.bundle.worldPreset.imagegenAssets.bg_sky_port_home.path,
      path.join(firstDir, "generated-assets", "bg_sky_port_home.png")
    );
    assert.equal(
      secondResponse.payload.bundle.worldPreset.imagegenAssets.bg_sky_port_home.path,
      path.join(secondDir, "generated-assets", "bg_sky_port_home.png")
    );
    assert.notEqual(
      firstResponse.payload.bundle.worldPreset.imagegenAssets.bg_sky_port_home.path,
      secondResponse.payload.bundle.worldPreset.imagegenAssets.bg_sky_port_home.path
    );

    const showResponse = await dispatchApi("POST", "/api/show-generated", secondResponse.payload.bundle);
    const layer = showResponse.payload.renderModel.screen.layers.find((item) => item.assetId === "bg_sky_port_home");
    assert.match(decodeURIComponent(layer.src), new RegExp(secondDir.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "u"));
  } finally {
    fs.rmSync(firstDir, { recursive: true, force: true });
    fs.rmSync(secondDir, { recursive: true, force: true });
  }
});

test("imagegen output fallback is generic and not demo-specific", () => {
  const project = getDemoProject();
  project.worldPreset.imagegenAssets = {};
  project.worldPreset.imagegenWorkflow = {
    targetAssetIds: ["bg_sky_port_home"]
  };

  const job = buildImagegenJob(prepareInput(project), {
    jobId: "imagegen_test_fallback"
  });
  const expectedOutputDir = path.join(__dirname, "..", "imagegen-jobs", "generated-assets");

  assert.equal(job.outputDir, expectedOutputDir);
  assert.equal(job.assets.length, 1);
  assert.equal(job.assets[0].outputPath, path.join(expectedOutputDir, "bg_sky_port_home.png"));
  assert.doesNotMatch(job.outputDir, /examples\/sky-port-home/u);
});

test("demo and generate endpoints return a renderable payload", async () => {
  const demoResponse = await dispatchApi("GET", "/api/demo");
  assert.equal(demoResponse.statusCode, 200);
  assert.equal(demoResponse.payload.ok, true);

  const draftResponse = await dispatchApi("POST", "/api/render-draft", demoResponse.payload.demo);
  assert.equal(draftResponse.statusCode, 200);
  assert.equal(draftResponse.payload.ok, true);

  const generateResponse = await dispatchApi("POST", "/api/generate-all", demoResponse.payload.demo);
  assert.equal(generateResponse.statusCode, 200);
  assert.equal(generateResponse.payload.ok, true);
  assert.ok(generateResponse.payload.generationReport);
  assert.ok(generateResponse.payload.generationReport.plannedJobs > 0);
  assert.ok(generateResponse.payload.generationReport.jobs.some((job) => job.backendClass === "image_batch"));
  assert.ok(generateResponse.payload.generationReport.jobs.some((job) => job.backendClass === "template_family_batch"));
  assert.equal(
    generateResponse.payload.renderModel.assets.length,
    demoResponse.payload.demo.materialSpecSheet.assets.length
  );
  assert.equal(generateResponse.payload.input.revisionMap.bg_sky_port_home.revisionCount, 1);
  assert.equal(generateResponse.payload.input.revisionMap.bg_sky_port_home.comments.length, 0);
  assert.equal(generateResponse.payload.input.revisionMap.bg_sky_port_home.generationMeta.backendClass, "image_batch");
  assert.equal(generateResponse.payload.input.revisionMap.bg_sky_port_home.generationMeta.usesImagegen, true);
  assert.notEqual(
    draftResponse.payload.renderModel.assets[0].previewSrc,
    generateResponse.payload.renderModel.assets[0].previewSrc
  );
  const generatedBackground = generateResponse.payload.renderModel.screen.layers.find((layer) => layer.assetId === "bg_sky_port_home");
  const generatedPrimaryButton = generateResponse.payload.renderModel.screen.layers.find((layer) => layer.assetId === "btn_start_sortie");
  assert.match(decodeURIComponent(generatedBackground.src), /generated-assets\/bg_sky_port_home\.png/);
  assert.match(decodeURIComponent(generatedPrimaryButton.src), /generated-assets\/btn_start_sortie\.png/);
});

test("show-generated displays prebuilt assets without creating imagegen jobs", async () => {
  const payload = getDemoProject();
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "gcgt-show-generated-"));
  payload.worldPreset.imagegenWorkflow = {
    ...(payload.worldPreset.imagegenWorkflow || {}),
    jobDir: tempDir
  };

  const response = await dispatchApi("POST", "/api/show-generated", payload);
  assert.equal(response.statusCode, 200);
  assert.equal(response.payload.ok, true);
  assert.equal(response.payload.generationReport.mode, "prebuilt_display");
  assert.equal(response.payload.generationReport.actionLabel, "生成後を表示");
  assert.equal(response.payload.imagegenReport.runner.mode, "prebuilt");
  assert.equal(response.payload.imagegenReport.runner.ran, false);
  assert.ok(response.payload.imagegenReport.adoptedAssetIds.includes("bg_sky_port_home"));
  assert.equal(response.payload.imagegenReport.compositionQuality.status, "pass");
  assert.deepEqual(fs.readdirSync(tempDir), []);

  const backgroundLayer = response.payload.renderModel.screen.layers.find((layer) => layer.assetId === "bg_sky_port_home");
  assert.match(decodeURIComponent(backgroundLayer.src), /generated-assets\/bg_sky_port_home\.png/);
});

test("composition quality endpoint reports grouped asset assembly health", async () => {
  const response = await dispatchApi("POST", "/api/composition-quality", getDemoProject());

  assert.equal(response.statusCode, 200);
  assert.equal(response.payload.ok, true);
  assert.equal(response.payload.compositionQuality.status, "pass");
  assert.equal(response.payload.compositionQuality.groupCount, 4);
  assert.ok(response.payload.compositionGroups.some((group) => group.groupId === "daily_mission_rows_area"));
  assert.ok(
    response.payload.compositionGroups
      .find((group) => group.groupId === "daily_mission_rows_area")
      .checks.some((check) => check.code === "child_content_inset")
  );
});

test("implementation report endpoint exports layer order and runtime overlays", async () => {
  const response = await dispatchApi("POST", "/api/implementation-report", getDemoProject());

  assert.equal(response.statusCode, 200);
  assert.equal(response.payload.ok, true);
  assert.equal(response.payload.report.screen.screenId, "home_sky_port_atlas");
  assert.ok(response.payload.report.layers.length > 0);
  assert.ok(response.payload.report.runtimeOverlays.some((overlay) => overlay.overlayId === "ov_sortie_cta"));
  assert.ok(response.payload.report.compositionGroups.some((group) => group.groupId === "primary_sortie_cta"));
  assert.match(response.payload.markdown, /## Layer Order/u);
  assert.match(response.payload.markdown, /## Runtime Overlays/u);
  assert.match(response.payload.markdown, /## Composition Groups/u);
  assert.match(response.payload.markdown, /compositionQuality: pass \/ score 100/u);
});

test("validate-workspace endpoint returns actionable diagnostics", async () => {
  const validResponse = await dispatchApi("POST", "/api/validate-workspace", getDemoProject());
  assert.equal(validResponse.statusCode, 200);
  assert.equal(validResponse.payload.ok, true);
  assert.equal(validResponse.payload.valid, true);
  assert.equal(validResponse.payload.summary.compositionStatus, "pass");

  const invalidProject = getDemoProject();
  delete invalidProject.screenKv.screenId;
  const invalidResponse = await dispatchApi("POST", "/api/validate-workspace", invalidProject);
  assert.equal(invalidResponse.statusCode, 200);
  assert.equal(invalidResponse.payload.ok, true);
  assert.equal(invalidResponse.payload.valid, false);
  assert.ok(invalidResponse.payload.diagnostics.some((diagnostic) => diagnostic.severity === "error"));
});

test("runtime text overlays resolve inside their target asset slots", async () => {
  const demoResponse = await dispatchApi("GET", "/api/demo");
  const generateResponse = await dispatchApi("POST", "/api/generate-all", demoResponse.payload.demo);
  const layers = generateResponse.payload.renderModel.screen.layers;
  const layerById = Object.fromEntries(layers.map((layer) => [layer.placementId, layer]));
  const textLayers = layers.filter((layer) => layer.role === "text");

  assert.ok(textLayers.length > 0);
  for (const layer of textLayers) {
    assert.ok(layer.targetPlacementId, `${layer.placementId} must resolve against a target placement`);
    assert.ok(layer.slot, `${layer.placementId} must keep its slot metadata`);
    const target = layerById[layer.targetPlacementId];
    assert.ok(target, `${layer.placementId} target ${layer.targetPlacementId} must exist`);
    assert.ok(layer.left >= target.left, `${layer.placementId} left must stay inside ${layer.targetPlacementId}`);
    assert.ok(layer.top >= target.top, `${layer.placementId} top must stay inside ${layer.targetPlacementId}`);
    assert.ok(
      layer.left + layer.width <= target.left + target.width,
      `${layer.placementId} right must stay inside ${layer.targetPlacementId}`
    );
    assert.ok(
      layer.top + layer.height <= target.top + target.height,
      `${layer.placementId} bottom must stay inside ${layer.targetPlacementId}`
    );
  }
});

test("runtime text slots are specified large enough without auto-shrinking", () => {
  const project = getDemoProject();
  const overlays = project.materialSpecSheet.contentOverlays || [];

  assert.ok(overlays.length > 0);
  for (const overlay of overlays) {
    const lines = String(overlay.sampleText || overlay.text || overlay.value || "").split("\n");
    const fontSize = overlay.fontSize || Math.max(12, Math.round((overlay.height || 1) * 0.46));
    const maxLineWidth = Math.max(...lines.map((line) => estimateTextWidth(line, fontSize)), 1);
    const requiredWidth = Math.ceil(maxLineWidth + (overlay.strokeWidth || 0) * 4 + 4);

    assert.ok(
      requiredWidth <= overlay.width,
      `${overlay.overlayId} requires ${requiredWidth}px at fontSize ${fontSize}, slot width is ${overlay.width}px`
    );
  }
});

test("top profile name text slot leaves vertical room for glyphs", () => {
  const project = getDemoProject();
  const overlays = Object.fromEntries(
    project.materialSpecSheet.contentOverlays.map((overlay) => [overlay.overlayId, overlay])
  );
  const name = overlays.ov_top_player_name;

  assert.equal(name.valign, "top");
  assert.ok(name.height >= 30, "ov_top_player_name must not clip tall Japanese glyphs");
  assert.deepEqual(name.slot, { x: 97, y: 8, width: 170, height: 30 });
});

test("daily mission row child assets stay inside their row shells", () => {
  const project = getDemoProject();
  const placements = project.materialSpecSheet.placements;
  const placementById = Object.fromEntries(placements.map((placement) => [placement.placementId, placement]));
  const rowPlacementIds = new Set([
    "daily_mission_row_login",
    "daily_mission_row_sortie",
    "daily_mission_row_shop"
  ]);
  const toBox = (placement) => ({
    left: placement.x - placement.width / 2,
    top: placement.y - placement.height / 2,
    right: placement.x + placement.width / 2,
    bottom: placement.y + placement.height / 2
  });

  for (const placement of placements.filter((item) => rowPlacementIds.has(item.parentId))) {
    const parent = placementById[placement.parentId];
    const childBox = toBox(placement);
    const parentBox = toBox(parent);

    assert.ok(childBox.left >= parentBox.left, `${placement.placementId} left must stay inside ${placement.parentId}`);
    assert.ok(childBox.top >= parentBox.top, `${placement.placementId} top must stay inside ${placement.parentId}`);
    assert.ok(childBox.right <= parentBox.right, `${placement.placementId} right must stay inside ${placement.parentId}`);
    assert.ok(childBox.bottom <= parentBox.bottom, `${placement.placementId} bottom must stay inside ${placement.parentId}`);
  }
});

test("profile action tiles use a shared icon and label grid", () => {
  const project = getDemoProject();
  const placements = project.materialSpecSheet.placements;
  const overlays = project.materialSpecSheet.contentOverlays;
  const placementById = Object.fromEntries(placements.map((placement) => [placement.placementId, placement]));
  const overlayById = Object.fromEntries(overlays.map((overlay) => [overlay.overlayId, overlay]));
  const tileKinds = ["achievement", "codex", "ranking", "friends"];
  const localBox = (placement, parent) => ({
    x: placement.x - placement.width / 2 - (parent.x - parent.width / 2),
    y: placement.y - placement.height / 2 - (parent.y - parent.height / 2),
    width: placement.width,
    height: placement.height
  });

  for (const kind of tileKinds) {
    const tile = placementById[`player_profile_tile_${kind}`];
    assert.deepEqual(
      localBox(placementById[`player_profile_icon_${kind}`], tile),
      { x: 17, y: 8, width: 24, height: 24 },
      `player_profile_icon_${kind} must use the shared tile icon slot`
    );
    assert.deepEqual(
      overlayById[`ov_profile_tile_${kind}`].slot,
      { x: 0, y: 36, width: 58, height: 18 },
      `ov_profile_tile_${kind} must use the shared tile label slot`
    );
  }
});

test("major panel outer frames do not bake child headers or row content", () => {
  const project = getDemoProject();
  const assets = Object.fromEntries(project.materialSpecSheet.assets.map((asset) => [asset.assetId, asset]));
  const placements = Object.fromEntries(
    project.materialSpecSheet.placements.map((placement) => [placement.placementId, placement])
  );

  assert.equal(assets.frame_player_profile_outer.contentModel.mode, "frame_only");
  assert.deepEqual(assets.frame_player_profile_outer.contentModel.slots, ["content_area"]);
  for (const forbidden of ["title_tab", "panel_title", "emblem", "rank_progress", "action_tiles"]) {
    assert.ok(
      assets.frame_player_profile_outer.contentModel.forbiddenBakedElements.includes(forbidden),
      `frame_player_profile_outer must not bake ${forbidden}`
    );
  }
  assert.equal(placements.player_profile_header_tab.assetId, "tab_player_profile_header");
  assert.equal(placements.player_profile_header_tab.parentId, "player_profile_outer");

  assert.equal(assets.frame_daily_mission_outer.contentModel.mode, "frame_only");
  assert.deepEqual(assets.frame_daily_mission_outer.contentModel.slots, ["content_area"]);
  for (const forbidden of ["header_strip", "mission_rows", "row_separators", "footer_button"]) {
    assert.ok(
      assets.frame_daily_mission_outer.contentModel.forbiddenBakedElements.includes(forbidden),
      `frame_daily_mission_outer must not bake ${forbidden}`
    );
  }
  assert.equal(placements.daily_mission_header_strip.assetId, "strip_daily_mission_header");
  assert.equal(placements.daily_mission_header_strip.parentId, "daily_mission_outer");
});

test("daily mission rows use a shared internal layout grid", () => {
  const project = getDemoProject();
  const placements = project.materialSpecSheet.placements;
  const overlays = project.materialSpecSheet.contentOverlays;
  const placementById = Object.fromEntries(placements.map((placement) => [placement.placementId, placement]));
  const overlayById = Object.fromEntries(overlays.map((overlay) => [overlay.overlayId, overlay]));
  const rowKinds = ["login", "sortie", "shop"];
  const localBox = (placement, parent) => ({
    x: placement.x - placement.width / 2 - (parent.x - parent.width / 2),
    y: placement.y - placement.height / 2 - (parent.y - parent.height / 2),
    width: placement.width,
    height: placement.height
  });

  for (const kind of rowKinds) {
    const row = placementById[`daily_mission_row_${kind}`];
    assert.deepEqual(
      localBox(placementById[`daily_mission_progress_base_${kind}`], row),
      { x: 14, y: 35, width: 116, height: 12 },
      `daily_mission_progress_base_${kind} must use the shared progress slot`
    );
    const progressFill = localBox(placementById[`daily_mission_progress_fill_${kind}`], row);
    assert.deepEqual(
      { x: progressFill.x, y: progressFill.y, height: progressFill.height },
      { x: 16, y: 37, height: 8 },
      `daily_mission_progress_fill_${kind} must start from the shared fill origin`
    );
    assert.deepEqual(
      localBox(placementById[`daily_mission_btn_${kind}`], row),
      { x: 201, y: 8, width: 84, height: 38 },
      `daily_mission_btn_${kind} must use the shared action slot`
    );
    assert.deepEqual(
      overlayById[`ov_mission_${kind}_count`].slot,
      { x: 55, y: 30, width: 42, height: 16 },
      `ov_mission_${kind}_count must use the shared count slot`
    );
    assert.deepEqual(
      overlayById[`ov_mission_${kind}_btn`].slot,
      { x: 7, y: 9, width: 70, height: 20 },
      `ov_mission_${kind}_btn must use the shared button label slot`
    );
  }

  for (const kind of ["sortie", "shop"]) {
    const row = placementById[`daily_mission_row_${kind}`];
    assert.deepEqual(
      localBox(placementById[`daily_mission_reward_${kind}`], row),
      { x: 153, y: 10, width: 44, height: 34 },
      `daily_mission_reward_${kind} must use the shared reward chip slot`
    );
    assert.deepEqual(
      overlayById[`ov_mission_${kind}_reward`].slot,
      { x: 1, y: 18, width: 42, height: 14 },
      `ov_mission_${kind}_reward must use the shared reward value slot`
    );
  }
});

test("side CTA text lanes reserve space for featured icons", async () => {
  const project = getDemoProject();
  const assets = Object.fromEntries(project.materialSpecSheet.assets.map((asset) => [asset.assetId, asset]));
  assert.equal(assets.card_gift_cta_shell.contentModel.mode, "frame_only");
  assert.ok(assets.card_gift_cta_shell.contentModel.forbiddenBakedElements.includes("gacha_orb_socket"));
  assert.ok(assets.card_gacha_cta_shell.contentModel.forbiddenBakedElements.includes("gacha_orb"));

  const demoResponse = await dispatchApi("GET", "/api/demo");
  const generateResponse = await dispatchApi("POST", "/api/generate-all", demoResponse.payload.demo);
  const layers = generateResponse.payload.renderModel.screen.layers;
  const layerById = Object.fromEntries(layers.map((layer) => [layer.placementId, layer]));
  const rightEdge = (layer) => layer.left + layer.width;
  const bottomEdge = (layer) => layer.top + layer.height;
  const navTop = layerById.bottom_nav_shell.top;

  for (const textId of ["ov_gift_title", "ov_gift_copy"]) {
    assert.ok(
      layerById[textId].left >= rightEdge(layerById.gift_cta_crate) + 16,
      `${textId} must leave space for the gift icon`
    );
    assert.ok(
      layerById[textId].left >= rightEdge(layerById.gift_cta_badge) + 8,
      `${textId} must leave space for the notification badge`
    );
    assert.ok(
      bottomEdge(layerById[textId]) <= bottomEdge(layerById.gift_cta_shell) - 10,
      `${textId} must not touch the side CTA bottom frame`
    );
  }
  assert.ok(
    overlapArea(layerBox(layerById.gift_cta_badge), layerBox(layerById.gift_cta_crate)) > 0,
    "gift_cta_badge must attach to the gift crate"
  );
  assert.ok(
    bottomEdge(layerById.gift_cta_shell) <= navTop - 8,
    "gift CTA must keep at least 8px gap above the bottom nav"
  );

  for (const textId of ["ov_gacha_title", "ov_gacha_copy"]) {
    assert.ok(
      rightEdge(layerById[textId]) <= layerById.gacha_cta_orb.left - 22,
      `${textId} must stay in the left text lane and reserve space for the gacha orb`
    );
    assert.ok(
      bottomEdge(layerById[textId]) <= bottomEdge(layerById.gacha_cta_shell) - 12,
      `${textId} must not touch the side CTA bottom frame`
    );
  }
  assert.ok(
    overlapArea(layerBox(layerById.gacha_cta_orb), layerBox(layerById.gacha_cta_shell)) > 0,
    "gacha_cta_orb must sit on the dedicated gacha socket"
  );
  assert.ok(
    bottomEdge(layerById.gacha_cta_shell) <= navTop - 8,
    "gacha CTA must keep at least 8px gap above the bottom nav"
  );
});

test("primary sortie CTA does not collide with the bottom nav", async () => {
  const demoResponse = await dispatchApi("GET", "/api/demo");
  const generateResponse = await dispatchApi("POST", "/api/generate-all", demoResponse.payload.demo);
  const layerById = Object.fromEntries(generateResponse.payload.renderModel.screen.layers.map((layer) => [layer.placementId, layer]));
  const navBox = layerBox(layerById.bottom_nav_shell);

  for (const placementId of ["sortie_button_base", "sortie_button_anchor"]) {
    const box = layerBox(layerById[placementId]);
    assert.equal(
      overlapArea(box, navBox),
      0,
      `${placementId} must not overlap bottom_nav_shell`
    );
    assert.ok(
      box.bottom <= navBox.top - 8,
      `${placementId} must keep at least 8px gap above bottom_nav_shell`
    );
  }
});

test("daily mission content stays padded inside its panel and away from gacha CTA", async () => {
  const demoResponse = await dispatchApi("GET", "/api/demo");
  const generateResponse = await dispatchApi("POST", "/api/generate-all", demoResponse.payload.demo);
  const layerById = Object.fromEntries(generateResponse.payload.renderModel.screen.layers.map((layer) => [layer.placementId, layer]));
  const outer = layerBox(layerById.daily_mission_outer);
  const gachaShell = layerBox(layerById.gacha_cta_shell);
  const gachaOrb = layerBox(layerById.gacha_cta_orb);
  const padded = {
    left: outer.left + 8,
    top: outer.top + 8,
    right: outer.right - 8,
    bottom: outer.bottom - 8
  };

  for (const placementId of [
    "daily_mission_row_login",
    "daily_mission_row_sortie",
    "daily_mission_row_shop",
    "daily_mission_receive_all"
  ]) {
    const box = layerBox(layerById[placementId]);
    assert.ok(box.left >= padded.left, `${placementId} must respect left panel padding`);
    assert.ok(box.top >= padded.top, `${placementId} must respect top panel padding`);
    assert.ok(box.right <= padded.right, `${placementId} must respect right panel padding`);
    assert.ok(box.bottom <= padded.bottom, `${placementId} must respect bottom panel padding`);
  }

  const receiveAll = layerBox(layerById.daily_mission_receive_all);
  assert.equal(overlapArea(receiveAll, gachaShell), 0, "daily_mission_receive_all must not overlap gacha_cta_shell");
  assert.equal(overlapArea(receiveAll, gachaOrb), 0, "daily_mission_receive_all must not overlap gacha_cta_orb");
});

test("major sibling surfaces have no unapproved overlaps", async () => {
  const project = getDemoProject();
  const allowed = project.materialSpecSheet.assemblyPolicy.layoutSafetyPolicy.allowedOverlaps
    .map((item) => `${item.source}->${item.target}`);
  assert.deepEqual(allowed, [
    "gift_cta_badge->gift_cta_crate",
    "gacha_cta_orb->gacha_cta_shell"
  ]);

  const demoResponse = await dispatchApi("GET", "/api/demo");
  const generateResponse = await dispatchApi("POST", "/api/generate-all", demoResponse.payload.demo);
  const layerById = Object.fromEntries(generateResponse.payload.renderModel.screen.layers.map((layer) => [layer.placementId, layer]));
  const forbiddenPairs = [
    ["sortie_button_base", "bottom_nav_shell"],
    ["sortie_button_anchor", "bottom_nav_shell"],
    ["daily_mission_receive_all", "gacha_cta_shell"],
    ["daily_mission_receive_all", "gacha_cta_orb"],
    ["gift_cta_shell", "bottom_nav_shell"],
    ["gacha_cta_shell", "bottom_nav_shell"]
  ];

  for (const [leftId, rightId] of forbiddenPairs) {
    assert.equal(
      overlapArea(layerBox(layerById[leftId]), layerBox(layerById[rightId])),
      0,
      `${leftId} must not overlap ${rightId}`
    );
  }
});

test("bottom nav separates the rail from individual tab buttons", () => {
  const project = getDemoProject();
  const assets = Object.fromEntries(project.materialSpecSheet.assets.map((asset) => [asset.assetId, asset]));
  const placements = project.materialSpecSheet.placements;
  const overlays = project.materialSpecSheet.contentOverlays;
  const placementById = Object.fromEntries(placements.map((placement) => [placement.placementId, placement]));
  const overlayById = Object.fromEntries(overlays.map((overlay) => [overlay.overlayId, overlay]));
  const tabKinds = ["home", "fleet", "shop", "mission", "settings"];
  const expectedButtonXs = [16, 266, 516, 766, 1016];
  const localBox = (placement, parent) => ({
    x: placement.x - placement.width / 2 - (parent.x - parent.width / 2),
    y: placement.y - placement.height / 2 - (parent.y - parent.height / 2),
    width: placement.width,
    height: placement.height
  });

  assert.equal(assets.panel_bottom_nav.contentModel.mode, "foundation_only");
  assert.ok(assets.panel_bottom_nav.contentModel.forbiddenBakedElements.includes("tab_button_frames"));
  assert.ok(assets.panel_bottom_nav.contentModel.forbiddenBakedElements.includes("tab_labels"));

  const shell = placementById.bottom_nav_shell;
  assert.deepEqual(
    { width: shell.width, height: shell.height },
    { width: 1260, height: 116 }
  );

  for (const [index, kind] of tabKinds.entries()) {
    const button = placementById[`bottom_nav_${kind}`];
    assert.equal(button.parentId, "bottom_nav_shell");
    assert.deepEqual(
      localBox(button, shell),
      { x: expectedButtonXs[index], y: 10, width: 228, height: 96 },
      `bottom_nav_${kind} must sit on the rail as a separate button`
    );
    assert.deepEqual(
      localBox(placementById[`bottom_nav_${kind}_icon`], button),
      { x: 38, y: 28, width: 40, height: 40 },
      `bottom_nav_${kind}_icon must use the shared icon slot`
    );
    assert.ok(
      overlayById[`ov_nav_${kind}`].slot.y >= 50,
      `ov_nav_${kind} must be a button overlay, not baked into panel_bottom_nav`
    );
  }
});

test("comment regenerate increments revision and returns normalized plan", async () => {
  const payload = getDemoProject();
  const regenerateResponse = await dispatchApi("POST", "/api/comment-regenerate", {
    ...payload,
    assetId: "btn_start_sortie",
    comment: "もっと目立たせつつ、少し豪華に"
  });

  assert.equal(regenerateResponse.statusCode, 200);
  assert.equal(regenerateResponse.payload.ok, true);
  assert.equal(regenerateResponse.payload.input.revisionMap.btn_start_sortie.revisionCount, 1);
  assert.equal(regenerateResponse.payload.normalizedPlan.action, "retouch");
});

test("regeneration request endpoint builds codex-ready markdown from queued assets", async () => {
  const payload = getDemoProject();
  const response = await dispatchApi("POST", "/api/build-regeneration-request", {
    ...payload,
    regenerationQueue: [
      {
        queueId: "regen_card_gift",
        assetId: "card_gift_cta_shell",
        userComment: "ギフト箱と文字レーンの距離を保ちつつ、土台の装飾をKVに寄せたい",
        aiReviewComment: "右側に不要な丸座を作らず、runtimeテキストの余白を確保する"
      }
    ]
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.payload.ok, true);
  assert.equal(response.payload.itemCount, 1);
  assert.equal(response.payload.queue[0].assetId, "card_gift_cta_shell");
  assert.match(response.payload.queue[0].outputPath, /generated-assets\/card_gift_cta_shell\.png/u);
  assert.match(response.payload.markdown, /# Codex imagegen再生成依頼/u);
  assert.match(response.payload.markdown, /card_gift_cta_shell/u);
  assert.match(response.payload.markdown, /248x96/u);
  assert.match(response.payload.markdown, /runtime overlay のテキスト/u);
  assert.match(response.payload.markdown, /notification_badge/u);
  assert.match(response.payload.markdown, /ギフト箱と文字レーン/u);
  assert.match(response.payload.markdown, /不要な丸座/u);
});

test("frontend exposes the image generation flow tracker", () => {
  const html = fs.readFileSync(path.join(__dirname, "..", "public", "index.html"), "utf8");
  const js = fs.readFileSync(path.join(__dirname, "..", "public", "app.js"), "utf8");
  const css = fs.readFileSync(path.join(__dirname, "..", "public", "app.css"), "utf8");

  assert.match(html, /画像生成フロー/u);
  assert.match(html, /id="draftButton"/u);
  assert.match(html, /id="projectScreenSelect"/u);
  assert.match(html, /id="exportReportButton"/u);
  assert.match(html, /id="implementationReportOutput"/u);
  assert.match(html, /id="validateButton"/u);
  assert.match(html, /id="validationOutput"/u);
  assert.match(html, /構成グループ/u);
  assert.match(html, /id="compositionSummary"/u);
  assert.match(html, /id="compositionGroupList"/u);
  assert.match(html, /仮組み確認/u);
  assert.match(html, /id="flowCurrentLabel"/u);
  assert.match(html, /data-flow-step="load"/u);
  assert.match(html, /data-flow-step="draft"/u);
  assert.match(html, /data-flow-step="show"/u);
  assert.match(html, /data-flow-step="review"/u);
  assert.match(html, /data-flow-step="queue"/u);
  assert.match(html, /data-flow-step="prompt"/u);
  assert.match(html, /data-flow-step="dialogue"/u);
  assert.match(html, /data-flow-step="import"/u);
  assert.match(js, /function setFlowStep/u);
  assert.match(js, /function renderGeneratedWorkspace/u);
  assert.match(js, /function renderProjectNavigator/u);
  assert.match(js, /function switchProjectScreen/u);
  assert.match(js, /function buildImplementationReport/u);
  assert.match(js, /function validateWorkspaceSpec/u);
  assert.match(js, /function renderValidationReport/u);
  assert.match(js, /function renderCompositionGroups/u);
  assert.match(js, /function renderCompositionOverlays/u);
  assert.match(js, /function showDraftWorkspace/u);
  assert.match(js, /function getDraftPayloadFromEditors/u);
  assert.match(js, /revisionMap: \{\}/u);
  assert.match(js, /body: JSON.stringify\(getDraftPayloadFromEditors\(\)\)/u);
  assert.match(js, /renderGeneratedWorkspace\(`デモを読み込み、生成後画面を表示しました/u);
  assert.match(js, /setFlowStep\("queue"\)/u);
  assert.match(js, /setFlowStep\("dialogue"\)/u);
  assert.match(css, /\.flow-step\.is-current/u);
  assert.match(css, /\.flow-step\.is-complete/u);
  assert.match(css, /\.screen-select/u);
  assert.match(css, /\.implementation-report-output/u);
  assert.match(css, /\.validation-item/u);
  assert.match(css, /\.composition-group-card/u);
  assert.match(css, /\.composition-content-outline/u);
});

test("ai review returns findings and suggestions", async () => {
  const reviewResponse = await dispatchApi("POST", "/api/ai-review", getDemoProject());
  assert.equal(reviewResponse.statusCode, 200);
  assert.equal(reviewResponse.payload.ok, true);
  assert.ok(reviewResponse.payload.review.topFindings.length > 0);
  assert.ok(reviewResponse.payload.review.suggestedActions.length > 0);
  assert.ok(reviewResponse.payload.review.guardrails.some((item) => /販売素材レベル/u.test(item)));
});

test("ai review does not over-score svg-only generated screens", async () => {
  const svgOnlyProject = getDemoProject();
  svgOnlyProject.worldPreset.imagegenAssets = {};
  svgOnlyProject.worldPreset.imagegenWorkflow = { disabled: true };
  const generateResponse = await dispatchApi("POST", "/api/generate-all", svgOnlyProject);
  const reviewResponse = await dispatchApi("POST", "/api/ai-review", generateResponse.payload.input);

  assert.equal(reviewResponse.statusCode, 200);
  assert.equal(reviewResponse.payload.ok, true);
  assert.ok(reviewResponse.payload.review.screenScore <= 58);
  assert.match(reviewResponse.payload.review.summary, /SVGモック段階/u);
  assert.equal(generateResponse.payload.input.revisionMap.bg_sky_port_home.generationMeta.usesImagegen, false);
  assert.equal(generateResponse.payload.input.revisionMap.bg_sky_port_home.generationMeta.actualBackend, "svg_template");
});

test("imagegen registry assets are adopted as generated previews", async () => {
  const project = getDemoProject();
  const imagePath = path.join(__dirname, "..", "examples", "sky-port-home", "key-visual.png");
  project.worldPreset.imagegenAssets = {
    bg_sky_port_home: {
      path: imagePath,
      backend: "built_in_imagegen",
      usesImagegen: true,
      prompt: "test prompt"
    }
  };

  const generateResponse = await dispatchApi("POST", "/api/generate-all", project);
  const backgroundRevision = generateResponse.payload.input.revisionMap.bg_sky_port_home;
  const generatedBackground = generateResponse.payload.renderModel.screen.layers.find((layer) => layer.assetId === "bg_sky_port_home");

  assert.equal(generateResponse.statusCode, 200);
  assert.equal(backgroundRevision.generationMeta.usesImagegen, true);
  assert.equal(backgroundRevision.generationMeta.actualBackend, "built_in_imagegen");
  assert.equal(backgroundRevision.generationMeta.imagePath, imagePath);
  assert.match(generatedBackground.src, /^\/api\/source-file\?path=/u);
  assert.match(decodeURIComponent(generatedBackground.src), /key-visual\.png/u);
});

test("imagegen job endpoint creates codex-ready asset prompts", async () => {
  const project = getDemoProject();
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "gcgt-imagegen-job-"));
  project.worldPreset.imagegenWorkflow = {
    jobDir: path.join(tempDir, "jobs"),
    outputDir: path.join(tempDir, "generated"),
    targetAssetIds: ["bg_sky_port_home", "card_gift_cta_shell", "btn_start_sortie"]
  };
  project.worldPreset.imagegenAssets = {};

  try {
    const response = await dispatchApi("POST", "/api/imagegen-job", project);
    const report = response.payload.imagegenReport;
    const backgroundJob = report.job.assets.find((asset) => asset.assetId === "bg_sky_port_home");
    const giftShellJob = report.job.assets.find((asset) => asset.assetId === "card_gift_cta_shell");
    const sortieButtonJob = report.job.assets.find((asset) => asset.assetId === "btn_start_sortie");

    assert.equal(response.statusCode, 200);
    assert.equal(response.payload.ok, true);
    assert.equal(report.job.assets.length, 3);
    assert.ok(fs.existsSync(report.job.jobPath));
    assert.ok(fs.existsSync(report.job.promptPath));
    assert.ok(backgroundJob);
    assert.ok(giftShellJob);
    assert.ok(sortieButtonJob);
    assert.match(backgroundJob.prompt, /Use case: stylized-concept/u);
    assert.match(backgroundJob.prompt, /Quality target: commercial-grade Japanese mobile game UI asset/u);
    assert.match(backgroundJob.prompt, /Reference policy: Use licensed or purchased assets only to derive quality criteria/u);
    assert.match(backgroundJob.prompt, /Production-readiness checks:/u);
    assert.equal(backgroundJob.qualityPlan, null);
    assert.equal(giftShellJob.qualityPlan.foundationAsset, true);
    assert.ok(giftShellJob.qualityPlan.protectedSlots.some((slot) => slot.overlayId === "ov_gift_title"));
    assert.ok(giftShellJob.qualityPlan.contentRegions.some((region) => region.placementId === "gift_cta_shell"));
    assert.ok(giftShellJob.compositionContexts.some((context) => context.groupId === "gift_side_cta"));
    assert.ok(sortieButtonJob.compositionContexts.some((context) => context.groupId === "primary_sortie_cta"));
    assert.match(giftShellJob.prompt, /UI anatomy: foundation\/shell asset/u);
    assert.match(giftShellJob.prompt, /Decoration\/content separation:/u);
    assert.match(giftShellJob.prompt, /Content model: frame_only; reserved empty slots: title, subtitle, gift_icon, notification_badge/u);
    assert.match(giftShellJob.prompt, /Draw only the holder, frame, dock, socket, or base surface; do not bake the slot contents/u);
    assert.match(giftShellJob.prompt, /Protected runtime slots: ov_gift_title on gift_cta_shell slot 90,18,118x30/u);
    assert.match(giftShellJob.prompt, /Inferred inner content surface: gift_cta_shell content surface 90,18,120x60/u);
    assert.match(giftShellJob.prompt, /Composition group context: gift_side_cta/u);
    assert.match(giftShellJob.prompt, /Composition layer stack: gift_cta_shell\/card_gift_cta_shell/u);
    assert.match(giftShellJob.prompt, /Composition protected overlays: ov_gift_title on gift_cta_shell/u);
    assert.match(giftShellJob.prompt, /Do not bake the gift crate, notification number, title text, or subtitle text into the shell/u);
    assert.match(giftShellJob.prompt, /Do not bake child elements: gacha_orb_socket, notification_count, title_text, subtitle_text/u);
    assert.match(sortieButtonJob.prompt, /Preserve a clear center lane for runtime labels/u);
    assert.match(sortieButtonJob.prompt, /Protected runtime slots: ov_sortie_cta on sortie_button_base slot 86,34,220x46/u);
    assert.match(sortieButtonJob.prompt, /Inferred inner content surface: sortie_button_base content surface 86,34,220x81/u);
    assert.match(sortieButtonJob.prompt, /Composition group context: primary_sortie_cta/u);
    assert.match(sortieButtonJob.prompt, /No emblem, highlight streak, or ornament crosses behind the main label slot/u);
    assert.match(sortieButtonJob.prompt, /copied purchased asset pack style/u);
    assert.match(report.job.commandHint, /codex .* exec/u);
    assert.deepEqual(report.adoptedAssetIds, []);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test("mock imagegen runner can create files that generate-all adopts", async () => {
  const previousMode = process.env.BETA_IMAGEGEN_MODE;
  process.env.BETA_IMAGEGEN_MODE = "mock";
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "gcgt-imagegen-run-"));
  const project = getDemoProject();
  project.worldPreset.imagegenWorkflow = {
    jobDir: path.join(tempDir, "jobs"),
    outputDir: path.join(tempDir, "generated"),
    targetAssetIds: ["bg_sky_port_home", "art_event_banner_fill"]
  };
  project.worldPreset.imagegenAssets = {};

  try {
    const runResponse = await dispatchApi("POST", "/api/run-imagegen-job", project);
    assert.equal(runResponse.statusCode, 200);
    assert.equal(runResponse.payload.imagegenReport.runner.ran, true);
    assert.equal(runResponse.payload.imagegenReport.runner.ok, true);
    assert.deepEqual(
      runResponse.payload.imagegenReport.adoptedAssetIds.sort(),
      ["art_event_banner_fill", "bg_sky_port_home"].sort()
    );

    const generatedResponse = await dispatchApi("POST", "/api/generate-all", runResponse.payload.input);
    const bannerLayer = generatedResponse.payload.renderModel.screen.layers.find((layer) => layer.assetId === "art_event_banner_fill");
    const bannerMeta = generatedResponse.payload.input.revisionMap.art_event_banner_fill.generationMeta;

    assert.equal(bannerMeta.usesImagegen, true);
    assert.equal(bannerMeta.actualBackend, "codex_cli_imagegen");
    assert.match(decodeURIComponent(bannerLayer.src), /art_event_banner_fill\.png/u);
  } finally {
    if (previousMode === undefined) {
      delete process.env.BETA_IMAGEGEN_MODE;
    } else {
      process.env.BETA_IMAGEGEN_MODE = previousMode;
    }
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test("manual image import adopts a local imagegen PNG for one asset", async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "gcgt-import-image-"));
  const imagePath = path.join(tempDir, "btn_start_sortie.png");
  fs.writeFileSync(imagePath, Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+P+/HgAEtAJJXIDTjwAAAABJRU5ErkJggg==",
    "base64"
  ));

  try {
    const importResponse = await dispatchApi("POST", "/api/import-asset-image", {
      ...getDemoProject(),
      assetId: "btn_start_sortie",
      imagePath
    });
    assert.equal(importResponse.statusCode, 200);
    assert.equal(importResponse.payload.ok, true);
    assert.equal(
      importResponse.payload.input.worldPreset.imagegenAssets.btn_start_sortie.path,
      imagePath
    );
    assert.equal(
      importResponse.payload.input.revisionMap.btn_start_sortie.generationMeta.actualBackend,
      "manual_imagegen_import"
    );
    assert.match(
      decodeURIComponent(importResponse.payload.renderModel.screen.layers.find((layer) => layer.assetId === "btn_start_sortie").src),
      /btn_start_sortie\.png/u
    );

    const generateResponse = await dispatchApi("POST", "/api/generate-all", importResponse.payload.input);
    const buttonMeta = generateResponse.payload.input.revisionMap.btn_start_sortie.generationMeta;
    assert.equal(buttonMeta.usesImagegen, true);
    assert.equal(buttonMeta.actualBackend, "manual_imagegen_import");
    assert.equal(buttonMeta.imagePath, imagePath);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test("ai suggestion for progress track produces a visible retouch", async () => {
  const project = getDemoProject();
  const baselineRender = generateRenderModel(prepareInput(project));
  const baselineAsset = baselineRender.assets.find((asset) => asset.assetId === "bar_profile_exp_base");
  const reviewResponse = await dispatchApi("POST", "/api/ai-review", project);
  const suggestion = reviewResponse.payload.review.suggestedActions.find((item) => item.assetId === "bar_profile_exp_base");

  assert.ok(suggestion);
  assert.match(suggestion.suggestedComment, /明る|可読|存在感/u);

  const regenerateResponse = await dispatchApi("POST", "/api/comment-regenerate", {
    ...project,
    assetId: "bar_profile_exp_base",
    comment: suggestion.suggestedComment
  });

  const revision = regenerateResponse.payload.input.revisionMap.bar_profile_exp_base;
  const updatedAsset = regenerateResponse.payload.renderModel.assets.find((asset) => asset.assetId === "bar_profile_exp_base");

  assert.equal(regenerateResponse.statusCode, 200);
  assert.equal(revision.revisionCount, 1);
  assert.ok(
    revision.directives.brightnessDelta
    || revision.directives.contrastDelta
    || revision.directives.emphasisDelta
    || revision.directives.readabilityBoost
  );
  assert.notEqual(updatedAsset.previewSrc, baselineAsset.previewSrc);
});

test("load-from-folder reads split json files and image references", async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "gcgt-beta-"));
  const bundle = getDemoProject();
  bundle.worldPreset.imagegenWorkflow = {};
  fs.writeFileSync(path.join(tempDir, "screen-kv.json"), JSON.stringify(bundle.screenKv, null, 2));
  fs.writeFileSync(path.join(tempDir, "material-spec.json"), JSON.stringify(bundle.materialSpecSheet, null, 2));
  fs.writeFileSync(path.join(tempDir, "world-preset.json"), JSON.stringify(bundle.worldPreset, null, 2));
  fs.writeFileSync(path.join(tempDir, "ref-ui.png"), "fake image");
  fs.mkdirSync(path.join(tempDir, "generated-assets"));
  fs.writeFileSync(path.join(tempDir, "generated-assets", "bg.png"), "fake generated image");
  fs.writeFileSync(path.join(tempDir, "imagegen-assets.json"), JSON.stringify({
    assets: [
      {
        assetId: "bg_sky_port_home",
        path: "generated-assets/bg.png",
        backend: "built_in_imagegen",
        prompt: "folder prompt"
      }
    ]
  }, null, 2));

  try {
    const response = await dispatchApi("POST", "/api/load-from-folder", {
      folderPath: tempDir
    });
    assert.equal(response.statusCode, 200);
    assert.equal(response.payload.ok, true);
    assert.equal(response.payload.bundle.screenKv.screenId, "home_sky_port_atlas");
    assert.ok(response.payload.source.imageFiles.length >= 2);
    assert.ok(response.payload.bundle.worldPreset.referenceImages.some((item) => item.path.endsWith("ref-ui.png")));
    assert.equal(
      response.payload.bundle.worldPreset.imagegenAssets.bg_sky_port_home.path,
      path.join(tempDir, "generated-assets", "bg.png")
    );
    assert.equal(
      response.payload.bundle.worldPreset.imagegenWorkflow.outputDir,
      path.join(tempDir, "generated-assets")
    );
    assert.equal(
      response.payload.bundle.worldPreset.imagegenWorkflow.jobDir,
      path.join(tempDir, ".game-creative-generation", "imagegen-jobs")
    );
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test("load-from-folder resolves multi-screen project manifests", async () => {
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "gcgt-project-"));
  const homeDir = path.join(projectRoot, "creative", "screens", "home");
  const shopDir = path.join(projectRoot, "creative", "screens", "shop");
  const writeScreen = (screenDir, screenId, screenName) => {
    const project = getDemoProject();
    project.screenKv.screenId = screenId;
    project.screenKv.screenName = screenName;
    project.worldPreset.imagegenAssets = {};
    project.worldPreset.imagegenWorkflow = {};
    fs.mkdirSync(path.join(screenDir, "generated-assets"), { recursive: true });
    fs.writeFileSync(path.join(screenDir, "screen-kv.json"), JSON.stringify(project.screenKv, null, 2));
    fs.writeFileSync(path.join(screenDir, "material-spec.json"), JSON.stringify(project.materialSpecSheet, null, 2));
    fs.writeFileSync(path.join(screenDir, "world-preset.json"), JSON.stringify(project.worldPreset, null, 2));
  };

  writeScreen(homeDir, "home_screen", "HOME");
  writeScreen(shopDir, "shop_screen", "SHOP");
  fs.writeFileSync(path.join(homeDir, "generated-assets", "bg_sky_port_home.png"), "fake imagegen output");
  fs.writeFileSync(path.join(projectRoot, "creative", "game-creative-project.json"), JSON.stringify({
    projectId: "sample_game",
    projectName: "Sample Game",
    defaultScreenId: "shop",
    screens: [
      {
        screenId: "home",
        name: "HOME",
        path: "screens/home"
      },
      {
        screenId: "shop",
        name: "SHOP",
        path: "screens/shop"
      }
    ]
  }, null, 2));

  try {
    const defaultResponse = await dispatchApi("POST", "/api/load-from-folder", {
      folderPath: path.join(projectRoot, "creative")
    });
    assert.equal(defaultResponse.statusCode, 200);
    assert.equal(defaultResponse.payload.ok, true);
    assert.equal(defaultResponse.payload.bundle.screenKv.screenId, "shop_screen");
    assert.equal(defaultResponse.payload.source.projectRoot, path.join(projectRoot, "creative"));
    assert.equal(defaultResponse.payload.source.screenId, "shop");
    assert.equal(defaultResponse.payload.source.screenFolderPath, shopDir);
    assert.equal(defaultResponse.payload.source.defaultScreenId, "shop");
    assert.deepEqual(
      defaultResponse.payload.source.projectScreens.map((screen) => `${screen.screenId}:${screen.name}`),
      ["home:HOME", "shop:SHOP"]
    );
    assert.equal(defaultResponse.payload.source.projectScreens[0].screenFolderPath, homeDir);
    assert.equal(
      defaultResponse.payload.bundle.worldPreset.imagegenWorkflow.outputDir,
      path.join(shopDir, "generated-assets")
    );
    assert.equal(
      defaultResponse.payload.bundle.worldPreset.imagegenWorkflow.jobDir,
      path.join(projectRoot, "creative", ".game-creative-generation", "imagegen-jobs")
    );

    const homeResponse = await dispatchApi("POST", "/api/load-from-folder", {
      folderPath: path.join(projectRoot, "creative"),
      screenId: "home"
    });
    assert.equal(homeResponse.statusCode, 200);
    assert.equal(homeResponse.payload.ok, true);
    assert.equal(homeResponse.payload.bundle.screenKv.screenId, "home_screen");
    assert.equal(homeResponse.payload.source.screenId, "home");
    assert.equal(
      homeResponse.payload.bundle.worldPreset.imagegenAssets.bg_sky_port_home.path,
      path.join(homeDir, "generated-assets", "bg_sky_port_home.png")
    );
  } finally {
    fs.rmSync(projectRoot, { recursive: true, force: true });
  }
});
