const state = {
  commentDrafts: {},
  generationReport: null,
  imagegenReport: null,
  screenKv: null,
  materialSpecSheet: null,
  worldPreset: null,
  flowStep: "load",
  implementationReport: "",
  validationReport: null,
  referenceQualityProfile: null,
  referenceQualityCompactProfile: null,
  assetQualityAudit: null,
  viewMode: "draft",
  compositionFocus: false,
  regenerationQueue: [],
  regenerationQueueDirty: false,
  regenerationQueuePath: "",
  regenerationPrompt: "",
  revisionMap: {},
  renderModel: null,
  review: null,
  reviewSuggestionsByAsset: {},
  selectedCompositionEditorGroupId: "",
  selectedCompositionGroupId: "",
  selectedPlacementId: "",
  placementPointerEdit: null,
  placementTuneMode: false,
  movePlacementDependents: true,
  source: {
    kind: "none"
  }
};

const MIN_BUSY_MS = 650;
const placementEditLogic = window.GameScreenFoundryPlacementEditLogic;

const elements = {
  activityOverlay: document.getElementById("activityOverlay"),
  activityOverlayLabel: document.getElementById("activityOverlayLabel"),
  activityStatus: document.getElementById("activityStatus"),
  aiModeLabel: document.getElementById("aiModeLabel"),
  applyLocksButton: document.getElementById("applyLocksButton"),
  assetGrid: document.getElementById("assetGrid"),
  bundleFileInput: document.getElementById("bundleFileInput"),
  applyCompositionInsetButton: document.getElementById("applyCompositionInsetButton"),
  applyPlacementEditButton: document.getElementById("applyPlacementEditButton"),
  compositionCountLabel: document.getElementById("compositionCountLabel"),
  compositionEditorSelect: document.getElementById("compositionEditorSelect"),
  compositionGroupList: document.getElementById("compositionGroupList"),
  compositionPanel: document.getElementById("compositionPanel"),
  compositionSummary: document.getElementById("compositionSummary"),
  contentInsetBottomInput: document.getElementById("contentInsetBottomInput"),
  contentInsetLeftInput: document.getElementById("contentInsetLeftInput"),
  contentInsetRightInput: document.getElementById("contentInsetRightInput"),
  contentInsetTopInput: document.getElementById("contentInsetTopInput"),
  draftButton: document.getElementById("draftButton"),
  structureButton: document.getElementById("structureButton"),
  folderPathInput: document.getElementById("folderPathInput"),
  flowCurrentLabel: document.getElementById("flowCurrentLabel"),
  flowSteps: document.getElementById("flowSteps"),
  exportReportButton: document.getElementById("exportReportButton"),
  generateButton: document.getElementById("generateButton"),
  handoffBlockerList: document.getElementById("handoffBlockerList"),
  handoffDetailList: document.getElementById("handoffDetailList"),
  handoffPanel: document.getElementById("handoffPanel"),
  handoffSummary: document.getElementById("handoffSummary"),
  imagegenJobButton: document.getElementById("imagegenJobButton"),
  imagegenRefreshButton: document.getElementById("imagegenRefreshButton"),
  imagegenStatus: document.getElementById("imagegenStatus"),
  implementationReportOutput: document.getElementById("implementationReportOutput"),
  implementationReportPanel: document.getElementById("implementationReportPanel"),
  implementationReportStatus: document.getElementById("implementationReportStatus"),
  kvPreviewImage: document.getElementById("kvPreviewImage"),
  kvPreviewWrap: document.getElementById("kvPreviewWrap"),
  kvStatus: document.getElementById("kvStatus"),
  loadDemoButton: document.getElementById("loadDemoButton"),
  loadFolderButton: document.getElementById("loadFolderButton"),
  presetInput: document.getElementById("presetInput"),
  placementEditorSelect: document.getElementById("placementEditorSelect"),
  placementHeightInput: document.getElementById("placementHeightInput"),
  placementGrowHeight: document.getElementById("placementGrowHeight"),
  placementGrowWidth: document.getElementById("placementGrowWidth"),
  placementNudgeDown: document.getElementById("placementNudgeDown"),
  placementNudgeLeft: document.getElementById("placementNudgeLeft"),
  placementNudgeRight: document.getElementById("placementNudgeRight"),
  placementNudgeUp: document.getElementById("placementNudgeUp"),
  placementParentInput: document.getElementById("placementParentInput"),
  placementShrinkHeight: document.getElementById("placementShrinkHeight"),
  placementShrinkWidth: document.getElementById("placementShrinkWidth"),
  placementStepInput: document.getElementById("placementStepInput"),
  placementFollowToggle: document.getElementById("placementFollowToggle"),
  placementTuneToggle: document.getElementById("placementTuneToggle"),
  placementWidthInput: document.getElementById("placementWidthInput"),
  placementXInput: document.getElementById("placementXInput"),
  placementYInput: document.getElementById("placementYInput"),
  placementZInput: document.getElementById("placementZInput"),
  projectScreenSelect: document.getElementById("projectScreenSelect"),
  applyReferenceProfileButton: document.getElementById("applyReferenceProfileButton"),
  buildRegenPromptButton: document.getElementById("buildRegenPromptButton"),
  buildReferenceProfileButton: document.getElementById("buildReferenceProfileButton"),
  clearRegenQueueButton: document.getElementById("clearRegenQueueButton"),
  auditReferenceQualityButton: document.getElementById("auditReferenceQualityButton"),
  loadRegenQueueButton: document.getElementById("loadRegenQueueButton"),
  referenceMaxFilesInput: document.getElementById("referenceMaxFilesInput"),
  referenceQualityOutput: document.getElementById("referenceQualityOutput"),
  referenceQualityPanel: document.getElementById("referenceQualityPanel"),
  referenceQualityStatus: document.getElementById("referenceQualityStatus"),
  referenceRootInput: document.getElementById("referenceRootInput"),
  regenPromptOutput: document.getElementById("regenPromptOutput"),
  regenQueueCountLabel: document.getElementById("regenQueueCountLabel"),
  regenQueueList: document.getElementById("regenQueueList"),
  regenQueuePanel: document.getElementById("regenQueuePanel"),
  reviewButton: document.getElementById("reviewButton"),
  reviewOutput: document.getElementById("reviewOutput"),
  saveRegenQueueButton: document.getElementById("saveRegenQueueButton"),
  screenCanvas: document.getElementById("screenCanvas"),
  screenCanvasWrap: document.getElementById("screenCanvasWrap"),
  screenKvInput: document.getElementById("screenKvInput"),
  screenMeta: document.getElementById("screenMeta"),
  specInput: document.getElementById("specInput"),
  assetCardTemplate: document.getElementById("assetCardTemplate"),
  assetCountLabel: document.getElementById("assetCountLabel"),
  assetPanel: document.getElementById("assetPanel"),
  sourceStatus: document.getElementById("sourceStatus"),
  specEditorPanel: document.getElementById("specEditorPanel"),
  specEditorStatus: document.getElementById("specEditorStatus"),
  validateButton: document.getElementById("validateButton"),
  validationOutput: document.getElementById("validationOutput"),
  validationPanel: document.getElementById("validationPanel"),
  validationStatus: document.getElementById("validationStatus")
};

const FLOW_STEPS = [
  {
    id: "load",
    label: "設計図を読み込む"
  },
  {
    id: "draft",
    label: "仮組み確認"
  },
  {
    id: "show",
    label: "生成後を表示"
  },
  {
    id: "review",
    label: "レビュー/コメント"
  },
  {
    id: "queue",
    label: "再生成キュー"
  },
  {
    id: "prompt",
    label: "Codex依頼文"
  },
  {
    id: "dialogue",
    label: "対話で生成"
  },
  {
    id: "import",
    label: "再取り込み"
  }
];

function setFlowStep(stepId) {
  const currentIndex = Math.max(0, FLOW_STEPS.findIndex((step) => step.id === stepId));
  state.flowStep = FLOW_STEPS[currentIndex].id;
  elements.flowCurrentLabel.textContent = `現在: ${FLOW_STEPS[currentIndex].label}`;

  elements.flowSteps.querySelectorAll(".flow-step").forEach((stepElement) => {
    const index = FLOW_STEPS.findIndex((step) => step.id === stepElement.dataset.flowStep);
    stepElement.classList.toggle("is-current", index === currentIndex);
    stepElement.classList.toggle("is-complete", index < currentIndex);
    stepElement.classList.toggle("is-pending", index > currentIndex);
  });

  elements.flowSteps.querySelectorAll(".flow-link").forEach((linkElement, index) => {
    linkElement.classList.toggle("is-complete", index < currentIndex);
  });
}

function setViewMode(mode) {
  state.viewMode = mode;
  elements.draftButton.classList.toggle("is-active", mode === "draft");
  elements.structureButton.classList.toggle("is-active", mode === "structure");
  elements.generateButton.classList.toggle("is-active", mode === "generated");
  elements.screenCanvasWrap.dataset.viewMode = mode;
}

function escapeQueryPath(filePath) {
  return `/api/source-file?path=${encodeURIComponent(filePath)}`;
}

function findKvImagePath() {
  if (state.source && state.source.kvImagePath) {
    return state.source.kvImagePath;
  }

  const refs = state.worldPreset && Array.isArray(state.worldPreset.referenceImages)
    ? state.worldPreset.referenceImages
    : [];
  const picked = refs.find((item) => /(?:^|\/)(key-visual|keyvisual|kv)\.(png|jpe?g|webp|svg)$/iu.test(item.path || ""))
    || refs.find((item) => /\.(png|jpe?g|webp|svg)$/iu.test(item.path || ""));
  return picked ? picked.path : "";
}

function renderKvPreview() {
  const kvPath = findKvImagePath();
  if (!kvPath) {
    elements.kvPreviewWrap.classList.add("empty");
    elements.kvPreviewImage.removeAttribute("src");
    elements.kvStatus.textContent = "画像なし";
    return;
  }

  elements.kvPreviewWrap.classList.remove("empty");
  elements.kvPreviewImage.src = escapeQueryPath(kvPath);
  elements.kvStatus.textContent = "常時表示";
}

function setBusy(button, busy, label) {
  button.disabled = busy;
  if (busy) {
    button.dataset.originalLabel = button.textContent;
    button.textContent = label;
  } else if (button.dataset.originalLabel) {
    button.textContent = button.dataset.originalLabel;
  }
}

function nowLabel() {
  return new Date().toLocaleTimeString("ja-JP", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  });
}

function setActivityStatus(message, { busy = false } = {}) {
  elements.activityStatus.textContent = message;
  elements.activityStatus.classList.toggle("is-busy", busy);
  elements.activityStatus.classList.toggle("is-success", !busy && /生成しました|読み込みました|保存しました|更新しました|再採用しました|完了/.test(message));
}

function setWorkspaceBusy(busy, label) {
  elements.activityOverlay.classList.toggle("hidden", !busy);
  elements.activityOverlayLabel.textContent = label;
  elements.screenCanvasWrap.classList.toggle("is-busy", busy);
  elements.assetGrid.classList.toggle("is-busy", busy);
  elements.reviewOutput.classList.toggle("is-busy", busy);
  if (busy) {
    setActivityStatus(label, { busy: true });
  } else {
    elements.activityStatus.classList.remove("is-busy");
  }
}

function sleep(ms) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

async function ensureMinimumBusy(startedAt) {
  const elapsed = Date.now() - startedAt;
  const remaining = MIN_BUSY_MS - elapsed;
  if (remaining > 0) {
    await sleep(remaining);
  }
}

function getPayloadFromEditors() {
  return {
    screenKv: JSON.parse(elements.screenKvInput.value),
    materialSpecSheet: JSON.parse(elements.specInput.value),
    worldPreset: JSON.parse(elements.presetInput.value),
    revisionMap: state.revisionMap
  };
}

function getPayloadFromEditorsSafely() {
  const fields = [
    ["screenKv", elements.screenKvInput, "画面 KV"],
    ["materialSpecSheet", elements.specInput, "素材仕様書"],
    ["worldPreset", elements.presetInput, "世界観プリセット"]
  ];
  const payload = {
    revisionMap: state.revisionMap
  };
  const diagnostics = [];

  fields.forEach(([key, element, label]) => {
    try {
      payload[key] = JSON.parse(element.value);
    } catch (error) {
      diagnostics.push({
        severity: "error",
        code: "json_parse",
        message: `${label}: ${error.message}`
      });
    }
  });

  return {
    payload,
    diagnostics
  };
}

function getDraftPayloadFromEditors() {
  const payload = getPayloadFromEditors();
  return {
    ...payload,
    revisionMap: {}
  };
}

function updateEditors() {
  elements.screenKvInput.value = JSON.stringify(state.screenKv, null, 2);
  elements.specInput.value = JSON.stringify(state.materialSpecSheet, null, 2);
  elements.presetInput.value = JSON.stringify(state.worldPreset, null, 2);
  renderKvPreview();
  renderStructuredSpecEditor();
}

function syncStateFromPayload(payload) {
  state.screenKv = payload.screenKv;
  state.materialSpecSheet = payload.materialSpecSheet;
  state.worldPreset = payload.worldPreset;
  state.revisionMap = payload.revisionMap || {};
  const referenceDerived = state.worldPreset
    && state.worldPreset.qualityProfile
    && state.worldPreset.qualityProfile.referenceDerived;
  if (referenceDerived && referenceDerived.summary) {
    state.referenceQualityCompactProfile = referenceDerived;
    if (!state.referenceQualityProfile || state.referenceQualityProfile.schema !== "game-screen-foundry.reference-quality-profile.v1") {
      state.referenceQualityProfile = referenceDerived;
    }
  }
}

function renderSourceStatus() {
  if (state.source.kind === "folder") {
    const imageCount = state.source.imageFiles ? state.source.imageFiles.length : 0;
    const jsonCount = state.source.jsonFiles ? state.source.jsonFiles.length : 0;
    if (state.source.projectRoot) {
      const screenCount = Array.isArray(state.source.projectScreens) ? state.source.projectScreens.length : 0;
      const label = state.source.screenId
        ? `${state.source.screenId} / ${state.source.screenName || ""}`.trim()
        : state.source.screenName || "未指定画面";
      elements.sourceStatus.textContent = `読み込み元: プロジェクト ${state.source.projectRoot} / 画面 ${label} / screens ${screenCount} / JSON ${jsonCount} / 画像 ${imageCount}`;
      renderProjectNavigator();
      return;
    }
    elements.sourceStatus.textContent = `読み込み元: フォルダ ${state.source.folderPath} / JSON ${jsonCount} / 画像 ${imageCount}`;
    renderProjectNavigator();
    return;
  }

  if (state.source.kind === "bundle-file") {
    elements.sourceStatus.textContent = `読み込み元: 取り込み済みバンドル ${state.source.fileName}`;
    renderProjectNavigator();
    return;
  }

  if (state.source.kind === "demo") {
    elements.sourceStatus.textContent = "読み込み元: デモバンドル";
    renderProjectNavigator();
    return;
  }

  elements.sourceStatus.textContent = "読み込み元: 未読み込み";
  renderProjectNavigator();
}

function renderProjectNavigator() {
  const screens = state.source && Array.isArray(state.source.projectScreens)
    ? state.source.projectScreens
    : [];
  elements.projectScreenSelect.innerHTML = "";

  if (!screens.length || !state.source.projectRoot) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "画面選択";
    elements.projectScreenSelect.appendChild(option);
    elements.projectScreenSelect.disabled = true;
    elements.projectScreenSelect.title = "game-creative-project.json を含むプロジェクトを読み込むと有効になります。";
    return;
  }

  screens.forEach((screen) => {
    const option = document.createElement("option");
    option.value = screen.screenId;
    option.textContent = `${screen.screenId} / ${screen.name || screen.screenId}`;
    option.title = screen.path || "";
    elements.projectScreenSelect.appendChild(option);
  });

  elements.projectScreenSelect.disabled = false;
  elements.projectScreenSelect.value = state.source.screenId || state.source.defaultScreenId || screens[0].screenId;
  elements.projectScreenSelect.title = `プロジェクト内の ${screens.length} 画面を切り替えます。`;
}

function parseFolderPathInput(value) {
  const trimmed = value.trim();
  const hashIndex = trimmed.lastIndexOf("#");
  if (hashIndex <= 0) {
    return {
      folderPath: trimmed,
      screenId: ""
    };
  }
  return {
    folderPath: trimmed.slice(0, hashIndex).trim(),
    screenId: trimmed.slice(hashIndex + 1).trim()
  };
}

function getPlacements() {
  return state.materialSpecSheet && Array.isArray(state.materialSpecSheet.placements)
    ? state.materialSpecSheet.placements
    : [];
}

function getSelectedPlacement() {
  return getPlacements().find((item) => item.placementId === state.selectedPlacementId) || null;
}

function getMaterialCompositionGroups() {
  return state.materialSpecSheet && Array.isArray(state.materialSpecSheet.compositionGroups)
    ? state.materialSpecSheet.compositionGroups
    : [];
}

function setOptions(select, rows, getValue, getLabel, emptyLabel) {
  select.innerHTML = "";
  if (!rows.length) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = emptyLabel;
    select.appendChild(option);
    return;
  }
  rows.forEach((row) => {
    const option = document.createElement("option");
    option.value = getValue(row);
    option.textContent = getLabel(row);
    select.appendChild(option);
  });
}

function setSpecEditorDisabled(disabled) {
  [
    elements.placementEditorSelect,
    elements.placementXInput,
    elements.placementYInput,
    elements.placementWidthInput,
    elements.placementHeightInput,
    elements.placementZInput,
    elements.placementParentInput,
    elements.placementStepInput,
    elements.placementFollowToggle,
    elements.placementTuneToggle,
    elements.placementNudgeUp,
    elements.placementNudgeLeft,
    elements.placementNudgeRight,
    elements.placementNudgeDown,
    elements.placementShrinkWidth,
    elements.placementGrowWidth,
    elements.placementShrinkHeight,
    elements.placementGrowHeight,
    elements.applyPlacementEditButton,
    elements.compositionEditorSelect,
    elements.contentInsetTopInput,
    elements.contentInsetRightInput,
    elements.contentInsetBottomInput,
    elements.contentInsetLeftInput,
    elements.applyCompositionInsetButton
  ].forEach((element) => {
    element.disabled = disabled;
  });
}

function normalizeInsetForEditor(value) {
  if (typeof value === "number") {
    return {
      top: value,
      right: value,
      bottom: value,
      left: value
    };
  }
  const inset = value && typeof value === "object" ? value : {};
  return {
    top: Number(inset.top || 0),
    right: Number(inset.right || 0),
    bottom: Number(inset.bottom || 0),
    left: Number(inset.left || 0)
  };
}

function syncPlacementEditorFields(placement) {
  elements.placementXInput.value = placement ? placement.x : "";
  elements.placementYInput.value = placement ? placement.y : "";
  elements.placementWidthInput.value = placement ? placement.width : "";
  elements.placementHeightInput.value = placement ? placement.height : "";
  elements.placementZInput.value = placement ? placement.zIndex : "";
  elements.placementParentInput.value = placement ? placement.parentId || "" : "";
}

function getPlacementStep() {
  const value = Number(elements.placementStepInput.value || 8);
  return Number.isFinite(value) && value > 0 ? Math.round(value) : 8;
}

function getPlacementBoxFromGeometry(geometry) {
  return {
    left: Math.round(geometry.x - geometry.width / 2),
    top: Math.round(geometry.y - geometry.height / 2),
    width: Math.max(1, Math.round(geometry.width)),
    height: Math.max(1, Math.round(geometry.height))
  };
}

function findLayerElementByPlacementId(placementId) {
  return [...elements.screenCanvas.querySelectorAll(".screen-layer")]
    .find((element) => element.dataset.placementId === placementId) || null;
}

function updateLivePlacementDom(placement) {
  const box = getPlacementBoxFromGeometry(placement);
  const layerElement = findLayerElementByPlacementId(placement.placementId);
  if (layerElement) {
    layerElement.style.left = `${box.left}px`;
    layerElement.style.top = `${box.top}px`;
    layerElement.style.width = `${box.width}px`;
    layerElement.style.height = `${box.height}px`;
  }

  const overlay = elements.screenCanvas.querySelector(".placement-edit-overlay");
  if (overlay && overlay.dataset.placementId === placement.placementId) {
    overlay.style.left = `${box.left}px`;
    overlay.style.top = `${box.top}px`;
    overlay.style.width = `${box.width}px`;
    overlay.style.height = `${box.height}px`;
    const label = overlay.querySelector(".placement-edit-label");
    if (label) {
      label.textContent = `${placement.placementId} ${placement.width}x${placement.height} @ ${placement.x},${placement.y}`;
    }
  }
}

function updateRenderLayerGeometry(placement) {
  if (!state.renderModel || !state.renderModel.screen) {
    return;
  }
  const layer = state.renderModel.screen.layers.find((item) => item.placementId === placement.placementId);
  if (!layer) {
    return;
  }
  const box = getPlacementBoxFromGeometry(placement);
  layer.left = box.left;
  layer.top = box.top;
  layer.width = box.width;
  layer.height = box.height;
}

function applyPlacementGeometry(placement, geometry, { liveDom = true, syncFields = true } = {}) {
  placement.x = Math.round(geometry.x);
  placement.y = Math.round(geometry.y);
  placement.width = Math.max(1, Math.round(geometry.width));
  placement.height = Math.max(1, Math.round(geometry.height));
  updateRenderLayerGeometry(placement);
  if (syncFields) {
    syncPlacementEditorFields(placement);
  }
  if (liveDom) {
    updateLivePlacementDom(placement);
  }
}

// Placements riding on the given one: parentId descendants, layers/children
// of composition groups rooted at it, and higher-z placements sitting fully
// inside its box. Used to move a base together with everything on top.
function collectDependentPlacements(rootPlacement) {
  const placements = getPlacements();
  const byId = new Map(placements.map((placement) => [placement.placementId, placement]));
  return placementEditLogic.collectDependentPlacementIds({
    placements,
    compositionGroups: getMaterialCompositionGroups(),
    rootPlacementId: rootPlacement.placementId
  }).map((placementId) => byId.get(placementId)).filter(Boolean);
}

function shiftDependentPlacements(dependents, dx, dy) {
  if (!dx && !dy) {
    return;
  }
  for (const placement of dependents) {
    applyPlacementGeometry(placement, {
      x: placement.x + dx,
      y: placement.y + dy,
      width: placement.width,
      height: placement.height
    }, { syncFields: false });
  }
}

// The renderer positions overlays from targetPlacementId + slot; the absolute
// x/y/width/height mirror is recomputed after every structured edit so both
// representations stay in agreement (overlay_xy_slot_mismatch stays quiet).
function syncOverlayAbsoluteGeometry() {
  placementEditLogic.syncOverlayAbsoluteGeometryForSpec(state.materialSpecSheet);
}

function renderStructuredSpecEditor() {
  const placements = getPlacements();
  const groups = getMaterialCompositionGroups();
  setSpecEditorDisabled(!placements.length);
  elements.specEditorStatus.textContent = placements.length
    ? `${placements.length} placements / ${groups.length} groups`
    : "未読み込み";

  setOptions(
    elements.placementEditorSelect,
    placements,
    (placement) => placement.placementId,
    (placement) => `${placement.placementId} / ${placement.assetId}`,
    "placementなし"
  );
  if (placements.length && !placements.some((placement) => placement.placementId === state.selectedPlacementId)) {
    state.selectedPlacementId = placements[0].placementId;
  }
  elements.placementEditorSelect.value = state.selectedPlacementId || "";
  const placement = getSelectedPlacement();
  syncPlacementEditorFields(placement);
  elements.placementFollowToggle.checked = state.movePlacementDependents;
  elements.placementTuneToggle.textContent = state.placementTuneMode ? "微調整 ON" : "微調整 OFF";
  elements.placementTuneToggle.setAttribute("aria-pressed", state.placementTuneMode ? "true" : "false");

  setOptions(
    elements.compositionEditorSelect,
    groups,
    (group) => group.groupId,
    (group) => `${group.groupId} / ${group.kind || "group"}`,
    "groupなし"
  );
  if (groups.length && !groups.some((group) => group.groupId === state.selectedCompositionEditorGroupId)) {
    state.selectedCompositionEditorGroupId = state.selectedCompositionGroupId || groups[0].groupId;
  }
  elements.compositionEditorSelect.disabled = !groups.length;
  elements.applyCompositionInsetButton.disabled = !groups.length;
  elements.compositionEditorSelect.value = state.selectedCompositionEditorGroupId || "";
  const group = groups.find((item) => item.groupId === state.selectedCompositionEditorGroupId) || null;
  const inset = normalizeInsetForEditor(group ? group.contentInset || group.minChildInset : null);
  elements.contentInsetTopInput.disabled = !group;
  elements.contentInsetRightInput.disabled = !group;
  elements.contentInsetBottomInput.disabled = !group;
  elements.contentInsetLeftInput.disabled = !group;
  elements.contentInsetTopInput.value = group ? inset.top : "";
  elements.contentInsetRightInput.value = group ? inset.right : "";
  elements.contentInsetBottomInput.value = group ? inset.bottom : "";
  elements.contentInsetLeftInput.value = group ? inset.left : "";
}

function readNumberField(input, label, { min = -Infinity } = {}) {
  const value = Number(input.value);
  if (!Number.isFinite(value)) {
    throw new Error(`${label} は数値で入力してください。`);
  }
  if (value < min) {
    throw new Error(`${label} は ${min} 以上にしてください。`);
  }
  return Math.round(value);
}

async function refreshAfterStructuredSpecEdit(message, button) {
  const busyStartedAt = Date.now();
  if (button) {
    setBusy(button, true, "反映中...");
  }
  setWorkspaceBusy(true, "構造化編集を反映しています...");
  try {
    syncOverlayAbsoluteGeometry();
    elements.specInput.value = JSON.stringify(state.materialSpecSheet, null, 2);
    state.review = null;
    state.reviewSuggestionsByAsset = {};
    renderValidationReport(null);
    await renderDraftWorkspace(message);
    setViewMode("draft");
  } catch (error) {
    window.alert(error.message);
    setActivityStatus(`構造化編集失敗: ${error.message}`);
  } finally {
    await ensureMinimumBusy(busyStartedAt);
    setWorkspaceBusy(false, "待機中");
    if (button) {
      setBusy(button, false);
    }
    renderStructuredSpecEditor();
  }
}

async function applyPlacementEditor() {
  try {
    const placement = getSelectedPlacement();
    if (!placement) {
      return;
    }
    const nextX = readNumberField(elements.placementXInput, "x");
    const nextY = readNumberField(elements.placementYInput, "y");
    const dependents = state.movePlacementDependents ? collectDependentPlacements(placement) : [];
    const dx = nextX - placement.x;
    const dy = nextY - placement.y;
    applyPlacementGeometry(placement, {
      x: nextX,
      y: nextY,
      width: readNumberField(elements.placementWidthInput, "w", { min: 1 }),
      height: readNumberField(elements.placementHeightInput, "h", { min: 1 })
    });
    shiftDependentPlacements(dependents, dx, dy);
    placement.zIndex = readNumberField(elements.placementZInput, "z");
    const parentId = elements.placementParentInput.value.trim();
    if (parentId) {
      placement.parentId = parentId;
    } else {
      delete placement.parentId;
    }
    await refreshAfterStructuredSpecEdit(`${placement.placementId} の配置を反映しました ${nowLabel()}`, elements.applyPlacementEditButton);
  } catch (error) {
    window.alert(error.message);
    setActivityStatus(`配置反映失敗: ${error.message}`);
  }
}

async function adjustSelectedPlacementGeometry(delta, label) {
  try {
    const placement = getSelectedPlacement();
    if (!placement) {
      return;
    }
    const dependents = state.movePlacementDependents ? collectDependentPlacements(placement) : [];
    applyPlacementGeometry(placement, {
      x: placement.x + (delta.x || 0),
      y: placement.y + (delta.y || 0),
      width: placement.width + (delta.width || 0),
      height: placement.height + (delta.height || 0)
    });
    shiftDependentPlacements(dependents, delta.x || 0, delta.y || 0);
    const followLabel = dependents.length && (delta.x || delta.y) ? `(載っている${dependents.length}件も追従)` : "";
    await refreshAfterStructuredSpecEdit(`${placement.placementId} を${label}しました${followLabel} ${nowLabel()}`, null);
  } catch (error) {
    window.alert(error.message);
    setActivityStatus(`配置微調整失敗: ${error.message}`);
  }
}

function togglePlacementTuneMode() {
  state.placementTuneMode = !state.placementTuneMode;
  renderStructuredSpecEditor();
  if (state.renderModel) {
    renderScreen();
  }
  setActivityStatus(`配置微調整 ${state.placementTuneMode ? "ON" : "OFF"} ${nowLabel()}`);
}

function getCanvasPoint(event) {
  const rect = elements.screenCanvas.getBoundingClientRect();
  const screen = state.renderModel ? state.renderModel.screen : null;
  const scaleX = screen && rect.width ? screen.width / rect.width : 1;
  const scaleY = screen && rect.height ? screen.height / rect.height : 1;
  return {
    x: (event.clientX - rect.left) * scaleX,
    y: (event.clientY - rect.top) * scaleY
  };
}

function getPointerEditGeometry(edit, point) {
  const dx = point.x - edit.startPoint.x;
  const dy = point.y - edit.startPoint.y;
  if (edit.mode === "resize-se") {
    const width = Math.max(1, edit.startPlacement.width + dx);
    const height = Math.max(1, edit.startPlacement.height + dy);
    return {
      x: edit.startLeft + width / 2,
      y: edit.startTop + height / 2,
      width,
      height
    };
  }

  return {
    x: edit.startPlacement.x + dx,
    y: edit.startPlacement.y + dy,
    width: edit.startPlacement.width,
    height: edit.startPlacement.height
  };
}

function handlePlacementPointerMove(event) {
  const edit = state.placementPointerEdit;
  if (!edit || event.pointerId !== edit.pointerId) {
    return;
  }
  event.preventDefault();
  const placement = getSelectedPlacement();
  if (!placement) {
    return;
  }
  const geometry = getPointerEditGeometry(edit, getCanvasPoint(event));
  applyPlacementGeometry(placement, geometry);
  if (edit.dependents && edit.mode !== "resize-se") {
    const dx = Math.round(geometry.x) - edit.startPlacement.x;
    const dy = Math.round(geometry.y) - edit.startPlacement.y;
    for (const dependent of edit.dependents) {
      applyPlacementGeometry(dependent.placement, {
        x: dependent.startX + dx,
        y: dependent.startY + dy,
        width: dependent.placement.width,
        height: dependent.placement.height
      }, { syncFields: false });
    }
  }
}

function finishPlacementPointerEdit(event) {
  const edit = state.placementPointerEdit;
  if (!edit || event.pointerId !== edit.pointerId) {
    return;
  }
  event.preventDefault();
  window.removeEventListener("pointermove", handlePlacementPointerMove);
  window.removeEventListener("pointerup", finishPlacementPointerEdit);
  window.removeEventListener("pointercancel", finishPlacementPointerEdit);
  state.placementPointerEdit = null;

  const placement = getSelectedPlacement();
  if (!placement) {
    return;
  }
  const moved = placement.x !== edit.startPlacement.x
    || placement.y !== edit.startPlacement.y
    || placement.width !== edit.startPlacement.width
    || placement.height !== edit.startPlacement.height;
  if (!moved) {
    return;
  }
  refreshAfterStructuredSpecEdit(`${placement.placementId} の微調整を反映しました ${nowLabel()}`, null);
}

function startPlacementPointerEdit(event, mode) {
  if (!state.placementTuneMode || !state.renderModel) {
    return;
  }
  const placement = getSelectedPlacement();
  if (!placement) {
    return;
  }
  event.preventDefault();
  event.stopPropagation();
  const startPoint = getCanvasPoint(event);
  const dependents = state.movePlacementDependents && mode !== "resize-se"
    ? collectDependentPlacements(placement).map((dependent) => ({
        placement: dependent,
        startX: dependent.x,
        startY: dependent.y
      }))
    : null;
  state.placementPointerEdit = {
    pointerId: event.pointerId,
    mode,
    startPoint,
    dependents,
    startPlacement: {
      x: placement.x,
      y: placement.y,
      width: placement.width,
      height: placement.height
    },
    startLeft: placement.x - placement.width / 2,
    startTop: placement.y - placement.height / 2
  };
  if (event.currentTarget.setPointerCapture) {
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  window.addEventListener("pointermove", handlePlacementPointerMove);
  window.addEventListener("pointerup", finishPlacementPointerEdit);
  window.addEventListener("pointercancel", finishPlacementPointerEdit);
}

async function applyCompositionInsetEditor() {
  try {
    const group = getMaterialCompositionGroups().find((item) => item.groupId === state.selectedCompositionEditorGroupId);
    if (!group) {
      return;
    }
    group.contentInset = {
      top: readNumberField(elements.contentInsetTopInput, "top", { min: 0 }),
      right: readNumberField(elements.contentInsetRightInput, "right", { min: 0 }),
      bottom: readNumberField(elements.contentInsetBottomInput, "bottom", { min: 0 }),
      left: readNumberField(elements.contentInsetLeftInput, "left", { min: 0 })
    };
    state.selectedCompositionGroupId = group.groupId;
    await refreshAfterStructuredSpecEdit(`${group.groupId} の contentInset を反映しました ${nowLabel()}`, elements.applyCompositionInsetButton);
  } catch (error) {
    window.alert(error.message);
    setActivityStatus(`Inset反映失敗: ${error.message}`);
  }
}

function renderImagegenStatus() {
  if (!state.imagegenReport) {
    elements.imagegenStatus.textContent = "imagegen: 未実行";
    elements.imagegenStatus.title = "";
    renderHandoffPanel();
    return;
  }

  const report = state.imagegenReport;
  const job = report.job || {};
  const runner = report.runner || {};
  const handoff = report.handoff || {};
  const adopted = Array.isArray(report.adoptedAssetIds) ? report.adoptedAssetIds.length : 0;
  const missing = Array.isArray(report.missingAssetIds) ? report.missingAssetIds.length : 0;
  const blockers = Array.isArray(report.blockerReports) ? report.blockerReports.length : 0;
  const total = Array.isArray(job.assets) ? job.assets.length : adopted + missing;
  const mode = runner.mode || "off";
  const compositionQuality = report.compositionQuality
    || (state.renderModel ? state.renderModel.compositionQuality : null);
  const compositionLabel = compositionQuality
    ? ` / 合成 ${getCompositionStatusLabel(compositionQuality.status)} ${compositionQuality.score}`
    : "";
  const stateLabel = runner.ran
    ? (runner.ok ? "実行済" : "失敗")
    : "ジョブ作成";

  const handoffLabel = handoff.state ? ` / handoff ${handoff.state}` : "";
  const blockerLabel = blockers ? ` / blocker ${blockers}` : "";
  elements.imagegenStatus.textContent = `imagegen: ${stateLabel} / mode ${mode} / 採用 ${adopted}/${total} / 未生成 ${missing}${blockerLabel}${handoffLabel}${compositionLabel}`;
  elements.imagegenStatus.title = [
    job.jobPath ? `job: ${job.jobPath}` : "",
    job.promptPath ? `prompt: ${job.promptPath}` : "",
    job.statusPath ? `status: ${job.statusPath}` : "",
    job.commandHint ? `command: ${job.commandHint}` : "",
    compositionQuality ? `composition: ${compositionQuality.status} score ${compositionQuality.score} fail ${compositionQuality.failCount} warn ${compositionQuality.warnCount}` : "",
    handoff.message || "",
    runner.message || ""
  ].filter(Boolean).join("\n");
  renderHandoffPanel();
}

function handoffStateLabel(stateName) {
  const labels = {
    no_targets: "対象なし",
    ready: "完了",
    blocked: "ブロック",
    partial_blocked: "一部ブロック",
    partial: "一部採用",
    runner_failed: "runner失敗",
    missing_outputs: "出力待ち",
    waiting: "待機中",
    created: "作成済み"
  };
  return labels[stateName] || stateName || "未作成";
}

function appendHandoffDetail(label, value) {
  const row = document.createElement("div");
  row.className = "handoff-detail-row";
  const key = document.createElement("span");
  key.textContent = label;
  const code = document.createElement("code");
  code.textContent = value || "-";
  row.appendChild(key);
  row.appendChild(code);
  elements.handoffDetailList.appendChild(row);
}

function renderHandoffPanel() {
  const report = state.imagegenReport;
  elements.handoffDetailList.innerHTML = "";
  elements.handoffBlockerList.innerHTML = "";

  if (!report || !report.job) {
    elements.handoffPanel.classList.remove("has-handoff", "has-blockers");
    elements.handoffSummary.textContent = "未作成";
    elements.handoffDetailList.className = "handoff-detail-list empty";
    elements.handoffDetailList.textContent = "imagegenジョブ作成後に、job / prompt / status / output の場所を表示します。";
    elements.handoffBlockerList.className = "handoff-blocker-list empty";
    elements.handoffBlockerList.textContent = "blocker sidecar はまだありません。";
    return;
  }

  const job = report.job;
  const handoff = report.handoff || {};
  const counts = handoff.counts || {};
  const blockers = Array.isArray(report.blockerReports) ? report.blockerReports : [];
  const total = counts.total ?? (Array.isArray(job.assets) ? job.assets.length : 0);
  const adopted = counts.adopted ?? (Array.isArray(report.adoptedAssetIds) ? report.adoptedAssetIds.length : 0);
  const missing = counts.missing ?? (Array.isArray(report.missingAssetIds) ? report.missingAssetIds.length : 0);
  const stateName = handoff.state || "created";

  elements.handoffPanel.classList.add("has-handoff");
  elements.handoffPanel.classList.toggle("has-blockers", blockers.length > 0);
  elements.handoffSummary.textContent = `${handoffStateLabel(stateName)} / 採用 ${adopted}/${total} / 未生成 ${missing}`;
  elements.handoffDetailList.className = "handoff-detail-list";
  appendHandoffDetail("job", job.jobPath);
  appendHandoffDetail("prompt", job.promptPath);
  appendHandoffDetail("status", job.statusPath || (handoff.paths && handoff.paths.statusPath));
  appendHandoffDetail("output", job.outputDir);
  appendHandoffDetail("command", job.commandHint);

  if (!blockers.length) {
    elements.handoffBlockerList.className = "handoff-blocker-list empty";
    elements.handoffBlockerList.textContent = "blocker sidecar はまだありません。";
    return;
  }

  elements.handoffBlockerList.className = "handoff-blocker-list";
  blockers.forEach((blocker) => {
    const item = document.createElement("article");
    item.className = "handoff-blocker-item";
    const title = document.createElement("strong");
    title.textContent = `${blocker.assetId || "job"}: ${blocker.reasonKind || "unknown"}`;
    const message = document.createElement("p");
    message.textContent = blocker.userMessage || "Image generation did not return a usable asset.";
    const pathLine = document.createElement("code");
    pathLine.textContent = blocker.path || "";
    item.appendChild(title);
    item.appendChild(message);
    if (blocker.suggestion) {
      const suggestion = document.createElement("p");
      suggestion.textContent = blocker.suggestion;
      item.appendChild(suggestion);
    }
    item.appendChild(pathLine);
    elements.handoffBlockerList.appendChild(item);
  });
}

function renderMeta() {
  const screen = state.renderModel.screen;
  elements.screenMeta.innerHTML = "";
  [
    `${screen.screenName}`,
    `${screen.width}x${screen.height}`,
    `レイヤー: ${screen.layers.length}`,
    `セーフエリア: ${screen.safeAreas.left || 0}/${screen.safeAreas.top || 0}/${screen.safeAreas.right || 0}/${screen.safeAreas.bottom || 0}`
  ].forEach((text) => {
    const chip = document.createElement("span");
    chip.className = "chip";
    chip.textContent = text;
    elements.screenMeta.appendChild(chip);
  });
}

function getCompositionGroups() {
  return state.renderModel && Array.isArray(state.renderModel.compositionGroups)
    ? state.renderModel.compositionGroups
    : [];
}

function ensureCompositionSelection() {
  const groups = getCompositionGroups();
  if (!groups.length) {
    state.selectedCompositionGroupId = "";
    return null;
  }
  const selected = groups.find((group) => group.groupId === state.selectedCompositionGroupId);
  if (selected) {
    return selected;
  }
  state.selectedCompositionGroupId = groups[0].groupId;
  return groups[0];
}

// Canvas focus (dimming + composition outlines) is opt-in: the default view
// shows the whole screen, and a group is only spotlighted after the user
// presses its 表示 button.
function getSelectedCompositionGroup() {
  return state.compositionFocus ? ensureCompositionSelection() : null;
}

function getCompositionStatusLabel(status) {
  if (status === "pass") {
    return "合格";
  }
  if (status === "fail") {
    return "要修正";
  }
  return "要確認";
}

function appendCompositionMetric(parent, label, value) {
  const item = document.createElement("span");
  item.className = "composition-metric";
  const key = document.createElement("span");
  key.textContent = label;
  const strong = document.createElement("strong");
  strong.textContent = String(value);
  item.appendChild(key);
  item.appendChild(strong);
  parent.appendChild(item);
}

function renderCompositionGroups() {
  const groups = getCompositionGroups();
  const quality = state.renderModel ? state.renderModel.compositionQuality : null;
  elements.compositionCountLabel.textContent = groups.length
    ? `${groups.length} 件 / score ${quality ? quality.score : "-"}`
    : "0 件";

  if (!groups.length) {
    elements.compositionPanel.classList.remove("has-groups");
    elements.compositionSummary.className = "composition-summary empty";
    elements.compositionSummary.textContent = "`compositionGroups` がある素材仕様書を読み込むと、重ね合わせ単位の品質チェックを表示します。";
    elements.compositionGroupList.className = "composition-group-list empty";
    elements.compositionGroupList.textContent = "構成グループはまだありません。";
    return;
  }

  const selected = ensureCompositionSelection();
  elements.compositionPanel.classList.add("has-groups");
  elements.compositionSummary.className = `composition-summary status-${quality.status}`;
  elements.compositionSummary.innerHTML = "";
  appendCompositionMetric(elements.compositionSummary, "状態", getCompositionStatusLabel(quality.status));
  appendCompositionMetric(elements.compositionSummary, "スコア", quality.score);
  appendCompositionMetric(elements.compositionSummary, "fail", quality.failCount);
  appendCompositionMetric(elements.compositionSummary, "warn", quality.warnCount);
  appendCompositionMetric(elements.compositionSummary, "選択中", selected ? selected.groupId : "-");

  elements.compositionGroupList.className = "composition-group-list";
  elements.compositionGroupList.innerHTML = "";

  groups.forEach((group) => {
    const article = document.createElement("article");
    article.className = `composition-group-card status-${group.status}`;
    article.classList.toggle("is-selected", group.groupId === state.selectedCompositionGroupId);

    const header = document.createElement("div");
    header.className = "composition-group-header";
    const title = document.createElement("div");
    title.className = "composition-group-title";
    const strong = document.createElement("strong");
    strong.textContent = group.groupId;
    const meta = document.createElement("span");
    meta.textContent = `${group.kind} / ${getCompositionStatusLabel(group.status)} / score ${group.score}`;
    title.appendChild(strong);
    title.appendChild(meta);

    const selectButton = document.createElement("button");
    selectButton.className = "composition-select-button";
    const isFocused = state.compositionFocus && group.groupId === state.selectedCompositionGroupId;
    selectButton.textContent = isFocused ? "表示中" : "表示";
    selectButton.addEventListener("click", () => {
      if (isFocused) {
        state.compositionFocus = false;
        setActivityStatus(`構成フォーカスを解除しました ${nowLabel()}`);
      } else {
        state.compositionFocus = true;
        state.selectedCompositionGroupId = group.groupId;
        setActivityStatus(`${group.groupId} の構成枠を表示しました ${nowLabel()}`);
      }
      renderScreen();
      renderCompositionGroups();
    });

    header.appendChild(title);
    header.appendChild(selectButton);
    article.appendChild(header);

    const anatomy = document.createElement("div");
    anatomy.className = "composition-anatomy";
    [
      `root: ${group.rootPlacementId}`,
      `layers: ${group.layerPlacementIds.length}`,
      `children: ${group.childContentPlacementIds.length}`,
      `overlays: ${group.protectedOverlayIds.length}`,
      group.contentBox ? `content: ${group.contentBox.width}x${group.contentBox.height}` : "content: -"
    ].forEach((text) => {
      const chip = document.createElement("span");
      chip.textContent = text;
      anatomy.appendChild(chip);
    });
    article.appendChild(anatomy);

    if (group.notes) {
      const notes = document.createElement("p");
      notes.className = "composition-notes";
      notes.textContent = group.notes;
      article.appendChild(notes);
    }

    const issueChecks = group.checks.filter((check) => check.status !== "pass");
    const checkList = document.createElement("div");
    checkList.className = issueChecks.length ? "composition-check-list" : "composition-check-list is-clean";
    if (!issueChecks.length) {
      const clean = document.createElement("div");
      clean.className = "composition-check status-pass";
      clean.textContent = "合成チェックは通過しています。";
      checkList.appendChild(clean);
    } else {
      issueChecks.forEach((check) => {
        const item = document.createElement("div");
        item.className = `composition-check status-${check.status}`;
        item.textContent = `${check.status}: ${check.message}`;
        checkList.appendChild(item);
      });
    }
    article.appendChild(checkList);
    elements.compositionGroupList.appendChild(article);
  });
}

function appendCompositionBox(box, className, label) {
  if (!box) {
    return;
  }
  const outline = document.createElement("div");
  outline.className = className;
  outline.style.left = `${box.left}px`;
  outline.style.top = `${box.top}px`;
  outline.style.width = `${box.width}px`;
  outline.style.height = `${box.height}px`;
  outline.style.zIndex = "10000";
  if (label) {
    const labelElement = document.createElement("span");
    labelElement.textContent = label;
    outline.appendChild(labelElement);
  }
  elements.screenCanvas.appendChild(outline);
}

function renderCompositionOverlays(group) {
  if (!group) {
    return;
  }
  appendCompositionBox(group.bounds, "composition-outline composition-bounds-outline", group.groupId);
  appendCompositionBox(group.rootBox, "composition-outline composition-root-outline", "root");
  if (group.contentBox) {
    appendCompositionBox(group.contentBox, "composition-outline composition-content-outline", "content");
  }
  group.layers.forEach((layer) => {
    if (layer.placementId !== group.rootPlacementId) {
      appendCompositionBox(layer.box, "composition-outline composition-layer-outline", layer.placementId);
    }
  });
  group.childContent.forEach((layer) => {
    appendCompositionBox(layer.box, "composition-outline composition-child-outline", layer.placementId);
  });
  group.protectedOverlays.forEach((overlay) => {
    appendCompositionBox(overlay.box, "composition-outline composition-overlay-outline", overlay.overlayId);
  });
}

function renderPlacementEditOverlay() {
  if (!state.placementTuneMode || !state.renderModel || !state.selectedPlacementId) {
    return;
  }
  const layer = state.renderModel.screen.layers.find((item) => item.placementId === state.selectedPlacementId);
  if (!layer) {
    return;
  }

  const overlay = document.createElement("div");
  overlay.className = "placement-edit-overlay";
  overlay.dataset.placementId = layer.placementId;
  overlay.style.left = `${layer.left}px`;
  overlay.style.top = `${layer.top}px`;
  overlay.style.width = `${layer.width}px`;
  overlay.style.height = `${layer.height}px`;
  overlay.style.zIndex = "10020";
  overlay.addEventListener("pointerdown", (event) => {
    const target = event.target;
    const mode = target && target.classList && target.classList.contains("placement-resize-handle")
      ? "resize-se"
      : "move";
    startPlacementPointerEdit(event, mode);
  });

  const label = document.createElement("span");
  label.className = "placement-edit-label";
  label.textContent = `${layer.placementId} ${layer.width}x${layer.height} @ ${Math.round(layer.left + layer.width / 2)},${Math.round(layer.top + layer.height / 2)}`;
  overlay.appendChild(label);

  const handle = document.createElement("span");
  handle.className = "placement-resize-handle";
  overlay.appendChild(handle);
  elements.screenCanvas.appendChild(overlay);
}

function renderScreen() {
  const screen = state.renderModel.screen;
  const selectedGroup = getSelectedCompositionGroup();
  const selectedPlacementIds = selectedGroup
    ? new Set([
        ...selectedGroup.layerPlacementIds,
        ...selectedGroup.childContentPlacementIds,
        ...selectedGroup.protectedOverlayIds
      ])
    : null;
  elements.screenCanvas.innerHTML = "";
  elements.screenCanvas.style.width = `${screen.width}px`;
  elements.screenCanvas.style.height = `${screen.height}px`;

  screen.layers.forEach((layer) => {
    const image = document.createElement("img");
    image.className = "screen-layer";
    if (selectedPlacementIds) {
      image.classList.toggle("is-outside-composition", !selectedPlacementIds.has(layer.placementId));
      image.classList.toggle("is-selected-composition-layer", selectedPlacementIds.has(layer.placementId));
    }
    image.classList.toggle("is-selected-placement", layer.placementId === state.selectedPlacementId);
    image.src = state.viewMode === "structure" && layer.structureSrc ? layer.structureSrc : layer.src;
    image.alt = layer.assetId;
    image.title = `${layer.assetId} (${layer.role})`;
    image.dataset.placementId = layer.placementId;
    image.style.left = `${layer.left}px`;
    image.style.top = `${layer.top}px`;
    image.style.width = `${layer.width}px`;
    image.style.height = `${layer.height}px`;
    image.style.zIndex = String(layer.zIndex);
    image.addEventListener("click", (event) => {
      event.stopPropagation();
      state.selectedPlacementId = layer.placementId;
      renderStructuredSpecEditor();
      renderScreen();
    });
    elements.screenCanvas.appendChild(image);
  });

  const safe = screen.safeAreas || {};
  const safeRect = document.createElement("div");
  safeRect.className = "safe-area";
  safeRect.style.left = `${safe.left || 0}px`;
  safeRect.style.top = `${safe.top || 0}px`;
  safeRect.style.width = `${screen.width - (safe.left || 0) - (safe.right || 0)}px`;
  safeRect.style.height = `${screen.height - (safe.top || 0) - (safe.bottom || 0)}px`;
  elements.screenCanvas.appendChild(safeRect);
  renderCompositionOverlays(selectedGroup);
  renderPlacementEditOverlay();
}

function renderReview() {
  if (!state.review) {
    elements.reviewOutput.className = "review-output empty";
    elements.reviewOutput.textContent = "まず「生成後を表示」で事前生成済み素材を反映してから AI レビューを実行してください。";
    return;
  }

  elements.reviewOutput.className = "review-output";
  const findingsHtml = state.review.topFindings.map((finding) => `
    <div class="review-item">
      <strong>${finding.assetId}</strong>
      <div>${finding.title}</div>
      <div>${finding.message}</div>
      <div><em>推奨コメント:</em> ${finding.suggestedComment}</div>
    </div>
  `).join("");

  const guardrailsHtml = state.review.guardrails.map((guardrail) => `
    <div class="guardrail-item">${guardrail}</div>
  `).join("");

  elements.reviewOutput.innerHTML = `
    <div class="review-summary">
      <strong>評価 ${state.review.screenScore}</strong>
      <div>${state.review.summary}</div>
    </div>
    <div class="review-list">${findingsHtml}</div>
    <h3>運用ガードレール</h3>
    <div class="guardrail-list">${guardrailsHtml}</div>
  `;
}

function getSuggestedComment(assetId) {
  return state.reviewSuggestionsByAsset[assetId] || "";
}

function findQueueItem(assetId) {
  return state.regenerationQueue.find((item) => item.assetId === assetId) || null;
}

function getQueuePayload() {
  return state.regenerationQueue.map((item) => ({
    ...item,
    aiReviewComment: item.aiReviewComment || getSuggestedComment(item.assetId)
  }));
}

function markRegenerationQueueDirty() {
  if (state.regenerationQueuePath) {
    state.regenerationQueueDirty = true;
  }
}

function roundPixel(value) {
  return Math.round(Number(value || 0));
}

function getAssetPlacementDetails(assetId) {
  const placements = state.materialSpecSheet && Array.isArray(state.materialSpecSheet.placements)
    ? state.materialSpecSheet.placements
    : [];
  return placements
    .filter((placement) => placement.assetId === assetId)
    .map((placement) => ({
      placementId: placement.placementId,
      parentId: placement.parentId || "",
      left: roundPixel(placement.x - placement.width / 2),
      top: roundPixel(placement.y - placement.height / 2),
      width: roundPixel(placement.width),
      height: roundPixel(placement.height),
      zIndex: placement.zIndex
    }));
}

function getAssetCompositionRefs(assetId) {
  const refs = [];
  getCompositionGroups().forEach((group) => {
    if (group.outputAssetId === assetId) {
      refs.push(`${group.groupId}: output`);
    }
    (group.layers || [])
      .filter((layer) => layer.assetId === assetId)
      .forEach((layer) => {
        const role = layer.placementId === group.rootPlacementId ? "root" : "layer";
        refs.push(`${group.groupId}: ${role} ${layer.placementId}`);
      });
    (group.childContent || [])
      .filter((layer) => layer.assetId === assetId)
      .forEach((layer) => {
        refs.push(`${group.groupId}: content ${layer.placementId}`);
      });
  });
  return refs;
}

function getRegisteredImagegenAsset(assetId) {
  const registry = state.worldPreset && state.worldPreset.imagegenAssets
    ? state.worldPreset.imagegenAssets
    : null;
  if (!registry) {
    return null;
  }
  if (Array.isArray(registry)) {
    return registry.find((item) => item && item.assetId === assetId) || null;
  }
  return registry[assetId] || null;
}

function appendInspectorRow(parent, label, value) {
  const row = document.createElement("div");
  row.className = "asset-inspector-row";
  const key = document.createElement("span");
  key.textContent = label;
  const content = document.createElement("strong");
  content.textContent = value || "-";
  row.appendChild(key);
  row.appendChild(content);
  parent.appendChild(row);
}

function renderAssetInspector(asset, root) {
  root.innerHTML = "";
  const placements = getAssetPlacementDetails(asset.assetId);
  const placementLabel = placements.length
    ? placements.slice(0, 3).map((placement) => {
        const parent = placement.parentId ? ` parent=${placement.parentId}` : "";
        return `${placement.placementId} @ ${placement.left},${placement.top} ${placement.width}x${placement.height} z${placement.zIndex}${parent}`;
      }).join(" / ") + (placements.length > 3 ? ` / +${placements.length - 3}` : "")
    : "未配置";
  const compositionRefs = getAssetCompositionRefs(asset.assetId);
  const meta = asset.generationMeta || {};
  const registered = getRegisteredImagegenAsset(asset.assetId) || {};
  const sourcePath = meta.imagePath || meta.sourceAssetPath || registered.path || "";
  const backend = meta.actualBackend || registered.backend || meta.backendClassLabel || meta.backendClass || "未採用";
  const sourceLabel = sourcePath
    ? `${backend} / ${sourcePath}`
    : backend;

  appendInspectorRow(root, "配置詳細", placementLabel);
  appendInspectorRow(root, "構成グループ", compositionRefs.length ? compositionRefs.join(" / ") : "なし");
  appendInspectorRow(root, "採用元", sourceLabel);
}

function setRegenerationPrompt(text) {
  state.regenerationPrompt = text || "";
  elements.regenPromptOutput.value = state.regenerationPrompt;
  if (state.regenerationPrompt) {
    setFlowStep("prompt");
  }
}

function setImplementationReport(text) {
  state.implementationReport = text || "";
  elements.implementationReportOutput.value = state.implementationReport;
  elements.implementationReportStatus.textContent = state.implementationReport
    ? `${state.implementationReport.split("\n").length} 行`
    : "未作成";
}

function renderValidationReport(report) {
  state.validationReport = report;
  elements.validationOutput.className = report ? "validation-output" : "validation-output empty";
  elements.validationOutput.innerHTML = "";

  if (!report) {
    elements.validationStatus.textContent = "未実行";
    elements.validationOutput.textContent = "エディタ内の3つのJSON、レンダリング可能性、composition quality、layout quality(重なりpadding・テキスト収まり・整列ライン)を確認します。";
    return;
  }

  elements.validationStatus.textContent = report.valid ? "OK" : "要修正";
  if (report.summary) {
    const summary = document.createElement("div");
    summary.className = "validation-summary";
    [
      `screen: ${report.summary.screenId}`,
      `size: ${report.summary.size}`,
      `assets: ${report.summary.assetCount}`,
      `layers: ${report.summary.layerCount}`,
      `composition: ${report.summary.compositionStatus} ${report.summary.compositionScore}`,
      report.summary.layoutStatus ? `layout: ${report.summary.layoutStatus} ${report.summary.layoutScore}` : ""
    ].filter(Boolean).forEach((text) => {
      const chip = document.createElement("span");
      chip.textContent = text;
      summary.appendChild(chip);
    });
    elements.validationOutput.appendChild(summary);
  }

  const diagnostics = report.diagnostics && report.diagnostics.length
    ? report.diagnostics
    : [{
        severity: "info",
        code: "valid",
        message: "仕様チェックは通過しています。"
      }];

  diagnostics.forEach((diagnostic) => {
    const item = document.createElement("div");
    item.className = `validation-item severity-${diagnostic.severity}`;
    item.textContent = `${diagnostic.severity}: ${diagnostic.message}`;
    elements.validationOutput.appendChild(item);
  });
}

function formatMetric(value) {
  if (!Number.isFinite(Number(value))) {
    return "-";
  }
  const number = Number(value);
  if (Math.abs(number) >= 100) {
    return String(Math.round(number));
  }
  return String(Math.round(number * 1000) / 1000);
}

function appendReferenceChip(parent, label, value) {
  const chip = document.createElement("span");
  chip.className = "reference-quality-chip";
  const key = document.createElement("span");
  key.textContent = label;
  const strong = document.createElement("strong");
  strong.textContent = String(value);
  chip.appendChild(key);
  chip.appendChild(strong);
  parent.appendChild(chip);
}

function renderReferenceQualityPanel() {
  const profile = state.referenceQualityProfile;
  const audit = state.assetQualityAudit;
  elements.referenceQualityOutput.innerHTML = "";
  elements.referenceQualityPanel.classList.toggle("has-profile", Boolean(profile));
  elements.referenceQualityPanel.classList.toggle("has-audit", Boolean(audit));
  elements.applyReferenceProfileButton.disabled = !state.referenceQualityCompactProfile;
  elements.auditReferenceQualityButton.disabled = !profile || !state.renderModel;

  if (!profile) {
    elements.referenceQualityStatus.textContent = "未作成";
    elements.referenceQualityOutput.className = "reference-quality-output empty";
    elements.referenceQualityOutput.textContent = "購入済み/参照用UI素材のフォルダから、透明余白、エッジ、外周/中央ディテールの傾向を測ります。";
    return;
  }

  const source = profile.source || {};
  const all = profile.summary && profile.summary.all ? profile.summary.all : { count: 0, metrics: {} };
  const metrics = all.metrics || {};
  elements.referenceQualityStatus.textContent = audit
    ? `${source.analyzed || all.count} samples / audit ${audit.status} ${audit.score}`
    : `${source.analyzed || all.count} samples`;
  elements.referenceQualityOutput.className = "reference-quality-output";

  const summary = document.createElement("div");
  summary.className = "reference-quality-summary";
  appendReferenceChip(summary, "sample", `${source.analyzed || all.count}/${source.candidates || all.count}`);
  appendReferenceChip(summary, "margin p50", formatMetric(metrics.transparentMarginMinRatio && metrics.transparentMarginMinRatio.p50));
  appendReferenceChip(summary, "edge dirt p90", formatMetric(metrics.edgeAlphaDirtyRatio && metrics.edgeAlphaDirtyRatio.p90));
  appendReferenceChip(summary, "outer/center p50", formatMetric(metrics.perimeterToCenterDetailRatio && metrics.perimeterToCenterDetailRatio.p50));
  if (audit) {
    appendReferenceChip(summary, "audit", `${audit.status} ${audit.score}`);
    appendReferenceChip(summary, "warn", audit.summary.warningCount);
  }
  elements.referenceQualityOutput.appendChild(summary);

  const categoryList = document.createElement("div");
  categoryList.className = "reference-category-list";
  Object.entries(profile.summary.categories || {}).forEach(([category, categorySummary]) => {
    const item = document.createElement("div");
    item.className = "reference-category-item";
    const title = document.createElement("strong");
    title.textContent = `${category} / ${categorySummary.count}`;
    const detail = document.createElement("span");
    detail.textContent = `size ${formatMetric(categorySummary.metrics.width.p50)}x${formatMetric(categorySummary.metrics.height.p50)} / margin ${formatMetric(categorySummary.metrics.transparentMarginMinRatio.p25)} / outer-center ${formatMetric(categorySummary.metrics.perimeterToCenterDetailRatio.p50)}`;
    item.appendChild(title);
    item.appendChild(detail);
    categoryList.appendChild(item);
  });
  elements.referenceQualityOutput.appendChild(categoryList);

  if (!audit) {
    const note = document.createElement("p");
    note.className = "reference-quality-note";
    note.textContent = "生成済みPNGを監査すると、現在の素材が参照プロファイルから見て不足している余白や分離を表示します。";
    elements.referenceQualityOutput.appendChild(note);
    return;
  }

  const diagnostics = audit.diagnostics && audit.diagnostics.length
    ? audit.diagnostics
    : [{
        severity: "info",
        assetId: "all",
        message: "参照品質監査は通過しています。",
        hint: "このプロファイルを維持したまま、composition と実機表示で最終確認してください。"
      }];
  const diagnosticList = document.createElement("div");
  diagnosticList.className = "reference-diagnostic-list";
  diagnostics.slice(0, 12).forEach((diagnostic) => {
    const item = document.createElement("div");
    item.className = `reference-diagnostic severity-${diagnostic.severity}`;
    const title = document.createElement("strong");
    title.textContent = `${diagnostic.assetId || "asset"}: ${diagnostic.code || diagnostic.severity}`;
    const message = document.createElement("span");
    message.textContent = diagnostic.message || "";
    const hint = document.createElement("em");
    hint.textContent = diagnostic.hint || "";
    item.appendChild(title);
    item.appendChild(message);
    if (diagnostic.hint) {
      item.appendChild(hint);
    }
    diagnosticList.appendChild(item);
  });
  if (diagnostics.length > 12) {
    const more = document.createElement("div");
    more.className = "reference-diagnostic-more";
    more.textContent = `+${diagnostics.length - 12} 件`;
    diagnosticList.appendChild(more);
  }
  elements.referenceQualityOutput.appendChild(diagnosticList);
}

async function buildReferenceQualityProfileFromPath() {
  const rootPath = elements.referenceRootInput.value.trim();
  if (!rootPath) {
    window.alert("参照素材フォルダのパスを入れてください。");
    return;
  }

  const busyStartedAt = Date.now();
  setBusy(elements.buildReferenceProfileButton, true, "解析中...");
  setWorkspaceBusy(true, "参照品質プロファイルを作成しています...");
  try {
    const response = await fetch("/api/reference-quality-profile", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        rootPath,
        maxFiles: Number(elements.referenceMaxFilesInput.value || 260),
        maxFilesPerAsset: 2
      })
    });
    const payload = await response.json();
    if (!payload.ok) {
      throw new Error(payload.error || "参照品質プロファイルの作成に失敗しました。");
    }
    state.referenceQualityProfile = payload.profile;
    state.referenceQualityCompactProfile = payload.compactProfile;
    state.assetQualityAudit = null;
    renderReferenceQualityPanel();
    setActivityStatus(`参照品質プロファイルを作成しました。${payload.profile.source.analyzed} samples ${nowLabel()}`);
  } catch (error) {
    window.alert(error.message);
    setActivityStatus(`参照品質プロファイル作成失敗: ${error.message}`);
  } finally {
    await ensureMinimumBusy(busyStartedAt);
    setWorkspaceBusy(false, "待機中");
    setBusy(elements.buildReferenceProfileButton, false);
  }
}

function applyReferenceQualityProfileToPreset() {
  if (!state.referenceQualityCompactProfile) {
    window.alert("先に参照品質プロファイルを作成してください。");
    return;
  }
  const { payload, diagnostics } = getPayloadFromEditorsSafely();
  if (diagnostics.length) {
    window.alert(diagnostics.map((diagnostic) => diagnostic.message).join("\n"));
    return;
  }

  state.worldPreset = {
    ...payload.worldPreset,
    qualityProfile: {
      ...(payload.worldPreset.qualityProfile || {}),
      referenceDerived: state.referenceQualityCompactProfile
    }
  };
  updateEditors();
  renderReferenceQualityPanel();
  setActivityStatus(`参照品質プロファイルを世界観プリセットへ反映しました ${nowLabel()}`);
}

async function auditGeneratedAssetsWithReferenceProfile() {
  if (!state.referenceQualityProfile) {
    window.alert("先に参照品質プロファイルを作成してください。");
    return;
  }
  if (!state.renderModel) {
    window.alert("先に画面を読み込んでください。");
    return;
  }

  const busyStartedAt = Date.now();
  setBusy(elements.auditReferenceQualityButton, true, "監査中...");
  setWorkspaceBusy(true, "生成PNGを参照品質プロファイルで監査しています...");
  try {
    const response = await fetch("/api/reference-asset-audit", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        input: getPayloadFromEditors(),
        referenceQualityProfile: state.referenceQualityProfile
      })
    });
    const payload = await response.json();
    if (!payload.ok) {
      throw new Error(payload.error || "生成PNG監査に失敗しました。");
    }
    state.assetQualityAudit = payload.audit;
    renderReferenceQualityPanel();
    setActivityStatus(`生成PNG監査 ${payload.audit.status} / score ${payload.audit.score} / warn ${payload.audit.summary.warningCount} ${nowLabel()}`);
  } catch (error) {
    window.alert(error.message);
    setActivityStatus(`生成PNG監査失敗: ${error.message}`);
  } finally {
    await ensureMinimumBusy(busyStartedAt);
    setWorkspaceBusy(false, "待機中");
    setBusy(elements.auditReferenceQualityButton, false);
  }
}

async function validateWorkspaceSpec() {
  const { payload, diagnostics } = getPayloadFromEditorsSafely();
  if (diagnostics.length) {
    renderValidationReport({
      valid: false,
      summary: null,
      diagnostics
    });
    setActivityStatus(`仕様チェック失敗: JSON parse error ${nowLabel()}`);
    return;
  }

  const busyStartedAt = Date.now();
  setBusy(elements.validateButton, true, "確認中...");
  setWorkspaceBusy(true, "仕様をチェックしています...");
  try {
    const response = await fetch("/api/validate-workspace", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });
    const result = await response.json();
    if (!result.ok) {
      throw new Error(result.error || "仕様チェックに失敗しました。");
    }
    renderValidationReport(result);
    setActivityStatus(result.valid
      ? `仕様チェックOK ${nowLabel()}`
      : `仕様チェックで要修正 ${nowLabel()}`);
  } catch (error) {
    renderValidationReport({
      valid: false,
      summary: null,
      diagnostics: [{
        severity: "error",
        code: "validate_request",
        message: error.message
      }]
    });
    setActivityStatus(`仕様チェック失敗: ${error.message}`);
  } finally {
    await ensureMinimumBusy(busyStartedAt);
    setWorkspaceBusy(false, "待機中");
    setBusy(elements.validateButton, false);
  }
}

async function buildImplementationReport() {
  if (!state.renderModel) {
    window.alert("先に画面を読み込んでください。");
    return;
  }

  const busyStartedAt = Date.now();
  setBusy(elements.exportReportButton, true, "作成中...");
  setWorkspaceBusy(true, "実装レポートを作成しています...");
  try {
    const response = await fetch("/api/implementation-report", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(getPayloadFromEditors())
    });
    const payload = await response.json();
    if (!payload.ok) {
      throw new Error(payload.error || "実装レポートの作成に失敗しました。");
    }
    elements.aiModeLabel.textContent = payload.ai.mode;
    setImplementationReport(payload.markdown || "");
    elements.implementationReportPanel.classList.remove("flash-once");
    void elements.implementationReportPanel.offsetWidth;
    elements.implementationReportPanel.classList.add("flash-once");
    setActivityStatus(`実装レポートを作成しました。layers ${payload.report.layers.length} / overlays ${payload.report.runtimeOverlays.length} ${nowLabel()}`);
  } catch (error) {
    window.alert(error.message);
    setActivityStatus(`実装レポート作成失敗: ${error.message}`);
  } finally {
    await ensureMinimumBusy(busyStartedAt);
    setWorkspaceBusy(false, "待機中");
    setBusy(elements.exportReportButton, false);
  }
}

function renderRegenerationQueue() {
  const queue = state.regenerationQueue;
  elements.regenQueueCountLabel.textContent = state.regenerationQueuePath
    ? `${queue.length} 件 / ${state.regenerationQueueDirty ? "未保存変更" : "保存済"}`
    : `${queue.length} 件`;
  elements.regenQueueCountLabel.title = state.regenerationQueuePath || "";
  elements.regenPromptOutput.value = state.regenerationPrompt;

  if (!queue.length) {
    elements.regenQueueList.className = "regen-queue-list empty";
    elements.regenQueueList.textContent = "素材カードのコメント欄に修正方針を書き、「再生成キューに追加」を押してください。";
    elements.regenQueuePanel.classList.remove("has-queue");
    return;
  }

  elements.regenQueuePanel.classList.add("has-queue");
  elements.regenQueueList.className = "regen-queue-list";
  elements.regenQueueList.innerHTML = "";

  queue.forEach((item, index) => {
    const asset = state.renderModel
      ? state.renderModel.assets.find((candidate) => candidate.assetId === item.assetId)
      : null;
    const article = document.createElement("article");
    article.className = "regen-queue-item";

    const title = document.createElement("div");
    title.className = "regen-queue-title";
    const titleAsset = document.createElement("strong");
    titleAsset.textContent = `${index + 1}. ${item.assetId}`;
    const titleRole = document.createElement("span");
    titleRole.textContent = asset ? `${asset.assetType} / ${asset.role}` : "素材";
    title.appendChild(titleAsset);
    title.appendChild(titleRole);

    const comment = document.createElement("p");
    comment.className = "regen-queue-comment";
    comment.textContent = item.userComment || "ユーザーコメントなし";

    const aiComment = document.createElement("p");
    aiComment.className = "regen-queue-ai";
    const suggestion = item.aiReviewComment || getSuggestedComment(item.assetId);
    aiComment.textContent = suggestion ? `AI指摘: ${suggestion}` : "AI指摘: 未設定";

    const removeButton = document.createElement("button");
    removeButton.className = "regen-queue-remove";
    removeButton.textContent = "外す";
    removeButton.addEventListener("click", () => {
      state.regenerationQueue = state.regenerationQueue.filter((candidate) => candidate.queueId !== item.queueId);
      markRegenerationQueueDirty();
      setRegenerationPrompt("");
      renderRegenerationQueue();
      renderAssets();
      setActivityStatus(`${item.assetId} を再生成キューから外しました ${nowLabel()}`);
    });

    article.appendChild(title);
    article.appendChild(comment);
    article.appendChild(aiComment);
    article.appendChild(removeButton);
    elements.regenQueueList.appendChild(article);
  });
}

function addAssetToRegenerationQueue(asset, userComment) {
  const normalizedUserComment = String(userComment || "").trim();
  const aiReviewComment = getSuggestedComment(asset.assetId);
  if (!normalizedUserComment && !aiReviewComment) {
    window.alert("ユーザーコメントを入れるか、先にAIレビューの提案を入れてください。");
    return;
  }

  const now = new Date().toISOString();
  const current = findQueueItem(asset.assetId);
  const nextItem = {
    queueId: current ? current.queueId : `regen_${asset.assetId}_${Date.now()}`,
    assetId: asset.assetId,
    userComment: normalizedUserComment,
    aiReviewComment,
    source: "asset_card",
    status: "queued",
    createdAt: current ? current.createdAt : now,
    updatedAt: now
  };

  if (current) {
    state.regenerationQueue = state.regenerationQueue.map((item) => (
      item.assetId === asset.assetId ? nextItem : item
    ));
  } else {
    state.regenerationQueue = [...state.regenerationQueue, nextItem];
  }

  markRegenerationQueueDirty();
  state.commentDrafts[asset.assetId] = normalizedUserComment;
  setRegenerationPrompt("");
  renderRegenerationQueue();
  renderAssets();
  setFlowStep("queue");
  setActivityStatus(`${asset.assetId} を再生成キューに${current ? "更新" : "追加"}しました ${nowLabel()}`);
}

async function buildRegenerationPrompt() {
  if (!state.regenerationQueue.length) {
    window.alert("再生成キューが空です。");
    return;
  }

  const busyStartedAt = Date.now();
  setBusy(elements.buildRegenPromptButton, true, "作成中...");
  setWorkspaceBusy(true, "Codex依頼文を作成しています...");
  try {
    const response = await fetch("/api/build-regeneration-request", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        ...getPayloadFromEditors(),
        regenerationQueue: getQueuePayload()
      })
    });
    const payload = await response.json();
    if (!payload.ok) {
      throw new Error(payload.error || "Codex依頼文の作成に失敗しました。");
    }
    elements.aiModeLabel.textContent = payload.ai.mode;
    setRegenerationPrompt(payload.markdown);
    setActivityStatus(`${payload.itemCount} 件のCodex依頼文を作成しました ${nowLabel()}`);
    elements.regenQueuePanel.classList.remove("flash-once");
    void elements.regenQueuePanel.offsetWidth;
    elements.regenQueuePanel.classList.add("flash-once");
    setFlowStep("dialogue");
  } catch (error) {
    window.alert(error.message);
    setActivityStatus(`依頼文作成失敗: ${error.message}`);
  } finally {
    await ensureMinimumBusy(busyStartedAt);
    setWorkspaceBusy(false, "待機中");
    setBusy(elements.buildRegenPromptButton, false);
  }
}

function getQueuePersistencePayload() {
  const { payload, diagnostics } = getPayloadFromEditorsSafely();
  if (diagnostics.length) {
    throw new Error(diagnostics.map((diagnostic) => diagnostic.message).join(" / "));
  }
  return {
    source: state.source,
    screenKv: payload.screenKv,
    regenerationQueue: getQueuePayload()
  };
}

async function saveRegenerationQueue() {
  const busyStartedAt = Date.now();
  setBusy(elements.saveRegenQueueButton, true, "保存中...");
  setWorkspaceBusy(true, "再生成キューを保存しています...");
  try {
    const response = await fetch("/api/save-regeneration-queue", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(getQueuePersistencePayload())
    });
    const payload = await response.json();
    if (!payload.ok) {
      throw new Error(payload.error || "再生成キューの保存に失敗しました。");
    }
    if (!payload.persisted) {
      state.regenerationQueuePath = "";
      state.regenerationQueueDirty = false;
      renderRegenerationQueue();
      setActivityStatus(payload.message || `この読み込み元ではキューを保存できません ${nowLabel()}`);
      return;
    }
    state.regenerationQueuePath = payload.queuePath || "";
    state.regenerationQueueDirty = false;
    renderRegenerationQueue();
    setActivityStatus(`再生成キューを保存しました。${payload.itemCount} 件 ${nowLabel()}`);
  } catch (error) {
    window.alert(error.message);
    setActivityStatus(`キュー保存失敗: ${error.message}`);
  } finally {
    await ensureMinimumBusy(busyStartedAt);
    setWorkspaceBusy(false, "待機中");
    setBusy(elements.saveRegenQueueButton, false);
  }
}

async function loadSavedRegenerationQueue() {
  const busyStartedAt = Date.now();
  setBusy(elements.loadRegenQueueButton, true, "読込中...");
  setWorkspaceBusy(true, "保存済み再生成キューを読み込んでいます...");
  try {
    const response = await fetch("/api/load-regeneration-queue", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(getQueuePersistencePayload())
    });
    const payload = await response.json();
    if (!payload.ok) {
      throw new Error(payload.error || "保存済みキューの読み込みに失敗しました。");
    }
    if (!payload.persisted) {
      state.regenerationQueuePath = "";
      state.regenerationQueueDirty = false;
      renderRegenerationQueue();
      setActivityStatus(payload.message || `保存済みキューはありません ${nowLabel()}`);
      return;
    }
    state.regenerationQueue = Array.isArray(payload.queue) ? payload.queue : [];
    state.regenerationQueuePath = payload.queuePath || "";
    state.regenerationQueueDirty = false;
    setRegenerationPrompt("");
    renderRegenerationQueue();
    renderAssets();
    setFlowStep("queue");
    setActivityStatus(`保存済み再生成キューを読み込みました。${state.regenerationQueue.length} 件 ${nowLabel()}`);
  } catch (error) {
    window.alert(error.message);
    setActivityStatus(`キュー読込失敗: ${error.message}`);
  } finally {
    await ensureMinimumBusy(busyStartedAt);
    setWorkspaceBusy(false, "待機中");
    setBusy(elements.loadRegenQueueButton, false);
  }
}

function clearRegenerationQueue() {
  state.regenerationQueue = [];
  markRegenerationQueueDirty();
  setRegenerationPrompt("");
  renderRegenerationQueue();
  renderAssets();
  setFlowStep(state.review ? "review" : state.renderModel ? "show" : "load");
  setActivityStatus(`再生成キューを空にしました ${nowLabel()}`);
}

async function restoreAssetVersion(asset, version) {
  const busyStartedAt = Date.now();
  setWorkspaceBusy(true, `${asset.assetId} の履歴版を採用しています...`);
  try {
    const response = await fetch("/api/restore-version", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        ...getPayloadFromEditors(),
        assetId: asset.assetId,
        versionId: version.versionId
      })
    });
    const payload = await response.json();
    if (!payload.ok) {
      throw new Error(payload.error || "履歴版の再採用に失敗しました。");
    }
    elements.aiModeLabel.textContent = payload.ai.mode;
    syncStateFromPayload(payload.input);
    state.renderModel = payload.renderModel;
    state.assetQualityAudit = null;
    updateEditors();
    renderMeta();
    renderScreen();
    renderCompositionGroups();
    renderAssets();
    renderReferenceQualityPanel();
    setFlowStep("show");
    setViewMode("generated");
    setActivityStatus(`${asset.assetId} で ${version.label} を再採用しました ${nowLabel()}`);
  } catch (error) {
    window.alert(error.message);
    setActivityStatus(`再採用失敗: ${error.message}`);
  } finally {
    await ensureMinimumBusy(busyStartedAt);
    setWorkspaceBusy(false, "待機中");
  }
}

function renderAssets() {
  elements.assetGrid.innerHTML = "";
  elements.assetCountLabel.textContent = `${state.renderModel.assets.length} 素材を表示中`;
  state.renderModel.assets.forEach((asset) => {
    const fragment = elements.assetCardTemplate.content.cloneNode(true);
    const card = fragment.querySelector(".asset-card");
    const preview = fragment.querySelector(".asset-preview");
    const title = fragment.querySelector(".asset-title");
    const role = fragment.querySelector(".asset-role");
    const purpose = fragment.querySelector(".asset-purpose");
    const generation = fragment.querySelector(".asset-generation");
    const textHandling = fragment.querySelector(".asset-text-handling");
    const revision = fragment.querySelector(".asset-revision");
    const inspector = fragment.querySelector(".asset-inspector");
    const log = fragment.querySelector(".asset-comment-log");
    const lock = fragment.querySelector(".asset-lock");
    const comment = fragment.querySelector(".asset-comment");
    const regenerateButton = fragment.querySelector(".asset-regenerate");
    const suggestionButton = fragment.querySelector(".asset-suggestion");
    const imagePathInput = fragment.querySelector(".asset-image-path");
    const importButton = fragment.querySelector(".asset-import-button");
    const historyRoot = fragment.querySelector(".asset-history");
    const historyNote = fragment.querySelector(".asset-history-note");
    const historyList = fragment.querySelector(".asset-history-list");

    preview.src = asset.previewSrc;
    preview.alt = asset.assetId;
    title.textContent = asset.assetId;
    role.textContent = `${asset.assetType} / ${asset.role}`;
    purpose.textContent = asset.purpose;
    generation.textContent = asset.generationPlan
      ? `初回生成: ${asset.generationPlan.firstPassModeLabel || asset.generationPlan.firstPassMode || "未設定"} / 方式: ${asset.generationPlan.backendClassLabel || asset.generationPlan.backendClass || "未設定"}${asset.generationMeta ? ` / 実行済: ${asset.generationMeta.backendClassLabel || asset.generationMeta.backendClass}` : ""}`
      : "初回生成: 未設計";
    textHandling.textContent = asset.textHandling
      ? `文字: ${asset.textHandling.ownership === "baked_in_asset" ? "素材に含める" : "上に載せる"}`
      : "文字: 未設計";
    revision.textContent = `改訂 ${asset.revisionCount} / 配置 ${asset.placementRefs.join(", ")}`;
    log.textContent = asset.latestComment
      ? `最新コメント: ${asset.latestComment}`
      : "最新コメント: まだありません";
    renderAssetInspector(asset, inspector);
    lock.checked = asset.locked;
    card.classList.toggle("is-locked", asset.locked);
    const queuedItem = findQueueItem(asset.assetId);
    card.classList.toggle("is-queued", Boolean(queuedItem));
    const suggestedComment = getSuggestedComment(asset.assetId);
    comment.value = state.commentDrafts[asset.assetId] || (queuedItem ? queuedItem.userComment : "");
    regenerateButton.textContent = queuedItem ? "キューを更新" : "再生成キューに追加";
    suggestionButton.title = suggestedComment
      ? "AI レビューの提案をコメント欄へ入れる"
      : (state.review ? "この素材への AI 提案はまだありません" : "先に「AI で画面レビュー」を実行してください");
    imagePathInput.value = asset.generationMeta && asset.generationMeta.imagePath
      ? asset.generationMeta.imagePath
      : "";

    comment.addEventListener("input", () => {
      state.commentDrafts[asset.assetId] = comment.value;
    });

    lock.addEventListener("change", () => {
      const entry = state.revisionMap[asset.assetId] || {
        locked: false,
        revisionCount: asset.revisionCount,
        comments: [],
        normalizedComments: [],
        directives: asset.directives || {}
      };
      entry.locked = lock.checked;
      state.revisionMap[asset.assetId] = entry;
      renderAssets();
      renderScreen();
    });

    suggestionButton.addEventListener("click", () => {
      const nextSuggestion = getSuggestedComment(asset.assetId);
      if (!nextSuggestion) {
        window.alert(state.review ? "この素材への AI 提案はまだありません。" : "先に「AI で画面レビュー」を実行してください。");
        return;
      }
      comment.value = nextSuggestion;
      state.commentDrafts[asset.assetId] = nextSuggestion;
      setActivityStatus(`${asset.assetId} に AI 提案を入れました ${nowLabel()}`);
    });

    regenerateButton.addEventListener("click", () => {
      const text = comment.value.trim();
      if (!text && !getSuggestedComment(asset.assetId)) {
        window.alert("コメントを入れるか、AIレビュー後にAI提案を使ってください。");
        return;
      }
      addAssetToRegenerationQueue(asset, text);
    });

    importButton.addEventListener("click", async () => {
      const imagePath = imagePathInput.value.trim();
      if (!imagePath) {
        window.alert("採用するPNG/JPG/WebPのパスを入れてください。");
        return;
      }

      setBusy(importButton, true, "採用中...");
      const busyStartedAt = Date.now();
      setWorkspaceBusy(true, `${asset.assetId} にPNGを採用しています...`);
      try {
        const response = await fetch("/api/import-asset-image", {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            ...getPayloadFromEditors(),
            assetId: asset.assetId,
            imagePath,
            backend: "manual_imagegen_import"
          })
        });
        const payload = await response.json();
        if (!payload.ok) {
          throw new Error(payload.error || "PNGの採用に失敗しました。");
        }
        elements.aiModeLabel.textContent = payload.ai.mode;
        syncStateFromPayload(payload.input);
        state.renderModel = payload.renderModel;
        state.assetQualityAudit = null;
        state.review = null;
        state.reviewSuggestionsByAsset = {};
        updateEditors();
        renderMeta();
        renderScreen();
        renderCompositionGroups();
        renderReview();
        renderAssets();
        renderReferenceQualityPanel();
        setFlowStep("import");
        setViewMode("generated");
        setActivityStatus(`${asset.assetId} にPNGを採用しました ${nowLabel()}`);
      } catch (error) {
        window.alert(error.message);
        setActivityStatus(`PNG採用失敗: ${error.message}`);
      } finally {
        await ensureMinimumBusy(busyStartedAt);
        setWorkspaceBusy(false, "待機中");
        setBusy(importButton, false);
      }
    });

    const historyEntries = [...(asset.history || [])].reverse();
    historyNote.textContent = `${historyEntries.length}件`;
    historyRoot.open = historyEntries.length > 1;
    historyList.innerHTML = "";
    historyEntries.forEach((version) => {
      const item = document.createElement("article");
      item.className = "history-item";
      if (version.isCurrent) {
        item.classList.add("is-current");
      }

      const previewWrap = document.createElement("div");
      previewWrap.className = "history-preview-wrap";
      const previewImage = document.createElement("img");
      previewImage.className = "history-preview";
      previewImage.src = version.previewSrc;
      previewImage.alt = `${asset.assetId} ${version.label}`;
      previewWrap.appendChild(previewImage);

      const meta = document.createElement("div");
      meta.className = "history-meta";

      const titleRow = document.createElement("div");
      titleRow.className = "history-title-row";
      const label = document.createElement("div");
      label.className = "history-label";
      label.textContent = version.label;
      titleRow.appendChild(label);
      if (version.isCurrent) {
        const current = document.createElement("span");
        current.className = "history-current";
        current.textContent = "現在採用中";
        titleRow.appendChild(current);
      }

      const commentLine = document.createElement("div");
      commentLine.className = "history-comment";
      commentLine.textContent = version.comment || "コメントなし";

      const diffLine = document.createElement("div");
      diffLine.className = "history-diff";
      diffLine.textContent = `差分: ${Array.isArray(version.diffSummary) ? version.diffSummary.join(" / ") : "なし"}`;

      meta.appendChild(titleRow);
      meta.appendChild(commentLine);
      meta.appendChild(diffLine);

      if (!version.isCurrent) {
        const restoreButton = document.createElement("button");
        restoreButton.className = "history-restore";
        restoreButton.textContent = "この版を採用";
        restoreButton.addEventListener("click", async () => {
          await restoreAssetVersion(asset, version);
        });
        meta.appendChild(restoreButton);
      }

      item.appendChild(previewWrap);
      item.appendChild(meta);
      historyList.appendChild(item);
    });

    elements.assetGrid.appendChild(fragment);
  });
}

async function loadDemo() {
  const busyStartedAt = Date.now();
  setBusy(elements.loadDemoButton, true, "読込中...");
  setWorkspaceBusy(true, "デモを読み込んでいます...");
  try {
    const response = await fetch("/api/demo");
    const payload = await response.json();
    if (!payload.ok) {
      throw new Error(payload.error || "デモの読み込みに失敗しました。");
    }
    syncStateFromPayload(payload.demo);
    state.review = null;
    state.reviewSuggestionsByAsset = {};
    state.generationReport = null;
    state.imagegenReport = null;
    state.assetQualityAudit = null;
    state.commentDrafts = {};
    state.regenerationQueue = [];
    state.regenerationQueueDirty = false;
    state.regenerationQueuePath = "";
    state.selectedCompositionEditorGroupId = "";
    state.selectedCompositionGroupId = "";
    state.selectedPlacementId = "";
    setRegenerationPrompt("");
    setImplementationReport("");
    renderValidationReport(null);
    renderReferenceQualityPanel();
    state.source = payload.source || { kind: "demo" };
    elements.aiModeLabel.textContent = payload.ai.mode;
    updateEditors();
    await renderGeneratedWorkspace(`デモを読み込み、生成後画面を表示しました ${nowLabel()}`, {
      resetReview: true,
      resetComments: true
    });
  } finally {
    await ensureMinimumBusy(busyStartedAt);
    setWorkspaceBusy(false, "待機中");
    setBusy(elements.loadDemoButton, false);
  }
}

async function renderGeneratedWorkspace(message, {
  resetReview = true,
  resetComments = false,
  scrollToAssets = false
} = {}) {
  const previousAssetCount = state.renderModel ? state.renderModel.assets.length : 0;
  const response = await fetch("/api/show-generated", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(getDraftPayloadFromEditors())
  });
  const payload = await response.json();
  if (!payload.ok) {
    throw new Error(payload.error || "生成後表示に失敗しました。");
  }
  syncStateFromPayload(payload.input);
  state.renderModel = payload.renderModel;
  state.generationReport = payload.generationReport || null;
  state.imagegenReport = payload.imagegenReport || null;
  state.assetQualityAudit = null;
  if (resetReview) {
    state.review = null;
    state.reviewSuggestionsByAsset = {};
  }
  if (resetComments) {
    state.commentDrafts = {};
  }
  elements.aiModeLabel.textContent = payload.ai.mode;
  updateEditors();
  renderSourceStatus();
  renderImagegenStatus();
  renderMeta();
  renderScreen();
  renderCompositionGroups();
  renderStructuredSpecEditor();
  renderReview();
  renderRegenerationQueue();
  renderAssets();
  renderReferenceQualityPanel();
  setFlowStep("review");
  setViewMode("generated");

  const displayedCount = state.renderModel.assets.length;
  const jobCount = state.generationReport ? state.generationReport.plannedJobs : 0;
  const skippedCount = state.generationReport ? state.generationReport.skippedAssets.length : 0;
  const imagegenCount = state.imagegenReport && Array.isArray(state.imagegenReport.adoptedAssetIds)
    ? state.imagegenReport.adoptedAssetIds.length
    : 0;
  setActivityStatus(message || `${displayedCount} 素材の生成後状態を表示しました。事前生成PNG採用 ${imagegenCount} / 表示ジョブ ${jobCount} / 固定スキップ ${skippedCount} ${nowLabel()}`);
  elements.assetPanel.classList.remove("flash-once");
  void elements.assetPanel.offsetWidth;
  elements.assetPanel.classList.add("flash-once");
  if (scrollToAssets && previousAssetCount === 0) {
    elements.assetPanel.scrollIntoView({
      behavior: "smooth",
      block: "start"
    });
  }
}

async function showGeneratedResults() {
  const busyStartedAt = Date.now();
  setBusy(elements.generateButton, true, "表示中...");
  setWorkspaceBusy(true, "事前生成済み素材を反映しています...");
  try {
    await renderGeneratedWorkspace("", {
      resetReview: true,
      resetComments: false,
      scrollToAssets: true
    });
  } catch (error) {
    window.alert(error.message);
    setActivityStatus(`生成後表示失敗: ${error.message}`);
  } finally {
    await ensureMinimumBusy(busyStartedAt);
    setWorkspaceBusy(false, "待機中");
    setBusy(elements.generateButton, false);
  }
}

async function prepareImagegenJob() {
  const busyStartedAt = Date.now();
  setBusy(elements.imagegenJobButton, true, "準備中...");
  setWorkspaceBusy(true, "imagegenジョブを作成しています...");
  try {
    const response = await fetch("/api/run-imagegen-job", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(getPayloadFromEditors())
    });
    const payload = await response.json();
    if (!payload.ok) {
      throw new Error(payload.error || "imagegenジョブの作成に失敗しました。");
    }

    elements.aiModeLabel.textContent = payload.ai.mode;
    syncStateFromPayload(payload.input);
    state.renderModel = payload.renderModel;
    state.imagegenReport = payload.imagegenReport || null;
    state.assetQualityAudit = null;
    state.review = null;
    state.reviewSuggestionsByAsset = {};
    updateEditors();
    renderSourceStatus();
    renderImagegenStatus();
    renderMeta();
    renderScreen();
    renderCompositionGroups();
    renderReview();
    renderRegenerationQueue();
    renderAssets();
    renderReferenceQualityPanel();

    const report = state.imagegenReport || {};
    const runner = report.runner || {};
    const adopted = Array.isArray(report.adoptedAssetIds) ? report.adoptedAssetIds.length : 0;
    const missing = Array.isArray(report.missingAssetIds) ? report.missingAssetIds.length : 0;
    const message = runner.ran
      ? `imagegen runner ${runner.ok ? "完了" : "失敗"}。採用 ${adopted} / 未生成 ${missing} ${nowLabel()}`
      : `imagegenジョブを作成しました。採用 ${adopted} / 未生成 ${missing}。生成後に「生成後を表示」を押してください ${nowLabel()}`;
    setFlowStep(runner.ran ? "import" : "dialogue");
    setActivityStatus(message);
  } catch (error) {
    window.alert(error.message);
    setActivityStatus(`imagegenジョブ失敗: ${error.message}`);
  } finally {
    await ensureMinimumBusy(busyStartedAt);
    setWorkspaceBusy(false, "待機中");
    setBusy(elements.imagegenJobButton, false);
  }
}

async function refreshImagegenOutputs() {
  const busyStartedAt = Date.now();
  setBusy(elements.imagegenRefreshButton, true, "再取込中...");
  setWorkspaceBusy(true, "生成済みPNGを再取り込みしています...");
  let autoRegisteredCount = 0;
  try {
    // For folder-based projects, rescan the folder first so manually
    // generated PNGs are picked up and persisted into imagegen-assets.json.
    const sourceFolder = state.source
      ? state.source.projectRoot || state.source.screenFolderPath || state.source.folderPath
      : "";
    if (sourceFolder) {
      const scanResponse = await fetch("/api/load-from-folder", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          folderPath: sourceFolder,
          screenId: state.source.screenId || "",
          persistAutoRegistered: true
        })
      });
      const scanPayload = await scanResponse.json();
      if (scanPayload.ok) {
        syncStateFromPayload(scanPayload.bundle);
        updateEditors();
        autoRegisteredCount = Array.isArray(scanPayload.autoRegisteredAssetIds)
          ? scanPayload.autoRegisteredAssetIds.length
          : 0;
      }
    }

    const response = await fetch("/api/imagegen-job", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(getPayloadFromEditors())
    });
    const payload = await response.json();
    if (!payload.ok) {
      throw new Error(payload.error || "生成済みPNGの再取り込みに失敗しました。");
    }
    elements.aiModeLabel.textContent = payload.ai.mode;
    syncStateFromPayload(payload.input);
    state.renderModel = payload.renderModel;
    state.imagegenReport = payload.imagegenReport || null;
    state.assetQualityAudit = null;
    state.review = null;
    state.reviewSuggestionsByAsset = {};
    updateEditors();
    renderSourceStatus();
    renderImagegenStatus();
    renderMeta();
    renderScreen();
    renderCompositionGroups();
    renderReview();
    renderRegenerationQueue();
    renderAssets();
    renderReferenceQualityPanel();

    const report = state.imagegenReport || {};
    const adopted = Array.isArray(report.adoptedAssetIds) ? report.adoptedAssetIds.length : 0;
    const missing = Array.isArray(report.missingAssetIds) ? report.missingAssetIds.length : 0;
    setFlowStep("import");
    setViewMode("generated");
    const autoLabel = autoRegisteredCount ? ` / manifest自動追記 ${autoRegisteredCount}` : "";
    setActivityStatus(`生成済みPNGを再取り込みしました。採用 ${adopted} / 未生成 ${missing}${autoLabel} ${nowLabel()}`);
  } catch (error) {
    window.alert(error.message);
    setActivityStatus(`再取り込み失敗: ${error.message}`);
  } finally {
    await ensureMinimumBusy(busyStartedAt);
    setWorkspaceBusy(false, "待機中");
    setBusy(elements.imagegenRefreshButton, false);
  }
}

async function runReview() {
  if (!state.renderModel) {
    window.alert("先に「生成後を表示」を実行してください。");
    return;
  }

  const busyStartedAt = Date.now();
  setBusy(elements.reviewButton, true, "レビュー中...");
  setWorkspaceBusy(true, "画面レビューを実行しています...");
  try {
    const response = await fetch("/api/ai-review", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(getPayloadFromEditors())
    });
    const payload = await response.json();
    if (!payload.ok) {
      throw new Error(payload.error || "画面レビューに失敗しました。");
    }
    state.review = payload.review;
    state.reviewSuggestionsByAsset = Object.fromEntries(
      payload.review.suggestedActions.map((action) => [action.assetId, action.suggestedComment])
    );
    elements.aiModeLabel.textContent = payload.ai.mode;
    renderReview();
    renderRegenerationQueue();
    renderAssets();
    setFlowStep("review");
    setActivityStatus(`AI レビュー完了 ${nowLabel()}`);
  } catch (error) {
    window.alert(error.message);
    setActivityStatus(`レビュー失敗: ${error.message}`);
  } finally {
    await ensureMinimumBusy(busyStartedAt);
    setWorkspaceBusy(false, "待機中");
    setBusy(elements.reviewButton, false);
  }
}

function applyLockSuggestions() {
  if (!state.review) {
    return;
  }
  state.review.lockAssetIds.forEach((assetId) => {
    const entry = state.revisionMap[assetId] || {
      locked: false,
      revisionCount: 0,
      comments: [],
      normalizedComments: [],
      directives: {}
    };
    entry.locked = true;
    state.revisionMap[assetId] = entry;
  });
  renderAssets();
}

async function renderDraftWorkspace(message) {
  const response = await fetch("/api/render-draft", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(getDraftPayloadFromEditors())
  });
  const payload = await response.json();
  if (!payload.ok) {
    throw new Error(payload.error || "仮組み画面の生成に失敗しました。");
  }
  state.renderModel = payload.renderModel;
  state.assetQualityAudit = null;
  elements.aiModeLabel.textContent = payload.ai.mode;
  renderMeta();
  renderScreen();
  renderCompositionGroups();
  renderStructuredSpecEditor();
  renderReview();
  renderRegenerationQueue();
  renderAssets();
  renderSourceStatus();
  renderImagegenStatus();
  renderReferenceQualityPanel();
  setFlowStep("draft");
  setViewMode("draft");
  setActivityStatus(message);
}

async function showDraftWorkspace() {
  const busyStartedAt = Date.now();
  setBusy(elements.draftButton, true, "表示中...");
  setWorkspaceBusy(true, "仮組み画面を表示しています...");
  try {
    await renderDraftWorkspace(`仮組み確認を表示しました ${nowLabel()}`);
  } catch (error) {
    window.alert(error.message);
    setActivityStatus(`仮組み表示失敗: ${error.message}`);
  } finally {
    await ensureMinimumBusy(busyStartedAt);
    setWorkspaceBusy(false, "待機中");
    setBusy(elements.draftButton, false);
  }
}

async function showStructureWorkspace() {
  const busyStartedAt = Date.now();
  setBusy(elements.structureButton, true, "表示中...");
  setWorkspaceBusy(true, "構造プレビューを表示しています...");
  try {
    if (!state.renderModel) {
      await renderDraftWorkspace(`構造プレビューを表示しました ${nowLabel()}`);
    }
    setViewMode("structure");
    renderScreen();
    setActivityStatus(`構造プレビューを表示しました ${nowLabel()}`);
  } catch (error) {
    window.alert(error.message);
    setActivityStatus(`構造プレビュー表示失敗: ${error.message}`);
  } finally {
    await ensureMinimumBusy(busyStartedAt);
    setWorkspaceBusy(false, "待機中");
    setBusy(elements.structureButton, false);
  }
}

async function loadBundleObject(bundle, source) {
  syncStateFromPayload({
    screenKv: bundle.screenKv,
    materialSpecSheet: bundle.materialSpecSheet,
    worldPreset: bundle.worldPreset,
    revisionMap: bundle.revisionMap || {}
  });
  state.source = source;
  state.renderModel = null;
  state.review = null;
  state.reviewSuggestionsByAsset = {};
  state.generationReport = null;
  state.imagegenReport = null;
  state.assetQualityAudit = null;
  state.commentDrafts = {};
  state.regenerationQueue = [];
  state.regenerationQueueDirty = false;
  state.regenerationQueuePath = "";
  state.selectedCompositionEditorGroupId = "";
  state.selectedCompositionGroupId = "";
  state.selectedPlacementId = "";
  setRegenerationPrompt("");
  setImplementationReport("");
  renderValidationReport(null);
  renderReferenceQualityPanel();
  updateEditors();
  await renderGeneratedWorkspace(`読み込み完了。生成後画面を表示しました ${nowLabel()}`, {
    resetReview: true,
    resetComments: true
  });
}

const LAST_SOURCE_STORAGE_KEY = "gsf.lastFolderSource";

function readStartupFolderSourceFromUrl() {
  const params = new URLSearchParams(window.location.search || "");
  const folderPath = params.get("folder") || params.get("project") || "";
  const screenId = params.get("screen") || params.get("screenId") || "";
  return folderPath.trim()
    ? {
        folderPath: folderPath.trim(),
        screenId: screenId.trim(),
        sourceLabel: "URL"
      }
    : null;
}

function saveLastFolderSource(folderPath, screenId) {
  try {
    localStorage.setItem(LAST_SOURCE_STORAGE_KEY, JSON.stringify({ folderPath, screenId: screenId || "" }));
  } catch (error) {
    // Storage may be unavailable; restoring is best-effort only.
  }
}

function readLastFolderSource() {
  try {
    const raw = localStorage.getItem(LAST_SOURCE_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return parsed && typeof parsed.folderPath === "string" && parsed.folderPath ? parsed : null;
  } catch (error) {
    return null;
  }
}

function clearLastFolderSource() {
  try {
    localStorage.removeItem(LAST_SOURCE_STORAGE_KEY);
  } catch (error) {
    // Ignore.
  }
}

async function readDefaultStartupSource() {
  const response = await fetch("/api/startup-source");
  const payload = await response.json();
  if (!payload.ok) {
    throw new Error(payload.error || "起動時フォルダ設定を取得できませんでした。");
  }
  const source = payload.startupSource || {};
  return source.defaultFolderPath
    ? {
        folderPath: source.defaultFolderPath,
        screenId: source.defaultScreenId || "",
        sourceLabel: source.source || "default",
        exists: source.exists,
        env: source.env || {}
      }
    : null;
}

function showEmptyStartupWorkspace(message, folderPath = "") {
  state.source = {
    kind: "none"
  };
  elements.sourceStatus.textContent = "読み込み元: 未読み込み";
  elements.imagegenStatus.textContent = "imagegen: 未実行";
  elements.imagegenStatus.title = "";
  elements.aiModeLabel.textContent = "未読み込み";
  if (folderPath) {
    elements.folderPathInput.value = folderPath;
  }
  setSpecEditorDisabled(true);
  renderProjectNavigator();
  renderHandoffPanel();
  setFlowStep("load");
  setActivityStatus(message);
}

async function loadFolder(options = {}) {
  const parsed = options.folderPath
    ? {
        folderPath: options.folderPath,
        screenId: options.screenId || ""
      }
    : parseFolderPathInput(elements.folderPathInput.value);
  const { folderPath, screenId } = parsed;
  if (!folderPath) {
    window.alert("フォルダパスを入れてください。");
    return;
  }

  const busyStartedAt = Date.now();
  setBusy(elements.loadFolderButton, true, "読み込み中...");
  setWorkspaceBusy(true, "フォルダを読み込んでいます...");
  try {
    const response = await fetch("/api/load-from-folder", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ folderPath, screenId })
    });
    const payload = await response.json();
    if (!payload.ok) {
      throw new Error(payload.error || "フォルダの読み込みに失敗しました。");
    }
    if (payload.source && payload.source.projectRoot) {
      elements.folderPathInput.value = payload.source.projectRoot;
    }
    await loadBundleObject(payload.bundle, payload.source);
    elements.aiModeLabel.textContent = payload.ai.mode;
    saveLastFolderSource(
      payload.source && payload.source.projectRoot ? payload.source.projectRoot : folderPath,
      payload.source ? payload.source.screenId : screenId
    );
  } catch (error) {
    if (options.silent) {
      throw error;
    }
    window.alert(error.message);
    setActivityStatus(`読込失敗: ${error.message}`);
  } finally {
    await ensureMinimumBusy(busyStartedAt);
    setWorkspaceBusy(false, "待機中");
    setBusy(elements.loadFolderButton, false);
  }
}

async function switchProjectScreen() {
  if (elements.projectScreenSelect.disabled || !elements.projectScreenSelect.value) {
    return;
  }
  const projectRoot = state.source && state.source.projectRoot
    ? state.source.projectRoot
    : parseFolderPathInput(elements.folderPathInput.value).folderPath;
  if (!projectRoot) {
    window.alert("先にプロジェクトフォルダを読み込んでください。");
    return;
  }
  await loadFolder({
    folderPath: projectRoot,
    screenId: elements.projectScreenSelect.value
  });
}

async function importBundleFile(file) {
  const text = await file.text();
  const bundle = JSON.parse(text);
  await loadBundleObject(bundle, {
    kind: "bundle-file",
    fileName: file.name
  });
}

elements.loadDemoButton.addEventListener("click", async () => {
  await loadDemo();
});
elements.loadFolderButton.addEventListener("click", loadFolder);
elements.projectScreenSelect.addEventListener("change", switchProjectScreen);
elements.placementEditorSelect.addEventListener("change", () => {
  state.selectedPlacementId = elements.placementEditorSelect.value;
  renderStructuredSpecEditor();
  if (state.renderModel) {
    renderScreen();
  }
});
elements.compositionEditorSelect.addEventListener("change", () => {
  state.selectedCompositionEditorGroupId = elements.compositionEditorSelect.value;
  state.selectedCompositionGroupId = elements.compositionEditorSelect.value;
  if (state.renderModel) {
    renderScreen();
    renderCompositionGroups();
  }
  renderStructuredSpecEditor();
});
elements.bundleFileInput.addEventListener("change", async (event) => {
  const file = event.target.files && event.target.files[0];
  if (!file) {
    return;
  }
  try {
    await importBundleFile(file);
  } catch (error) {
    window.alert(error.message);
  } finally {
    event.target.value = "";
  }
});
elements.imagegenJobButton.addEventListener("click", prepareImagegenJob);
elements.imagegenRefreshButton.addEventListener("click", refreshImagegenOutputs);
elements.draftButton.addEventListener("click", showDraftWorkspace);
elements.structureButton.addEventListener("click", showStructureWorkspace);
elements.generateButton.addEventListener("click", showGeneratedResults);
elements.validateButton.addEventListener("click", validateWorkspaceSpec);
elements.exportReportButton.addEventListener("click", buildImplementationReport);
elements.applyPlacementEditButton.addEventListener("click", applyPlacementEditor);
elements.placementTuneToggle.addEventListener("click", togglePlacementTuneMode);
elements.placementFollowToggle.addEventListener("change", () => {
  state.movePlacementDependents = elements.placementFollowToggle.checked;
  setActivityStatus(`載っている素材の追従 ${state.movePlacementDependents ? "ON" : "OFF"} ${nowLabel()}`);
});
elements.placementNudgeUp.addEventListener("click", () => {
  adjustSelectedPlacementGeometry({ y: -getPlacementStep() }, "上へ移動");
});
elements.placementNudgeLeft.addEventListener("click", () => {
  adjustSelectedPlacementGeometry({ x: -getPlacementStep() }, "左へ移動");
});
elements.placementNudgeRight.addEventListener("click", () => {
  adjustSelectedPlacementGeometry({ x: getPlacementStep() }, "右へ移動");
});
elements.placementNudgeDown.addEventListener("click", () => {
  adjustSelectedPlacementGeometry({ y: getPlacementStep() }, "下へ移動");
});
elements.placementShrinkWidth.addEventListener("click", () => {
  adjustSelectedPlacementGeometry({ width: -getPlacementStep() }, "幅縮小");
});
elements.placementGrowWidth.addEventListener("click", () => {
  adjustSelectedPlacementGeometry({ width: getPlacementStep() }, "幅拡大");
});
elements.placementShrinkHeight.addEventListener("click", () => {
  adjustSelectedPlacementGeometry({ height: -getPlacementStep() }, "高さ縮小");
});
elements.placementGrowHeight.addEventListener("click", () => {
  adjustSelectedPlacementGeometry({ height: getPlacementStep() }, "高さ拡大");
});
elements.applyCompositionInsetButton.addEventListener("click", applyCompositionInsetEditor);
elements.buildRegenPromptButton.addEventListener("click", buildRegenerationPrompt);
elements.buildReferenceProfileButton.addEventListener("click", buildReferenceQualityProfileFromPath);
elements.applyReferenceProfileButton.addEventListener("click", applyReferenceQualityProfileToPreset);
elements.auditReferenceQualityButton.addEventListener("click", auditGeneratedAssetsWithReferenceProfile);
elements.saveRegenQueueButton.addEventListener("click", saveRegenerationQueue);
elements.loadRegenQueueButton.addEventListener("click", loadSavedRegenerationQueue);
elements.clearRegenQueueButton.addEventListener("click", clearRegenerationQueue);
elements.reviewButton.addEventListener("click", runReview);
elements.applyLocksButton.addEventListener("click", applyLockSuggestions);

// During boot the workflow buttons stay disabled so early clicks are not
// swallowed by the initial load.
function setBootBusy(busy) {
  const bootButtons = [
    elements.draftButton,
    elements.structureButton,
    elements.generateButton,
    elements.validateButton,
    elements.reviewButton,
    elements.imagegenJobButton,
    elements.imagegenRefreshButton,
    elements.exportReportButton,
    elements.applyLocksButton,
    elements.loadDemoButton,
    elements.loadFolderButton
  ];
  for (const button of bootButtons) {
    button.disabled = busy;
  }
}

async function bootWorkspace() {
  setBootBusy(true);
  try {
    const requested = readStartupFolderSourceFromUrl();
    if (requested) {
      elements.folderPathInput.value = requested.folderPath;
      await loadFolder({ folderPath: requested.folderPath, screenId: requested.screenId, silent: true });
      setActivityStatus(`URL指定のフォルダを読み込みました: ${requested.folderPath}${requested.screenId ? `#${requested.screenId}` : ""} ${nowLabel()}`);
      return;
    }

    const last = readLastFolderSource();
    if (last) {
      elements.folderPathInput.value = last.folderPath;
      try {
        await loadFolder({ folderPath: last.folderPath, screenId: last.screenId, silent: true });
        setActivityStatus(`前回のフォルダを復元しました: ${last.folderPath}${last.screenId ? `#${last.screenId}` : ""} ${nowLabel()}`);
        return;
      } catch (error) {
        clearLastFolderSource();
        setActivityStatus(`前回フォルダの復元に失敗しました。デフォルトフォルダを確認します: ${error.message}`);
      }
    }

    const defaultSource = await readDefaultStartupSource();
    if (defaultSource) {
      elements.folderPathInput.value = defaultSource.folderPath;
      try {
        await loadFolder({ folderPath: defaultSource.folderPath, screenId: defaultSource.screenId, silent: true });
        setActivityStatus(`デフォルトフォルダを読み込みました: ${defaultSource.folderPath}${defaultSource.screenId ? `#${defaultSource.screenId}` : ""} ${nowLabel()}`);
        return;
      } catch (error) {
        const envName = defaultSource.env && defaultSource.env.project ? defaultSource.env.project : "GAME_SCREEN_FOUNDRY_PROJECT";
        showEmptyStartupWorkspace(
          `デフォルトフォルダを読み込めませんでした。${envName} かフォルダ入力を設定してください: ${error.message}`,
          defaultSource.folderPath
        );
        return;
      }
    }

    showEmptyStartupWorkspace("フォルダを指定してください。デモは「デモを読み込む」を押した時だけ表示します。");
  } catch (error) {
    showEmptyStartupWorkspace(`起動時の読み込みに失敗しました: ${error.message}`);
  } finally {
    setBootBusy(false);
  }
}

setFlowStep("load");
renderReferenceQualityPanel();
bootWorkspace();
