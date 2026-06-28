"use strict";

const fs = require("fs");
const path = require("path");
const http = require("http");
const { URL } = require("url");

const { getDemoProject } = require("./lib/sample-data");
const { prepareInput, clone } = require("./lib/spec");
const { generateRenderModel } = require("./lib/generator");
const { baseDirectives, mergeDirectives } = require("./lib/comment-tools");
const { getAiMode, normalizeCommentWithAi, reviewScreenWithAi } = require("./lib/codex-adapter");
const { resolveBundleFromFolder } = require("./lib/folder-loader");
const { prepareImagegenWorkflow } = require("./lib/imagegen-workflow");
const { buildRegenerationRequest } = require("./lib/regeneration-queue");
const { buildImplementationReport } = require("./lib/implementation-report");

const PORT = Number(process.env.PORT || 4311);
const HOST = process.env.HOST || "127.0.0.1";
const publicDir = path.join(__dirname, "public");
const allowedSourceRoots = new Set([__dirname]);

function isPathInside(parentPath, childPath) {
  const parent = path.resolve(parentPath);
  const child = path.resolve(childPath);
  const relative = path.relative(parent, child);
  return relative === "" || (!!relative && !relative.startsWith("..") && !path.isAbsolute(relative));
}

function allowSourceRoot(rootPath) {
  if (typeof rootPath !== "string" || !rootPath.trim()) {
    return;
  }
  allowedSourceRoots.add(path.resolve(rootPath));
}

function isAllowedSourceFile(filePath) {
  const resolved = path.resolve(filePath);
  return [...allowedSourceRoots].some((rootPath) => isPathInside(rootPath, resolved));
}

function sanitizeFileSlug(value, fallback = "screen") {
  const slug = String(value || "")
    .trim()
    .replace(/[^a-z0-9_-]+/giu, "_")
    .replace(/^_+|_+$/gu, "");
  return slug || fallback;
}

function resolveRegenerationQueuePath(source = {}, screenKv = {}) {
  if (!source || source.kind !== "folder") {
    return null;
  }

  const baseDir = source.projectRoot || source.screenFolderPath || source.folderPath || "";
  if (!baseDir) {
    return null;
  }

  const resolvedBase = path.resolve(baseDir);
  if (!fs.existsSync(resolvedBase) || !fs.statSync(resolvedBase).isDirectory()) {
    throw new Error(`再生成キューの保存元フォルダが見つかりません: ${resolvedBase}`);
  }
  if (!isAllowedSourceFile(resolvedBase)) {
    throw new Error("再生成キューを保存する前に、対象のプロジェクトフォルダを読み込んでください。");
  }

  const screenId = sanitizeFileSlug(source.screenId || screenKv.screenId || "screen");
  const queuePath = path.join(
    resolvedBase,
    ".game-creative-generation",
    "regeneration-queues",
    `${screenId}.json`
  );
  const resolvedQueuePath = path.resolve(queuePath);
  if (!isPathInside(resolvedBase, resolvedQueuePath)) {
    throw new Error("再生成キューの保存先がプロジェクトフォルダ外に解決されました。");
  }
  return resolvedQueuePath;
}

function normalizeRegenerationQueue(queue) {
  if (!Array.isArray(queue)) {
    return [];
  }
  return queue
    .filter((item) => item && item.assetId)
    .map((item) => ({
      queueId: String(item.queueId || `regen_${item.assetId}`),
      assetId: String(item.assetId),
      userComment: String(item.userComment || ""),
      aiReviewComment: String(item.aiReviewComment || ""),
      source: String(item.source || "asset_card"),
      status: String(item.status || "queued"),
      createdAt: String(item.createdAt || ""),
      updatedAt: String(item.updatedAt || "")
    }));
}

function resolveSourceFileRequest(filePath) {
  if (!filePath) {
    return {
      statusCode: 400,
      body: "Missing path"
    };
  }

  const resolved = path.resolve(filePath);
  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) {
    return {
      statusCode: 404,
      body: "Not found"
    };
  }

  if (!isAllowedSourceFile(resolved)) {
    return {
      statusCode: 403,
      body: "Source path is outside allowed project roots"
    };
  }

  if (!/\.(png|jpe?g|webp|svg)$/iu.test(resolved)) {
    return {
      statusCode: 415,
      body: "Unsupported file"
    };
  }

  return {
    statusCode: 200,
    filePath: resolved
  };
}

function sendSourceFile(response, filePath) {
  const result = resolveSourceFileRequest(filePath);
  if (result.statusCode !== 200) {
    response.writeHead(result.statusCode);
    response.end(result.body);
    return;
  }
  sendFile(response, result.filePath);
}

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  response.end(JSON.stringify(payload));
}

function sendFile(response, filePath) {
  const extension = path.extname(filePath);
  const mimeTypes = {
    ".css": "text/css; charset=utf-8",
    ".html": "text/html; charset=utf-8",
    ".js": "application/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".svg": "image/svg+xml; charset=utf-8",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp"
  };
  const contentType = mimeTypes[extension] || "application/octet-stream";
  const content = fs.readFileSync(filePath);
  response.writeHead(200, {
    "Content-Type": contentType,
    "Cache-Control": "no-store"
  });
  response.end(content);
}

function readJsonBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    request.on("data", (chunk) => chunks.push(chunk));
    request.on("end", () => {
      try {
        if (!chunks.length) {
          resolve({});
          return;
        }
        const raw = Buffer.concat(chunks).toString("utf8");
        resolve(JSON.parse(raw));
      } catch (error) {
        reject(error);
      }
    });
    request.on("error", reject);
  });
}

function buildGenerateResponse(input) {
  const renderModel = generateRenderModel(input);
  return {
    ok: true,
    ai: {
      mode: getAiMode()
    },
    input,
    renderModel,
    compositionQuality: renderModel.compositionQuality
  };
}

function buildDraftResponse(input) {
  const renderModel = generateRenderModel(input);
  return {
    ok: true,
    ai: {
      mode: getAiMode()
    },
    input,
    renderModel,
    compositionQuality: renderModel.compositionQuality
  };
}

function resolveImportImagePath(imagePath) {
  if (typeof imagePath !== "string" || !imagePath.trim()) {
    throw new Error("imagePath is required");
  }
  const resolved = path.resolve(imagePath.trim());
  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) {
    throw new Error(`imagePath not found: ${resolved}`);
  }
  if (!/\.(png|jpe?g|webp)$/iu.test(resolved)) {
    throw new Error("imagePath must be png, jpg, jpeg, or webp");
  }
  return resolved;
}

function ensureImagegenAssetRegistry(worldPreset) {
  const current = worldPreset.imagegenAssets || {};
  if (Array.isArray(current)) {
    return Object.fromEntries(current
      .filter((item) => item && item.assetId)
      .map((item) => [item.assetId, item]));
  }
  return { ...current };
}

function ensureRevision(revisionMap, assetId) {
  if (!revisionMap[assetId]) {
    revisionMap[assetId] = {
      locked: false,
      revisionCount: 0,
      comments: [],
      normalizedComments: [],
      directives: baseDirectives(),
      generationMeta: null,
      history: [],
      selectedVersionId: ""
    };
  }
  if (!revisionMap[assetId].generationMeta) {
    revisionMap[assetId].generationMeta = null;
  }
  if (!Array.isArray(revisionMap[assetId].history)) {
    revisionMap[assetId].history = [];
  }
  if (!revisionMap[assetId].selectedVersionId) {
    revisionMap[assetId].selectedVersionId = "";
  }
  return revisionMap[assetId];
}

function createHistoryEntry({
  comment = "",
  directives,
  generationMeta = null,
  locked = false,
  normalizedComment = "",
  restoredFromVersionId = "",
  revisionCount = 0,
  source = "regenerate"
}) {
  return {
    versionId: `version_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`,
    revisionCount,
    comment,
    normalizedComment,
    directives: clone(directives || baseDirectives()),
    generationMeta: generationMeta ? clone(generationMeta) : null,
    locked,
    source,
    restoredFromVersionId,
    createdAt: new Date().toISOString()
  };
}

function createImportedImageGenerationMeta({
  asset,
  imagePath,
  importedAt,
  prompt = "",
  backend = "manual_imagegen_import"
}) {
  const plan = normalizeGenerationPlan(asset);
  return {
    jobId: `import_${asset.assetId}_${Date.now()}`,
    backendClass: plan.backendClass,
    backendClassLabel: "imagegen実画像手動採用",
    actualBackend: backend,
    usesImagegen: true,
    batchGroup: plan.batchGroup,
    firstPassMode: plan.firstPassMode,
    firstPassModeLabel: plan.firstPassModeLabel,
    generationIndex: 0,
    stylePatch: baseDirectives(),
    imagePath,
    sourcePrompt: prompt,
    sourceAssetPath: imagePath,
    generatedAt: importedAt
  };
}

function ensureRevisionHistory(revision) {
  if (!Array.isArray(revision.history)) {
    revision.history = [];
  }

  if (!revision.history.length) {
    const initial = createHistoryEntry({
      comment: "",
      directives: revision.directives,
      generationMeta: revision.generationMeta,
      locked: revision.locked,
      normalizedComment: "",
      revisionCount: revision.revisionCount,
      source: "initial"
    });
    revision.history.push(initial);
    revision.selectedVersionId = initial.versionId;
  }

  return revision.history;
}

function appendHistoryEntry(revision, entry) {
  ensureRevisionHistory(revision);
  revision.history.push(entry);
  revision.selectedVersionId = entry.versionId;
}

function stableHash(input) {
  let hash = 0;
  const text = String(input || "");
  for (let index = 0; index < text.length; index += 1) {
    hash = ((hash << 5) - hash) + text.charCodeAt(index);
    hash |= 0;
  }
  return Math.abs(hash);
}

function pickFromHash(hash, options) {
  return options[hash % options.length];
}

function normalizeGenerationPlan(asset) {
  const plan = asset.generationPlan || {};
  const fallbackLabels = {
    image_batch: "imagegen候補生成",
    template_family_batch: "SVGテンプレ生成",
    symbol_batch: "SVGアイコン生成"
  };
  const backendClass = plan.backendClass || "image_batch";
  return {
    firstPassMode: plan.firstPassMode || "bulk_generate_all_assets",
    firstPassModeLabel: plan.firstPassModeLabel || "一括で本生成",
    backendClass,
    backendClassLabel: fallbackLabels[backendClass] || plan.backendClassLabel || "SVGモック生成",
    batchGroup: plan.batchGroup || asset.assetId,
    targetedRegenerate: plan.targetedRegenerate !== false,
    note: plan.note || ""
  };
}

function getImagegenAsset(input, assetId) {
  const registry = input.worldPreset && input.worldPreset.imagegenAssets
    ? input.worldPreset.imagegenAssets
    : null;
  if (!registry) {
    return null;
  }
  if (Array.isArray(registry)) {
    return registry.find((item) => item && item.assetId === assetId) || null;
  }
  return registry[assetId] || null;
}

function resolveImagegenAssetPath(imagegenAsset) {
  if (!imagegenAsset || !imagegenAsset.path) {
    return "";
  }
  return path.resolve(imagegenAsset.path);
}

function buildGenerationMeta({ asset, job, generationIndex, imagegenAsset, startedAt, stylePatch }) {
  const imagePath = resolveImagegenAssetPath(imagegenAsset);
  const hasImportedImage = imagePath && fs.existsSync(imagePath) && fs.statSync(imagePath).isFile();
  if (hasImportedImage) {
    return {
      jobId: job.jobId,
      backendClass: job.backendClass,
      backendClassLabel: "imagegen実画像取り込み",
      actualBackend: imagegenAsset.backend || "imagegen_import",
      usesImagegen: imagegenAsset.usesImagegen !== false,
      batchGroup: job.batchGroup,
      firstPassMode: job.firstPassMode,
      firstPassModeLabel: job.firstPassModeLabel,
      generationIndex,
      stylePatch,
      imagePath,
      sourcePrompt: imagegenAsset.prompt || "",
      sourceAssetPath: imagegenAsset.path,
      generatedAt: startedAt
    };
  }

  return {
    jobId: job.jobId,
    backendClass: job.backendClass,
    backendClassLabel: job.backendClassLabel,
    actualBackend: imagegenAsset ? "imagegen_import_missing" : "svg_template",
    usesImagegen: false,
    batchGroup: job.batchGroup,
    firstPassMode: job.firstPassMode,
    firstPassModeLabel: job.firstPassModeLabel,
    generationIndex,
    stylePatch,
    imagePath: "",
    sourcePrompt: imagegenAsset && imagegenAsset.prompt ? imagegenAsset.prompt : "",
    sourceAssetPath: imagegenAsset && imagegenAsset.path ? imagegenAsset.path : "",
    generatedAt: startedAt
  };
}

function createGenerationJobs(input) {
  const assetById = new Map(input.materialSpecSheet.assets.map((asset) => [asset.assetId, asset]));
  const groups = new Map();
  const skippedAssets = [];

  for (const asset of input.materialSpecSheet.assets) {
    const revision = ensureRevision(input.revisionMap, asset.assetId);
    if (revision.locked) {
      skippedAssets.push(asset.assetId);
      continue;
    }
    const plan = normalizeGenerationPlan(asset);
    const groupId = `${plan.backendClass}:${plan.batchGroup}`;
    if (!groups.has(groupId)) {
      groups.set(groupId, {
        jobId: `job_${groups.size + 1}_${plan.batchGroup}`,
        backendClass: plan.backendClass,
        backendClassLabel: plan.backendClassLabel,
        batchGroup: plan.batchGroup,
        firstPassMode: plan.firstPassMode,
        firstPassModeLabel: plan.firstPassModeLabel,
        note: plan.note,
        assetIds: []
      });
    }
    groups.get(groupId).assetIds.push(asset.assetId);
  }

  const backendOrder = {
    image_batch: 0,
    template_family_batch: 1,
    symbol_batch: 2
  };

  const jobs = [...groups.values()]
    .map((job) => ({
      ...job,
      assets: job.assetIds.map((assetId) => assetById.get(assetId))
    }))
    .sort((left, right) => {
      const orderDelta = (backendOrder[left.backendClass] || 99) - (backendOrder[right.backendClass] || 99);
      if (orderDelta !== 0) {
        return orderDelta;
      }
      return left.batchGroup.localeCompare(right.batchGroup, "ja");
    });

  return {
    jobs,
    skippedAssets
  };
}

function buildGenerationStylePatch({ asset, job, generationIndex }) {
  const hash = stableHash(`${job.batchGroup}:${asset.assetId}:${generationIndex}`);
  const patch = baseDirectives();

  if (job.backendClass === "image_batch") {
    patch.brightnessDelta = pickFromHash(hash, [2, 4, 6, 8]);
    patch.contrastDelta = pickFromHash(hash + 1, [12, 16, 20]);
    patch.ornamentDelta = pickFromHash(hash + 2, [1, 2, 2]);
    patch.emphasisDelta = pickFromHash(hash + 3, [1, 1, 2]);
    patch.roundnessDelta = pickFromHash(hash + 4, [0, 1]);
    patch.materialHint = pickFromHash(hash + 5, ["brass", "crystal", "stone"]);
    patch.readabilityBoost = pickFromHash(hash + 6, [0, 1, 1]);
    patch.moodShift = pickFromHash(hash + 7, ["warm", "mysterious", ""]);
    return patch;
  }

  if (job.backendClass === "template_family_batch") {
    patch.brightnessDelta = pickFromHash(hash, [0, 2, 4]);
    patch.contrastDelta = pickFromHash(hash + 1, [8, 10, 12]);
    patch.ornamentDelta = pickFromHash(hash + 2, [0, 1, 1]);
    patch.emphasisDelta = pickFromHash(hash + 3, [0, 1]);
    patch.roundnessDelta = pickFromHash(hash + 4, [0, 1, 1]);
    patch.materialHint = pickFromHash(hash + 5, ["brass", "stone"]);
    patch.readabilityBoost = pickFromHash(hash + 6, [0, 1]);
    return patch;
  }

  patch.brightnessDelta = pickFromHash(hash, [4, 6, 8]);
  patch.contrastDelta = pickFromHash(hash + 1, [12, 14, 16]);
  patch.ornamentDelta = pickFromHash(hash + 2, [0, 1]);
  patch.emphasisDelta = pickFromHash(hash + 3, [1, 1, 2]);
  patch.roundnessDelta = pickFromHash(hash + 4, [0, 1]);
  patch.materialHint = pickFromHash(hash + 5, ["crystal", "brass"]);
  patch.readabilityBoost = 1;
  return patch;
}

function executeGenerationJobs(input) {
  const revisionMap = clone(input.revisionMap || {});
  const preparedInput = {
    ...input,
    revisionMap
  };
  const { jobs, skippedAssets } = createGenerationJobs(preparedInput);
  const report = {
    totalAssets: input.materialSpecSheet.assets.length,
    plannedAssets: jobs.reduce((total, job) => total + job.assetIds.length, 0),
    plannedJobs: jobs.length,
    skippedAssets,
    jobs: []
  };

  jobs.forEach((job, jobIndex) => {
    const startedAt = new Date().toISOString();
    job.assetIds.forEach((assetId, assetIndex) => {
      const asset = job.assets[assetIndex];
      const revision = ensureRevision(revisionMap, assetId);
      ensureRevisionHistory(revision);
      revision.revisionCount += 1;
      const stylePatch = buildGenerationStylePatch({
        asset,
        job,
        generationIndex: revision.revisionCount + jobIndex + assetIndex
      });
      const generationMeta = buildGenerationMeta({
        asset,
        job,
        generationIndex: revision.revisionCount,
        imagegenAsset: getImagegenAsset(input, assetId),
        startedAt,
        stylePatch
      });
      revision.generationMeta = generationMeta;
      appendHistoryEntry(revision, createHistoryEntry({
        comment: "",
        directives: revision.directives,
        generationMeta,
        locked: revision.locked,
        normalizedComment: `bulk_generate:${job.jobId}`,
        revisionCount: revision.revisionCount,
        source: "bulk_generate"
      }));
    });

    report.jobs.push({
      jobId: job.jobId,
      backendClass: job.backendClass,
      backendClassLabel: job.backendClassLabel,
      batchGroup: job.batchGroup,
      firstPassMode: job.firstPassMode,
      firstPassModeLabel: job.firstPassModeLabel,
      assetIds: [...job.assetIds],
      imagegenAssetIds: job.assetIds.filter((assetId) => {
        const meta = revisionMap[assetId] && revisionMap[assetId].generationMeta;
        return meta && meta.usesImagegen;
      }),
      status: "completed",
      note: job.note
    });
  });

  return {
    nextInput: preparedInput,
    report
  };
}

function summarizeRegisteredGeneratedAssets(input) {
  const registry = input.worldPreset && input.worldPreset.imagegenAssets
    ? input.worldPreset.imagegenAssets
    : {};
  const registryById = Array.isArray(registry)
    ? Object.fromEntries(registry.filter((item) => item && item.assetId).map((item) => [item.assetId, item]))
    : registry;
  const adoptedAssetIds = [];
  const missingAssetIds = [];

  for (const asset of input.materialSpecSheet.assets) {
    const entry = registryById[asset.assetId];
    const imagePath = resolveImagegenAssetPath(entry);
    if (imagePath && fs.existsSync(imagePath) && fs.statSync(imagePath).isFile()) {
      adoptedAssetIds.push(asset.assetId);
    } else {
      missingAssetIds.push(asset.assetId);
    }
  }

  return {
    job: null,
    runner: {
      mode: "prebuilt",
      ran: false,
      ok: true,
      message: "事前生成済みPNGを採用して表示しました。"
    },
    adoptedAssetIds,
    missingAssetIds
  };
}

async function handleCommentRegenerate(body) {
  const input = prepareInput(body);
  if (!body.assetId) {
    throw new Error("assetId is required");
  }
  if (typeof body.comment !== "string") {
    throw new Error("comment is required");
  }

  const revisionMap = clone(input.revisionMap);
  const revision = ensureRevision(revisionMap, body.assetId);
  ensureRevisionHistory(revision);
  const asset = input.materialSpecSheet.assets.find((item) => item.assetId === body.assetId);
  const placement = input.materialSpecSheet.placements.find((item) => item.assetId === body.assetId) || null;

  if (!asset) {
    throw new Error(`Unknown assetId: ${body.assetId}`);
  }

  const normalized = await normalizeCommentWithAi({
    asset,
    comment: body.comment,
    placement,
    previousComments: revision.comments
  });

  revision.locked = normalized.plan.action === "lock" ? true : revision.locked;
  revision.revisionCount += normalized.plan.action === "noop" ? 0 : 1;
  revision.comments = [...revision.comments, body.comment];
  revision.normalizedComments = [...revision.normalizedComments, normalized.plan.normalizedComment];
  revision.directives = mergeDirectives(revision.directives, normalized.plan.directives);
  appendHistoryEntry(revision, createHistoryEntry({
    comment: body.comment,
    directives: revision.directives,
    generationMeta: revision.generationMeta,
    locked: revision.locked,
    normalizedComment: normalized.plan.normalizedComment,
    revisionCount: revision.revisionCount,
    source: normalized.plan.action
  }));

  const nextInput = {
    ...input,
    revisionMap
  };

  return {
    ok: true,
    ai: normalized.ai,
    normalizedPlan: normalized.plan,
    input: nextInput,
    renderModel: generateRenderModel(nextInput)
  };
}

async function handleRestoreVersion(body) {
  const input = prepareInput(body);
  if (!body.assetId) {
    throw new Error("assetId is required");
  }
  if (!body.versionId) {
    throw new Error("versionId is required");
  }

  const revisionMap = clone(input.revisionMap);
  const revision = ensureRevision(revisionMap, body.assetId);
  const asset = input.materialSpecSheet.assets.find((item) => item.assetId === body.assetId);
  if (!asset) {
    throw new Error(`Unknown assetId: ${body.assetId}`);
  }

  ensureRevisionHistory(revision);
  const target = revision.history.find((entry) => entry.versionId === body.versionId);
  if (!target) {
    throw new Error(`Unknown versionId: ${body.versionId}`);
  }

  const restoreComment = target.comment
    ? `履歴から再採用: ${target.comment}`
    : "履歴から初期版を再採用";
  revision.locked = target.locked;
  revision.revisionCount += 1;
  revision.comments = [...revision.comments, restoreComment];
  revision.normalizedComments = [...revision.normalizedComments, target.normalizedComment || "restore"];
  revision.directives = clone(target.directives || baseDirectives());
  revision.generationMeta = target.generationMeta ? clone(target.generationMeta) : null;

  appendHistoryEntry(revision, createHistoryEntry({
    comment: restoreComment,
    directives: revision.directives,
    generationMeta: revision.generationMeta,
    locked: revision.locked,
    normalizedComment: target.normalizedComment || "restore",
    restoredFromVersionId: target.versionId,
    revisionCount: revision.revisionCount,
    source: "restore"
  }));

  const nextInput = {
    ...input,
    revisionMap
  };

  return {
    ok: true,
    ai: {
      mode: getAiMode()
    },
    restoredVersionId: body.versionId,
    input: nextInput,
    renderModel: generateRenderModel(nextInput)
  };
}

function handleImportAssetImage(body) {
  const input = prepareInput(body);
  if (!body.assetId) {
    throw new Error("assetId is required");
  }
  const imagePath = resolveImportImagePath(body.imagePath);
  allowSourceRoot(path.dirname(imagePath));
  const asset = input.materialSpecSheet.assets.find((item) => item.assetId === body.assetId);
  if (!asset) {
    throw new Error(`Unknown assetId: ${body.assetId}`);
  }

  const importedAt = new Date().toISOString();
  const revisionMap = clone(input.revisionMap || {});
  const revision = ensureRevision(revisionMap, body.assetId);
  ensureRevisionHistory(revision);
  revision.revisionCount += 1;
  const generationMeta = createImportedImageGenerationMeta({
    asset,
    imagePath,
    importedAt,
    prompt: body.prompt || "",
    backend: body.backend || "manual_imagegen_import"
  });
  revision.generationMeta = generationMeta;
  revision.comments = [...revision.comments, `imagegen PNGを採用: ${path.basename(imagePath)}`];
  revision.normalizedComments = [...revision.normalizedComments, "import_imagegen_asset"];
  appendHistoryEntry(revision, createHistoryEntry({
    comment: `imagegen PNGを採用: ${path.basename(imagePath)}`,
    directives: revision.directives,
    generationMeta,
    locked: revision.locked,
    normalizedComment: "import_imagegen_asset",
    revisionCount: revision.revisionCount,
    source: "import_imagegen_asset"
  }));

  const worldPreset = clone(input.worldPreset);
  worldPreset.imagegenAssets = ensureImagegenAssetRegistry(worldPreset);
  worldPreset.imagegenAssets[body.assetId] = {
    ...(worldPreset.imagegenAssets[body.assetId] || {}),
    assetId: body.assetId,
    path: imagePath,
    backend: body.backend || "manual_imagegen_import",
    usesImagegen: true,
    prompt: body.prompt || "",
    notes: "Imported manually from a local imagegen PNG."
  };

  const nextInput = {
    ...input,
    worldPreset,
    revisionMap
  };

  return {
    ok: true,
    ai: {
      mode: getAiMode()
    },
    importedAssetId: body.assetId,
    imagePath,
    input: nextInput,
    renderModel: generateRenderModel(nextInput)
  };
}

async function handleAiReview(body) {
  const input = prepareInput(body);
  const renderModel = generateRenderModel(input);
  const review = await reviewScreenWithAi({
    renderModel,
    revisionMap: input.revisionMap || {}
  });

  return {
    ok: true,
    ai: review.ai,
    review: review.review
  };
}

function handleImagegenJob(body, { run = false } = {}) {
  const payload = Object.keys(body).length ? body : getDemoProject();
  const input = prepareInput(payload);
  const { nextInput, report } = prepareImagegenWorkflow(input, {
    run,
    writeFiles: true
  });
  const renderModel = generateRenderModel(nextInput);
  return {
    ok: true,
    ai: {
      mode: getAiMode()
    },
    input: nextInput,
    renderModel,
    compositionQuality: renderModel.compositionQuality,
    imagegenReport: {
      ...report,
      compositionQuality: renderModel.compositionQuality
    }
  };
}

function handleBuildRegenerationRequest(body) {
  const input = prepareInput(body);
  const { queue, markdown } = buildRegenerationRequest(input, body.regenerationQueue || []);
  return {
    ok: true,
    ai: {
      mode: getAiMode()
    },
    queue: queue.map((entry) => ({
      queueId: entry.queueId,
      assetId: entry.assetId,
      status: entry.status,
      outputPath: entry.outputPath,
      userComment: entry.userComment,
      aiReviewComment: entry.aiReviewComment
    })),
    itemCount: queue.length,
    markdown
  };
}

function handleSaveRegenerationQueue(body) {
  const queuePath = resolveRegenerationQueuePath(body.source, body.screenKv);
  if (!queuePath) {
    return {
      ok: true,
      persisted: false,
      message: "フォルダまたはプロジェクトを読み込むと、再生成キューを保存できます。"
    };
  }

  const queue = normalizeRegenerationQueue(body.regenerationQueue);
  const now = new Date().toISOString();
  const screenId = body.source && body.source.screenId
    ? body.source.screenId
    : body.screenKv && body.screenKv.screenId
      ? body.screenKv.screenId
      : "";
  const payload = {
    version: 1,
    savedAt: now,
    source: {
      projectRoot: body.source.projectRoot || "",
      folderPath: body.source.folderPath || "",
      screenFolderPath: body.source.screenFolderPath || "",
      screenId,
      screenName: body.source.screenName || (body.screenKv && body.screenKv.screenName) || ""
    },
    queue
  };

  fs.mkdirSync(path.dirname(queuePath), { recursive: true });
  fs.writeFileSync(queuePath, `${JSON.stringify(payload, null, 2)}\n`);
  return {
    ok: true,
    persisted: true,
    queuePath,
    itemCount: queue.length,
    savedAt: now
  };
}

function handleLoadRegenerationQueue(body) {
  const queuePath = resolveRegenerationQueuePath(body.source, body.screenKv);
  if (!queuePath) {
    return {
      ok: true,
      persisted: false,
      message: "フォルダまたはプロジェクトを読み込むと、保存済み再生成キューを読み込めます。"
    };
  }
  if (!fs.existsSync(queuePath)) {
    return {
      ok: true,
      persisted: false,
      queuePath,
      message: "この画面の保存済み再生成キューはまだありません。"
    };
  }

  const payload = JSON.parse(fs.readFileSync(queuePath, "utf8"));
  const queue = normalizeRegenerationQueue(payload.queue);
  return {
    ok: true,
    persisted: true,
    queuePath,
    savedAt: payload.savedAt || "",
    itemCount: queue.length,
    queue
  };
}

function handleCompositionQuality(body) {
  const input = prepareInput(Object.keys(body).length ? body : getDemoProject());
  const renderModel = generateRenderModel(input);
  return {
    ok: true,
    ai: {
      mode: getAiMode()
    },
    compositionQuality: renderModel.compositionQuality,
    compositionGroups: renderModel.compositionGroups
  };
}

function handleImplementationReport(body) {
  const input = prepareInput(Object.keys(body).length ? body : getDemoProject());
  const { report, markdown } = buildImplementationReport(input);
  return {
    ok: true,
    ai: {
      mode: getAiMode()
    },
    report,
    markdown
  };
}

function handleValidateWorkspace(body) {
  try {
    const input = prepareInput(Object.keys(body).length ? body : getDemoProject());
    const renderModel = generateRenderModel(input);
    const diagnostics = [];
    const composition = renderModel.compositionQuality;
    if (composition && composition.failCount > 0) {
      diagnostics.push({
        severity: "error",
        code: "composition_quality",
        message: `${composition.failCount} composition group(s) are failing.`
      });
    }
    if (composition && composition.warnCount > 0) {
      diagnostics.push({
        severity: "warning",
        code: "composition_quality",
        message: `${composition.warnCount} composition group(s) need review.`
      });
    }
    if (!renderModel.screen.layers.length) {
      diagnostics.push({
        severity: "error",
        code: "empty_layers",
        message: "Screen renders no layers."
      });
    }

    return {
      ok: true,
      valid: diagnostics.every((item) => item.severity !== "error"),
      summary: {
        screenId: renderModel.screen.screenId,
        screenName: renderModel.screen.screenName,
        size: `${renderModel.screen.width}x${renderModel.screen.height}`,
        assetCount: renderModel.assets.length,
        layerCount: renderModel.screen.layers.length,
        compositionStatus: composition ? composition.status : "pass",
        compositionScore: composition ? composition.score : 100,
        compositionGroupCount: composition ? composition.groupCount : 0
      },
      diagnostics
    };
  } catch (error) {
    return {
      ok: true,
      valid: false,
      summary: null,
      diagnostics: [
        {
          severity: "error",
          code: "workspace_parse",
          message: error.message
        }
      ]
    };
  }
}

async function dispatchApi(method, pathname, body = {}) {
  if (method === "GET" && pathname === "/api/source-file") {
    throw new Error("Use HTTP server route for source-file");
  }

  if (method === "GET" && pathname === "/api/health") {
    return {
      statusCode: 200,
      payload: { ok: true, aiMode: getAiMode() }
    };
  }

  if (method === "GET" && pathname === "/api/demo") {
    return {
      statusCode: 200,
      payload: {
        ok: true,
        ai: {
          mode: getAiMode()
        },
        demo: getDemoProject(),
        source: {
          kind: "demo",
          kvImagePath: path.join(__dirname, "examples", "sky-port-home", "key-visual.png")
        }
      }
    };
  }

  if (method === "POST" && pathname === "/api/load-from-folder") {
    if (typeof body.folderPath !== "string" || !body.folderPath.trim()) {
      throw new Error("folderPath is required");
    }
    const loaded = resolveBundleFromFolder(body.folderPath.trim(), {
      screenId: typeof body.screenId === "string" ? body.screenId.trim() : ""
    });
    allowSourceRoot(loaded.source.folderPath);
    if (loaded.source.projectRoot) {
      allowSourceRoot(loaded.source.projectRoot);
    }
    return {
      statusCode: 200,
      payload: {
        ok: true,
        ai: {
          mode: getAiMode()
        },
        bundle: loaded.bundle,
        source: {
          kind: "folder",
          folderPath: loaded.source.folderPath,
          projectRoot: loaded.source.projectRoot,
          projectId: loaded.source.projectId,
          projectName: loaded.source.projectName,
          manifestPath: loaded.source.manifestPath,
          defaultScreenId: loaded.source.defaultScreenId,
          projectScreens: loaded.source.projectScreens,
          screenId: loaded.source.screenId,
          screenName: loaded.source.screenName,
          screenFolderPath: loaded.source.screenFolderPath,
          jsonFiles: loaded.source.jsonFiles,
          imageFiles: loaded.source.imageFiles,
          kvImagePath: loaded.source.kvImagePath
        }
      }
    };
  }

  if (method === "POST" && pathname === "/api/generate-all") {
    const payload = Object.keys(body).length ? body : getDemoProject();
    const imagegenWorkflow = prepareImagegenWorkflow(prepareInput(payload), {
      run: process.env.BETA_IMAGEGEN_AUTORUN === "1",
      writeFiles: true
    });
    const { nextInput, report } = executeGenerationJobs(imagegenWorkflow.nextInput);
    const generated = buildGenerateResponse(nextInput);
    return {
      statusCode: 200,
      payload: {
        ...generated,
        generationReport: report,
        imagegenReport: {
          ...imagegenWorkflow.report,
          compositionQuality: generated.renderModel.compositionQuality
        }
      }
    };
  }

  if (method === "POST" && pathname === "/api/show-generated") {
    const payload = Object.keys(body).length ? body : getDemoProject();
    const input = prepareInput(payload);
    const { nextInput, report } = executeGenerationJobs(input);
    const generated = buildGenerateResponse(nextInput);
    return {
      statusCode: 200,
      payload: {
        ...generated,
        generationReport: {
          ...report,
          mode: "prebuilt_display",
          actionLabel: "生成後を表示"
        },
        imagegenReport: {
          ...summarizeRegisteredGeneratedAssets(nextInput),
          compositionQuality: generated.renderModel.compositionQuality
        }
      }
    };
  }

  if (method === "POST" && pathname === "/api/imagegen-job") {
    return {
      statusCode: 200,
      payload: handleImagegenJob(body, { run: false })
    };
  }

  if (method === "POST" && pathname === "/api/run-imagegen-job") {
    return {
      statusCode: 200,
      payload: handleImagegenJob(body, { run: true })
    };
  }

  if (method === "POST" && pathname === "/api/build-regeneration-request") {
    return {
      statusCode: 200,
      payload: handleBuildRegenerationRequest(body)
    };
  }

  if (method === "POST" && pathname === "/api/save-regeneration-queue") {
    return {
      statusCode: 200,
      payload: handleSaveRegenerationQueue(body)
    };
  }

  if (method === "POST" && pathname === "/api/load-regeneration-queue") {
    return {
      statusCode: 200,
      payload: handleLoadRegenerationQueue(body)
    };
  }

  if (method === "POST" && pathname === "/api/composition-quality") {
    return {
      statusCode: 200,
      payload: handleCompositionQuality(body)
    };
  }

  if (method === "POST" && pathname === "/api/implementation-report") {
    return {
      statusCode: 200,
      payload: handleImplementationReport(body)
    };
  }

  if (method === "POST" && pathname === "/api/validate-workspace") {
    return {
      statusCode: 200,
      payload: handleValidateWorkspace(body)
    };
  }

  if (method === "POST" && pathname === "/api/render-draft") {
    const payload = Object.keys(body).length ? body : getDemoProject();
    return {
      statusCode: 200,
      payload: buildDraftResponse(prepareInput(payload))
    };
  }

  if (method === "POST" && pathname === "/api/comment-regenerate") {
    return {
      statusCode: 200,
      payload: await handleCommentRegenerate(body)
    };
  }

  if (method === "POST" && pathname === "/api/restore-version") {
    return {
      statusCode: 200,
      payload: await handleRestoreVersion(body)
    };
  }

  if (method === "POST" && pathname === "/api/import-asset-image") {
    return {
      statusCode: 200,
      payload: handleImportAssetImage(body)
    };
  }

  if (method === "POST" && pathname === "/api/ai-review") {
    return {
      statusCode: 200,
      payload: await handleAiReview(body)
    };
  }

  return {
    statusCode: 404,
    payload: { ok: false, error: "Not found" }
  };
}

function handleStatic(response, pathname) {
  const relativePath = pathname === "/" ? "index.html" : pathname.replace(/^\/+/u, "");
  const filePath = path.join(publicDir, relativePath);
  if (!filePath.startsWith(publicDir) || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    response.writeHead(404);
    response.end("Not found");
    return;
  }
  sendFile(response, filePath);
}

function createServer() {
  return http.createServer(async (request, response) => {
    const url = new URL(request.url, `http://${request.headers.host}`);
    try {
      if (request.method === "GET" && url.pathname === "/api/source-file") {
        sendSourceFile(response, url.searchParams.get("path"));
        return;
      }

      if (url.pathname.startsWith("/api/")) {
        const body = request.method === "GET" ? {} : await readJsonBody(request);
        const result = await dispatchApi(request.method, url.pathname, body);
        sendJson(response, result.statusCode, result.payload);
        return;
      }

      handleStatic(response, url.pathname);
    } catch (error) {
      sendJson(response, 500, {
        ok: false,
        error: error.message
      });
    }
  });
}

if (require.main === module) {
  createServer().listen(PORT, HOST, () => {
    process.stdout.write(`Game Creative Beta listening on http://${HOST}:${PORT}\n`);
  });
}

module.exports = {
  createServer,
  dispatchApi,
  resolveSourceFileRequest
};
