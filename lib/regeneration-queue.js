"use strict";

const path = require("path");

const { clone } = require("./spec");
const { buildAssetGenerationContract } = require("./imagegen-workflow");

function normalizeQueueItems(items) {
  if (!Array.isArray(items)) {
    return [];
  }

  return items
    .map((item, index) => ({
      queueId: String(item.queueId || `regen_${index + 1}`).trim(),
      assetId: String(item.assetId || "").trim(),
      userComment: String(item.userComment || "").trim(),
      aiReviewComment: String(item.aiReviewComment || "").trim(),
      source: String(item.source || "asset_card").trim(),
      status: String(item.status || "queued").trim(),
      createdAt: String(item.createdAt || "").trim(),
      updatedAt: String(item.updatedAt || "").trim()
    }))
    .filter((item) => item.assetId && (item.userComment || item.aiReviewComment));
}

function formatList(values, fallback = "なし") {
  const items = Array.isArray(values) ? values.filter(Boolean) : [];
  return items.length ? items.join(" / ") : fallback;
}

function formatJson(value) {
  if (value === undefined || value === null) {
    return "未設定";
  }
  return JSON.stringify(value, null, 2);
}

function listStyleValues(value) {
  return Array.isArray(value) ? value.filter(Boolean).map(String) : [];
}

function buildPresetStyleSummary(preset = {}) {
  const parts = [
    preset.styleMedium,
    preset.visualStyle,
    preset.artDirection,
    preset.genre ? `genre: ${preset.genre}` : "",
    preset.shapeLanguage ? `shape language: ${preset.shapeLanguage}` : "",
    preset.lineTreatment ? `line treatment: ${preset.lineTreatment}` : "",
    preset.lightingStyle ? `lighting: ${preset.lightingStyle}` : "",
    preset.detailDensity ? `detail density: ${preset.detailDensity}` : "",
    preset.uiTone ? `UI tone: ${preset.uiTone}` : ""
  ];
  const moodKeywords = listStyleValues(preset.moodKeywords).slice(0, 6);
  const materialKeywords = listStyleValues(preset.materialKeywords).slice(0, 6);
  if (moodKeywords.length) {
    parts.push(`mood keywords: ${moodKeywords.join(", ")}`);
  }
  if (materialKeywords.length) {
    parts.push(`material keywords: ${materialKeywords.join(", ")}`);
  }
  return [...new Set(parts.map((part) => String(part || "").trim()).filter(Boolean))].join("; ");
}

function getOutputPath(input, assetId) {
  const workflow = input.worldPreset.imagegenWorkflow || {};
  if (workflow.outputDir) {
    return path.join(workflow.outputDir, `${assetId}.png`);
  }
  return `generated-assets/${assetId}.png`;
}

function findRelatedPlacements(input, assetId) {
  const placements = input.materialSpecSheet.placements || [];
  const roots = placements.filter((placement) => placement.assetId === assetId);
  const rootIds = new Set(roots.map((placement) => placement.placementId));
  const children = placements.filter((placement) => rootIds.has(placement.parentId));
  return {
    roots,
    children
  };
}

function findRelatedOverlays(input, placements) {
  const overlays = input.materialSpecSheet.contentOverlays || [];
  const placementIds = new Set([
    ...placements.roots.map((placement) => placement.placementId),
    ...placements.children.map((placement) => placement.placementId)
  ]);
  return overlays.filter((overlay) => placementIds.has(overlay.targetPlacementId));
}

function summarizePlacement(placement) {
  return `${placement.placementId}: ${placement.width}x${placement.height} at (${placement.x}, ${placement.y}) z${placement.zIndex}`;
}

function summarizeOverlay(overlay) {
  const slot = overlay.slot
    ? ` slot ${overlay.slot.x},${overlay.slot.y},${overlay.slot.width}x${overlay.slot.height}`
    : "";
  return `${overlay.overlayId}: "${overlay.sampleText || overlay.text || ""}" ${overlay.width}x${overlay.height}${slot}`;
}

function buildQueueEntry(input, item) {
  const asset = input.materialSpecSheet.assets.find((candidate) => candidate.assetId === item.assetId);
  if (!asset) {
    throw new Error(`Unknown queued assetId: ${item.assetId}`);
  }

  const revision = (input.revisionMap || {})[item.assetId] || {};
  const placements = findRelatedPlacements(input, item.assetId);
  const overlays = findRelatedOverlays(input, placements);
  const registry = input.worldPreset.imagegenAssets || {};
  const registryItem = Array.isArray(registry)
    ? registry.find((entry) => entry && entry.assetId === item.assetId)
    : registry[item.assetId];

  return {
    ...item,
    asset: clone(asset),
    revision: clone(revision),
    placements: clone(placements.roots),
    childPlacements: clone(placements.children),
    textOverlays: clone(overlays),
    currentImagePath: revision.generationMeta && revision.generationMeta.imagePath
      ? revision.generationMeta.imagePath
      : (registryItem && registryItem.path ? registryItem.path : ""),
    outputPath: getOutputPath(input, item.assetId)
  };
}

function buildRegenerationRequest(input, rawQueueItems) {
  const queue = normalizeQueueItems(rawQueueItems)
    .map((item) => buildQueueEntry(input, item))
    .map((entry) => ({
      ...entry,
      generationContract: buildAssetGenerationContract(input, entry.assetId, {
        operation: entry.currentImagePath ? "edit" : "generate",
        currentImagePath: entry.currentImagePath,
        outputPath: entry.outputPath,
        source: "regeneration_queue",
        change: [entry.userComment, entry.aiReviewComment].filter(Boolean)
      })
    }));
  if (!queue.length) {
    throw new Error("regenerationQueue is empty");
  }

  const screen = input.screenKv || {};
  const preset = input.worldPreset || {};
  const workflow = preset.imagegenWorkflow || {};
  const referenceImages = Array.isArray(preset.referenceImages)
    ? preset.referenceImages.map((item) => item.path || item).filter(Boolean)
    : [];
  const styleDirection = buildPresetStyleSummary(preset);

  const lines = [
    "# Codex imagegen再生成依頼",
    "",
    "## 目的",
    "- ブラウザ側でキュー化された素材だけを再生成する。",
    "- 生成後はPNGを指定パスに保存し、ブラウザで「生成済みPNGを再取り込み」または「生成後を表示」で確認する。",
    "- 画面全体のレイアウトは変更せず、素材単体の品質と仕様適合だけを直す。",
    "",
    "## 画面コンテキスト",
    `- screenId: ${screen.screenId || "unknown"}`,
    `- screenName: ${screen.screenName || "unknown"}`,
    `- canvas: ${screen.canvasWidth || screen.width || "?"}x${screen.canvasHeight || screen.height || "?"}`,
    `- worldPreset: ${screen.worldPresetId || preset.presetId || "unknown"}`,
    `- uiDensity: ${screen.uiDensity || "未設定"}`,
    `- styleDirection: ${styleDirection || "未設定"}`,
    `- referenceImages: ${formatList(referenceImages)}`,
    `- outputDir: ${workflow.outputDir || "未設定"}`,
    "",
    "## 共通ルール",
    "- 各素材は指定サイズどおりのPNGで書き出す。",
    "- transparent=true の素材は透過背景を維持する。",
    "- runtime overlay のテキスト、数値、ラベルは素材に焼き込まない。",
    "- baked_in_asset と明示された文字だけ素材内に作り込む。",
    "- 9-slice、テキストレーン、子要素スロット、禁止焼き込み要素を守る。",
    "- 画面上の座標やレイヤー順は変更しない。必要なら素材内部の余白と見た目だけを調整する。",
    "- 上記のstyleDirectionと、現在読み込まれているKV・参照画像の方向性だけを維持する。",
    "",
    "## 再生成キュー"
  ];

  queue.forEach((entry, index) => {
    const asset = entry.asset;
    const exportRequirements = asset.exportRequirements || {};
    const textHandling = asset.textHandling || {};
    const contentModel = asset.contentModel || {};
    const generationPlan = asset.generationPlan || {};
    const contract = entry.generationContract;
    const dimensions = Array.isArray(exportRequirements.sizes) && exportRequirements.sizes.length
      ? exportRequirements.sizes.join(", ")
      : formatList(entry.placements.map((placement) => `${placement.width}x${placement.height}`));

    lines.push(
      "",
      `### ${index + 1}. ${entry.assetId}`,
      `- queueId: ${entry.queueId}`,
      `- assetType / role: ${asset.assetType || "unknown"} / ${asset.role || "unknown"}`,
      `- purpose: ${asset.purpose || "未設定"}`,
      `- outputPath: ${entry.outputPath}`,
      `- requiredSize: ${dimensions}`,
      `- transparent: ${exportRequirements.transparent === false ? "false" : "true"}`,
      `- currentImagePath: ${entry.currentImagePath || "未生成または未採用"}`,
      `- generationBackend: ${generationPlan.backendClassLabel || generationPlan.backendClass || "未設定"}`,
      `- operation: ${contract.operation}`,
      `- inputImages: ${formatList(contract.inputImages.map((item) => `${item.role}: ${item.path}`))}`,
      `- placements: ${formatList(entry.placements.map(summarizePlacement))}`,
      `- childPlacements: ${formatList(entry.childPlacements.map(summarizePlacement))}`,
      `- relatedTextOverlays: ${formatList(entry.textOverlays.map(summarizeOverlay))}`,
      `- textOwnership: ${textHandling.ownership || "未設定"}`,
      `- runtimeTextSlots: ${formatList(textHandling.runtimeTextSlots)}`,
      `- bakedTextBlocks: ${formatJson(textHandling.bakedTextBlocks || [])}`,
      `- contentModel: ${formatJson(contentModel)}`,
      `- styleNotes: ${formatList(asset.styleNotes)}`,
      `- functionNotes: ${formatList(asset.functionNotes)}`,
      `- userComment: ${entry.userComment || "なし"}`,
      `- aiReviewComment: ${entry.aiReviewComment || "なし"}`,
      "",
      "#### この素材で守ること",
      "- サイズ、透過、親子スロット、runtime text lane を変えない。",
      "- コメントで指摘された部分以外は、現行素材の役割と画面内の読みやすさを維持する。",
      "- 出力ファイル名は assetId と完全一致させる。",
      `- preserve: ${contract.preserve.join(" / ")}`,
      `- acceptanceChecks: ${contract.acceptanceChecks.join(" / ")}`,
      "",
      "#### 共通imagegenプロンプト",
      "```text",
      contract.prompt,
      "```"
    );
  });

  return {
    queue,
    markdown: lines.join("\n")
  };
}

module.exports = {
  buildPresetStyleSummary,
  buildRegenerationRequest,
  normalizeQueueItems
};
