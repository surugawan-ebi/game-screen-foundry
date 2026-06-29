"use strict";

const { buildLookup } = require("./spec");
const { baseDirectives, mergeDirectives } = require("./comment-tools");
const { buildCompositionReview } = require("./composition-quality");

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function cloneValue(value) {
  return JSON.parse(JSON.stringify(value));
}

function adjustHexColor(hex, delta) {
  const normalized = hex.replace("#", "");
  const channels = normalized.length === 3
    ? normalized.split("").map((char) => parseInt(char + char, 16))
    : [
        parseInt(normalized.slice(0, 2), 16),
        parseInt(normalized.slice(2, 4), 16),
        parseInt(normalized.slice(4, 6), 16)
      ];

  const shifted = channels.map((channel) => clamp(channel + delta, 0, 255));
  return `#${shifted.map((channel) => channel.toString(16).padStart(2, "0")).join("")}`;
}

function getKvStyleProfile(preset) {
  const profile = preset && preset.kvStyleProfile ? preset.kvStyleProfile : null;
  return profile && profile.rendererHint === "sky_port_home_kv" ? profile : null;
}

function getKvColor(preset, key, fallback) {
  const profile = getKvStyleProfile(preset);
  return profile && profile.colors && profile.colors[key] ? profile.colors[key] : fallback;
}

function slugToLabel(id) {
  return String(id || "")
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function escapeXml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function hasBakedText(asset) {
  return asset
    && asset.textHandling
    && asset.textHandling.ownership === "baked_in_asset"
    && Array.isArray(asset.textHandling.bakedTextBlocks)
    && asset.textHandling.bakedTextBlocks.length > 0;
}

function renderBakedTextMarkup(asset, width, height) {
  if (!hasBakedText(asset)) {
    return "";
  }

  return asset.textHandling.bakedTextBlocks.map((block) => {
    const align = block.align || "center";
    const textAnchor = align === "left" ? "start" : align === "right" ? "end" : "middle";
    const x = block.x !== undefined
      ? block.x
      : align === "left"
        ? (block.paddingLeft || 0)
        : align === "right"
          ? width - (block.paddingRight || 0)
          : width / 2;
    const y = block.y !== undefined ? block.y : height / 2;
    return `<text x="${x}" y="${y}" text-anchor="${textAnchor}" font-family="${block.fontFamily || "'Hiragino Sans', Arial, sans-serif"}" font-size="${block.fontSize || 16}" font-weight="${block.fontWeight || 700}" letter-spacing="${block.letterSpacing || 0}" fill="${block.color || "#eef3df"}" stroke="${block.strokeColor || "none"}" stroke-width="${block.strokeWidth || 0}" paint-order="stroke fill" opacity="${block.opacity === undefined ? 1 : block.opacity}">${escapeXml(block.text || "")}</text>`;
  }).join("");
}

function inferAssetLabel(asset) {
  if (asset.previewLabel) {
    return asset.previewLabel;
  }

  const roleLabels = {
    primary_cta: "はじめる",
    secondary_cta: "設定",
    title_logo: "月灯り配達録",
    ambient_backdrop: "背景"
  };

  if (roleLabels[asset.role]) {
    return roleLabels[asset.role];
  }

  if (/start/u.test(asset.assetId)) {
    return "はじめる";
  }

  if (/setting/u.test(asset.assetId)) {
    return "設定";
  }

  if (/logo/u.test(asset.assetId)) {
    return "ロゴ";
  }

  return slugToLabel(asset.assetId);
}

function normalizeDisplayGenerationPlan(plan) {
  if (!plan) {
    return null;
  }
  const backendClass = plan.backendClass || "image_batch";
  const backendClassLabelMap = {
    image_batch: "imagegen候補生成",
    template_family_batch: "SVGテンプレ生成",
    symbol_batch: "SVGアイコン生成"
  };
  return {
    ...plan,
    backendClass,
    backendClassLabel: backendClassLabelMap[backendClass] || plan.backendClassLabel || "SVGモック生成"
  };
}

function getAssetRevision(revisionMap, assetId) {
  return {
    locked: false,
    revisionCount: 0,
    comments: [],
    normalizedComments: [],
    directives: baseDirectives(),
    generationMeta: null,
    history: [],
    selectedVersionId: "",
    ...(revisionMap[assetId] || {})
  };
}

function summarizeDirectiveDiff(previous, next) {
  const left = {
    ...baseDirectives(),
    ...(previous || {})
  };
  const right = {
    ...baseDirectives(),
    ...(next || {})
  };
  const lines = [];

  const pushDelta = (label, before, after) => {
    if (before === after) {
      return;
    }
    const delta = after - before;
    const prefix = delta > 0 ? "+" : "";
    lines.push(`${label} ${prefix}${delta}`);
  };

  pushDelta("明るさ", left.brightnessDelta, right.brightnessDelta);
  pushDelta("コントラスト", left.contrastDelta, right.contrastDelta);
  pushDelta("装飾量", left.ornamentDelta, right.ornamentDelta);
  pushDelta("強調", left.emphasisDelta, right.emphasisDelta);
  pushDelta("角丸", left.roundnessDelta, right.roundnessDelta);
  pushDelta("可読性", left.readabilityBoost, right.readabilityBoost);

  if (left.materialHint !== right.materialHint) {
    lines.push(`材質 ${right.materialHint || "なし"}`);
  }

  if (left.moodShift !== right.moodShift) {
    lines.push(`ムード ${right.moodShift || "標準"}`);
  }

  return lines.length ? lines : ["見た目差分なし"];
}

function buildFallbackHistory(revision) {
  return [
    {
      versionId: "version_initial_fallback",
      revisionCount: revision.revisionCount,
      comment: revision.comments[revision.comments.length - 1] || "",
      normalizedComment: revision.normalizedComments[revision.normalizedComments.length - 1] || "",
      directives: cloneValue(revision.directives || baseDirectives()),
      generationMeta: revision.generationMeta ? cloneValue(revision.generationMeta) : null,
      locked: revision.locked,
      source: revision.revisionCount > 0 ? "current" : "initial",
      restoredFromVersionId: "",
      createdAt: ""
    }
  ];
}

function getHistoryEntries({ asset, placement, preset, revision }) {
  const history = Array.isArray(revision.history) && revision.history.length
    ? revision.history
    : buildFallbackHistory(revision);
  const currentVersionId = revision.selectedVersionId || history[history.length - 1].versionId;

  return history.map((entry, index) => {
    const prev = index > 0 ? history[index - 1] : null;
    const snapshotRevision = {
      locked: entry.locked,
      revisionCount: entry.revisionCount,
      comments: entry.comment ? [entry.comment] : [],
      normalizedComments: entry.normalizedComment ? [entry.normalizedComment] : [],
      directives: cloneValue(entry.directives || baseDirectives()),
      generationMeta: entry.generationMeta ? cloneValue(entry.generationMeta) : null,
      history: [],
      selectedVersionId: entry.versionId
    };
    const label = entry.source === "initial"
      ? "初期版"
      : entry.source === "restore"
        ? `再採用 ${entry.revisionCount}`
        : `改訂 ${entry.revisionCount}`;

    return {
      ...entry,
      label,
      isCurrent: entry.versionId === currentVersionId,
      diffSummary: summarizeDirectiveDiff(prev ? prev.directives : baseDirectives(), entry.directives),
      previewSrc: renderAssetPreview(asset, placement, preset, snapshotRevision)
    };
  });
}

function getRoleFill(asset, preset, directives) {
  const palette = preset.palette || {};
  const kvStyle = getKvStyleProfile(preset);
  if (kvStyle) {
    const colors = kvStyle.colors || {};
    const roleMap = {
      ambient_backdrop: colors.skyTop || palette.secondary || "#43a7f2",
      event_banner_art: colors.skyTop || palette.secondary || "#43a7f2",
      primary_cta: colors.uiBlue || palette.accent || "#0f6f96",
      nav_button_active: colors.uiBlue || palette.accent || "#0f6f96",
      nav_button_default: colors.uiInner || palette.neutralDark || "#2c241a",
      secondary_cta: colors.uiInner || palette.neutralDark || "#2c241a",
      utility_round_button: colors.uiInner || palette.neutralDark || "#2c241a",
      square_action_tile: colors.uiBlue || palette.secondary || "#0f6f96",
      compact_action_button: colors.uiBlue || palette.secondary || "#0f6f96",
      status_profile_shell: colors.uiInner || palette.neutralDark || "#2c241a",
      resource_shell: colors.uiInner || palette.neutralDark || "#2c241a",
      nav_bar_shell: colors.uiInner || palette.neutralDark || "#2c241a",
      info_panel_shell: colors.parchment || "#efe0c4",
      mission_panel_shell: colors.parchment || "#efe0c4",
      mission_row_shell: colors.parchment || "#efe0c4",
      mission_header_strip: colors.uiInner || palette.neutralDark || "#2c241a",
      title_tab: colors.uiInner || palette.neutralDark || "#2c241a",
      ribbon_tag: colors.warningRibbon || "#a23a25",
      reward_chip: colors.uiInner || palette.neutralDark || "#2c241a",
      progress_track: colors.uiInner || palette.neutralDark || "#2c241a",
      progress_fill: colors.uiBlueLight || palette.accent || "#34c5e8"
    };
    if (roleMap[asset.role]) {
      return adjustHexColor(roleMap[asset.role], directives.brightnessDelta);
    }
  }

  const roleMap = {
    primary_cta: palette.accent || "#67c3d9",
    reward_marker: palette.accent || "#67c3d9",
    modal_base: palette.secondary || "#394454",
    reward_slot: palette.primary || "#8a6731",
    ambient_backdrop: palette.neutralDark || "#14181f"
  };

  let fill = roleMap[asset.role] || palette.primary || "#8a6731";

  if (directives.materialHint === "stone") {
    fill = palette.secondary || "#394454";
  }

  if (directives.materialHint === "crystal") {
    fill = palette.accent || "#67c3d9";
  }

  if (directives.materialHint === "brass") {
    fill = palette.primary || "#8a6731";
  }

  return adjustHexColor(fill, directives.brightnessDelta);
}

function getStrokeColor(preset, directives) {
  const base = getKvColor(preset, "shadow", preset.palette && preset.palette.neutralDark ? preset.palette.neutralDark : "#14181f");
  return adjustHexColor(base, Math.floor(directives.contrastDelta / 2));
}

function buildSvgCommon({ asset, width, height, preset, revision, label }) {
  const baseStylePatch = revision.generationMeta && revision.generationMeta.stylePatch
    ? revision.generationMeta.stylePatch
    : baseDirectives();
  const directives = mergeDirectives(baseStylePatch, revision.directives);
  const fill = getRoleFill(asset, preset, directives);
  const stroke = getStrokeColor(preset, directives);
  const accent = getKvColor(preset, "uiBlueLight", preset.palette && preset.palette.accent ? preset.palette.accent : "#67c3d9");
  const frame = getKvColor(preset, "brass", preset.palette && preset.palette.primary ? preset.palette.primary : "#8a6731");
  const light = getKvColor(preset, "brassLight", preset.palette && preset.palette.neutralLight ? preset.palette.neutralLight : "#dccfb0");
  const kvStyle = getKvStyleProfile(preset);
  const radius = clamp(18 + directives.roundnessDelta * 8, 4, 42);
  const strokeWidth = clamp(3 + Math.floor(directives.contrastDelta / 8), 2, 8);
  const ornamentLevel = clamp(2 + directives.ornamentDelta, 0, 5);
  const emphasis = clamp(0 + directives.emphasisDelta, 0, 3);
  return {
    accent,
    directives,
    fill,
    frame,
    height,
    label,
    light,
    ornamentLevel,
    radius,
    stroke,
    strokeWidth,
    width,
    emphasis,
    generationMeta: revision.generationMeta || null,
    kvStyle
  };
}

function svgDataUri(svg) {
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

function fileSourceUri(filePath) {
  return `/api/source-file?path=${encodeURIComponent(filePath)}`;
}

function getImagegenPreviewSrc(revision) {
  const meta = revision && revision.generationMeta ? revision.generationMeta : null;
  if (!meta || !meta.imagePath) {
    return "";
  }
  return fileSourceUri(meta.imagePath);
}

function renderOverlaySvg(overlay, preset) {
  const width = Math.max(overlay.width || 1, 1);
  const height = Math.max(overlay.height || 1, 1);
  const text = overlay.sampleText || overlay.text || overlay.value || "";
  const lines = String(text).split("\n");
  const fontSize = overlay.fontSize || Math.max(12, Math.round(height * 0.46));
  const lineHeight = overlay.lineHeight || Math.round(fontSize * 1.12);
  const totalHeight = lineHeight * lines.length;
  const valign = overlay.valign || "middle";
  const align = overlay.align || "center";
  const textAnchor = align === "left" ? "start" : align === "right" ? "end" : "middle";
  const x = align === "left"
    ? (overlay.paddingLeft || 0)
    : align === "right"
      ? width - (overlay.paddingRight || 0)
      : width / 2;
  const startY = valign === "top"
    ? (overlay.paddingTop || fontSize)
    : valign === "bottom"
      ? height - totalHeight + fontSize
      : Math.round((height - totalHeight) / 2 + fontSize * 0.8);
  const palette = preset.palette || {};
  const textColor = overlay.color || palette.neutralLight || "#eef3df";
  const backgroundColor = overlay.backgroundColor || "transparent";
  const borderColor = overlay.borderColor || "transparent";
  const radius = overlay.cornerRadius || 0;
  const strokeColor = overlay.strokeColor || "none";
  const strokeWidth = overlay.strokeWidth || 0;
  const letterSpacing = overlay.letterSpacing || 0;
  const fontFamily = overlay.fontFamily || "'Hiragino Sans', Arial, sans-serif";
  const fontWeight = overlay.fontWeight || 600;
  const opacity = overlay.opacity === undefined ? 1 : overlay.opacity;
  const bgMarkup = backgroundColor !== "transparent" || borderColor !== "transparent"
    ? `<rect x="0" y="0" width="${width}" height="${height}" rx="${radius}" fill="${backgroundColor}" stroke="${borderColor}" stroke-width="${overlay.borderWidth || 0}" opacity="${opacity}" />`
    : "";
  const lineMarkup = lines.map((line, index) => {
    const y = startY + index * lineHeight;
    return `<text x="${x}" y="${y}" text-anchor="${textAnchor}" font-family="${fontFamily}" font-size="${fontSize}" font-weight="${fontWeight}" letter-spacing="${letterSpacing}" fill="${textColor}" stroke="${strokeColor}" stroke-width="${strokeWidth}" paint-order="stroke fill" opacity="${opacity}">${escapeXml(line)}</text>`;
  }).join("");
  return svgDataUri(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}">
  ${bgMarkup}
  ${lineMarkup}
</svg>`);
}

function isPlaceholderRevision(revision) {
  return !revision.locked
    && revision.revisionCount === 0
    && (!revision.comments || revision.comments.length === 0)
    && (!revision.normalizedComments || revision.normalizedComments.length === 0);
}

function buildPlaceholderCommon({ asset, width, height, preset, revision, label }) {
  const common = buildSvgCommon({ asset, width, height, preset, revision, label });
  return {
    ...common,
    fill: "#1b1f27",
    frame: "#505764",
    light: "#d5dae3",
    stroke: "#7f8897",
    draftFill: "#1b1f27",
    draftPanel: "#2a313b",
    draftLine: "#7f8897"
  };
}

function buildPlaceholderBackdropSvg({ asset, width, height, preset, revision }) {
  const common = buildPlaceholderCommon({ asset, width, height, preset, revision, label: inferAssetLabel(asset) });
  const logoZoneY = Math.round(height * 0.14);
  const buttonZoneY = Math.round(height * 0.62);
  return svgDataUri(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}">
  <rect width="${width}" height="${height}" fill="${common.draftFill}" />
  <rect x="24" y="24" width="${width - 48}" height="${height - 48}" fill="none" stroke="${common.draftLine}" stroke-dasharray="16 10" stroke-width="2" opacity="0.7" />
  <path d="M 0 ${height * 0.72} L ${width * 0.18} ${height * 0.58} L ${width * 0.38} ${height * 0.68} L ${width * 0.6} ${height * 0.52} L ${width * 0.82} ${height * 0.66} L ${width} ${height * 0.56}" fill="none" stroke="${common.draftLine}" stroke-width="3" opacity="0.36" />
  <rect x="${Math.round(width * 0.22)}" y="${logoZoneY}" width="${Math.round(width * 0.56)}" height="${Math.round(height * 0.18)}" rx="8" fill="none" stroke="${common.light}" stroke-dasharray="14 8" stroke-width="3" opacity="0.82" />
  <rect x="${Math.round(width * 0.36)}" y="${buttonZoneY}" width="${Math.round(width * 0.28)}" height="${Math.round(height * 0.11)}" rx="8" fill="none" stroke="${common.light}" stroke-dasharray="12 8" stroke-width="3" opacity="0.82" />
  <rect x="${Math.round(width * 0.39)}" y="${Math.round(buttonZoneY + height * 0.14)}" width="${Math.round(width * 0.22)}" height="${Math.round(height * 0.09)}" rx="8" fill="none" stroke="${common.light}" stroke-dasharray="12 8" stroke-width="3" opacity="0.62" />
  <text x="40" y="64" font-family="'Courier New', monospace" font-size="${Math.round(Math.min(width, height) * 0.03)}" fill="${common.light}">LAYOUT / BACKGROUND</text>
  <text x="${Math.round(width * 0.5)}" y="${Math.round(logoZoneY + height * 0.11)}" text-anchor="middle" font-family="'Courier New', monospace" font-size="${Math.round(Math.min(width, height) * 0.026)}" fill="${common.light}" opacity="0.84">LOGO AREA</text>
  <text x="${Math.round(width * 0.5)}" y="${Math.round(buttonZoneY + height * 0.065)}" text-anchor="middle" font-family="'Courier New', monospace" font-size="${Math.round(Math.min(width, height) * 0.022)}" fill="${common.light}" opacity="0.84">PRIMARY CTA AREA</text>
</svg>`);
}

function buildPlaceholderButtonSvg({ asset, width, height, preset, revision }) {
  const common = buildPlaceholderCommon({ asset, width, height, preset, revision, label: inferAssetLabel(asset) });
  const frameX = 14;
  const frameY = 14;
  return svgDataUri(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}">
  <rect width="${width}" height="${height}" rx="${Math.max(common.radius, 12)}" fill="${common.draftFill}" />
  <rect x="${frameX}" y="${frameY}" width="${width - frameX * 2}" height="${height - frameY * 2}" rx="8" fill="none" stroke="${common.light}" stroke-dasharray="10 6" stroke-width="3" />
  <line x1="${frameX + 18}" y1="${Math.round(height / 2)}" x2="${width - frameX - 18}" y2="${Math.round(height / 2)}" stroke="${common.draftLine}" stroke-width="2" opacity="0.5" />
  <text x="22" y="26" font-family="'Courier New', monospace" font-size="${Math.round(height * 0.18)}" fill="${common.light}" opacity="0.72">BUTTON</text>
  <text x="50%" y="61%" text-anchor="middle" font-family="'Courier New', monospace" font-size="${Math.round(height * 0.24)}" font-weight="700" fill="${common.light}">${common.label}</text>
</svg>`);
}

function buildPlaceholderLogoSvg({ asset, width, height, preset, revision }) {
  const common = buildPlaceholderCommon({ asset, width, height, preset, revision, label: inferAssetLabel(asset) });
  const lowerLabel = asset.subLabel || "TITLE SUB";
  return svgDataUri(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}">
  <rect width="${width}" height="${height}" rx="10" fill="${common.draftFill}" />
  <rect x="18" y="18" width="${width - 36}" height="${height - 36}" rx="10" fill="none" stroke="${common.light}" stroke-dasharray="14 8" stroke-width="3" />
  <line x1="${Math.round(width * 0.16)}" y1="${Math.round(height * 0.28)}" x2="${Math.round(width * 0.84)}" y2="${Math.round(height * 0.28)}" stroke="${common.draftLine}" stroke-width="2" opacity="0.55" />
  <line x1="${Math.round(width * 0.16)}" y1="${Math.round(height * 0.72)}" x2="${Math.round(width * 0.84)}" y2="${Math.round(height * 0.72)}" stroke="${common.draftLine}" stroke-width="2" opacity="0.55" />
  <text x="24" y="34" font-family="'Courier New', monospace" font-size="${Math.round(height * 0.12)}" fill="${common.light}" opacity="0.72">LOGO BLOCK</text>
  <text x="50%" y="49%" text-anchor="middle" font-family="Georgia, serif" font-size="${Math.round(height * 0.24)}" font-weight="700" fill="${common.light}">${common.label}</text>
  <text x="50%" y="67%" text-anchor="middle" font-family="'Courier New', monospace" font-size="${Math.round(height * 0.1)}" fill="${common.light}" opacity="0.76">${lowerLabel}</text>
</svg>`);
}

function buildPlaceholderPanelSvg({ asset, width, height, preset, revision }) {
  const common = buildPlaceholderCommon({ asset, width, height, preset, revision, label: "パネル" });
  return svgDataUri(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}">
  <rect width="${width}" height="${height}" rx="${common.radius}" fill="${common.draftFill}" />
  <rect x="16" y="16" width="${width - 32}" height="${height - 32}" rx="8" fill="none" stroke="${common.light}" stroke-dasharray="12 8" stroke-width="3" />
  <rect x="36" y="44" width="${width - 72}" height="${Math.max(height - 88, 20)}" rx="${Math.max(common.radius - 14, 4)}" fill="none" stroke="${common.draftLine}" stroke-width="2" opacity="0.5" />
  <text x="24" y="34" font-family="'Courier New', monospace" font-size="${Math.round(height * 0.12)}" fill="${common.light}" opacity="0.72">PANEL</text>
</svg>`);
}

function buildPlaceholderIconSvg({ asset, width, height, preset, revision }) {
  const common = buildPlaceholderCommon({ asset, width, height, preset, revision, label: inferAssetLabel(asset) });
  const size = Math.min(width, height);
  return svgDataUri(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}">
  <rect width="${width}" height="${height}" rx="${Math.max(common.radius, 12)}" fill="${common.draftFill}" />
  <circle cx="${width / 2}" cy="${height / 2}" r="${Math.round(size * 0.3)}" fill="none" stroke="${common.light}" stroke-dasharray="10 6" stroke-width="3" />
  <path d="M ${width * 0.5} ${height * 0.24} L ${width * 0.72} ${height * 0.5} L ${width * 0.5} ${height * 0.76} L ${width * 0.28} ${height * 0.5} Z" fill="none" stroke="${common.draftLine}" stroke-width="2" />
  <text x="50%" y="90%" text-anchor="middle" font-family="'Courier New', monospace" font-size="${Math.round(size * 0.12)}" fill="${common.light}" opacity="0.76">${common.label}</text>
</svg>`);
}

function buildPlaceholderCardFrameSvg({ asset, width, height, preset, revision }) {
  const common = buildPlaceholderCommon({ asset, width, height, preset, revision, label: inferAssetLabel(asset) });
  return svgDataUri(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}">
  <rect width="${width}" height="${height}" rx="${common.radius}" fill="${common.draftFill}" />
  <rect x="12" y="12" width="${width - 24}" height="${height - 24}" rx="${Math.max(common.radius - 6, 8)}" fill="none" stroke="${common.light}" stroke-dasharray="12 8" stroke-width="3" />
  <rect x="34" y="44" width="${width - 68}" height="${height - 88}" rx="${Math.max(common.radius - 14, 2)}" fill="none" stroke="${common.draftLine}" stroke-width="2" opacity="0.5" />
  <text x="50%" y="52%" text-anchor="middle" font-family="'Courier New', monospace" font-size="${Math.round(height * 0.1)}" fill="${common.light}" opacity="0.76">FRAME ROUGH</text>
</svg>`);
}

function buildPlaceholderGenericSvg({ asset, width, height, preset, revision }) {
  const common = buildPlaceholderCommon({ asset, width, height, preset, revision, label: inferAssetLabel(asset) });
  return svgDataUri(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}">
  <rect width="${width}" height="${height}" rx="${common.radius}" fill="${common.draftFill}" />
  <rect x="14" y="14" width="${width - 28}" height="${height - 28}" rx="${Math.max(common.radius - 8, 8)}" fill="none" stroke="${common.light}" stroke-dasharray="12 8" stroke-width="3" />
  <text x="50%" y="54%" text-anchor="middle" font-family="'Courier New', monospace" font-size="${Math.round(Math.min(width, height) * 0.12)}" fill="${common.light}">${common.label}</text>
</svg>`);
}

function buildBackdropSvg({ asset, width, height, preset, revision }) {
  const common = buildSvgCommon({ asset, width, height, preset, revision, label: inferAssetLabel(asset) });
  const vignette = adjustHexColor(common.fill, -22);
  const light = adjustHexColor(common.accent, 12);
  const bakedText = renderBakedTextMarkup(asset, width, height);
  return svgDataUri(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${vignette}" />
      <stop offset="100%" stop-color="${common.fill}" />
    </linearGradient>
    <radialGradient id="glow" cx="50%" cy="45%" r="50%">
      <stop offset="0%" stop-color="${light}" stop-opacity="0.22" />
      <stop offset="100%" stop-color="${light}" stop-opacity="0" />
    </radialGradient>
  </defs>
  <rect width="${width}" height="${height}" fill="url(#bg)" />
  <rect width="${width}" height="${height}" fill="url(#glow)" />
  <path d="M 0 ${height * 0.72} C ${width * 0.14} ${height * 0.54}, ${width * 0.28} ${height * 0.84}, ${width * 0.45} ${height * 0.68} S ${width * 0.76} ${height * 0.88}, ${width} ${height * 0.66} L ${width} ${height} L 0 ${height} Z" fill="${adjustHexColor(common.stroke, -6)}" opacity="0.55" />
  <path d="M 0 ${height * 0.79} C ${width * 0.18} ${height * 0.68}, ${width * 0.36} ${height * 0.9}, ${width * 0.58} ${height * 0.78} S ${width * 0.82} ${height * 0.92}, ${width} ${height * 0.8} L ${width} ${height} L 0 ${height} Z" fill="${adjustHexColor(vignette, -8)}" opacity="0.8" />
  <circle cx="${width * 0.77}" cy="${height * 0.22}" r="${Math.min(width, height) * 0.07}" fill="${common.light}" opacity="0.28" />
  <rect x="32" y="32" width="${width - 64}" height="${height - 64}" fill="none" stroke="${common.stroke}" stroke-opacity="0.28" stroke-width="2" />
  ${bakedText}
</svg>`);
}

function renderSkyPortClouds(width, height, color) {
  return [
    [0.08, 0.18, 0.16],
    [0.28, 0.15, 0.12],
    [0.62, 0.18, 0.18],
    [0.88, 0.15, 0.14],
    [0.18, 0.42, 0.22],
    [0.72, 0.42, 0.2]
  ].map(([x, y, scale], index) => {
    const cx = width * x;
    const cy = height * y;
    const rx = width * scale;
    const opacity = index < 4 ? 0.78 : 0.42;
    return `<g opacity="${opacity}">
      <ellipse cx="${cx}" cy="${cy}" rx="${rx * 0.44}" ry="${height * scale * 0.18}" fill="${color}" />
      <ellipse cx="${cx - rx * 0.18}" cy="${cy + height * scale * 0.02}" rx="${rx * 0.28}" ry="${height * scale * 0.13}" fill="${color}" />
      <ellipse cx="${cx + rx * 0.2}" cy="${cy + height * scale * 0.03}" rx="${rx * 0.34}" ry="${height * scale * 0.14}" fill="${color}" />
    </g>`;
  }).join("");
}

function renderSkyPortAirships(width, height, colors) {
  return [
    [0.28, 0.2, 0.1, -7],
    [0.46, 0.16, 0.07, 3],
    [0.83, 0.14, 0.08, -4],
    [0.66, 0.26, 0.05, 6]
  ].map(([x, y, scale, tilt], index) => {
    const cx = width * x;
    const cy = height * y;
    const bodyW = width * scale;
    const bodyH = height * scale * 0.22;
    const mast = colors.deckShadow;
    const hull = index % 2 === 0 ? colors.parchmentShade : colors.distantCity;
    return `<g id="kv-airship-${index + 1}" transform="translate(${cx} ${cy}) rotate(${tilt})" opacity="${index === 3 ? 0.58 : 0.76}">
      <ellipse cx="0" cy="0" rx="${bodyW * 0.5}" ry="${bodyH}" fill="${hull}" stroke="${mast}" stroke-width="${Math.max(1.5, bodyH * 0.08)}" />
      <path d="M ${-bodyW * 0.42} 0 C ${-bodyW * 0.18} ${bodyH * 0.48}, ${bodyW * 0.18} ${bodyH * 0.48}, ${bodyW * 0.42} 0" fill="none" stroke="${colors.brass}" stroke-width="${Math.max(1, bodyH * 0.06)}" opacity="0.65" />
      <rect x="${-bodyW * 0.22}" y="${bodyH * 0.82}" width="${bodyW * 0.44}" height="${bodyH * 0.34}" rx="${bodyH * 0.12}" fill="${colors.deckShadow}" />
      <line x1="${-bodyW * 0.28}" y1="${bodyH * 0.15}" x2="${-bodyW * 0.16}" y2="${bodyH * 0.82}" stroke="${mast}" stroke-width="1" />
      <line x1="${bodyW * 0.28}" y1="${bodyH * 0.15}" x2="${bodyW * 0.16}" y2="${bodyH * 0.82}" stroke="${mast}" stroke-width="1" />
    </g>`;
  }).join("");
}

function renderSkyPortCity(width, height, colors) {
  const towers = Array.from({ length: 9 }).map((_, index) => {
    const x = width * (0.08 + index * 0.105);
    const baseY = height * (0.55 + (index % 3) * 0.035);
    const towerH = height * (0.12 + (index % 4) * 0.035);
    const towerW = width * (0.026 + (index % 3) * 0.008);
    const domeY = baseY - towerH - towerW * 0.4;
    return `<g opacity="${index < 2 || index > 6 ? 0.42 : 0.68}">
      <rect x="${x - towerW / 2}" y="${baseY - towerH}" width="${towerW}" height="${towerH}" fill="${colors.distantCity}" stroke="${colors.deckShadow}" stroke-width="1" />
      <path d="M ${x - towerW * 0.72} ${baseY - towerH} L ${x} ${domeY} L ${x + towerW * 0.72} ${baseY - towerH} Z" fill="${colors.brass}" opacity="0.7" />
      <rect x="${x - towerW * 0.8}" y="${baseY - towerH * 0.2}" width="${towerW * 1.6}" height="${towerH * 0.2}" fill="${colors.deckShadow}" opacity="0.5" />
    </g>`;
  }).join("");

  return `<g id="kv-floating-city">
    ${towers}
    <path d="M ${width * 0.06} ${height * 0.58} C ${width * 0.28} ${height * 0.5}, ${width * 0.44} ${height * 0.66}, ${width * 0.62} ${height * 0.55} S ${width * 0.86} ${height * 0.62}, ${width} ${height * 0.54}" fill="none" stroke="${colors.deckShadow}" stroke-width="${Math.max(3, width * 0.006)}" opacity="0.58" />
    <path d="M ${width * 0.18} ${height * 0.66} C ${width * 0.38} ${height * 0.58}, ${width * 0.56} ${height * 0.66}, ${width * 0.78} ${height * 0.6}" fill="none" stroke="${colors.brass}" stroke-width="${Math.max(2, width * 0.004)}" opacity="0.58" />
  </g>`;
}

function buildSkyPortBackdropSvg({ asset, width, height, preset, revision }) {
  const common = buildSvgCommon({ asset, width, height, preset, revision, label: inferAssetLabel(asset) });
  const colors = common.kvStyle.colors;
  const skyTop = adjustHexColor(colors.skyTop, common.directives.brightnessDelta);
  const skyBottom = colors.skyBottom;
  const deckY = height * 0.68;
  return svgDataUri(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}">
  <defs>
    <linearGradient id="kvSky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${skyTop}" />
      <stop offset="62%" stop-color="${skyBottom}" />
      <stop offset="100%" stop-color="${adjustHexColor(colors.deckStone, 10)}" />
    </linearGradient>
    <radialGradient id="kvDeckLight" cx="50%" cy="72%" r="42%">
      <stop offset="0%" stop-color="${colors.brassLight}" stop-opacity="0.38" />
      <stop offset="100%" stop-color="${colors.brassLight}" stop-opacity="0" />
    </radialGradient>
  </defs>
  <rect width="${width}" height="${height}" fill="url(#kvSky)" />
  <g id="kv-cloud-bank">${renderSkyPortClouds(width, height, colors.cloud)}</g>
  <g id="kv-airships">${renderSkyPortAirships(width, height, colors)}</g>
  ${renderSkyPortCity(width, height, colors)}
  <path d="M 0 ${height * 0.78} C ${width * 0.22} ${height * 0.67}, ${width * 0.4} ${height * 0.84}, ${width * 0.62} ${height * 0.7} S ${width * 0.86} ${height * 0.83}, ${width} ${height * 0.72} L ${width} ${height} L 0 ${height} Z" fill="${colors.deckShadow}" opacity="0.56" />
  <ellipse cx="${width * 0.5}" cy="${deckY}" rx="${width * 0.34}" ry="${height * 0.15}" fill="${colors.deckStone}" stroke="${colors.deckShadow}" stroke-width="${Math.max(3, width * 0.004)}" opacity="0.92" />
  <ellipse cx="${width * 0.5}" cy="${deckY}" rx="${width * 0.22}" ry="${height * 0.1}" fill="none" stroke="${colors.brass}" stroke-width="${Math.max(2, width * 0.003)}" opacity="0.7" />
  <ellipse cx="${width * 0.5}" cy="${deckY}" rx="${width * 0.12}" ry="${height * 0.055}" fill="none" stroke="${colors.deckShadow}" stroke-width="${Math.max(2, width * 0.002)}" opacity="0.46" />
  <rect width="${width}" height="${height}" fill="url(#kvDeckLight)" />
  <g id="kv-rail-and-crates" opacity="0.72">
    <path d="M ${width * 0.08} ${height * 0.62} C ${width * 0.26} ${height * 0.56}, ${width * 0.42} ${height * 0.64}, ${width * 0.58} ${height * 0.58} S ${width * 0.84} ${height * 0.62}, ${width * 0.96} ${height * 0.57}" fill="none" stroke="${colors.deckShadow}" stroke-width="${Math.max(2, width * 0.003)}" />
    ${Array.from({ length: 10 }).map((_, index) => {
      const x = width * (0.12 + index * 0.085);
      const y = height * (0.6 + (index % 2) * 0.025);
      return `<rect x="${x}" y="${y}" width="${Math.max(5, width * 0.008)}" height="${Math.max(14, height * 0.032)}" fill="${colors.deckShadow}" />`;
    }).join("")}
  </g>
</svg>`);
}

function buildSkyPortEventBannerArtSvg({ asset, width, height, preset, revision }) {
  const common = buildSvgCommon({ asset, width, height, preset, revision, label: inferAssetLabel(asset) });
  const colors = common.kvStyle.colors;
  const bakedText = renderBakedTextMarkup(asset, width, height);
  return svgDataUri(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}">
  <defs>
    <linearGradient id="bannerSky" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${adjustHexColor(colors.skyTop, 8)}" />
      <stop offset="100%" stop-color="${colors.distantCity}" />
    </linearGradient>
  </defs>
  <rect width="${width}" height="${height}" rx="${Math.max(12, height * 0.08)}" fill="url(#bannerSky)" />
  ${renderSkyPortClouds(width, height, colors.cloud)}
  ${renderSkyPortAirships(width, height, colors)}
  <path d="M 0 ${height * 0.78} C ${width * 0.24} ${height * 0.56}, ${width * 0.42} ${height * 0.9}, ${width * 0.64} ${height * 0.66} S ${width * 0.84} ${height * 0.82}, ${width} ${height * 0.6} L ${width} ${height} L 0 ${height} Z" fill="${colors.deckShadow}" opacity="0.48" />
  <rect x="${width * 0.05}" y="${height * 0.08}" width="${width * 0.9}" height="${height * 0.84}" rx="${Math.max(10, height * 0.07)}" fill="none" stroke="${colors.brassLight}" stroke-width="${Math.max(2, height * 0.025)}" opacity="0.5" />
  ${bakedText}
</svg>`);
}

function buildPanelSvg({ asset, width, height, preset, revision }) {
  const common = buildSvgCommon({ asset, width, height, preset, revision, label: "パネル" });
  const inner = adjustHexColor(common.fill, -16);
  const plate = adjustHexColor(common.frame, 6);
  const ornaments = Array.from({ length: common.ornamentLevel }).map((_, index) => {
    const offset = 14 + index * 10;
    return `<circle cx="${offset + 10}" cy="${offset + 10}" r="3" fill="${common.light}" />
<circle cx="${width - offset - 10}" cy="${offset + 10}" r="3" fill="${common.light}" />
<circle cx="${offset + 10}" cy="${height - offset - 10}" r="3" fill="${common.light}" />
<circle cx="${width - offset - 10}" cy="${height - offset - 10}" r="3" fill="${common.light}" />`;
  }).join("");
  const bakedText = renderBakedTextMarkup(asset, width, height);
  const labelMarkup = hasBakedText(asset)
    ? ""
    : `<text x="50%" y="52%" text-anchor="middle" font-family="Georgia, serif" font-size="${Math.round(height * 0.08)}" fill="${common.light}" opacity="0.72">${common.label}</text>`;

  return svgDataUri(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}">
  <rect x="10" y="10" width="${width - 20}" height="${height - 20}" rx="${common.radius}" fill="${plate}" stroke="${common.stroke}" stroke-width="${common.strokeWidth}" />
  <rect x="28" y="28" width="${width - 56}" height="${height - 56}" rx="${Math.max(common.radius - 8, 4)}" fill="${inner}" stroke="${adjustHexColor(common.stroke, 18)}" stroke-width="2" />
  <rect x="44" y="44" width="${width - 88}" height="${height - 88}" rx="${Math.max(common.radius - 12, 4)}" fill="none" stroke="${common.light}" stroke-opacity="0.18" stroke-width="1.5" />
  ${ornaments}
  ${labelMarkup}
  ${bakedText}
</svg>`);
}

function buildSkyPortPanelSvg({ asset, width, height, preset, revision }) {
  const common = buildSvgCommon({ asset, width, height, preset, revision, label: "パネル" });
  const colors = common.kvStyle.colors;
  const bakedText = renderBakedTextMarkup(asset, width, height);

  if (asset.role === "ribbon_tag") {
    return svgDataUri(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}">
  <path d="M 6 5 H ${width - 12} L ${width - 26} ${height / 2} L ${width - 12} ${height - 5} H 6 L 18 ${height / 2} Z" fill="${colors.warningRibbon}" stroke="${colors.brass}" stroke-width="3" />
  <path d="M 18 ${height / 2} H ${width - 30}" stroke="${colors.brassLight}" stroke-width="1.5" opacity="0.45" />
  ${bakedText}
</svg>`);
  }

  const darkRoles = new Set([
    "status_profile_shell",
    "resource_shell",
    "nav_bar_shell",
    "mission_header_strip",
    "title_tab",
    "reward_chip"
  ]);
  const isDark = darkRoles.has(asset.role);
  const fill = isDark ? colors.uiInner : colors.parchment;
  const inner = isDark ? adjustHexColor(colors.uiInner, 14) : colors.parchment;
  const highlight = isDark ? colors.uiBlueLight : colors.parchmentShade;
  const labelMarkup = bakedText || "";
  const inset = Math.max(8, Math.round(Math.min(width, height) * 0.08));
  const ornamentCount = Math.max(2, Math.min(6, common.ornamentLevel + 2));
  const ornaments = Array.from({ length: ornamentCount }).map((_, index) => {
    const x = inset + index * ((width - inset * 2) / Math.max(ornamentCount - 1, 1));
    return `<circle cx="${x.toFixed(1)}" cy="${height - inset * 0.7}" r="${Math.max(1.6, Math.min(width, height) * 0.025)}" fill="${colors.brassLight}" opacity="0.48" />`;
  }).join("");

  return svgDataUri(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}">
  <defs>
    <linearGradient id="panelFill" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${adjustHexColor(fill, isDark ? 8 : 10)}" />
      <stop offset="100%" stop-color="${adjustHexColor(fill, isDark ? -8 : -8)}" />
    </linearGradient>
  </defs>
  <rect x="4" y="4" width="${width - 8}" height="${height - 8}" rx="${common.radius}" fill="${colors.shadow}" opacity="0.42" />
  <rect x="8" y="7" width="${width - 16}" height="${height - 14}" rx="${common.radius}" fill="url(#panelFill)" stroke="${colors.shadow}" stroke-width="${Math.max(2, common.strokeWidth)}" />
  <rect x="${inset}" y="${inset}" width="${width - inset * 2}" height="${height - inset * 2}" rx="${Math.max(4, common.radius - 8)}" fill="${inner}" opacity="${isDark ? 0.64 : 0.58}" stroke="${colors.brass}" stroke-width="${Math.max(1.5, common.strokeWidth - 2)}" />
  <path d="M ${inset * 1.4} ${inset * 1.2} H ${width - inset * 1.4}" stroke="${colors.brassLight}" stroke-width="2" opacity="0.5" />
  <rect x="${inset * 1.2}" y="${inset * 1.35}" width="${width - inset * 2.4}" height="${Math.max(3, height * 0.08)}" rx="${Math.max(2, height * 0.03)}" fill="${highlight}" opacity="${isDark ? 0.22 : 0.28}" />
  ${ornaments}
  ${labelMarkup}
</svg>`);
}

function buildSkyPortButtonSvg({ asset, width, height, preset, revision }) {
  const common = buildSvgCommon({ asset, width, height, preset, revision, label: inferAssetLabel(asset) });
  const colors = common.kvStyle.colors;
  const isPrimary = asset.role === "primary_cta";
  const isActiveNav = asset.role === "nav_button_active";
  const isRound = asset.role === "utility_round_button";
  const fill = isPrimary || isActiveNav || asset.role === "compact_action_button"
    ? colors.uiBlue
    : colors.uiInner;
  const radius = isRound ? Math.min(width, height) / 2 : common.radius;
  const bakedText = renderBakedTextMarkup(asset, width, height);
  const shouldDrawLabel = !hasBakedText(asset)
    && !(asset.textHandling && asset.textHandling.ownership === "runtime_overlay")
    && !isRound;
  const sideOrnaments = isPrimary
    ? `<path d="M 8 ${height / 2} L ${width * 0.18} ${height * 0.18} L ${width * 0.18} ${height * 0.82} Z" fill="${colors.brassLight}" opacity="0.72" />
      <path d="M ${width - 8} ${height / 2} L ${width * 0.82} ${height * 0.18} L ${width * 0.82} ${height * 0.82} Z" fill="${colors.brassLight}" opacity="0.72" />`
    : "";

  return svgDataUri(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}">
  <defs>
    <linearGradient id="skyPortButton" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${adjustHexColor(fill, 18)}" />
      <stop offset="100%" stop-color="${adjustHexColor(fill, -12)}" />
    </linearGradient>
  </defs>
  <rect x="3" y="5" width="${width - 6}" height="${height - 8}" rx="${radius}" fill="${colors.shadow}" opacity="0.5" />
  ${sideOrnaments}
  <rect x="8" y="7" width="${width - 16}" height="${height - 14}" rx="${radius}" fill="${colors.brass}" stroke="${colors.shadow}" stroke-width="${Math.max(2, common.strokeWidth)}" />
  <rect x="18" y="16" width="${width - 36}" height="${height - 32}" rx="${Math.max(4, radius - 8)}" fill="url(#skyPortButton)" />
  <rect x="24" y="19" width="${width - 48}" height="${Math.max(4, (height - 38) * 0.4)}" rx="${Math.max(3, radius - 12)}" fill="${colors.uiBlueLight}" opacity="${isPrimary || isActiveNav ? 0.22 : 0.08}" />
  ${shouldDrawLabel ? `<text x="50%" y="57%" text-anchor="middle" font-family="'Hiragino Mincho ProN', Georgia, serif" font-size="${Math.round(height * (isPrimary ? 0.31 : 0.22))}" font-weight="800" fill="${colors.cloud}" stroke="${colors.shadow}" stroke-width="${isPrimary ? 2 : 1}" paint-order="stroke fill" opacity="${isPrimary ? 0.95 : 0.72}">${common.label}</text>` : ""}
  ${bakedText}
</svg>`);
}

function buildSkyPortCardFrameSvg({ asset, width, height, preset, revision }) {
  const common = buildSvgCommon({ asset, width, height, preset, revision, label: inferAssetLabel(asset) });
  const colors = common.kvStyle.colors;
  const isInfoPanel = asset.role === "info_panel_shell" || asset.role === "mission_panel_shell";
  const isOverlayFrame = asset.role === "event_banner_shell";
  const fill = isOverlayFrame ? "none" : (isInfoPanel ? colors.parchment : colors.uiInner);
  const fillOpacity = isOverlayFrame ? 0 : 0.96;
  const innerStroke = isInfoPanel ? colors.parchmentShade : colors.uiBlueLight;

  return svgDataUri(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}">
  <rect x="4" y="6" width="${width - 8}" height="${height - 10}" rx="${common.radius}" fill="${colors.shadow}" opacity="${isOverlayFrame ? 0.22 : 0.5}" />
  <rect x="8" y="8" width="${width - 16}" height="${height - 16}" rx="${common.radius}" fill="${fill}" fill-opacity="${fillOpacity}" stroke="${colors.shadow}" stroke-width="${Math.max(2, common.strokeWidth)}" />
  <rect x="14" y="14" width="${width - 28}" height="${height - 28}" rx="${Math.max(4, common.radius - 4)}" fill="none" stroke="${colors.brass}" stroke-width="${Math.max(3, common.strokeWidth - 1)}" />
  <rect x="28" y="30" width="${width - 56}" height="${height - 60}" rx="${Math.max(4, common.radius - 10)}" fill="none" stroke="${innerStroke}" stroke-width="2" opacity="0.42" />
  <path d="M 24 24 L 56 24 L 24 56 Z M ${width - 24} 24 L ${width - 56} 24 L ${width - 24} 56 Z M 24 ${height - 24} L 56 ${height - 24} L 24 ${height - 56} Z M ${width - 24} ${height - 24} L ${width - 56} ${height - 24} L ${width - 24} ${height - 56} Z" fill="${colors.brassLight}" opacity="0.62" />
</svg>`);
}

function buildSkyPortIconSvg({ asset, width, height, preset, revision }) {
  const common = buildSvgCommon({ asset, width, height, preset, revision, label: "" });
  const colors = common.kvStyle.colors;
  const size = Math.min(width, height);
  const crystal = asset.role === "resource_icon" || asset.role === "side_cta_icon";
  const badge = asset.role === "notification_badge" || asset.role === "carousel_dot";
  const fill = crystal ? colors.uiBlueLight : colors.brass;
  const inner = crystal ? colors.cloud : colors.uiInner;
  const symbol = asset.assetId.includes("mail")
    ? `<path d="M ${width * 0.28} ${height * 0.38} H ${width * 0.72} V ${height * 0.64} H ${width * 0.28} Z M ${width * 0.28} ${height * 0.38} L ${width * 0.5} ${height * 0.54} L ${width * 0.72} ${height * 0.38}" fill="none" stroke="${inner}" stroke-width="${Math.max(2, size * 0.06)}" />`
    : `<path d="M ${width * 0.5} ${height * 0.24} L ${width * 0.66} ${height * 0.5} L ${width * 0.5} ${height * 0.76} L ${width * 0.34} ${height * 0.5} Z" fill="${inner}" opacity="0.9" />`;

  return svgDataUri(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}">
  <circle cx="${width / 2}" cy="${height / 2}" r="${size * 0.46}" fill="${badge ? colors.warningRibbon : colors.shadow}" opacity="${badge ? 0.96 : 0.46}" />
  <circle cx="${width / 2}" cy="${height / 2}" r="${size * 0.39}" fill="${fill}" stroke="${colors.shadow}" stroke-width="${Math.max(2, size * 0.055)}" />
  <circle cx="${width / 2}" cy="${height / 2}" r="${size * 0.27}" fill="${crystal ? colors.uiBlue : colors.brassLight}" opacity="0.82" />
  ${symbol}
  <circle cx="${width * 0.34}" cy="${height * 0.3}" r="${Math.max(2, size * 0.05)}" fill="${colors.cloud}" opacity="0.78" />
</svg>`);
}

function buildProgressTrackSvg({ asset, width, height, preset, revision }) {
  const common = buildSvgCommon({ asset, width, height, preset, revision, label: "" });
  const outerX = 4;
  const outerY = Math.max(4, Math.round(height * 0.12));
  const outerHeight = Math.max(height - outerY * 2, 10);
  const innerInset = Math.max(3, Math.round(height * 0.12));
  const innerX = outerX + innerInset;
  const innerY = outerY + innerInset;
  const innerWidth = Math.max(width - innerX * 2, 8);
  const innerHeight = Math.max(height - innerY * 2, 4);
  const shineHeight = Math.max(Math.round(innerHeight * 0.45), 3);
  const accentGlow = adjustHexColor(common.frame, 20);
  const tickCount = clamp(common.ornamentLevel + common.emphasis, 0, 5);
  const ticks = Array.from({ length: tickCount }).map((_, index) => {
    const x = innerX + ((index + 1) * innerWidth) / (tickCount + 1);
    return `<rect x="${x.toFixed(2)}" y="${innerY + 2}" width="1.5" height="${Math.max(innerHeight - 4, 2)}" fill="${common.light}" opacity="0.34" />`;
  }).join("");
  return svgDataUri(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}">
  <defs>
    <linearGradient id="trackShell" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${adjustHexColor(common.frame, 14)}" />
      <stop offset="100%" stop-color="${common.frame}" />
    </linearGradient>
    <linearGradient id="trackInner" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="${adjustHexColor(common.fill, -20)}" />
      <stop offset="100%" stop-color="${adjustHexColor(common.fill, -6)}" />
    </linearGradient>
  </defs>
  <rect x="${outerX}" y="${outerY}" width="${width - outerX * 2}" height="${outerHeight}" rx="${Math.max(outerHeight / 2, 6)}" fill="url(#trackShell)" stroke="${common.stroke}" stroke-width="${Math.max(common.strokeWidth - 1, 2)}" />
  <rect x="${innerX}" y="${innerY}" width="${innerWidth}" height="${innerHeight}" rx="${Math.max(innerHeight / 2, 3)}" fill="url(#trackInner)" />
  <rect x="${innerX + 2}" y="${innerY + 2}" width="${Math.max(innerWidth - 4, 4)}" height="${shineHeight}" rx="${Math.max(shineHeight / 2, 2)}" fill="${common.light}" opacity="${(0.08 + common.emphasis * 0.05).toFixed(2)}" />
  <rect x="${outerX}" y="${outerY}" width="${width - outerX * 2}" height="${outerHeight}" rx="${Math.max(outerHeight / 2, 6)}" fill="none" stroke="${accentGlow}" stroke-opacity="${(0.14 + common.directives.readabilityBoost * 0.08).toFixed(2)}" stroke-width="1.5" />
  ${ticks}
</svg>`);
}

function buildProgressFillSvg({ asset, width, height, preset, revision }) {
  const common = buildSvgCommon({ asset, width, height, preset, revision, label: "" });
  const outerY = Math.max(2, Math.round(height * 0.08));
  const outerHeight = Math.max(height - outerY * 2, 6);
  const glow = adjustHexColor(common.accent, 28);
  return svgDataUri(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}">
  <defs>
    <linearGradient id="fillBar" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="${adjustHexColor(common.fill, 18)}" />
      <stop offset="55%" stop-color="${common.fill}" />
      <stop offset="100%" stop-color="${adjustHexColor(common.fill, -10)}" />
    </linearGradient>
  </defs>
  <rect x="0" y="${outerY}" width="${width}" height="${outerHeight}" rx="${Math.max(outerHeight / 2, 3)}" fill="${glow}" opacity="${(0.18 + common.emphasis * 0.08).toFixed(2)}" />
  <rect x="1" y="${outerY + 1}" width="${Math.max(width - 2, 2)}" height="${Math.max(outerHeight - 2, 2)}" rx="${Math.max((outerHeight - 2) / 2, 2)}" fill="url(#fillBar)" stroke="${common.stroke}" stroke-width="1.5" />
  <rect x="4" y="${outerY + 2}" width="${Math.max(width - 12, 4)}" height="${Math.max((outerHeight - 2) * 0.38, 2)}" rx="2" fill="${common.light}" opacity="${(0.2 + common.directives.readabilityBoost * 0.1).toFixed(2)}" />
</svg>`);
}

function buildButtonSvg({ asset, width, height, preset, revision }) {
  const common = buildSvgCommon({ asset, width, height, preset, revision, label: inferAssetLabel(asset) });
  const glow = adjustHexColor(common.accent, 10);
  const inner = adjustHexColor(common.fill, 14 + common.directives.readabilityBoost * 4);
  const haloOpacity = 0.08 + common.emphasis * 0.07;
  return svgDataUri(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}">
  <defs>
    <linearGradient id="buttonFill" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${inner}" />
      <stop offset="100%" stop-color="${common.fill}" />
    </linearGradient>
  </defs>
  <rect x="8" y="8" width="${width - 16}" height="${height - 16}" rx="${common.radius}" fill="${glow}" opacity="${haloOpacity.toFixed(2)}" />
  <rect x="14" y="14" width="${width - 28}" height="${height - 28}" rx="${common.radius}" fill="${common.frame}" stroke="${common.stroke}" stroke-width="${common.strokeWidth}" />
  <rect x="24" y="24" width="${width - 48}" height="${height - 48}" rx="${Math.max(common.radius - 8, 4)}" fill="url(#buttonFill)" />
  <rect x="28" y="26" width="${width - 56}" height="${(height - 52) / 2}" rx="${Math.max(common.radius - 12, 4)}" fill="${common.light}" opacity="0.10" />
  <text x="50%" y="56%" text-anchor="middle" font-family="'Courier New', monospace" font-size="${Math.round(height * 0.24)}" font-weight="700" fill="${common.light}">${common.label}</text>
</svg>`);
}

function buildIconSvg({ asset, width, height, preset, revision }) {
  const common = buildSvgCommon({ asset, width, height, preset, revision, label: "R" });
  const ring = adjustHexColor(common.frame, 10);
  const center = adjustHexColor(common.fill, 10);
  const sparkleCount = clamp(3 + common.ornamentLevel, 2, 8);
  const sparkles = Array.from({ length: sparkleCount }).map((_, index) => {
    const angle = (Math.PI * 2 * index) / sparkleCount;
    const cx = width / 2 + Math.cos(angle) * (width * 0.33);
    const cy = height / 2 + Math.sin(angle) * (height * 0.33);
    return `<circle cx="${cx.toFixed(2)}" cy="${cy.toFixed(2)}" r="3" fill="${common.light}" opacity="0.75" />`;
  }).join("");

  return svgDataUri(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}">
  <circle cx="${width / 2}" cy="${height / 2}" r="${Math.min(width, height) * 0.44}" fill="${ring}" stroke="${common.stroke}" stroke-width="${common.strokeWidth}" />
  <circle cx="${width / 2}" cy="${height / 2}" r="${Math.min(width, height) * 0.33}" fill="${center}" />
  ${sparkles}
  <path d="M ${width * 0.36} ${height * 0.62} L ${width * 0.5} ${height * 0.3} L ${width * 0.66} ${height * 0.62} Z" fill="${common.light}" opacity="0.78" />
</svg>`);
}

function buildCardFrameSvg({ asset, width, height, preset, revision }) {
  const common = buildSvgCommon({ asset, width, height, preset, revision, label: inferAssetLabel(asset) });
  const outer = adjustHexColor(common.frame, 4);
  const inner = adjustHexColor(common.fill, -8);
  const ornaments = common.ornamentLevel > 0
    ? `
      <path d="M 30 30 L 58 30 L 30 58 Z" fill="${common.light}" opacity="0.55" />
      <path d="M ${width - 30} 30 L ${width - 58} 30 L ${width - 30} 58 Z" fill="${common.light}" opacity="0.55" />
      <path d="M 30 ${height - 30} L 58 ${height - 30} L 30 ${height - 58} Z" fill="${common.light}" opacity="0.55" />
      <path d="M ${width - 30} ${height - 30} L ${width - 58} ${height - 30} L ${width - 30} ${height - 58} Z" fill="${common.light}" opacity="0.55" />`
    : "";
  return svgDataUri(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}">
  <rect x="8" y="8" width="${width - 16}" height="${height - 16}" rx="${common.radius}" fill="${outer}" stroke="${common.stroke}" stroke-width="${common.strokeWidth}" />
  <rect x="24" y="24" width="${width - 48}" height="${height - 48}" rx="${Math.max(common.radius - 8, 4)}" fill="${inner}" />
  <rect x="40" y="48" width="${width - 80}" height="${height - 96}" rx="${Math.max(common.radius - 14, 2)}" fill="none" stroke="${common.light}" stroke-opacity="0.22" stroke-width="2" />
  ${ornaments}
  <text x="50%" y="54%" text-anchor="middle" font-family="Georgia, serif" font-size="${Math.round(height * 0.10)}" fill="${common.light}" opacity="0.65">枠</text>
</svg>`);
}

function buildLogoSvg({ asset, width, height, preset, revision }) {
  const common = buildSvgCommon({ asset, width, height, preset, revision, label: inferAssetLabel(asset) });
  const glow = adjustHexColor(common.accent, 18);
  const lowerLabel = asset.subLabel || "月夜の配達人";
  return svgDataUri(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}">
  <defs>
    <linearGradient id="logoFill" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${common.light}" />
      <stop offset="100%" stop-color="${adjustHexColor(common.frame, 12)}" />
    </linearGradient>
  </defs>
  <ellipse cx="${width / 2}" cy="${height * 0.42}" rx="${width * 0.4}" ry="${height * 0.28}" fill="${glow}" opacity="${(0.12 + common.emphasis * 0.05).toFixed(2)}" />
  <path d="M ${width * 0.18} ${height * 0.24} C ${width * 0.24} ${height * 0.08}, ${width * 0.35} ${height * 0.08}, ${width * 0.41} ${height * 0.24} C ${width * 0.36} ${height * 0.34}, ${width * 0.24} ${height * 0.34}, ${width * 0.18} ${height * 0.24} Z" fill="${common.frame}" opacity="0.82" />
  <path d="M ${width * 0.59} ${height * 0.24} C ${width * 0.65} ${height * 0.08}, ${width * 0.76} ${height * 0.08}, ${width * 0.82} ${height * 0.24} C ${width * 0.76} ${height * 0.34}, ${width * 0.64} ${height * 0.34}, ${width * 0.59} ${height * 0.24} Z" fill="${common.frame}" opacity="0.82" />
  <text x="50%" y="46%" text-anchor="middle" font-family="Georgia, serif" font-size="${Math.round(height * 0.34)}" font-weight="700" fill="url(#logoFill)" letter-spacing="3">${common.label}</text>
  <text x="50%" y="72%" text-anchor="middle" font-family="'Courier New', monospace" font-size="${Math.round(height * 0.14)}" fill="${common.light}" opacity="0.86" letter-spacing="7">${lowerLabel}</text>
</svg>`);
}

function buildGenericSvg({ asset, width, height, preset, revision }) {
  const common = buildSvgCommon({
    asset,
    width,
    height,
    preset,
    revision,
    label: inferAssetLabel(asset)
  });

  return svgDataUri(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}">
  <rect x="8" y="8" width="${width - 16}" height="${height - 16}" rx="${common.radius}" fill="${common.fill}" stroke="${common.stroke}" stroke-width="${common.strokeWidth}" />
  <text x="50%" y="54%" text-anchor="middle" font-family="'Courier New', monospace" font-size="${Math.round(Math.min(width, height) * 0.12)}" fill="${common.light}">${common.label}</text>
</svg>`);
}

function renderAssetPreview(asset, placement, preset, revision) {
  const width = Math.max(placement ? placement.width : 256, 48);
  const height = Math.max(placement ? placement.height : 128, 48);
  const imagegenPreviewSrc = getImagegenPreviewSrc(revision);
  if (imagegenPreviewSrc) {
    return imagegenPreviewSrc;
  }

  const placeholderMode = isPlaceholderRevision(revision);
  const placeholderBuilderMap = {
    background: buildPlaceholderBackdropSvg,
    panel: buildPlaceholderPanelSvg,
    button: buildPlaceholderButtonSvg,
    icon: buildPlaceholderIconSvg,
    card_frame: buildPlaceholderCardFrameSvg,
    logo: buildPlaceholderLogoSvg
  };
  const builderMap = {
    background: buildBackdropSvg,
    panel: buildPanelSvg,
    button: buildButtonSvg,
    icon: buildIconSvg,
    card_frame: buildCardFrameSvg,
    logo: buildLogoSvg
  };
  if (!placeholderMode && getKvStyleProfile(preset)) {
    if (asset.assetType === "background" && asset.role === "event_banner_art") {
      return buildSkyPortEventBannerArtSvg({ asset, width, height, preset, revision });
    }
    if (asset.assetType === "background") {
      return buildSkyPortBackdropSvg({ asset, width, height, preset, revision });
    }
    if (asset.assetType === "panel" && asset.role !== "progress_track" && asset.role !== "progress_fill") {
      return buildSkyPortPanelSvg({ asset, width, height, preset, revision });
    }
    if (asset.assetType === "button") {
      return buildSkyPortButtonSvg({ asset, width, height, preset, revision });
    }
    if (asset.assetType === "card_frame") {
      return buildSkyPortCardFrameSvg({ asset, width, height, preset, revision });
    }
    if (asset.assetType === "icon") {
      return buildSkyPortIconSvg({ asset, width, height, preset, revision });
    }
  }
  if (!placeholderMode && asset.role === "progress_track") {
    return buildProgressTrackSvg({ asset, width, height, preset, revision });
  }
  if (!placeholderMode && asset.role === "progress_fill") {
    return buildProgressFillSvg({ asset, width, height, preset, revision });
  }
  const builder = placeholderMode
    ? (placeholderBuilderMap[asset.assetType] || buildPlaceholderGenericSvg)
    : (builderMap[asset.assetType] || buildGenericSvg);
  return builder({ asset, width, height, preset, revision });
}

function getPlacementBox(placement) {
  return {
    left: placement.x - placement.width / 2,
    top: placement.y - placement.height / 2,
    width: placement.width,
    height: placement.height
  };
}

function resolveOverlayBox(overlay, placementById) {
  const fallbackWidth = Math.max(overlay.width || 1, 1);
  const fallbackHeight = Math.max(overlay.height || 1, 1);
  const fallback = {
    left: Math.round((overlay.x || 0) - fallbackWidth / 2),
    top: Math.round((overlay.y || 0) - fallbackHeight / 2),
    width: fallbackWidth,
    height: fallbackHeight,
    targetPlacementId: "",
    slot: null
  };

  if (!overlay.targetPlacementId || !overlay.slot || !placementById[overlay.targetPlacementId]) {
    return fallback;
  }

  const target = placementById[overlay.targetPlacementId];
  const targetBox = getPlacementBox(target);
  const slot = overlay.slot;
  const width = Math.max(slot.width || overlay.width || 1, 1);
  const height = Math.max(slot.height || overlay.height || 1, 1);
  const offsetX = slot.offsetX || 0;
  const offsetY = slot.offsetY || 0;
  const left = slot.x !== undefined
    ? targetBox.left + slot.x + offsetX
    : slot.right !== undefined
      ? targetBox.left + targetBox.width - slot.right - width + offsetX
      : targetBox.left + (targetBox.width - width) / 2 + offsetX;
  const top = slot.y !== undefined
    ? targetBox.top + slot.y + offsetY
    : slot.bottom !== undefined
      ? targetBox.top + targetBox.height - slot.bottom - height + offsetY
      : targetBox.top + (targetBox.height - height) / 2 + offsetY;

  return {
    left: Math.round(left),
    top: Math.round(top),
    width,
    height,
    targetPlacementId: overlay.targetPlacementId,
    slot: cloneValue(slot)
  };
}

function generateRenderModel(input) {
  const placementByAssetId = {};
  const placementById = {};
  for (const placement of input.materialSpecSheet.placements) {
    placementById[placement.placementId] = placement;
    if (!placementByAssetId[placement.assetId]) {
      placementByAssetId[placement.assetId] = [];
    }
    placementByAssetId[placement.assetId].push(placement);
  }

  const assetsById = buildLookup(input.materialSpecSheet.assets, "assetId");
  const assets = input.materialSpecSheet.assets.map((asset) => {
    const placements = placementByAssetId[asset.assetId] || [];
    const primaryPlacement = placements[0] || null;
    const revision = getAssetRevision(input.revisionMap, asset.assetId);
    const previewSrc = renderAssetPreview(asset, primaryPlacement, input.worldPreset, revision);
    return {
      assetId: asset.assetId,
      assetType: asset.assetType,
      role: asset.role,
      purpose: asset.purpose,
      generationPlan: normalizeDisplayGenerationPlan(asset.generationPlan),
      generationMeta: revision.generationMeta || null,
      textHandling: asset.textHandling || null,
      visualPriority: asset.visualPriority,
      locked: revision.locked,
      revisionCount: revision.revisionCount,
      latestComment: revision.comments[revision.comments.length - 1] || "",
      normalizedComment: revision.normalizedComments[revision.normalizedComments.length - 1] || "",
      directives: revision.directives,
      history: getHistoryEntries({
        asset,
        placement: primaryPlacement,
        preset: input.worldPreset,
        revision
      }),
      placementRefs: placements.map((placement) => placement.placementId),
      previewSrc
    };
  });

  const layers = input.materialSpecSheet.placements
    .map((placement) => {
      const asset = assetsById[placement.assetId];
      const revision = getAssetRevision(input.revisionMap, placement.assetId);
      const left = Math.round(placement.x - placement.width / 2);
      const top = Math.round(placement.y - placement.height / 2);
      return {
        placementId: placement.placementId,
        assetId: placement.assetId,
        role: asset.role,
        src: renderAssetPreview(asset, placement, input.worldPreset, revision),
        width: placement.width,
        height: placement.height,
        left,
        top,
        zIndex: placement.zIndex,
        visibleStates: placement.stateVisibility || {}
      };
    })
    .concat((input.materialSpecSheet.contentOverlays || []).map((overlay) => {
      const box = resolveOverlayBox(overlay, placementById);
      const resolvedOverlay = {
        ...overlay,
        width: box.width,
        height: box.height
      };
      return {
        placementId: overlay.overlayId,
        assetId: overlay.overlayId,
        role: overlay.kind,
        src: renderOverlaySvg(resolvedOverlay, input.worldPreset),
        width: box.width,
        height: box.height,
        left: box.left,
        top: box.top,
        zIndex: overlay.zIndex,
        targetPlacementId: box.targetPlacementId,
        slot: box.slot,
        visibleStates: overlay.stateVisibility || {}
      };
    }))
    .sort((left, right) => left.zIndex - right.zIndex);
  const compositionReview = buildCompositionReview(input);

  return {
    screen: {
      screenId: input.screenKv.screenId,
      screenName: input.screenKv.screenName,
      width: input.screenKv.canvasWidth,
      height: input.screenKv.canvasHeight,
      safeAreas: input.screenKv.safeAreas || {},
      layers
    },
    assets,
    compositionGroups: compositionReview.groups,
    compositionQuality: compositionReview.summary
  };
}

module.exports = {
  generateRenderModel
};
