"use strict";

const { getOverlayBox, getPlacementBox, normalizeInset } = require("./composition-quality");
const { getDesignRules } = require("./design-rules");

const TOLERANCE = 0.5;
const DEFAULT_OVERLAP_PADDING = 8;
const DEFAULT_OVERLAY_SLOT_PADDING = 4;
const DEFAULT_ALIGNMENT_TOLERANCE = 4;
const DEFAULT_MIN_FONT_SIZE = 10;
const TEXT_TIGHT_WIDTH_RATIO = 0.92;
const TEXT_TIGHT_HEIGHT_RATIO = 0.95;
const BACKDROP_CANVAS_COVERAGE = 0.9;
const STICKING_OUT_AREA_RATIO = 0.6;
const AXIS_RELATION_OVERLAP_RATIO = 0.5;
const MAX_ALIGNMENT_ISSUES = 24;

function round(value) {
  return Math.round(Number(value) * 10) / 10;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function createCheck(status, code, message, refs = {}) {
  return { status, code, message, refs };
}

function statusFromChecks(checks) {
  if (checks.some((check) => check.status === "fail")) {
    return "fail";
  }
  if (checks.some((check) => check.status === "warn")) {
    return "warn";
  }
  return "pass";
}

function scoreFromChecks(checks) {
  const failCount = checks.filter((check) => check.status === "fail").length;
  const warnCount = checks.filter((check) => check.status === "warn").length;
  return clamp(100 - failCount * 18 - warnCount * 7, 0, 100);
}

function getLayoutSafetyPolicy(materialSpec) {
  const policy = materialSpec.assemblyPolicy && materialSpec.assemblyPolicy.layoutSafetyPolicy
    ? materialSpec.assemblyPolicy.layoutSafetyPolicy
    : {};
  return {
    mode: policy.mode || "explicit_overlap_only",
    siblingOverlapDefault: policy.siblingOverlapDefault || "forbidden",
    minimumMajorSurfaceGap: Number(policy.minimumMajorSurfaceGap || 0),
    overlapPaddingDefault: Number(policy.overlapPaddingDefault
      || policy.parentPaddingDefault
      || DEFAULT_OVERLAP_PADDING),
    overlaySlotPaddingDefault: Number(policy.overlaySlotPaddingDefault || DEFAULT_OVERLAY_SLOT_PADDING),
    alignmentTolerance: Number(policy.alignmentTolerance || DEFAULT_ALIGNMENT_TOLERANCE),
    minFontSize: Number(policy.minFontSize || DEFAULT_MIN_FONT_SIZE),
    allowedOverlaps: Array.isArray(policy.allowedOverlaps) ? policy.allowedOverlaps : []
  };
}

function isBackdropPlacement(placement, asset, canvas) {
  if (!canvas.width || !canvas.height) {
    return false;
  }
  const coverage = placement.width * placement.height / (canvas.width * canvas.height);
  if (coverage >= BACKDROP_CANVAS_COVERAGE) {
    return true;
  }
  // A background-typed asset only counts as a screen backdrop when it actually
  // spans most of the canvas; smaller background art (banner fills, panel art)
  // still participates in overlap and alignment checks.
  const type = String(asset.assetType || "");
  const role = String(asset.role || "");
  const renderGroup = String(asset.renderGroup || "");
  const typeHint = type === "background" || /backdrop/u.test(role) || /background/u.test(renderGroup);
  return typeHint && coverage >= 0.5;
}

function buildGroupPairSet(materialSpec) {
  const groups = Array.isArray(materialSpec.compositionGroups) ? materialSpec.compositionGroups : [];
  const pairKeys = new Set();
  for (const group of groups) {
    const members = [
      group.rootPlacementId,
      ...(Array.isArray(group.layerPlacementIds) ? group.layerPlacementIds : []),
      ...(Array.isArray(group.childContentPlacementIds) ? group.childContentPlacementIds : [])
    ].filter(Boolean).map(String);
    const uniqueMembers = [...new Set(members)];
    for (let i = 0; i < uniqueMembers.length; i += 1) {
      for (let j = i + 1; j < uniqueMembers.length; j += 1) {
        pairKeys.add(pairKey(uniqueMembers[i], uniqueMembers[j]));
      }
    }
  }
  return pairKeys;
}

function pairKey(left, right) {
  return [left, right].sort().join("::");
}

function matchesOverlapRule(rule, a, b) {
  const source = String(rule.source || "");
  const target = String(rule.target || "");
  const idsA = [a.placementId, a.assetId];
  const idsB = [b.placementId, b.assetId];
  return (idsA.includes(source) && idsB.includes(target))
    || (idsB.includes(source) && idsA.includes(target));
}

function overlapArea(left, right) {
  return Math.max(0, Math.min(left.right, right.right) - Math.max(left.left, right.left))
    * Math.max(0, Math.min(left.bottom, right.bottom) - Math.max(left.top, right.top));
}

function containsBox(outer, inner, tolerance = TOLERANCE) {
  return inner.left + tolerance >= outer.left
    && inner.top + tolerance >= outer.top
    && inner.right - tolerance <= outer.right
    && inner.bottom - tolerance <= outer.bottom;
}

function measureInsets(outer, inner) {
  return {
    top: round(inner.top - outer.top),
    right: round(outer.right - inner.right),
    bottom: round(outer.bottom - inner.bottom),
    left: round(inner.left - outer.left)
  };
}

function minInsetSide(inset) {
  return Math.min(inset.top, inset.right, inset.bottom, inset.left);
}

function measureOverflow(outer, inner) {
  return {
    top: round(Math.max(0, outer.top - inner.top)),
    right: round(Math.max(0, inner.right - outer.right)),
    bottom: round(Math.max(0, inner.bottom - outer.bottom)),
    left: round(Math.max(0, outer.left - inner.left))
  };
}

function requiredInnerPadding(innerPlacement, policy) {
  if (innerPlacement.padding !== undefined && innerPlacement.padding !== null) {
    const inset = normalizeInset(innerPlacement.padding, 0);
    return Math.max(minInsetSide(inset), 0);
  }
  return policy.overlapPaddingDefault;
}

function isAncestor(placementById, candidateAncestorId, placement) {
  let current = placement;
  const seen = new Set();
  while (current && current.parentId && !seen.has(current.parentId)) {
    if (current.parentId === candidateAncestorId) {
      return true;
    }
    seen.add(current.parentId);
    current = placementById.get(current.parentId);
  }
  return false;
}

function checkOverlapPairs({ entries, placementById, policy, groupPairs, checks, stackings }) {
  for (let i = 0; i < entries.length; i += 1) {
    for (let j = i + 1; j < entries.length; j += 1) {
      const a = entries[i];
      const b = entries[j];
      const area = overlapArea(a.box, b.box);
      if (area <= 0) {
        continue;
      }
      if (groupPairs.has(pairKey(a.placementId, b.placementId))) {
        continue;
      }
      if (isAncestor(placementById, a.placementId, b.placement)
        || isAncestor(placementById, b.placementId, a.placement)) {
        continue;
      }

      const allowedRule = policy.allowedOverlaps.find((rule) => matchesOverlapRule(rule, a, b)) || null;
      const outerFirst = a.box.width * a.box.height >= b.box.width * b.box.height;
      const outer = outerFirst ? a : b;
      const inner = outerFirst ? b : a;
      const refs = {
        placementIds: [a.placementId, b.placementId],
        assetIds: [a.assetId, b.assetId]
      };

      if (containsBox(outer.box, inner.box)) {
        const inset = measureInsets(outer.box, inner.box);
        // Progress/gauge fill layers are designed to sit flush against their track.
        if (/fill/u.test(String(inner.role || "")) && /track|base|gauge|meter|progress/u.test(String(outer.role || ""))) {
          checks.push(createCheck("pass", "overlap_fill_layer", `${inner.placementId} is a fill layer sitting flush on ${outer.placementId}.`, refs));
          continue;
        }
        const required = allowedRule && allowedRule.minPadding !== undefined
          ? Math.max(minInsetSide(normalizeInset(allowedRule.minPadding, 0)), 0)
          : requiredInnerPadding(inner.placement, policy);
        stackings.push({
          outerPlacementId: outer.placementId,
          outerAssetId: outer.assetId,
          innerPlacementId: inner.placementId,
          innerAssetId: inner.assetId,
          inset,
          requiredPadding: required,
          declared: Boolean(allowedRule)
        });
        if (minInsetSide(inset) + TOLERANCE < Math.min(required, 2)) {
          checks.push(createCheck("fail", "overlap_padding_missing", `${inner.placementId} sits on ${outer.placementId} but touches its edge (min clearance ${round(minInsetSide(inset))}px); the top asset will look like it sticks out. Add padding or resize.`, {
            ...refs,
            inset,
            requiredPadding: required
          }));
        } else if (minInsetSide(inset) + TOLERANCE < required) {
          checks.push(createCheck("warn", "overlap_padding_tight", `${inner.placementId} sits on ${outer.placementId} with only ${round(minInsetSide(inset))}px clearance; the policy expects ${required}px. Increase padding or declare a smaller minPadding in allowedOverlaps.`, {
            ...refs,
            inset,
            requiredPadding: required
          }));
        } else {
          checks.push(createCheck("pass", "overlap_padding", `${inner.placementId} keeps at least ${required}px clearance inside ${outer.placementId}.`, {
            ...refs,
            inset,
            requiredPadding: required
          }));
        }
        continue;
      }

      const innerArea = inner.box.width * inner.box.height;
      const stickingOut = innerArea > 0 && area / innerArea >= STICKING_OUT_AREA_RATIO;
      if (allowedRule) {
        checks.push(createCheck("pass", "overlap_declared", `${a.placementId} and ${b.placementId} overlap as declared in allowedOverlaps.`, {
          ...refs,
          reason: allowedRule.reason || ""
        }));
        continue;
      }
      if (stickingOut) {
        checks.push(createCheck("fail", "overlap_sticks_out", `${inner.placementId} mostly sits on ${outer.placementId} but sticks out past its edge by ${JSON.stringify(measureOverflow(outer.box, inner.box))}px. Contain it, resize it, or declare the overlap in allowedOverlaps.`, {
          ...refs,
          overflow: measureOverflow(outer.box, inner.box)
        }));
        continue;
      }
      checks.push(createCheck(policy.siblingOverlapDefault === "forbidden" ? "fail" : "warn", "overlap_undeclared", `${a.placementId} and ${b.placementId} overlap without an allowedOverlaps declaration.`, {
        ...refs,
        overlapArea: round(area)
      }));
    }
  }
}

function checkParentContainment({ entries, placementById, policy, groupPairs, designRules, checks }) {
  const FOUNDATION_TYPES = ["panel", "card_frame", "button"];
  const DISCRETE_CHILD_TYPES = /icon|badge|token|emblem|crest/u;
  const entryById = new Map(entries.map((entry) => [entry.placementId, entry]));
  for (const entry of entries) {
    const parentId = entry.placement.parentId;
    if (!parentId || !placementById.has(parentId)) {
      continue;
    }
    // Group co-membership exempts the overflow warning (layerFitRules cover
    // overflow against the group root), but not the frame-band check below —
    // fit rules describe the root relation, not the direct parent.
    const inSameGroup = groupPairs.has(pairKey(entry.placementId, parentId));
    const parentEntry = entryById.get(parentId) || {
      placementId: parentId,
      assetId: (placementById.get(parentId) || {}).assetId || "",
      box: getPlacementBox(placementById.get(parentId))
    };
    if (policy.allowedOverlaps.some((rule) => matchesOverlapRule(rule, entry, parentEntry))) {
      continue;
    }
    // Allow ~1px design flush against the parent edge before flagging an overhang.
    if (!containsBox(parentEntry.box, entry.box, 1.5)) {
      if (!inSameGroup) {
        checks.push(createCheck("warn", "child_overflows_parent", `${entry.placementId} extends past its parent ${parentId} by ${JSON.stringify(measureOverflow(parentEntry.box, entry.box))}px. If this overhang is intentional, declare it in a composition group layerFitRules or allowedOverlaps.`, {
          placementIds: [entry.placementId, parentId],
          overflow: measureOverflow(parentEntry.box, entry.box)
        }));
      }
      continue;
    }
    // Discrete children (icons, badges, tokens) inside a foundation parent
    // must clear the parent's baked decorative frame band, or they visually
    // sit on the frame ornament.
    if (containsBox(parentEntry.box, entry.box, 0.5)
      && FOUNDATION_TYPES.includes(parentEntry.assetType || "")
      && DISCRETE_CHILD_TYPES.test(entry.assetType || "")
      && !/fill/u.test(entry.role || "")) {
      const inset = measureInsets(parentEntry.box, entry.box);
      if (minInsetSide(inset) + TOLERANCE < designRules.frameThickness) {
        checks.push(createCheck("warn", "child_in_frame_band", `${entry.placementId} sits only ${round(minInsetSide(inset))}px from the edge of ${parentId}; the decorative frame band is ${designRules.frameThickness}px, so it overlaps the parent's frame ornament. Move it inside the frame band or shrink the frame via designRules.frameThickness.`, {
          placementIds: [entry.placementId, parentId],
          inset,
          frameThickness: designRules.frameThickness
        }));
      }
    }
  }
}

function estimateLineWidth(line, fontSize, letterSpacing) {
  let width = 0;
  for (const char of String(line)) {
    const code = char.codePointAt(0);
    // Fullwidth CJK/kana glyphs render close to 1em; ASCII averages ~0.56em.
    width += code > 0xff ? fontSize : fontSize * 0.56;
  }
  const length = [...String(line)].length;
  return width + Math.max(0, length - 1) * letterSpacing;
}

function isTextOverlay(overlay) {
  if (overlay.sampleText || overlay.text) {
    return true;
  }
  return /text|label|count|number|timer|caption/u.test(String(overlay.kind || ""));
}

function checkTextOverlays({ materialSpec, placementById, policy, checks }) {
  const overlays = Array.isArray(materialSpec.contentOverlays) ? materialSpec.contentOverlays : [];
  for (const overlay of overlays) {
    if (!isTextOverlay(overlay)) {
      continue;
    }
    const box = getOverlayBox(overlay, placementById);
    const sampleText = String(overlay.sampleText || overlay.text || "");
    const refs = {
      overlayId: overlay.overlayId,
      targetPlacementId: overlay.targetPlacementId || ""
    };

    if (overlay.targetPlacementId && placementById.has(overlay.targetPlacementId)) {
      const targetBox = getPlacementBox(placementById.get(overlay.targetPlacementId));
      if (!containsBox(targetBox, box)) {
        checks.push(createCheck("fail", "overlay_outside_target", `${overlay.overlayId} extends past ${overlay.targetPlacementId} by ${JSON.stringify(measureOverflow(targetBox, box))}px.`, {
          ...refs,
          overflow: measureOverflow(targetBox, box)
        }));
      } else {
        const inset = measureInsets(targetBox, box);
        // A slot that spans the full target on an axis is an intentional
        // full-bleed lane (e.g. value text over a progress bar), not a
        // padding mistake.
        const fullBleedX = inset.left + inset.right <= 2;
        const fullBleedY = inset.top + inset.bottom <= 2;
        const tightX = !fullBleedX && Math.min(inset.left, inset.right) + TOLERANCE < policy.overlaySlotPaddingDefault;
        const tightY = !fullBleedY && Math.min(inset.top, inset.bottom) + TOLERANCE < policy.overlaySlotPaddingDefault;
        if (tightX || tightY) {
          checks.push(createCheck("warn", "overlay_slot_padding_tight", `${overlay.overlayId} slot touches the edge of ${overlay.targetPlacementId} (min clearance ${round(minInsetSide(inset))}px, expected ${policy.overlaySlotPaddingDefault}px).`, {
            ...refs,
            inset
          }));
        }
      }
    }

    if (!sampleText) {
      checks.push(createCheck("warn", "text_sample_missing", `${overlay.overlayId} has no sampleText, so font-size fit cannot be verified. Add a representative worst-case sample.`, refs));
      continue;
    }

    // Mirror the preview renderer's defaults so the check matches what users see.
    const fontSize = Number(overlay.fontSize) || Math.max(12, Math.round(box.height * 0.46));
    const lineHeight = Number(overlay.lineHeight) || Math.round(fontSize * 1.12);
    const letterSpacing = Number(overlay.letterSpacing) || 0;
    const paddingX = Number(overlay.paddingLeft || 0) + Number(overlay.paddingRight || 0);
    const paddingY = Number(overlay.paddingTop || 0) + Number(overlay.paddingBottom || 0);
    const lines = sampleText.split("\n");
    const maxLines = Number(overlay.maxLines || 0);
    if (maxLines && lines.length > maxLines) {
      checks.push(createCheck("fail", "text_max_lines", `${overlay.overlayId} sampleText uses ${lines.length} lines but maxLines is ${maxLines}.`, {
        ...refs,
        lineCount: lines.length,
        maxLines
      }));
    }
    const availableWidth = Math.max(box.width - paddingX, 1);
    const availableHeight = Math.max(box.height - paddingY, 1);
    const maxLineWidth = Math.max(...lines.map((line) => estimateLineWidth(line, fontSize, letterSpacing)));
    // A single line only needs its glyph height; lineHeight matters when stacking lines.
    const totalHeight = lines.length === 1 ? fontSize : lines.length * lineHeight;
    const textRefs = {
      ...refs,
      fontSize,
      lineHeight,
      estimatedTextWidth: round(maxLineWidth),
      estimatedTextHeight: round(totalHeight),
      slotWidth: round(availableWidth),
      slotHeight: round(availableHeight)
    };

    if (maxLineWidth > availableWidth + TOLERANCE) {
      checks.push(createCheck("fail", "text_overflow_x", `${overlay.overlayId} sample "${sampleText}" needs ~${round(maxLineWidth)}px at ${fontSize}px but the slot is ${round(availableWidth)}px wide. Reduce fontSize to ~${Math.floor(fontSize * availableWidth / maxLineWidth)}px, shorten the text, or widen the slot.`, {
        ...textRefs,
        suggestedFontSize: Math.floor(fontSize * availableWidth / maxLineWidth)
      }));
    } else if (maxLineWidth > availableWidth * TEXT_TIGHT_WIDTH_RATIO) {
      checks.push(createCheck("warn", "text_tight_x", `${overlay.overlayId} sample text fills ${Math.round(maxLineWidth / availableWidth * 100)}% of the slot width; longer runtime values may clip.`, textRefs));
    } else {
      checks.push(createCheck("pass", "text_fit", `${overlay.overlayId} sample text fits its slot at ${fontSize}px.`, textRefs));
    }

    if (totalHeight > availableHeight + TOLERANCE) {
      checks.push(createCheck("fail", "text_overflow_y", `${overlay.overlayId} needs ~${round(totalHeight)}px of text height but the slot is ${round(availableHeight)}px tall.`, textRefs));
    } else if (lines.length > 1 && totalHeight > availableHeight * TEXT_TIGHT_HEIGHT_RATIO) {
      checks.push(createCheck("warn", "text_tight_y", `${overlay.overlayId} line stack fills ${Math.round(totalHeight / availableHeight * 100)}% of the slot height.`, textRefs));
    }

    if (fontSize < policy.minFontSize) {
      checks.push(createCheck("warn", "text_font_small", `${overlay.overlayId} resolves to ${fontSize}px, below the ${policy.minFontSize}px readability floor at 1x.`, textRefs));
    }
  }
}

function axisOverlap(minA, maxA, minB, maxB) {
  return Math.max(0, Math.min(maxA, maxB) - Math.max(minA, minB));
}

// When an overlay declares both targetPlacementId+slot (which the renderer
// actually uses) and absolute x/y/width/height, the two must agree —
// otherwise external implementations that read the absolute values render
// the text somewhere else.
function checkOverlaySlotConsistency({ materialSpec, placementById, checks }) {
  const overlays = Array.isArray(materialSpec.contentOverlays) ? materialSpec.contentOverlays : [];
  for (const overlay of overlays) {
    if (!overlay.slot || !overlay.targetPlacementId || !placementById.has(overlay.targetPlacementId)) {
      continue;
    }
    if (overlay.x === undefined || overlay.y === undefined) {
      continue;
    }
    const resolved = getOverlayBox(overlay, placementById);
    const resolvedCenterX = (resolved.left + resolved.right) / 2;
    const resolvedCenterY = (resolved.top + resolved.bottom) / 2;
    const problems = [];
    if (Math.abs(Number(overlay.x) - resolvedCenterX) > 2 || Math.abs(Number(overlay.y) - resolvedCenterY) > 2) {
      problems.push(`center x/y ${overlay.x},${overlay.y} vs slot-resolved ${round(resolvedCenterX)},${round(resolvedCenterY)}`);
    }
    if (overlay.width !== undefined && Math.abs(Number(overlay.width) - resolved.width) > 2) {
      problems.push(`width ${overlay.width} vs slot ${round(resolved.width)}`);
    }
    if (overlay.height !== undefined && Math.abs(Number(overlay.height) - resolved.height) > 2) {
      problems.push(`height ${overlay.height} vs slot ${round(resolved.height)}`);
    }
    if (problems.length) {
      checks.push(createCheck("warn", "overlay_xy_slot_mismatch", `${overlay.overlayId}: the slot (which the renderer uses) and the declared absolute geometry disagree — ${problems.join("; ")}. Update x/y/width/height to ${round(resolvedCenterX)},${round(resolvedCenterY)},${round(resolved.width)}x${round(resolved.height)} or fix the slot.`, {
        overlayId: overlay.overlayId,
        targetPlacementId: overlay.targetPlacementId,
        suggested: {
          x: round(resolvedCenterX),
          y: round(resolvedCenterY),
          width: round(resolved.width),
          height: round(resolved.height)
        }
      }));
    }
  }
}

// Sibling runtime lanes on one shell (HUD values, capsule counters, row
// labels) must share one vertical rhythm: same center line, comparable font
// size and lane height. Pair-internal alignment is not enough — a row of
// lanes with drifting centers reads as sloppy design.
function checkLaneRhythm({ materialSpec, placementById, designRules, checks }) {
  const overlays = (Array.isArray(materialSpec.contentOverlays) ? materialSpec.contentOverlays : [])
    .filter((overlay) => isTextOverlay(overlay) && overlay.targetPlacementId && placementById.has(overlay.targetPlacementId));
  const lanes = overlays.map((overlay) => {
    const target = placementById.get(overlay.targetPlacementId);
    return {
      overlay,
      targetPlacementId: overlay.targetPlacementId,
      targetAssetId: target.assetId,
      box: getOverlayBox(overlay, placementById),
      fontSize: Number(overlay.fontSize) || 0
    };
  });

  const reported = new Set();
  for (let i = 0; i < lanes.length; i += 1) {
    for (let j = i + 1; j < lanes.length; j += 1) {
      const a = lanes[i];
      const b = lanes[j];
      // Same shell, or the same asset repeated (e.g. dock buttons, list rows).
      const sameFamily = a.targetPlacementId === b.targetPlacementId
        || a.targetAssetId === b.targetAssetId;
      if (!sameFamily) {
        continue;
      }
      const verticalOverlap = axisOverlap(a.box.top, a.box.bottom, b.box.top, b.box.bottom);
      if (verticalOverlap < Math.min(a.box.height, b.box.height) * AXIS_RELATION_OVERLAP_RATIO) {
        continue;
      }
      const centerDelta = Math.abs((a.box.top + a.box.bottom) / 2 - (b.box.top + b.box.bottom) / 2);
      const fontDelta = a.fontSize && b.fontSize ? Math.abs(a.fontSize - b.fontSize) : 0;
      const heightDelta = Math.abs(a.box.height - b.box.height);
      // A font ratio of 1.4+ is an intentional hierarchy (title + meta on one
      // row); only same-rank lanes must share one font scale and height.
      const intentionalHierarchy = a.fontSize && b.fontSize
        && Math.max(a.fontSize, b.fontSize) / Math.min(a.fontSize, b.fontSize) >= 1.4;
      const problems = [];
      if (centerDelta > designRules.iconTextCenterTolerance) {
        problems.push(`center lines differ by ${round(centerDelta)}px`);
      }
      if (!intentionalHierarchy && fontDelta > 2) {
        problems.push(`font sizes differ (${a.fontSize}px vs ${b.fontSize}px)`);
      }
      if (!intentionalHierarchy && heightDelta > 4) {
        problems.push(`lane heights differ (${round(a.box.height)}px vs ${round(b.box.height)}px)`);
      }
      if (!problems.length) {
        continue;
      }
      const key = [a.overlay.overlayId, b.overlay.overlayId].sort().join("::");
      if (reported.has(key)) {
        continue;
      }
      reported.add(key);
      checks.push(createCheck("warn", "lane_rhythm_inconsistent", `${a.overlay.overlayId} and ${b.overlay.overlayId} are sibling lanes in one row but ${problems.join("; ")}. Normalize the lane template (same slot height, same centerY, one font scale) so the row reads as one rhythm.`, {
        overlayIds: [a.overlay.overlayId, b.overlay.overlayId],
        targetPlacementId: a.targetPlacementId,
        centerDelta: round(centerDelta),
        fontSizes: [a.fontSize, b.fontSize],
        heights: [round(a.box.height), round(b.box.height)]
      }));
    }
  }
}

function checkIconTextPairs({ materialSpec, entries, placementById, designRules, checks }) {
  const overlays = Array.isArray(materialSpec.contentOverlays) ? materialSpec.contentOverlays : [];
  const iconEntries = entries.filter((entry) => /icon|badge|token/u.test(entry.assetType)
    || (entry.box.width <= 48 && entry.box.height <= 48 && /icon|badge/u.test(entry.assetId)));

  for (const overlay of overlays) {
    if (!isTextOverlay(overlay)) {
      continue;
    }
    const overlayBox = getOverlayBox(overlay, placementById);
    for (const icon of iconEntries) {
      // Pair an icon with a text lane when they belong to the same shell.
      const sharesShell = icon.placement.parentId === overlay.targetPlacementId
        || icon.placementId === overlay.targetPlacementId
        || (icon.placement.parentId && icon.placement.parentId === (placementById.get(overlay.targetPlacementId) || {}).parentId);
      if (!sharesShell) {
        continue;
      }
      // Only comparable-size, side-by-side pairs form one text lane. A large
      // emblem spanning several text lines, or a vertically stacked
      // icon-over-label nav tab, is a different pattern.
      if (icon.box.height > overlayBox.height * 2) {
        continue;
      }
      const verticalOverlap = axisOverlap(icon.box.top, icon.box.bottom, overlayBox.top, overlayBox.bottom);
      if (verticalOverlap < Math.min(icon.box.height, overlayBox.height) * AXIS_RELATION_OVERLAP_RATIO) {
        continue;
      }
      const horizontalOverlap = axisOverlap(icon.box.left, icon.box.right, overlayBox.left, overlayBox.right);
      if (horizontalOverlap > icon.box.width * 0.5) {
        continue;
      }
      const horizontalGap = Math.max(icon.box.left, overlayBox.left) - Math.min(icon.box.right, overlayBox.right);
      if (horizontalGap > designRules.iconTextPairGap) {
        continue;
      }
      const iconCenter = (icon.box.top + icon.box.bottom) / 2;
      const textCenter = (overlayBox.top + overlayBox.bottom) / 2;
      const delta = Math.abs(iconCenter - textCenter);
      if (delta > designRules.iconTextCenterTolerance) {
        checks.push(createCheck("warn", "icon_text_center_mismatch", `${icon.placementId} (centerY ${round(iconCenter)}) and text lane ${overlay.overlayId} (centerY ${round(textCenter)}) form an icon+label pair but their horizontal center lines differ by ${round(delta)}px; align them on one line.`, {
          placementIds: [icon.placementId],
          overlayId: overlay.overlayId,
          iconCenterY: round(iconCenter),
          textCenterY: round(textCenter),
          delta: round(delta)
        }));
      }
    }
  }
}

function checkTouchTargets({ entries, designRules, checks }) {
  if (!designRules.minTouchTarget) {
    return;
  }
  for (const entry of entries) {
    if (entry.assetType !== "button") {
      continue;
    }
    if (entry.box.width + TOLERANCE < designRules.minTouchTarget || entry.box.height + TOLERANCE < designRules.minTouchTarget) {
      checks.push(createCheck("warn", "touch_target_small", `${entry.placementId} is ${round(entry.box.width)}x${round(entry.box.height)}px, below the ${designRules.minTouchTarget}px touch target rule.`, {
        placementIds: [entry.placementId],
        minTouchTarget: designRules.minTouchTarget
      }));
    }
  }
}

function nearMissValues(pairsOfValues, tolerance) {
  const misses = [];
  for (const [edge, valueA, valueB] of pairsOfValues) {
    const delta = Math.abs(valueA - valueB);
    if (delta > TOLERANCE && delta <= tolerance) {
      misses.push({ edge, delta: round(delta), a: round(valueA), b: round(valueB) });
    }
  }
  misses.sort((left, right) => left.delta - right.delta);
  return misses;
}

function nearMissEdges(pairsOfValues, tolerance) {
  // An exact match on any edge of the axis means the pair is intentionally
  // aligned (edge-aligned or centered); small offsets on the other edges are
  // then a size choice, not sloppiness.
  const exactlyAligned = pairsOfValues.some(([, valueA, valueB]) => Math.abs(valueA - valueB) <= TOLERANCE);
  if (exactlyAligned) {
    return [];
  }
  return nearMissValues(pairsOfValues, tolerance);
}

function checkAlignment({ entries, policy, groupPairs, checks }) {
  const tolerance = policy.alignmentTolerance;
  const issues = [];
  let alignedPairCount = 0;

  for (let i = 0; i < entries.length; i += 1) {
    for (let j = i + 1; j < entries.length; j += 1) {
      const a = entries[i];
      const b = entries[j];
      // Fill layers track their gauge base, not shared guide lines.
      if (/fill/u.test(a.role) || /fill/u.test(b.role)) {
        continue;
      }
      // Declared decorative overlaps and grouped layers position relative to
      // each other, not to screen guide lines.
      if (groupPairs.has(pairKey(a.placementId, b.placementId))
        || policy.allowedOverlaps.some((rule) => matchesOverlapRule(rule, a, b))) {
        continue;
      }
      const refs = {
        placementIds: [a.placementId, b.placementId]
      };

      if (a.assetId === b.assetId) {
        const sizeMisses = nearMissValues([
          ["width", a.box.width, b.box.width],
          ["height", a.box.height, b.box.height]
        ], tolerance);
        if (sizeMisses.length) {
          issues.push(createCheck("warn", "size_near_miss", `${a.placementId} and ${b.placementId} place the same asset at sizes differing by ${sizeMisses[0].delta}px in ${sizeMisses[0].edge}; unify the size or make the difference intentional.`, {
            ...refs,
            ...sizeMisses[0]
          }));
        }
      }

      // Only compare siblings: elements under the same parent (or both top-level)
      // are the ones expected to share layout guide lines.
      if ((a.placement.parentId || "") !== (b.placement.parentId || "")) {
        continue;
      }
      // Concentric/stacked pairs (one inside the other) are an inset design,
      // not two siblings that should share guide lines.
      if (containsBox(a.box, b.box, 1.5) || containsBox(b.box, a.box, 1.5)) {
        continue;
      }
      const xOverlap = axisOverlap(a.box.left, a.box.right, b.box.left, b.box.right);
      const yOverlap = axisOverlap(a.box.top, a.box.bottom, b.box.top, b.box.bottom);

      // Elements sharing a row (vertical ranges overlap) should share horizontal guide lines.
      if (yOverlap >= Math.min(a.box.height, b.box.height) * AXIS_RELATION_OVERLAP_RATIO) {
        const misses = nearMissEdges([
          ["top", a.box.top, b.box.top],
          ["centerY", (a.box.top + a.box.bottom) / 2, (b.box.top + b.box.bottom) / 2],
          ["bottom", a.box.bottom, b.box.bottom]
        ], tolerance);
        if (misses.length) {
          issues.push(createCheck("warn", "alignment_near_miss_y", `${a.placementId} and ${b.placementId} are ${misses[0].delta}px from sharing the same ${misses[0].edge} line; snap them to the same value.`, {
            ...refs,
            ...misses[0]
          }));
        } else {
          alignedPairCount += 1;
        }
      }

      // Elements sharing a column (horizontal ranges overlap) should share vertical guide lines.
      if (xOverlap >= Math.min(a.box.width, b.box.width) * AXIS_RELATION_OVERLAP_RATIO) {
        const misses = nearMissEdges([
          ["left", a.box.left, b.box.left],
          ["centerX", (a.box.left + a.box.right) / 2, (b.box.left + b.box.right) / 2],
          ["right", a.box.right, b.box.right]
        ], tolerance);
        if (misses.length) {
          issues.push(createCheck("warn", "alignment_near_miss_x", `${a.placementId} and ${b.placementId} are ${misses[0].delta}px from sharing the same ${misses[0].edge} line; snap them to the same value.`, {
            ...refs,
            ...misses[0]
          }));
        } else {
          alignedPairCount += 1;
        }
      }

    }
  }

  const shown = issues.slice(0, MAX_ALIGNMENT_ISSUES);
  checks.push(...shown);
  if (issues.length > shown.length) {
    checks.push(createCheck("warn", "alignment_more_issues", `${issues.length - shown.length} more alignment near-miss issue(s) were truncated.`, {
      truncated: issues.length - shown.length
    }));
  }
  if (!issues.length) {
    checks.push(createCheck("pass", "alignment", `${alignedPairCount} related placement pair(s) share exact guide lines within ${tolerance}px snapping tolerance.`, {
      alignedPairCount,
      tolerance
    }));
  }
}

function buildLayoutReview(input) {
  const materialSpec = input.materialSpecSheet || {};
  const screenKv = input.screenKv || {};
  const canvas = {
    width: Number(screenKv.canvasWidth || 0),
    height: Number(screenKv.canvasHeight || 0)
  };
  const placements = Array.isArray(materialSpec.placements) ? materialSpec.placements : [];
  const assets = Array.isArray(materialSpec.assets) ? materialSpec.assets : [];
  const assetById = new Map(assets.map((asset) => [asset.assetId, asset]));
  const placementById = new Map(placements.map((placement) => [placement.placementId, placement]));
  const policy = getLayoutSafetyPolicy(materialSpec);
  const designRules = getDesignRules(input.worldPreset);
  const groupPairs = buildGroupPairSet(materialSpec);

  const entries = placements.map((placement) => {
    const asset = assetById.get(placement.assetId) || {};
    return {
      placementId: placement.placementId,
      assetId: placement.assetId,
      assetType: asset.assetType || "",
      role: asset.role || "",
      placement,
      box: getPlacementBox(placement),
      backdrop: isBackdropPlacement(placement, asset, canvas)
    };
  });
  const foreground = entries.filter((entry) => !entry.backdrop);

  const checks = [];
  const stackings = [];
  checkOverlapPairs({ entries: foreground, placementById, policy, groupPairs, checks, stackings });
  checkParentContainment({ entries, placementById, policy, groupPairs, designRules, checks });
  checkTextOverlays({ materialSpec, placementById, policy, checks });
  checkOverlaySlotConsistency({ materialSpec, placementById, checks });
  checkAlignment({ entries: foreground, policy, groupPairs, checks });
  checkLaneRhythm({ materialSpec, placementById, designRules, checks });
  checkIconTextPairs({ materialSpec, entries: foreground, placementById, designRules, checks });
  checkTouchTargets({ entries: foreground, designRules, checks });

  return {
    designRules,
    summary: {
      status: statusFromChecks(checks),
      score: scoreFromChecks(checks),
      checkCount: checks.length,
      failCount: checks.filter((check) => check.status === "fail").length,
      warnCount: checks.filter((check) => check.status === "warn").length,
      passCount: checks.filter((check) => check.status === "pass").length
    },
    policy,
    stackings,
    checks
  };
}

function getLayoutChecksForPlacements(layoutReview, placementIds) {
  const wanted = new Set(placementIds.filter(Boolean));
  return layoutReview.checks.filter((check) => {
    if (check.status === "pass") {
      return false;
    }
    const refs = check.refs || {};
    const refIds = [
      ...(Array.isArray(refs.placementIds) ? refs.placementIds : []),
      refs.targetPlacementId,
      refs.overlayId
    ].filter(Boolean);
    return refIds.some((id) => wanted.has(id));
  });
}

function getStackingsForPlacements(layoutReview, placementIds) {
  const wanted = new Set(placementIds.filter(Boolean));
  return layoutReview.stackings.filter((stacking) => {
    return wanted.has(stacking.outerPlacementId) || wanted.has(stacking.innerPlacementId);
  });
}

module.exports = {
  buildLayoutReview,
  estimateLineWidth,
  getLayoutChecksForPlacements,
  getStackingsForPlacements
};
