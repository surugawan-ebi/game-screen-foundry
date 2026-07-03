"use strict";

// Structure preview: renders every placement as a flat colored rectangle
// whose lightness increases with its stacking depth (deeper in the pile =
// darker, topmost = lightest), while runtime text overlays stay real text.
// This makes layering, padding, and slot problems visible before any image
// generation happens.

const STRUCTURE_HUE = 212;
const STRUCTURE_SATURATION = 42;
const LIGHTNESS_FLOOR = 24;
const LIGHTNESS_CEILING = 88;

function escapeXml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function getBox(placement) {
  return {
    left: placement.x - placement.width / 2,
    top: placement.y - placement.height / 2,
    right: placement.x + placement.width / 2,
    bottom: placement.y + placement.height / 2
  };
}

function boxesOverlap(a, b) {
  return Math.min(a.right, b.right) > Math.max(a.left, b.left)
    && Math.min(a.bottom, b.bottom) > Math.max(a.top, b.top);
}

// Stacking depth: 0 for the lowest layer; each placement sits one level above
// the deepest lower-z placement it overlaps. This is the visual pile height
// at that spot, not just the zIndex order.
function computeStackDepths(placements) {
  const sorted = [...placements].sort((left, right) => left.zIndex - right.zIndex
    || String(left.placementId).localeCompare(String(right.placementId)));
  const depths = new Map();
  const boxes = sorted.map((placement) => ({ placement, box: getBox(placement) }));
  for (let i = 0; i < boxes.length; i += 1) {
    let depth = 0;
    for (let j = 0; j < i; j += 1) {
      if (boxes[j].placement.zIndex < boxes[i].placement.zIndex
        && boxesOverlap(boxes[i].box, boxes[j].box)) {
        depth = Math.max(depth, depths.get(boxes[j].placement.placementId) + 1);
      }
    }
    depths.set(boxes[i].placement.placementId, depth);
  }
  return depths;
}

function normalizeInset(value, fallback = 0) {
  if (value === undefined || value === null) {
    return { top: fallback, right: fallback, bottom: fallback, left: fallback };
  }
  if (typeof value === "number") {
    return { top: value, right: value, bottom: value, left: value };
  }
  return {
    top: Number(value.top || 0),
    right: Number(value.right || 0),
    bottom: Number(value.bottom || 0),
    left: Number(value.left || 0)
  };
}

function mergeInsetMax(current, next) {
  if (!current) {
    return next;
  }
  return {
    top: Math.max(current.top, next.top),
    right: Math.max(current.right, next.right),
    bottom: Math.max(current.bottom, next.bottom),
    left: Math.max(current.left, next.left)
  };
}

// Placements that are composition-group roots with declared insets. Two
// distinct concepts: `frameInset` is the painted decorative frame band
// (hatched); `contentInset` is the safe area for child content (dashed box).
// The bands between them may host other functional children (headers,
// footers) and are neither hatched nor dashed. Without a frameInset the
// contentInset band is treated as decoration (legacy behavior).
function computeContentInsets(materialSpec) {
  const groups = Array.isArray(materialSpec.compositionGroups) ? materialSpec.compositionGroups : [];
  const insets = new Map();
  for (const group of groups) {
    if (!group.rootPlacementId) {
      continue;
    }
    const hasContent = group.contentInset !== undefined || group.minChildInset !== undefined;
    const hasFrame = group.frameInset !== undefined;
    if (!hasContent && !hasFrame) {
      continue;
    }
    const contentInset = normalizeInset(group.contentInset, 0);
    const minChildInset = normalizeInset(group.minChildInset, 0);
    const effectiveContent = hasContent ? mergeInsetMax(contentInset, minChildInset) : null;
    const current = insets.get(group.rootPlacementId) || { content: null, frame: null };
    insets.set(group.rootPlacementId, {
      content: effectiveContent ? mergeInsetMax(current.content, effectiveContent) : current.content,
      frame: hasFrame ? mergeInsetMax(current.frame, normalizeInset(group.frameInset, 0)) : current.frame
    });
  }
  return insets;
}

function hatchPatternDefs(id) {
  return `<defs><pattern id="${id}" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="6" stroke="rgba(255,255,255,0.38)" stroke-width="1.6"/></pattern></defs>`;
}

// Even-odd path covering the decorative frame band (outer rect minus the
// content box) so it can be filled with the hatch pattern.
function frameBandPath(width, height, inset) {
  const innerLeft = Math.min(inset.left, width);
  const innerTop = Math.min(inset.top, height);
  const innerRight = Math.max(width - inset.right, innerLeft);
  const innerBottom = Math.max(height - inset.bottom, innerTop);
  return `M0,0 H${width} V${height} H0 Z M${innerLeft},${innerTop} H${innerRight} V${innerBottom} H${innerLeft} Z`;
}

function contentBoxRect(width, height, inset) {
  return {
    x: Math.min(inset.left, width),
    y: Math.min(inset.top, height),
    width: Math.max(width - inset.left - inset.right, 0),
    height: Math.max(height - inset.top - inset.bottom, 0)
  };
}

function lightnessForDepth(depth, maxDepth) {
  const range = LIGHTNESS_CEILING - LIGHTNESS_FLOOR;
  const steps = Math.max(maxDepth, 1);
  return Math.round(LIGHTNESS_FLOOR + Math.min(depth, steps) / steps * range);
}

function structureFill(depth, maxDepth) {
  return `hsl(${STRUCTURE_HUE}, ${STRUCTURE_SATURATION}%, ${lightnessForDepth(depth, maxDepth)}%)`;
}

function labelColor(depth, maxDepth) {
  return lightnessForDepth(depth, maxDepth) >= 60 ? "#22303f" : "#dbe6f2";
}

function buildStructureLayerSvg({ placement, depth, maxDepth, contentInset = null, frameInset = null }) {
  const width = Math.max(1, Math.round(placement.width));
  const height = Math.max(1, Math.round(placement.height));
  const fill = structureFill(depth, maxDepth);
  const text = labelColor(depth, maxDepth);
  const fontSize = Math.max(8, Math.min(11, Math.floor(height / 3)));
  const patternId = `frame_hatch_${String(placement.placementId).replace(/[^a-zA-Z0-9_-]/gu, "_")}`;
  // Hatch marks the painted decorative frame; without an explicit frameInset
  // the whole contentInset band is treated as decoration (legacy behavior).
  const hatchInset = frameInset || contentInset;
  const parts = [];
  if (hatchInset) {
    parts.push(hatchPatternDefs(patternId));
    parts.push(`<path d="${frameBandPath(width, height, hatchInset)}" fill-rule="evenodd" fill="url(#${patternId})"/>`);
  }
  if (contentInset) {
    const box = contentBoxRect(width, height, contentInset);
    parts.push(`<rect x="${box.x + 0.5}" y="${box.y + 0.5}" width="${Math.max(box.width - 1, 0)}" height="${Math.max(box.height - 1, 0)}" fill="none" stroke="rgba(255,220,130,0.9)" stroke-width="1" stroke-dasharray="4 3"/>`);
  }
  const frameBand = parts.join("");
  const labelInset = hatchInset;
  const labelY = labelInset ? Math.min(labelInset.top, height - fontSize) + fontSize + 3 : fontSize + 3;
  const label = height >= 14 && width >= 40
    ? `<text x="${labelInset ? labelInset.left + 4 : 4}" y="${labelY}" font-family="Menlo, monospace" font-size="${fontSize}" fill="${text}" opacity="0.85">${escapeXml(placement.placementId)}</text>`
    : "";
  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
    `<rect x="0.5" y="0.5" width="${width - 1}" height="${height - 1}" fill="${fill}" stroke="rgba(255,255,255,0.55)" stroke-width="1"/>`,
    frameBand,
    label,
    "</svg>"
  ].join("");
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

// Mirrors the preview renderer's font resolution and the layout checker's
// CJK-aware width estimation so the structure view shows exactly what the
// text-fit check will judge.
function resolveTextMetrics(overlay, slotWidth, slotHeight) {
  const { estimateLineWidth } = require("./layout-quality");
  const sampleText = String(overlay.sampleText || overlay.text || "");
  const fontSize = Number(overlay.fontSize) || Math.max(12, Math.round(slotHeight * 0.46));
  const letterSpacing = Number(overlay.letterSpacing) || 0;
  const paddingX = Number(overlay.paddingLeft || 0) + Number(overlay.paddingRight || 0);
  const lines = sampleText.split("\n");
  const maxLineWidth = sampleText
    ? Math.max(...lines.map((line) => estimateLineWidth(line, fontSize, letterSpacing)))
    : 0;
  const availableWidth = Math.max(slotWidth - paddingX, 1);
  return {
    sampleText,
    fontSize,
    lines,
    maxLineWidth,
    availableWidth,
    overflow: maxLineWidth > availableWidth + 0.5
  };
}

// Structure rendering for a runtime text overlay: the declared text region as
// a dashed box (red + tinted when the sample text overflows it) with the
// sample text inside.
function buildStructureOverlaySvg({ overlay, width, height }) {
  const slotWidth = Math.max(1, Math.round(width));
  const slotHeight = Math.max(1, Math.round(height));
  const metrics = resolveTextMetrics(overlay, slotWidth, slotHeight);
  const borderColor = metrics.overflow ? "rgba(255,92,92,0.95)" : "rgba(255,210,120,0.85)";
  const fillRect = metrics.overflow
    ? `<rect x="0" y="0" width="${slotWidth}" height="${slotHeight}" fill="rgba(255,92,92,0.18)"/>`
    : "";
  const textColor = metrics.overflow ? "#ff8d8d" : "#ffe2a8";
  const align = overlay.align === "left" ? "start" : overlay.align === "right" ? "end" : "middle";
  const anchorX = align === "start" ? 2 : align === "end" ? slotWidth - 2 : slotWidth / 2;
  const lineHeight = Number(overlay.lineHeight) || Math.round(metrics.fontSize * 1.12);
  const totalHeight = metrics.lines.length === 1 ? metrics.fontSize : metrics.lines.length * lineHeight;
  const firstBaseline = (slotHeight - totalHeight) / 2 + metrics.fontSize * 0.85;
  const texts = metrics.lines.map((line, index) => `<text x="${anchorX}" y="${firstBaseline + index * lineHeight}" text-anchor="${align}" font-family="'Hiragino Sans', sans-serif" font-size="${metrics.fontSize}" fill="${textColor}">${escapeXml(line)}</text>`).join("");
  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${slotWidth}" height="${slotHeight}" viewBox="0 0 ${slotWidth} ${slotHeight}">`,
    fillRect,
    `<rect x="0.5" y="0.5" width="${slotWidth - 1}" height="${slotHeight - 1}" fill="none" stroke="${borderColor}" stroke-width="1" stroke-dasharray="4 3"/>`,
    texts,
    "</svg>"
  ].join("");
  return {
    src: `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`,
    overflow: metrics.overflow,
    estimatedTextWidth: Math.round(metrics.maxLineWidth),
    availableWidth: Math.round(metrics.availableWidth)
  };
}

function buildStructurePreview(input) {
  const placements = Array.isArray(input.materialSpecSheet.placements)
    ? input.materialSpecSheet.placements
    : [];
  const depthByPlacement = computeStackDepths(placements);
  const maxDepth = Math.max(0, ...depthByPlacement.values());
  return {
    depthByPlacement,
    maxDepth,
    contentInsetByPlacement: computeContentInsets(input.materialSpecSheet)
  };
}

// Standalone composite SVG of the whole screen for CLI/report use: colored
// rectangles per placement plus real text for runtime overlays.
function buildStructureCompositeSvg(input, options = {}) {
  const screenKv = input.screenKv || {};
  const width = Number(screenKv.canvasWidth || 0);
  const height = Number(screenKv.canvasHeight || 0);
  const placements = Array.isArray(input.materialSpecSheet.placements)
    ? input.materialSpecSheet.placements
    : [];
  const overlays = Array.isArray(input.materialSpecSheet.contentOverlays)
    ? input.materialSpecSheet.contentOverlays
    : [];
  const placementById = new Map(placements.map((placement) => [placement.placementId, placement]));
  const depthByPlacement = computeStackDepths(placements);
  const maxDepth = Math.max(0, ...depthByPlacement.values());
  const contentInsetByPlacement = computeContentInsets(input.materialSpecSheet);
  const parts = [];

  parts.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`);
  parts.push(hatchPatternDefs("frame_hatch"));
  parts.push(`<rect x="0" y="0" width="${width}" height="${height}" fill="#141a21"/>`);

  const sortedPlacements = [...placements].sort((left, right) => left.zIndex - right.zIndex);
  for (const placement of sortedPlacements) {
    const depth = depthByPlacement.get(placement.placementId) || 0;
    const box = getBox(placement);
    const fill = structureFill(depth, maxDepth);
    parts.push(`<rect x="${box.left + 0.5}" y="${box.top + 0.5}" width="${Math.max(1, placement.width - 1)}" height="${Math.max(1, placement.height - 1)}" fill="${fill}" stroke="rgba(255,255,255,0.55)" stroke-width="1"/>`);
    const insets = contentInsetByPlacement.get(placement.placementId);
    let labelOffsetX = 0;
    let labelOffsetY = 0;
    if (insets) {
      const hatchInset = insets.frame || insets.content;
      if (hatchInset) {
        parts.push(`<path d="${frameBandPath(placement.width, placement.height, hatchInset)}" fill-rule="evenodd" fill="url(#frame_hatch)" transform="translate(${box.left},${box.top})"/>`);
        labelOffsetX = hatchInset.left;
        labelOffsetY = hatchInset.top;
      }
      if (insets.content) {
        const inner = contentBoxRect(placement.width, placement.height, insets.content);
        parts.push(`<rect x="${box.left + inner.x + 0.5}" y="${box.top + inner.y + 0.5}" width="${Math.max(inner.width - 1, 0)}" height="${Math.max(inner.height - 1, 0)}" fill="none" stroke="rgba(255,220,130,0.9)" stroke-width="1" stroke-dasharray="4 3"/>`);
      }
    }
    if (placement.height >= 14 && placement.width >= 40 && options.labels !== false) {
      const fontSize = Math.max(8, Math.min(11, Math.floor(placement.height / 3)));
      parts.push(`<text x="${box.left + labelOffsetX + 4}" y="${box.top + labelOffsetY + fontSize + 3}" font-family="Menlo, monospace" font-size="${fontSize}" fill="${labelColor(depth, maxDepth)}" opacity="0.85">${escapeXml(placement.placementId)}</text>`);
    }
  }

  const sortedOverlays = [...overlays].sort((left, right) => (left.zIndex || 0) - (right.zIndex || 0));
  for (const overlay of sortedOverlays) {
    const target = overlay.targetPlacementId ? placementById.get(overlay.targetPlacementId) : null;
    let left;
    let top;
    let slotWidth = Math.max(overlay.width || 1, 1);
    let slotHeight = Math.max(overlay.height || 1, 1);
    if (target && overlay.slot) {
      const targetBox = getBox(target);
      slotWidth = Math.max(overlay.slot.width || slotWidth, 1);
      slotHeight = Math.max(overlay.slot.height || slotHeight, 1);
      left = overlay.slot.x !== undefined
        ? targetBox.left + overlay.slot.x
        : overlay.slot.right !== undefined
          ? targetBox.right - overlay.slot.right - slotWidth
          : targetBox.left + (target.width - slotWidth) / 2;
      top = overlay.slot.y !== undefined
        ? targetBox.top + overlay.slot.y
        : overlay.slot.bottom !== undefined
          ? targetBox.bottom - overlay.slot.bottom - slotHeight
          : targetBox.top + (target.height - slotHeight) / 2;
    } else {
      left = (overlay.x || 0) - slotWidth / 2;
      top = (overlay.y || 0) - slotHeight / 2;
    }
    const metrics = resolveTextMetrics(overlay, slotWidth, slotHeight);
    const borderColor = metrics.overflow ? "rgba(255,92,92,0.95)" : "rgba(255,196,90,0.8)";
    const textColor = metrics.overflow ? "#ff8d8d" : "#ffd88a";
    if (metrics.overflow) {
      parts.push(`<rect x="${left}" y="${top}" width="${slotWidth}" height="${slotHeight}" fill="rgba(255,92,92,0.18)"/>`);
    }
    parts.push(`<rect x="${left}" y="${top}" width="${slotWidth}" height="${slotHeight}" fill="none" stroke="${borderColor}" stroke-width="1" stroke-dasharray="3 2"/>`);
    const align = overlay.align === "left" ? "start" : overlay.align === "right" ? "end" : "middle";
    const anchorX = align === "start" ? left + 2 : align === "end" ? left + slotWidth - 2 : left + slotWidth / 2;
    const lines = metrics.sampleText ? metrics.lines : [String(overlay.overlayId || "")];
    const lineHeight = Number(overlay.lineHeight) || Math.round(metrics.fontSize * 1.12);
    const totalHeight = lines.length === 1 ? metrics.fontSize : lines.length * lineHeight;
    const firstBaseline = top + (slotHeight - totalHeight) / 2 + metrics.fontSize * 0.85;
    lines.forEach((line, index) => {
      parts.push(`<text x="${anchorX}" y="${firstBaseline + index * lineHeight}" text-anchor="${align}" font-family="'Hiragino Sans', sans-serif" font-size="${metrics.fontSize}" fill="${textColor}">${escapeXml(line)}</text>`);
    });
  }

  parts.push("</svg>");
  return parts.join("\n");
}

module.exports = {
  buildStructureCompositeSvg,
  buildStructureLayerSvg,
  buildStructureOverlaySvg,
  buildStructurePreview,
  computeStackDepths
};
