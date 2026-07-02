"use strict";

const fs = require("fs");
const path = require("path");

const { generateRenderModel } = require("./generator");
const { analyzePngFile } = require("./png-metrics");

const PROFILE_SCHEMA = "game-screen-foundry.reference-quality-profile.v1";
const COMPACT_PROFILE_SCHEMA = "game-screen-foundry.reference-quality-profile.compact.v1";
const AUDIT_SCHEMA = "game-screen-foundry.reference-asset-audit.v1";
const UI_CATEGORIES = [
  "ui-button",
  "ui-icon",
  "ui-panel",
  "ui-item",
  "ui-book",
  "ui-map",
  "ui-paper",
  "ui-screen",
  "ui-theme"
];
const FOUNDATION_ASSET_TYPES = new Set(["panel", "card_frame", "button"]);
const IMAGE_EXTENSIONS = new Set([".png"]);
const PROFILE_METRICS = [
  "width",
  "height",
  "aspectRatio",
  "alphaCoverage",
  "transparentPixelRatio",
  "transparentMarginMinRatio",
  "transparentMarginHorizontalRatio",
  "transparentMarginVerticalRatio",
  "edgeAlphaCoverage",
  "edgeAlphaDirtyRatio",
  "centerAlphaCoverage",
  "perimeterAlphaCoverage",
  "centerGradientDensity",
  "perimeterGradientDensity",
  "perimeterToCenterDetailRatio",
  "centerToPerimeterDetailRatio",
  "quantizedColorCount",
  "outlineCoverage",
  "outlineContrast",
  "luminanceBandCount"
];

function walkFiles(dirPath, bucket = []) {
  for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
    if (entry.name === ".git" || entry.name === "node_modules") {
      continue;
    }
    const nextPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      walkFiles(nextPath, bucket);
    } else if (entry.isFile()) {
      bucket.push(nextPath);
    }
  }
  return bucket;
}

function listImageFiles(dirPath) {
  return walkFiles(dirPath)
    .filter((filePath) => IMAGE_EXTENSIONS.has(path.extname(filePath).toLowerCase()))
    .sort((left, right) => left.localeCompare(right));
}

function parseBacktickField(text, key) {
  const match = text.match(new RegExp(`^- ${key}:\\s*\`([^\\n\`]+)\``, "mu"));
  return match ? match[1].trim() : "";
}

function parseListField(text, key) {
  const startMatch = text.match(new RegExp(`^- ${key}:\\s*$`, "mu"));
  if (!startMatch) {
    const inline = parseBacktickField(text, key);
    return inline ? [inline] : [];
  }
  const lines = text.slice(startMatch.index + startMatch[0].length).split(/\r?\n/u);
  const values = [];
  for (const line of lines) {
    if (/^- [a-z_]+:/u.test(line)) {
      break;
    }
    const item = line.match(/^\s+-\s+`?([^`\n]+)`?\s*$/u);
    if (item) {
      values.push(item[1].trim());
    }
  }
  return values;
}

function parseAssetMetadata(assetMdPath) {
  const text = fs.readFileSync(assetMdPath, "utf8");
  return {
    assetMdPath,
    assetDir: path.dirname(assetMdPath),
    id: parseBacktickField(text, "id"),
    name: parseBacktickField(text, "name"),
    status: parseBacktickField(text, "status"),
    category: parseBacktickField(text, "category"),
    format: parseBacktickField(text, "format"),
    tags: parseListField(text, "tags"),
    contents: parseListField(text, "contents")
  };
}

function inferCategoryFromName(filePath) {
  const name = path.basename(filePath).toLowerCase();
  if (/(?:^|[_-])(btn|button)(?:[_-]|$)/u.test(name)) {
    return "ui-button";
  }
  if (/(?:^|[_-])(icon|emblem|badge|crest)(?:[_-]|$)/u.test(name)) {
    return "ui-icon";
  }
  if (/(?:^|[_-])(panel|frame|card|window|popup|bar|strip|ribbon|chip|tab|capsule|tile|holder|gage|gauge)(?:[_-]|$)/u.test(name)) {
    return "ui-panel";
  }
  if (/(?:^|[_-])(book|paper|map)(?:[_-]|$)/u.test(name)) {
    return name.includes("book") ? "ui-book" : name.includes("map") ? "ui-map" : "ui-paper";
  }
  if (/(?:^|[_-])(bg|background|screen)(?:[_-]|$)/u.test(name)) {
    return "ui-screen";
  }
  return "ui-item";
}

function profileKindForCategory(category) {
  if (category === "ui-button") {
    return "button";
  }
  if (category === "ui-icon" || category === "ui-item") {
    return "foreground";
  }
  if (["ui-panel", "ui-book", "ui-map", "ui-paper", "ui-screen", "ui-theme"].includes(category)) {
    return "foundation";
  }
  return "other";
}

function chooseRepresentativeFiles(files, maxCount) {
  if (files.length <= maxCount) {
    return files;
  }
  if (maxCount <= 1) {
    return [files[0]];
  }
  const picked = [];
  for (let index = 0; index < maxCount; index += 1) {
    const sourceIndex = Math.round((index / (maxCount - 1)) * (files.length - 1));
    picked.push(files[sourceIndex]);
  }
  return [...new Set(picked)];
}

function getAssetImageFiles(assetMeta, maxFilesPerAsset) {
  const filesDir = path.join(assetMeta.assetDir, "files");
  const root = fs.existsSync(filesDir) && fs.statSync(filesDir).isDirectory()
    ? filesDir
    : assetMeta.assetDir;
  const images = listImageFiles(root);
  if (!assetMeta.contents.length) {
    return chooseRepresentativeFiles(images, maxFilesPerAsset);
  }

  const contentBasenames = new Set(assetMeta.contents.map((item) => path.basename(item).toLowerCase()));
  const matched = images.filter((filePath) => contentBasenames.has(path.basename(filePath).toLowerCase()));
  return chooseRepresentativeFiles(matched.length ? matched : images, maxFilesPerAsset);
}

function collectReferenceCandidates(rootPath, options = {}) {
  const resolvedRoot = path.resolve(rootPath);
  if (!fs.existsSync(resolvedRoot) || !fs.statSync(resolvedRoot).isDirectory()) {
    throw new Error(`Reference root not found: ${resolvedRoot}`);
  }

  const categories = new Set(options.categories && options.categories.length
    ? options.categories
    : UI_CATEGORIES);
  const maxFilesPerAsset = Number.isFinite(options.maxFilesPerAsset) ? options.maxFilesPerAsset : 3;
  const assetMdFiles = walkFiles(resolvedRoot)
    .filter((filePath) => path.basename(filePath) === "asset.md")
    .sort((left, right) => left.localeCompare(right));

  if (!assetMdFiles.length) {
    return listImageFiles(resolvedRoot).map((filePath) => {
      const category = inferCategoryFromName(filePath);
      return {
        filePath,
        category,
        kind: profileKindForCategory(category),
        sourceId: path.basename(filePath, path.extname(filePath)),
        sourceName: path.basename(filePath),
        status: "inferred",
        fromAssetMd: false
      };
    }).filter((item) => categories.has(item.category));
  }

  const candidates = [];
  for (const assetMdPath of assetMdFiles) {
    const meta = parseAssetMetadata(assetMdPath);
    if (!categories.has(meta.category) || meta.status === "restricted") {
      continue;
    }
    const imageFiles = getAssetImageFiles(meta, maxFilesPerAsset);
    for (const filePath of imageFiles) {
      candidates.push({
        filePath,
        category: meta.category,
        kind: profileKindForCategory(meta.category),
        sourceId: meta.id || path.basename(meta.assetDir),
        sourceName: meta.name || path.basename(filePath),
        status: meta.status || "unknown",
        tags: meta.tags,
        fromAssetMd: true
      });
    }
  }
  return candidates;
}

function percentile(sortedValues, ratio) {
  if (!sortedValues.length) {
    return 0;
  }
  const index = (sortedValues.length - 1) * ratio;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) {
    return sortedValues[lower];
  }
  return sortedValues[lower] + (sortedValues[upper] - sortedValues[lower]) * (index - lower);
}

function round(value, digits = 4) {
  if (!Number.isFinite(value)) {
    return 0;
  }
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function summarizeMetric(samples, key) {
  const values = samples
    .map((sample) => Number(sample.metrics[key]))
    .filter((value) => Number.isFinite(value))
    .sort((left, right) => left - right);
  if (!values.length) {
    return {
      min: 0,
      p10: 0,
      p25: 0,
      p50: 0,
      p75: 0,
      p90: 0,
      max: 0,
      avg: 0
    };
  }
  return {
    min: round(values[0]),
    p10: round(percentile(values, 0.1)),
    p25: round(percentile(values, 0.25)),
    p50: round(percentile(values, 0.5)),
    p75: round(percentile(values, 0.75)),
    p90: round(percentile(values, 0.9)),
    max: round(values[values.length - 1]),
    avg: round(values.reduce((total, value) => total + value, 0) / values.length)
  };
}

function summarizeSamples(samples) {
  const metrics = {};
  for (const metric of PROFILE_METRICS) {
    metrics[metric] = summarizeMetric(samples, metric);
  }
  return {
    count: samples.length,
    metrics
  };
}

function groupBy(samples, getKey) {
  const grouped = {};
  for (const sample of samples) {
    const key = getKey(sample);
    if (!grouped[key]) {
      grouped[key] = [];
    }
    grouped[key].push(sample);
  }
  return grouped;
}

function summarizeGrouped(samples, getKey) {
  const grouped = groupBy(samples, getKey);
  return Object.fromEntries(Object.entries(grouped)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, rows]) => [key, summarizeSamples(rows)]));
}

function selectBalancedCandidates(candidates, maxFiles) {
  if (candidates.length <= maxFiles) {
    return candidates;
  }
  const grouped = groupBy(candidates, (candidate) => candidate.category);
  const categories = Object.keys(grouped).sort((left, right) => left.localeCompare(right));
  const selected = [];
  let cursor = 0;
  while (selected.length < maxFiles && categories.length) {
    const category = categories[cursor % categories.length];
    const bucket = grouped[category];
    if (bucket.length) {
      selected.push(bucket.shift());
    }
    for (let index = categories.length - 1; index >= 0; index -= 1) {
      if (!grouped[categories[index]].length) {
        categories.splice(index, 1);
        if (cursor >= categories.length) {
          cursor = 0;
        }
      }
    }
    cursor += 1;
  }
  return selected;
}

function buildPromptGuidance(profile) {
  const all = profile.summary.all.metrics;
  const categories = profile.summary.categories;
  const global = [
    `Use reference-derived transparent margin targets around isolated UI assets; median min margin ratio is ${all.transparentMarginMinRatio.p50}.`,
    `Keep alpha edges clean; reference p90 edge alpha dirt ratio is ${all.edgeAlphaDirtyRatio.p90}.`,
    `For shell/base assets, separate decorated perimeter from a calmer content surface; reference median perimeter/center detail ratio is ${all.perimeterToCenterDetailRatio.p50}.`
  ];
  if (all.outlineCoverage && all.outlineCoverage.p50 >= 0.5) {
    global.push(`Reference sprites carry a consistent darker outline along the silhouette (median coverage ${all.outlineCoverage.p50}, contrast ${all.outlineContrast ? all.outlineContrast.p50 : "n/a"}); match this outline treatment.`);
  }
  if (all.luminanceBandCount) {
    global.push(`Reference shading uses ${all.luminanceBandCount.p25}-${all.luminanceBandCount.p75} decisive luminance bands with ~${all.quantizedColorCount.p50} quantized colors per sprite; avoid muddy soft gradients and flat placeholder fills.`);
  }
  const byCategory = {};
  for (const [category, summary] of Object.entries(categories)) {
    byCategory[category] = [
      `Reference ${category} median size ${Math.round(summary.metrics.width.p50)}x${Math.round(summary.metrics.height.p50)}.`,
      `Reference ${category} p25 transparent min margin ${summary.metrics.transparentMarginMinRatio.p25}.`,
      `Reference ${category} median perimeter/center detail ratio ${summary.metrics.perimeterToCenterDetailRatio.p50}.`
    ];
  }
  return {
    global,
    byCategory
  };
}

function buildThresholds(summary) {
  const all = summary.all.metrics;
  return {
    transparentMarginMinRatio: {
      warnBelow: round(Math.max(0.002, all.transparentMarginMinRatio.p10 * 0.75))
    },
    edgeAlphaDirtyRatio: {
      warnAbove: round(Math.min(0.35, Math.max(0.03, all.edgeAlphaDirtyRatio.p90 * 1.5 + 0.01)))
    },
    perimeterToCenterDetailRatio: {
      warnBelowFoundation: round(Math.max(0.5, all.perimeterToCenterDetailRatio.p25 * 0.72))
    },
    centerGradientDensity: {
      warnAboveFoundation: round(all.centerGradientDensity.p90 * 1.18 + 0.005)
    }
  };
}

function buildReferenceQualityProfile(rootPath, options = {}) {
  const startedAt = Date.now();
  const maxFiles = Number.isFinite(options.maxFiles) ? options.maxFiles : 1200;
  const candidates = collectReferenceCandidates(rootPath, options);
  const selected = selectBalancedCandidates(candidates, maxFiles);
  const skipped = [];
  const samples = [];

  for (const candidate of selected) {
    try {
      const metrics = analyzePngFile(candidate.filePath);
      samples.push({
        category: candidate.category,
        kind: candidate.kind,
        sourceId: candidate.sourceId,
        sourceName: candidate.sourceName,
        status: candidate.status,
        fileName: path.basename(candidate.filePath),
        relativePath: path.relative(path.resolve(rootPath), candidate.filePath),
        metrics
      });
    } catch (error) {
      skipped.push({
        fileName: path.basename(candidate.filePath),
        relativePath: path.relative(path.resolve(rootPath), candidate.filePath),
        reason: error.message
      });
    }
  }

  const summary = {
    all: summarizeSamples(samples),
    categories: summarizeGrouped(samples, (sample) => sample.category),
    kinds: summarizeGrouped(samples, (sample) => sample.kind)
  };
  const profile = {
    schema: PROFILE_SCHEMA,
    generatedAt: new Date().toISOString(),
    source: {
      rootPath: path.resolve(rootPath),
      candidates: candidates.length,
      analyzed: samples.length,
      skipped: skipped.length,
      maxFiles,
      categories: options.categories && options.categories.length ? options.categories : UI_CATEGORIES,
      elapsedMs: Date.now() - startedAt
    },
    summary,
    thresholds: buildThresholds(summary),
    promptGuidance: null,
    samples: samples.slice(0, 80),
    skipped: skipped.slice(0, 50)
  };
  profile.promptGuidance = buildPromptGuidance(profile);
  return profile;
}

function compactReferenceQualityProfile(profile) {
  if (!profile || profile.schema !== PROFILE_SCHEMA) {
    throw new Error("reference quality profile is required");
  }
  return {
    schema: COMPACT_PROFILE_SCHEMA,
    generatedAt: profile.generatedAt,
    sourceSummary: {
      analyzed: profile.source ? profile.source.analyzed : profile.summary.all.count,
      categories: profile.source ? profile.source.categories : UI_CATEGORIES
    },
    summary: {
      all: profile.summary.all,
      categories: profile.summary.categories,
      kinds: profile.summary.kinds
    },
    thresholds: profile.thresholds,
    promptGuidance: profile.promptGuidance
  };
}

function isReferenceQualityProfile(profile) {
  return Boolean(
    profile
      && (profile.schema === PROFILE_SCHEMA || profile.schema === COMPACT_PROFILE_SCHEMA)
      && profile.summary
      && profile.summary.all
      && profile.summary.categories
  );
}

function normalizeRegistry(registry) {
  if (!registry) {
    return {};
  }
  if (Array.isArray(registry)) {
    return Object.fromEntries(registry
      .filter((item) => item && item.assetId)
      .map((item) => [item.assetId, item]));
  }
  return registry;
}

function profileCategoryForAsset(asset) {
  if (!asset) {
    return "ui-item";
  }
  if (asset.assetType === "button") {
    return "ui-button";
  }
  if (asset.assetType === "icon") {
    return "ui-icon";
  }
  if (["panel", "card_frame"].includes(asset.assetType)) {
    return "ui-panel";
  }
  if (asset.assetType === "background") {
    return "ui-screen";
  }
  return inferCategoryFromName(asset.assetId || asset.role || "");
}

function getReferenceSummaryForAsset(profile, asset) {
  const category = profileCategoryForAsset(asset);
  const categorySummary = profile.summary.categories[category];
  if (categorySummary && categorySummary.count >= 5) {
    return {
      category,
      summary: categorySummary
    };
  }
  return {
    category,
    summary: profile.summary.all
  };
}

function getAssetImagePath(asset, input) {
  const meta = asset.generationMeta || {};
  if (meta.imagePath && fs.existsSync(meta.imagePath)) {
    return meta.imagePath;
  }
  if (meta.sourceAssetPath && fs.existsSync(meta.sourceAssetPath)) {
    return meta.sourceAssetPath;
  }
  const registry = normalizeRegistry(input.worldPreset && input.worldPreset.imagegenAssets);
  const registered = registry[asset.assetId] || {};
  if (registered.path && fs.existsSync(registered.path)) {
    return registered.path;
  }
  return "";
}

function getPrimaryPlacement(assetId, input) {
  const placements = input.materialSpecSheet && Array.isArray(input.materialSpecSheet.placements)
    ? input.materialSpecSheet.placements
    : [];
  return placements.find((placement) => placement.assetId === assetId) || null;
}

function makeDiagnostic(severity, code, asset, message, hint, details = {}) {
  return {
    severity,
    code,
    assetId: asset.assetId,
    assetType: asset.assetType,
    role: asset.role,
    message,
    hint,
    details
  };
}

function buildAuditThresholds(referenceSummary, profile) {
  const metrics = referenceSummary.summary.metrics;
  const global = profile.thresholds || {};
  const medianMargin = metrics.transparentMarginMinRatio.p50;
  return {
    marginWarnBelow: medianMargin >= 0.015
      ? round(Math.max(0.004, metrics.transparentMarginMinRatio.p10 * 0.75))
      : null,
    edgeDirtyWarnAbove: round(Math.min(0.35, Math.max(
      global.edgeAlphaDirtyRatio ? global.edgeAlphaDirtyRatio.warnAbove : 0.03,
      metrics.edgeAlphaDirtyRatio.p90 * 1.45 + 0.01
    ))),
    detailRatioWarnBelow: round(Math.max(
      global.perimeterToCenterDetailRatio ? global.perimeterToCenterDetailRatio.warnBelowFoundation : 0.5,
      metrics.perimeterToCenterDetailRatio.p25 * 0.7
    )),
    centerGradientWarnAbove: round(Math.max(
      global.centerGradientDensity ? global.centerGradientDensity.warnAboveFoundation : 0.02,
      metrics.centerGradientDensity.p90 * 1.15 + 0.004
    ))
  };
}

function auditAssetAgainstProfile({ asset, input, profile }) {
  const diagnostics = [];
  const imagePath = getAssetImagePath(asset, input);
  if (!imagePath) {
    diagnostics.push(makeDiagnostic(
      "info",
      "asset_image_missing",
      asset,
      "No generated/adopted PNG path is available for this asset.",
      "Generate or import the asset before running reference-derived visual checks."
    ));
    return {
      assetId: asset.assetId,
      category: profileCategoryForAsset(asset),
      status: "skipped",
      imagePath: "",
      metrics: null,
      diagnostics
    };
  }

  let metrics;
  try {
    metrics = analyzePngFile(imagePath);
  } catch (error) {
    diagnostics.push(makeDiagnostic(
      "warning",
      "asset_image_unreadable",
      asset,
      `Could not inspect the generated image: ${error.message}`,
      "Use a non-interlaced PNG for local reference-derived checks.",
      { imagePath }
    ));
    return {
      assetId: asset.assetId,
      category: profileCategoryForAsset(asset),
      status: "warn",
      imagePath,
      metrics: null,
      diagnostics
    };
  }

  const referenceSummary = getReferenceSummaryForAsset(profile, asset);
  const thresholds = buildAuditThresholds(referenceSummary, profile);
  const foundationAsset = FOUNDATION_ASSET_TYPES.has(asset.assetType);

  if (thresholds.marginWarnBelow !== null && metrics.transparentMarginMinRatio < thresholds.marginWarnBelow) {
    diagnostics.push(makeDiagnostic(
      "warning",
      "transparent_margin_low",
      asset,
      `${asset.assetId} has low transparent breathing room (${metrics.transparentMarginMinRatio}).`,
      "Regenerate with the visible object inset from the canvas edge; child layers should not be the full width of their parent base.",
      {
        actual: metrics.transparentMarginMinRatio,
        expectedAtLeast: thresholds.marginWarnBelow,
        referenceCategory: referenceSummary.category
      }
    ));
  }

  if (metrics.edgeAlphaDirtyRatio > thresholds.edgeDirtyWarnAbove) {
    diagnostics.push(makeDiagnostic(
      "warning",
      "edge_alpha_dirty",
      asset,
      `${asset.assetId} has more semi-transparent border pixels than the reference profile.`,
      "Clean the alpha edge or add enough transparent margin so the asset composites crisply over the screen.",
      {
        actual: metrics.edgeAlphaDirtyRatio,
        expectedAtMost: thresholds.edgeDirtyWarnAbove,
        referenceCategory: referenceSummary.category
      }
    ));
  }

  if (foundationAsset && metrics.perimeterToCenterDetailRatio < thresholds.detailRatioWarnBelow) {
    diagnostics.push(makeDiagnostic(
      "warning",
      "weak_perimeter_content_separation",
      asset,
      `${asset.assetId} does not show strong outer-decoration vs inner-content separation.`,
      "Push ornament, contrast, bevels, tabs, and highlights to the perimeter; keep the center quieter for text or child content.",
      {
        actual: metrics.perimeterToCenterDetailRatio,
        expectedAtLeast: thresholds.detailRatioWarnBelow,
        referenceCategory: referenceSummary.category
      }
    ));
  }

  if (foundationAsset && metrics.centerGradientDensity > thresholds.centerGradientWarnAbove) {
    diagnostics.push(makeDiagnostic(
      "warning",
      "content_surface_too_busy",
      asset,
      `${asset.assetId} has a busier center/content surface than the reference profile.`,
      "Regenerate the base with a calmer center fill and reserve detail for corners, rim, separators, and sockets.",
      {
        actual: metrics.centerGradientDensity,
        expectedAtMost: thresholds.centerGradientWarnAbove,
        referenceCategory: referenceSummary.category
      }
    ));
  }

  const placement = getPrimaryPlacement(asset.assetId, input);
  if (placement && metrics.width > 0 && metrics.height > 0) {
    const imageAspect = metrics.width / metrics.height;
    const placementAspect = placement.width / placement.height;
    const aspectDelta = Math.abs(imageAspect - placementAspect) / Math.max(0.001, placementAspect);
    if (aspectDelta > 0.18) {
      diagnostics.push(makeDiagnostic(
        "warning",
        "aspect_ratio_mismatch",
        asset,
        `${asset.assetId} aspect ratio differs from its primary placement by ${round(aspectDelta * 100, 1)}%.`,
        "Generate close to the target placement ratio so scaling does not flatten decoration or squeeze inner content margins.",
        {
          image: `${metrics.width}x${metrics.height}`,
          placement: `${placement.width}x${placement.height}`,
          deltaRatio: round(aspectDelta)
        }
      ));
    }
  }

  const status = diagnostics.some((item) => item.severity === "error")
    ? "fail"
    : diagnostics.some((item) => item.severity === "warning")
      ? "warn"
      : "pass";

  return {
    assetId: asset.assetId,
    category: referenceSummary.category,
    status,
    imagePath,
    metrics,
    diagnostics
  };
}

function auditGeneratedAssetsWithProfile(input, profile) {
  if (!isReferenceQualityProfile(profile)) {
    throw new Error("referenceQualityProfile is required");
  }
  const renderModel = generateRenderModel(input);
  const assets = renderModel.assets.map((asset) => auditAssetAgainstProfile({
    asset,
    input,
    profile
  }));
  const diagnostics = assets.flatMap((asset) => asset.diagnostics);
  const warningCount = diagnostics.filter((item) => item.severity === "warning").length;
  const errorCount = diagnostics.filter((item) => item.severity === "error").length;
  const inspectedCount = assets.filter((asset) => asset.metrics).length;
  const score = Math.max(0, Math.round(100 - errorCount * 18 - warningCount * 6));
  return {
    schema: AUDIT_SCHEMA,
    generatedAt: new Date().toISOString(),
    valid: errorCount === 0,
    status: errorCount ? "fail" : warningCount ? "warn" : "pass",
    score,
    summary: {
      screenId: input.screenKv.screenId,
      assetCount: assets.length,
      inspectedCount,
      skippedCount: assets.length - inspectedCount,
      warningCount,
      errorCount,
      profileSampleCount: profile.summary.all.count
    },
    diagnostics,
    assets
  };
}

function getReferencePromptLines(referenceDerived, asset) {
  if (!referenceDerived || !referenceDerived.promptGuidance) {
    return [];
  }
  const category = profileCategoryForAsset(asset);
  const guidance = referenceDerived.promptGuidance;
  return [
    ...((guidance.global || []).slice(0, 3)),
    ...(((guidance.byCategory || {})[category] || []).slice(0, 2))
  ];
}

module.exports = {
  AUDIT_SCHEMA,
  COMPACT_PROFILE_SCHEMA,
  PROFILE_SCHEMA,
  UI_CATEGORIES,
  auditGeneratedAssetsWithProfile,
  buildReferenceQualityProfile,
  compactReferenceQualityProfile,
  collectReferenceCandidates,
  getReferencePromptLines,
  profileCategoryForAsset
};
