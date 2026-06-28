const state = {
  commentDrafts: {},
  generationReport: null,
  imagegenReport: null,
  screenKv: null,
  materialSpecSheet: null,
  worldPreset: null,
  flowStep: "load",
  implementationReport: "",
  viewMode: "draft",
  regenerationQueue: [],
  regenerationPrompt: "",
  revisionMap: {},
  renderModel: null,
  review: null,
  reviewSuggestionsByAsset: {},
  selectedCompositionGroupId: "",
  source: {
    kind: "demo"
  }
};

const MIN_BUSY_MS = 650;

const elements = {
  activityOverlay: document.getElementById("activityOverlay"),
  activityOverlayLabel: document.getElementById("activityOverlayLabel"),
  activityStatus: document.getElementById("activityStatus"),
  aiModeLabel: document.getElementById("aiModeLabel"),
  applyLocksButton: document.getElementById("applyLocksButton"),
  assetGrid: document.getElementById("assetGrid"),
  bundleFileInput: document.getElementById("bundleFileInput"),
  compositionCountLabel: document.getElementById("compositionCountLabel"),
  compositionGroupList: document.getElementById("compositionGroupList"),
  compositionPanel: document.getElementById("compositionPanel"),
  compositionSummary: document.getElementById("compositionSummary"),
  draftButton: document.getElementById("draftButton"),
  folderPathInput: document.getElementById("folderPathInput"),
  flowCurrentLabel: document.getElementById("flowCurrentLabel"),
  flowSteps: document.getElementById("flowSteps"),
  exportReportButton: document.getElementById("exportReportButton"),
  generateButton: document.getElementById("generateButton"),
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
  projectScreenSelect: document.getElementById("projectScreenSelect"),
  buildRegenPromptButton: document.getElementById("buildRegenPromptButton"),
  clearRegenQueueButton: document.getElementById("clearRegenQueueButton"),
  regenPromptOutput: document.getElementById("regenPromptOutput"),
  regenQueueCountLabel: document.getElementById("regenQueueCountLabel"),
  regenQueueList: document.getElementById("regenQueueList"),
  regenQueuePanel: document.getElementById("regenQueuePanel"),
  reviewButton: document.getElementById("reviewButton"),
  reviewOutput: document.getElementById("reviewOutput"),
  screenCanvas: document.getElementById("screenCanvas"),
  screenCanvasWrap: document.getElementById("screenCanvasWrap"),
  screenKvInput: document.getElementById("screenKvInput"),
  screenMeta: document.getElementById("screenMeta"),
  specInput: document.getElementById("specInput"),
  assetCardTemplate: document.getElementById("assetCardTemplate"),
  assetCountLabel: document.getElementById("assetCountLabel"),
  assetPanel: document.getElementById("assetPanel"),
  sourceStatus: document.getElementById("sourceStatus")
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
  elements.activityStatus.classList.toggle("is-success", !busy && /生成しました|読み込みました|更新しました|再採用しました|完了/.test(message));
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
}

function syncStateFromPayload(payload) {
  state.screenKv = payload.screenKv;
  state.materialSpecSheet = payload.materialSpecSheet;
  state.worldPreset = payload.worldPreset;
  state.revisionMap = payload.revisionMap || {};
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

  elements.sourceStatus.textContent = "読み込み元: デモバンドル";
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

function renderImagegenStatus() {
  if (!state.imagegenReport) {
    elements.imagegenStatus.textContent = "imagegen: 未実行";
    elements.imagegenStatus.title = "";
    return;
  }

  const report = state.imagegenReport;
  const job = report.job || {};
  const runner = report.runner || {};
  const adopted = Array.isArray(report.adoptedAssetIds) ? report.adoptedAssetIds.length : 0;
  const missing = Array.isArray(report.missingAssetIds) ? report.missingAssetIds.length : 0;
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

  elements.imagegenStatus.textContent = `imagegen: ${stateLabel} / mode ${mode} / 採用 ${adopted}/${total} / 未生成 ${missing}${compositionLabel}`;
  elements.imagegenStatus.title = [
    job.jobPath ? `job: ${job.jobPath}` : "",
    job.promptPath ? `prompt: ${job.promptPath}` : "",
    job.commandHint ? `command: ${job.commandHint}` : "",
    compositionQuality ? `composition: ${compositionQuality.status} score ${compositionQuality.score} fail ${compositionQuality.failCount} warn ${compositionQuality.warnCount}` : "",
    runner.message || ""
  ].filter(Boolean).join("\n");
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

function getSelectedCompositionGroup() {
  return ensureCompositionSelection();
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
    selectButton.textContent = group.groupId === state.selectedCompositionGroupId ? "表示中" : "表示";
    selectButton.addEventListener("click", () => {
      state.selectedCompositionGroupId = group.groupId;
      renderScreen();
      renderCompositionGroups();
      setActivityStatus(`${group.groupId} の構成枠を表示しました ${nowLabel()}`);
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
    image.src = layer.src;
    image.alt = layer.assetId;
    image.title = `${layer.assetId} (${layer.role})`;
    image.style.left = `${layer.left}px`;
    image.style.top = `${layer.top}px`;
    image.style.width = `${layer.width}px`;
    image.style.height = `${layer.height}px`;
    image.style.zIndex = String(layer.zIndex);
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
  elements.regenQueueCountLabel.textContent = `${queue.length} 件`;
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

function clearRegenerationQueue() {
  state.regenerationQueue = [];
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
    updateEditors();
    renderMeta();
    renderScreen();
    renderCompositionGroups();
    renderAssets();
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
        state.review = null;
        state.reviewSuggestionsByAsset = {};
        updateEditors();
        renderMeta();
        renderScreen();
        renderCompositionGroups();
        renderReview();
        renderAssets();
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
    state.commentDrafts = {};
    state.regenerationQueue = [];
    setRegenerationPrompt("");
    setImplementationReport("");
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
  renderReview();
  renderRegenerationQueue();
  renderAssets();
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
  try {
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

    const report = state.imagegenReport || {};
    const adopted = Array.isArray(report.adoptedAssetIds) ? report.adoptedAssetIds.length : 0;
    const missing = Array.isArray(report.missingAssetIds) ? report.missingAssetIds.length : 0;
    setFlowStep("import");
    setViewMode("generated");
    setActivityStatus(`生成済みPNGを再取り込みしました。採用 ${adopted} / 未生成 ${missing} ${nowLabel()}`);
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
  elements.aiModeLabel.textContent = payload.ai.mode;
  renderMeta();
  renderScreen();
  renderCompositionGroups();
  renderReview();
  renderRegenerationQueue();
  renderAssets();
  renderSourceStatus();
  renderImagegenStatus();
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
  state.commentDrafts = {};
  state.regenerationQueue = [];
  setRegenerationPrompt("");
  setImplementationReport("");
  updateEditors();
  await renderGeneratedWorkspace(`読み込み完了。生成後画面を表示しました ${nowLabel()}`, {
    resetReview: true,
    resetComments: true
  });
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
  } catch (error) {
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
elements.generateButton.addEventListener("click", showGeneratedResults);
elements.exportReportButton.addEventListener("click", buildImplementationReport);
elements.buildRegenPromptButton.addEventListener("click", buildRegenerationPrompt);
elements.clearRegenQueueButton.addEventListener("click", clearRegenerationQueue);
elements.reviewButton.addEventListener("click", runReview);
elements.applyLocksButton.addEventListener("click", applyLockSuggestions);

setFlowStep("load");
loadDemo().catch((error) => {
  window.alert(error.message);
});
