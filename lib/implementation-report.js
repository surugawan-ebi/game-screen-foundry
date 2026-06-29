"use strict";

const { generateRenderModel } = require("./generator");

function list(value) {
  return Array.isArray(value) ? value : [];
}

function getGenerationSummary(asset) {
  const meta = asset.generationMeta || {};
  return {
    backend: meta.actualBackend || meta.backendClass || "",
    backendLabel: meta.backendClassLabel || "",
    usesImagegen: meta.usesImagegen === true,
    imagePath: meta.imagePath || meta.sourceAssetPath || "",
    prompt: meta.sourcePrompt || ""
  };
}

function formatSlot(slot) {
  if (!slot) {
    return "";
  }
  return Object.entries(slot)
    .map(([key, value]) => `${key}=${value}`)
    .join(", ");
}

function buildMarkdown(report) {
  const lines = [
    `# ${report.screen.screenName} Implementation Handoff`,
    "",
    "## Screen",
    "",
    `- screenId: ${report.screen.screenId}`,
    `- size: ${report.screen.width}x${report.screen.height}`,
    `- layerCount: ${report.layers.length}`,
    `- assetCount: ${report.assets.length}`,
    `- compositionQuality: ${report.compositionQuality.status} / score ${report.compositionQuality.score}`,
    "",
    "## Layer Order",
    "",
    "| z | placementId | assetId | role | x | y | w | h | target/slot |",
    "| ---: | --- | --- | --- | ---: | ---: | ---: | ---: | --- |"
  ];

  for (const layer of report.layers) {
    const target = layer.targetPlacementId
      ? `${layer.targetPlacementId}${layer.slot ? ` (${formatSlot(layer.slot)})` : ""}`
      : "";
    lines.push(`| ${layer.zIndex} | ${layer.placementId} | ${layer.assetId} | ${layer.role} | ${layer.left} | ${layer.top} | ${layer.width} | ${layer.height} | ${target} |`);
  }

  lines.push(
    "",
    "## Runtime Overlays",
    "",
    "| overlayId | kind | targetPlacementId | x | y | w | h | sample |",
    "| --- | --- | --- | ---: | ---: | ---: | ---: | --- |"
  );

  for (const overlay of report.runtimeOverlays) {
    lines.push(`| ${overlay.overlayId} | ${overlay.kind} | ${overlay.targetPlacementId} | ${overlay.left} | ${overlay.top} | ${overlay.width} | ${overlay.height} | ${overlay.sampleText.replace(/\n/g, "<br>")} |`);
  }

  lines.push(
    "",
    "## Assets",
    "",
    "| assetId | type/role | placements | generated source |",
    "| --- | --- | --- | --- |"
  );

  for (const asset of report.assets) {
    const source = asset.generation.imagePath || asset.generation.backend || "not generated";
    lines.push(`| ${asset.assetId} | ${asset.assetType} / ${asset.role} | ${asset.placementRefs.join(", ")} | ${source} |`);
  }

  lines.push(
    "",
    "## Composition Groups",
    "",
    "| groupId | kind | status | score | root | layers | overlays |",
    "| --- | --- | --- | ---: | --- | ---: | ---: |"
  );

  for (const group of report.compositionGroups) {
    lines.push(`| ${group.groupId} | ${group.kind} | ${group.status} | ${group.score} | ${group.rootPlacementId} | ${group.layerPlacementIds.length} | ${group.protectedOverlayIds.length} |`);
  }

  lines.push(
    "",
    "## Engineer Notes",
    "",
    "- Treat generated PNGs as reusable implementation parts, not a flattened screenshot.",
    "- Runtime text and numbers should come from the overlay table.",
    "- Preserve layer order by ascending zIndex.",
    "- Review composition groups before merging layout changes."
  );

  return `${lines.join("\n")}\n`;
}

function buildImplementationReport(input) {
  const renderModel = generateRenderModel(input);
  const overlayById = new Map(list(input.materialSpecSheet.contentOverlays)
    .map((overlay) => [overlay.overlayId, overlay]));
  const runtimeOverlays = renderModel.screen.layers
    .filter((layer) => overlayById.has(layer.placementId))
    .map((layer) => {
      const overlay = overlayById.get(layer.placementId);
      return {
        overlayId: overlay.overlayId,
        kind: overlay.kind,
        sampleText: overlay.sampleText || overlay.text || "",
        targetPlacementId: layer.targetPlacementId || overlay.targetPlacementId || "",
        slot: layer.slot || overlay.slot || null,
        left: layer.left,
        top: layer.top,
        width: layer.width,
        height: layer.height,
        zIndex: layer.zIndex
      };
    });

  const report = {
    screen: {
      screenId: renderModel.screen.screenId,
      screenName: renderModel.screen.screenName,
      width: renderModel.screen.width,
      height: renderModel.screen.height,
      safeAreas: renderModel.screen.safeAreas
    },
    compositionQuality: renderModel.compositionQuality,
    layers: renderModel.screen.layers.map((layer) => ({
      placementId: layer.placementId,
      assetId: layer.assetId,
      role: layer.role,
      left: layer.left,
      top: layer.top,
      width: layer.width,
      height: layer.height,
      zIndex: layer.zIndex,
      targetPlacementId: layer.targetPlacementId || "",
      slot: layer.slot || null
    })),
    runtimeOverlays,
    assets: renderModel.assets.map((asset) => ({
      assetId: asset.assetId,
      assetType: asset.assetType,
      role: asset.role,
      purpose: asset.purpose,
      placementRefs: asset.placementRefs,
      locked: asset.locked,
      generation: getGenerationSummary(asset)
    })),
    compositionGroups: renderModel.compositionGroups.map((group) => ({
      groupId: group.groupId,
      kind: group.kind,
      status: group.status,
      score: group.score,
      rootPlacementId: group.rootPlacementId,
      outputAssetId: group.outputAssetId,
      layerPlacementIds: group.layerPlacementIds,
      childContentPlacementIds: group.childContentPlacementIds,
      protectedOverlayIds: group.protectedOverlayIds,
      contentBox: group.contentBox,
      issueCounts: group.issueCounts
    }))
  };

  return {
    report,
    markdown: buildMarkdown(report)
  };
}

module.exports = {
  buildImplementationReport
};
