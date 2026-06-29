"use strict";

const fs = require("fs");
const path = require("path");

function walkFiles(dirPath, bucket = []) {
  for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
    const nextPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      walkFiles(nextPath, bucket);
      continue;
    }
    if (entry.isFile()) {
      bucket.push(nextPath);
    }
  }
  return bucket;
}

function listDirectFiles(dirPath) {
  return fs.readdirSync(dirPath, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => path.join(dirPath, entry.name));
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function basenameMap(files) {
  return Object.fromEntries(
    files.map((filePath) => [path.basename(filePath).toLowerCase(), filePath])
  );
}

function pickKvImagePath(imageFiles) {
  return imageFiles.find((filePath) => /(?:^|\/)(key-visual|keyvisual|kv)\.(png|jpe?g|webp|svg)$/iu.test(filePath))
    || imageFiles[0]
    || "";
}

function normalizeImagegenAssetManifest(manifest, baseDir) {
  const rows = Array.isArray(manifest) ? manifest : manifest.assets || [];
  return Object.fromEntries(rows
    .filter((item) => item && item.assetId && item.path)
    .map((item) => {
      const resolvedPath = path.isAbsolute(item.path)
        ? item.path
        : path.resolve(baseDir, item.path);
      return [item.assetId, {
        ...item,
        path: resolvedPath
      }];
    }));
}

function resolvePortableAssetPath(filePath, baseDir) {
  if (typeof filePath !== "string" || !filePath.trim()) {
    return filePath;
  }
  if (path.isAbsolute(filePath)) {
    return path.resolve(filePath);
  }

  const baseCandidate = path.resolve(baseDir, filePath);
  if (fs.existsSync(baseCandidate)) {
    return baseCandidate;
  }

  const cwdCandidate = path.resolve(filePath);
  if (fs.existsSync(cwdCandidate)) {
    return cwdCandidate;
  }

  return baseCandidate;
}

function normalizeImagegenAssetRegistry(registry, baseDir) {
  if (!registry) {
    return {};
  }

  const rows = Array.isArray(registry)
    ? registry
    : Object.entries(registry).map(([assetId, item]) => ({
        assetId,
        ...(item || {})
      }));

  return Object.fromEntries(rows
    .filter((item) => item && item.assetId)
    .map((item) => {
      const next = { ...item };
      if (next.path) {
        next.path = resolvePortableAssetPath(next.path, baseDir);
      }
      return [next.assetId, next];
    }));
}

function pickExistingPath(byBasename, names) {
  for (const name of names) {
    if (byBasename[name]) {
      return byBasename[name];
    }
  }
  return "";
}

function normalizeProjectScreens(projectRoot, manifest) {
  const screens = Array.isArray(manifest.screens) ? manifest.screens : [];
  return screens
    .filter((screen) => screen && screen.screenId)
    .map((screen) => {
      const screenPath = screen.path || screen.folderPath || screen.dir || "";
      return {
        screenId: screen.screenId,
        name: screen.name || screen.screenName || screen.screenId,
        path: screenPath,
        screenFolderPath: screenPath ? path.resolve(projectRoot, screenPath) : "",
        role: screen.role || screen.screenRole || "",
        notes: screen.notes || ""
      };
    });
}

function resolveProjectScreenFolder(projectRoot, manifest, requestedScreenId = "") {
  const screens = Array.isArray(manifest.screens) ? manifest.screens : [];
  if (!screens.length) {
    throw new Error("Project manifest must include screens");
  }

  const projectScreens = normalizeProjectScreens(projectRoot, manifest);
  const screenId = requestedScreenId || manifest.defaultScreenId || screens[0].screenId;
  const screen = projectScreens.find((item) => item && item.screenId === screenId);
  if (!screen) {
    throw new Error(`Screen not found in project manifest: ${screenId}`);
  }

  if (!screen.path) {
    throw new Error(`Project screen ${screenId} must include path`);
  }

  return {
    projectId: manifest.projectId || "",
    projectName: manifest.projectName || manifest.name || "",
    projectRoot,
    defaultScreenId: manifest.defaultScreenId || screens[0].screenId || "",
    projectScreens,
    screen,
    screenId,
    screenFolderPath: screen.screenFolderPath
  };
}

function ensureWorkflowDefaults(bundle, { projectRoot = "", screenFolderPath }) {
  bundle.worldPreset.imagegenWorkflow = {
    ...(bundle.worldPreset.imagegenWorkflow || {})
  };

  if (!bundle.worldPreset.imagegenWorkflow.outputDir) {
    bundle.worldPreset.imagegenWorkflow.outputDir = path.join(screenFolderPath, "generated-assets");
  }

  if (!bundle.worldPreset.imagegenWorkflow.jobDir) {
    const baseDir = projectRoot || screenFolderPath;
    bundle.worldPreset.imagegenWorkflow.jobDir = path.join(baseDir, ".game-creative-generation", "imagegen-jobs");
  }
}

function registerGeneratedAssetsFromFolder(bundle, generatedAssetsDir) {
  if (!fs.existsSync(generatedAssetsDir) || !fs.statSync(generatedAssetsDir).isDirectory()) {
    return;
  }

  const assetIds = new Set((bundle.materialSpecSheet.assets || []).map((asset) => asset.assetId));
  const generatedFiles = fs.readdirSync(generatedAssetsDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && /\.(png|jpe?g|webp)$/iu.test(entry.name))
    .map((entry) => path.join(generatedAssetsDir, entry.name));

  if (!generatedFiles.length) {
    return;
  }

  const current = bundle.worldPreset.imagegenAssets || {};
  bundle.worldPreset.imagegenAssets = Array.isArray(current)
    ? Object.fromEntries(current.filter((item) => item && item.assetId).map((item) => [item.assetId, item]))
    : { ...current };

  for (const filePath of generatedFiles) {
    const assetId = path.basename(filePath).replace(/\.(png|jpe?g|webp)$/iu, "");
    if (!assetIds.has(assetId) || bundle.worldPreset.imagegenAssets[assetId]) {
      continue;
    }
    bundle.worldPreset.imagegenAssets[assetId] = {
      assetId,
      path: filePath,
      backend: "folder_generated_asset",
      usesImagegen: true,
      notes: "Auto-registered from generated-assets folder."
    };
  }
}

function resolveScreenBundleFromFolder(resolved, projectContext = {}) {
  const directFiles = listDirectFiles(resolved);
  const directJsonFiles = directFiles.filter((filePath) => filePath.endsWith(".json"));
  const directByBasename = basenameMap(directJsonFiles);
  const files = walkFiles(resolved);
  const jsonFiles = files.filter((filePath) => filePath.endsWith(".json"));
  const imageFiles = files.filter((filePath) => /\.(png|jpe?g|webp|svg)$/iu.test(filePath));

  const screenKvPath =
    pickExistingPath(directByBasename, ["screen-kv.json", "screenkv.json", "screen.json"]);
  const specPath =
    pickExistingPath(directByBasename, ["material-spec.json", "materialspec.json", "spec.json"]);
  const worldPresetPath =
    pickExistingPath(directByBasename, ["world-preset.json", "worldpreset.json", "preset.json"]);
  const imagegenManifestPath =
    pickExistingPath(directByBasename, ["imagegen-assets.json", "generated-assets.json", "asset-images.json"]);

  let bundle = null;
  if (screenKvPath && specPath && worldPresetPath) {
    bundle = {
      screenKv: readJson(screenKvPath),
      materialSpecSheet: readJson(specPath),
      worldPreset: readJson(worldPresetPath),
      revisionMap: {}
    };
  } else {
    const bundlePath = pickExistingPath(directByBasename, ["bundle.json", "game-creative-bundle.json"]);
    if (!bundlePath) {
      throw new Error(
        "Could not find the trio of screen-kv.json, material-spec.json, world-preset.json or bundle.json"
      );
    }
    bundle = readJson(bundlePath);
  }

  if (!bundle.revisionMap || typeof bundle.revisionMap !== "object") {
    bundle.revisionMap = {};
  }

  ensureWorkflowDefaults(bundle, {
    projectRoot: projectContext.projectRoot || "",
    screenFolderPath: resolved
  });

  const referenceImages = imageFiles.map((filePath) => ({
    path: filePath,
    role: "imported_reference",
    notes: "Imported from source folder"
  }));

  if (!bundle.worldPreset.referenceImages || !Array.isArray(bundle.worldPreset.referenceImages)) {
    bundle.worldPreset.referenceImages = [];
  }

  bundle.worldPreset.imagegenAssets = normalizeImagegenAssetRegistry(
    bundle.worldPreset.imagegenAssets,
    resolved
  );

  if (imagegenManifestPath) {
    bundle.worldPreset.imagegenAssets = {
      ...(bundle.worldPreset.imagegenAssets || {}),
      ...normalizeImagegenAssetManifest(readJson(imagegenManifestPath), path.dirname(imagegenManifestPath))
    };
  }

  registerGeneratedAssetsFromFolder(bundle, path.join(resolved, "generated-assets"));

  const existingPaths = new Set(bundle.worldPreset.referenceImages.map((item) => item.path));
  for (const image of referenceImages) {
    if (!existingPaths.has(image.path)) {
      bundle.worldPreset.referenceImages.push(image);
    }
  }

  return {
    bundle,
    source: {
      folderPath: resolved,
      projectRoot: projectContext.projectRoot || "",
      projectId: projectContext.projectId || "",
      projectName: projectContext.projectName || "",
      manifestPath: projectContext.manifestPath || "",
      defaultScreenId: projectContext.defaultScreenId || "",
      projectScreens: projectContext.projectScreens || [],
      screenId: projectContext.screenId || bundle.screenKv.screenId,
      screenName: projectContext.screen && projectContext.screen.name ? projectContext.screen.name : bundle.screenKv.screenName,
      screenFolderPath: resolved,
      jsonFiles,
      imageFiles,
      kvImagePath: pickKvImagePath(imageFiles)
    }
  };
}

function resolveBundleFromFolder(folderPath, options = {}) {
  const resolved = path.resolve(folderPath);
  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isDirectory()) {
    throw new Error(`Folder not found: ${resolved}`);
  }

  const directByBasename = basenameMap(listDirectFiles(resolved).filter((filePath) => filePath.endsWith(".json")));
  const projectManifestPath = pickExistingPath(directByBasename, [
    "game-creative-project.json",
    "creative-project.json",
    "creative-screens.json"
  ]);

  const hasDirectScreenBundle = Boolean(
    pickExistingPath(directByBasename, ["bundle.json", "game-creative-bundle.json"])
      || (
        pickExistingPath(directByBasename, ["screen-kv.json", "screenkv.json", "screen.json"])
        && pickExistingPath(directByBasename, ["material-spec.json", "materialspec.json", "spec.json"])
        && pickExistingPath(directByBasename, ["world-preset.json", "worldpreset.json", "preset.json"])
      )
  );

  if (!hasDirectScreenBundle && projectManifestPath) {
    const manifest = readJson(projectManifestPath);
    const projectContext = resolveProjectScreenFolder(resolved, manifest, options.screenId || "");
    return resolveScreenBundleFromFolder(projectContext.screenFolderPath, {
      ...projectContext,
      manifestPath: projectManifestPath
    });
  }

  return resolveScreenBundleFromFolder(resolved);
}

module.exports = {
  resolveBundleFromFolder
};
