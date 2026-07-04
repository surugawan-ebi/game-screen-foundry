"use strict";

const { getDesignRules } = require("./design-rules");

const DEFAULT_LAYER_MIN_INSET = 4;
const DEFAULT_FOUNDATION_ASSET_TYPES = ["panel", "card_frame", "button"];
const TOLERANCE = 0.5;

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function round(value) {
  return Math.round(Number(value) * 10) / 10;
}

function list(value) {
  return Array.isArray(value) ? value.filter(Boolean).map(String) : [];
}

function normalizeInset(value, fallback = 0) {
  if (value === undefined || value === null) {
    return {
      top: fallback,
      right: fallback,
      bottom: fallback,
      left: fallback
    };
  }
  if (typeof value === "number") {
    return {
      top: value,
      right: value,
      bottom: value,
      left: value
    };
  }
  return {
    top: Number(value.top || 0),
    right: Number(value.right || 0),
    bottom: Number(value.bottom || 0),
    left: Number(value.left || 0)
  };
}

function mergeInsets(left, right) {
  return {
    top: Math.max(left.top, right.top),
    right: Math.max(left.right, right.right),
    bottom: Math.max(left.bottom, right.bottom),
    left: Math.max(left.left, right.left)
  };
}

function getPlacementBox(placement) {
  return {
    left: round(placement.x - placement.width / 2),
    top: round(placement.y - placement.height / 2),
    right: round(placement.x + placement.width / 2),
    bottom: round(placement.y + placement.height / 2),
    width: round(placement.width),
    height: round(placement.height)
  };
}

function boxToRect(box) {
  return {
    left: round(box.left),
    top: round(box.top),
    right: round(box.right),
    bottom: round(box.bottom),
    width: round(box.right - box.left),
    height: round(box.bottom - box.top)
  };
}

function getOverlayBox(overlay, placementById) {
  const fallbackWidth = Math.max(overlay.width || 1, 1);
  const fallbackHeight = Math.max(overlay.height || 1, 1);
  if (!overlay.targetPlacementId || !overlay.slot || !placementById.has(overlay.targetPlacementId)) {
    return {
      left: round((overlay.x || 0) - fallbackWidth / 2),
      top: round((overlay.y || 0) - fallbackHeight / 2),
      right: round((overlay.x || 0) + fallbackWidth / 2),
      bottom: round((overlay.y || 0) + fallbackHeight / 2),
      width: fallbackWidth,
      height: fallbackHeight,
      targetPlacementId: "",
      slot: null
    };
  }

  const target = placementById.get(overlay.targetPlacementId);
  const targetBox = getPlacementBox(target);
  const slot = overlay.slot;
  const width = Math.max(slot.width || overlay.width || 1, 1);
  const height = Math.max(slot.height || overlay.height || 1, 1);
  const offsetX = slot.offsetX || 0;
  const offsetY = slot.offsetY || 0;
  const left = slot.x !== undefined
    ? targetBox.left + slot.x + offsetX
    : slot.right !== undefined
      ? targetBox.right - slot.right - width + offsetX
      : targetBox.left + (targetBox.width - width) / 2 + offsetX;
  const top = slot.y !== undefined
    ? targetBox.top + slot.y + offsetY
    : slot.bottom !== undefined
      ? targetBox.bottom - slot.bottom - height + offsetY
      : targetBox.top + (targetBox.height - height) / 2 + offsetY;

  return {
    left: round(left),
    top: round(top),
    right: round(left + width),
    bottom: round(top + height),
    width: round(width),
    height: round(height),
    targetPlacementId: overlay.targetPlacementId,
    slot: clone(slot)
  };
}

function containsBox(outer, inner, tolerance = TOLERANCE) {
  return inner.left + tolerance >= outer.left
    && inner.top + tolerance >= outer.top
    && inner.right - tolerance <= outer.right
    && inner.bottom - tolerance <= outer.bottom;
}

function overlapArea(left, right) {
  return Math.max(0, Math.min(left.right, right.right) - Math.max(left.left, right.left))
    * Math.max(0, Math.min(left.bottom, right.bottom) - Math.max(left.top, right.top));
}

function measureGap(left, right) {
  const horizontal = right.left > left.right
    ? right.left - left.right
    : left.left > right.right
      ? left.left - right.right
      : 0;
  const vertical = right.top > left.bottom
    ? right.top - left.bottom
    : left.top > right.bottom
      ? left.top - right.bottom
      : 0;
  return {
    horizontal: round(horizontal),
    vertical: round(vertical),
    nearest: round(Math.max(horizontal, vertical))
  };
}

function measureInsets(rootBox, box) {
  return {
    top: round(box.top - rootBox.top),
    right: round(rootBox.right - box.right),
    bottom: round(rootBox.bottom - box.bottom),
    left: round(box.left - rootBox.left)
  };
}

function measureOverflow(rootBox, box) {
  return {
    top: round(Math.max(0, rootBox.top - box.top)),
    right: round(Math.max(0, box.right - rootBox.right)),
    bottom: round(Math.max(0, box.bottom - rootBox.bottom)),
    left: round(Math.max(0, rootBox.left - box.left))
  };
}

function insetMeetsMinimum(inset, minimum) {
  return inset.top + TOLERANCE >= minimum.top
    && inset.right + TOLERANCE >= minimum.right
    && inset.bottom + TOLERANCE >= minimum.bottom
    && inset.left + TOLERANCE >= minimum.left;
}

function overflowWithin(overflow, allowed) {
  return overflow.top <= allowed.top + TOLERANCE
    && overflow.right <= allowed.right + TOLERANCE
    && overflow.bottom <= allowed.bottom + TOLERANCE
    && overflow.left <= allowed.left + TOLERANCE;
}

function sameBox(left, right) {
  return Math.abs(left.left - right.left) <= TOLERANCE
    && Math.abs(left.top - right.top) <= TOLERANCE
    && Math.abs(left.width - right.width) <= TOLERANCE
    && Math.abs(left.height - right.height) <= TOLERANCE;
}

function expandBounds(bounds, box) {
  if (!box) {
    return bounds;
  }
  if (!bounds) {
    return {
      left: box.left,
      top: box.top,
      right: box.right,
      bottom: box.bottom
    };
  }
  return {
    left: Math.min(bounds.left, box.left),
    top: Math.min(bounds.top, box.top),
    right: Math.max(bounds.right, box.right),
    bottom: Math.max(bounds.bottom, box.bottom)
  };
}

function createCheck(status, code, message, refs = {}) {
  return {
    status,
    code,
    message,
    refs
  };
}

function normalizeFitRule(rule) {
  if (!rule || typeof rule !== "object") {
    return null;
  }
  return {
    placementId: String(rule.placementId || ""),
    fit: rule.fit || "inside_root",
    minInset: normalizeInset(rule.minInset, 0),
    minGap: Number(rule.minGap || 0),
    allowedOverflow: normalizeInset(rule.allowedOverflow, 0),
    notes: rule.notes || ""
  };
}

function getRuleByPlacement(group) {
  const rules = Array.isArray(group.layerFitRules) ? group.layerFitRules : [];
  return new Map(rules
    .map(normalizeFitRule)
    .filter((rule) => rule && rule.placementId)
    .map((rule) => [rule.placementId, rule]));
}

function minInsetSide(inset) {
  return Math.min(inset.top, inset.right, inset.bottom, inset.left);
}

function checkLayerFit({ group, placement, rootPlacement, rule, frameContext }) {
  const box = getPlacementBox(placement);
  const rootBox = getPlacementBox(rootPlacement);
  const refs = {
    groupId: group.groupId,
    placementId: placement.placementId,
    rootPlacementId: rootPlacement.placementId
  };

  if (placement.placementId === group.rootPlacementId) {
    return createCheck("pass", "root_layer", `${placement.placementId} is the root layer.`, refs);
  }

  const inset = measureInsets(rootBox, box);
  const overflow = measureOverflow(rootBox, box);
  const overlap = overlapArea(rootBox, box);
  const resolvedRule = rule || null;
  // On a foundation root (panel/card frame/button), the outer band of the
  // box is baked frame decoration. A contained layer whose measured inset is
  // effectively zero sits on that frame no matter what minInset was declared,
  // so a loose declaration must not silence it.
  const context = frameContext || {};
  const checkFrameBudget = (fitCode) => {
    if (!context.rootIsFoundation || context.layerIsFill) {
      return null;
    }
    // An explicit frameInset declares the painted decoration band per side;
    // layers must clear it regardless of contentInset.
    if (context.frameInset) {
      const measured = minInsetSide(inset);
      if (measured + TOLERANCE < 2) {
        return createCheck("fail", "layer_fit_flush_frame", `${placement.placementId} touches the edge of foundation root ${rootPlacement.placementId} (measured inset ${measured}px); it will sit on the baked frame. Move it inside the frame band, or declare edge_attached/decorative_overlap if the overhang is intentional.`, {
          ...refs,
          inset,
          fitCode
        });
      }
      const offendingSide = ["top", "right", "bottom", "left"]
        .find((side) => inset[side] + TOLERANCE < context.frameInset[side]);
      if (offendingSide) {
        return createCheck("warn", "layer_fit_below_frame_budget", `${placement.placementId} keeps only ${inset[offendingSide]}px from the ${offendingSide} edge of ${rootPlacement.placementId}; the declared painted frame band there is ${context.frameInset[offendingSide]}px, so it overlaps the frame ornament.`, {
          ...refs,
          inset,
          frameInset: context.frameInset
        });
      }
      return null;
    }
    const measured = minInsetSide(inset);
    if (measured + TOLERANCE < 2) {
      return createCheck("fail", "layer_fit_flush_frame", `${placement.placementId} touches the edge of foundation root ${rootPlacement.placementId} (measured inset ${measured}px); it will sit on the baked frame. Move it inside the frame band, or declare edge_attached/decorative_overlap if the overhang is intentional.`, {
        ...refs,
        inset,
        fitCode
      });
    }
    if (!context.groupHasContentInset && measured + TOLERANCE < context.frameThickness) {
      return createCheck("warn", "layer_fit_below_frame_budget", `${placement.placementId} keeps only ${measured}px from the edge of ${rootPlacement.placementId}; the design frame band is ${context.frameThickness}px. Add contentInset to the group or move the layer inside the frame band.`, {
        ...refs,
        inset,
        frameThickness: context.frameThickness
      });
    }
    return null;
  };

  if (resolvedRule && resolvedRule.fit === "same_canvas") {
    return sameBox(rootBox, box)
      ? createCheck("pass", "layer_fit_same_canvas", `${placement.placementId} shares the root canvas.`, refs)
      : createCheck("fail", "layer_fit_same_canvas", `${placement.placementId} is marked same_canvas but does not match the root bounds.`, {
          ...refs,
          inset,
          overflow
        });
  }

  if (resolvedRule && resolvedRule.fit === "inside_root") {
    if (!containsBox(rootBox, box)) {
      return createCheck("fail", "layer_fit_inside_root", `${placement.placementId} must stay inside ${rootPlacement.placementId}.`, {
        ...refs,
        overflow
      });
    }
    if (!insetMeetsMinimum(inset, resolvedRule.minInset)) {
      return createCheck("fail", "layer_fit_inside_root", `${placement.placementId} touches the root edge; increase margin or lower minInset.`, {
        ...refs,
        inset,
        minInset: resolvedRule.minInset
      });
    }
    const frameCheck = checkFrameBudget("inside_root");
    if (frameCheck) {
      return frameCheck;
    }
    return createCheck("pass", "layer_fit_inside_root", `${placement.placementId} stays inside the root with the required inset.`, {
      ...refs,
      inset
    });
  }

  if (resolvedRule && (resolvedRule.fit === "edge_attached" || resolvedRule.fit === "decorative_overlap")) {
    if (overlap <= 0) {
      return createCheck("fail", "layer_fit_overlap", `${placement.placementId} is marked ${resolvedRule.fit} but does not overlap the root.`, refs);
    }
    return overflowWithin(overflow, resolvedRule.allowedOverflow)
      ? createCheck("pass", `layer_fit_${resolvedRule.fit}`, `${placement.placementId} uses the approved ${resolvedRule.fit} overflow.`, {
          ...refs,
          overflow
        })
      : createCheck("fail", `layer_fit_${resolvedRule.fit}`, `${placement.placementId} exceeds approved overflow for ${resolvedRule.fit}.`, {
          ...refs,
          overflow,
          allowedOverflow: resolvedRule.allowedOverflow
        });
  }

  if (resolvedRule && resolvedRule.fit === "sibling") {
    if (overlap > 0) {
      return createCheck("fail", "layer_fit_sibling_overlap", `${placement.placementId} is marked sibling of ${rootPlacement.placementId} but overlaps it.`, {
        ...refs,
        overlap: round(overlap)
      });
    }
    const gap = measureGap(rootBox, box);
    if (gap.nearest + TOLERANCE < resolvedRule.minGap) {
      return createCheck("fail", "layer_fit_sibling_gap", `${placement.placementId} is marked sibling of ${rootPlacement.placementId} but keeps only ${gap.nearest}px gap.`, {
        ...refs,
        gap,
        minGap: resolvedRule.minGap
      });
    }
    return createCheck("pass", "layer_fit_sibling", `${placement.placementId} is an independent sibling of ${rootPlacement.placementId}.`, {
      ...refs,
      gap
    });
  }

  if (sameBox(rootBox, box)) {
    return createCheck("pass", "layer_fit_default_same_canvas", `${placement.placementId} shares the root bounds.`, refs);
  }
  if (containsBox(rootBox, box)) {
    const frameCheck = checkFrameBudget("default");
    if (frameCheck) {
      return frameCheck;
    }
    const minimum = normalizeInset(DEFAULT_LAYER_MIN_INSET, 0);
    return insetMeetsMinimum(inset, minimum)
      ? createCheck("pass", "layer_fit_default_inside", `${placement.placementId} stays inside the root with visible breathing room.`, {
          ...refs,
          inset
        })
      : createCheck("warn", "layer_fit_default_tight", `${placement.placementId} is inside the root but touches an edge; add layerFitRules.minInset or resize it.`, {
          ...refs,
          inset,
          minInset: minimum
        });
  }
  return overlap > 0
    ? createCheck("warn", "layer_fit_default_overflow", `${placement.placementId} overflows the root without an explicit layerFitRules entry.`, {
        ...refs,
        overflow
      })
    : createCheck("fail", "layer_fit_default_detached", `${placement.placementId} does not overlap the root.`, refs);
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

function buildCompositionReview(input) {
  const materialSpec = input.materialSpecSheet || {};
  const groups = Array.isArray(materialSpec.compositionGroups) ? materialSpec.compositionGroups : [];
  const placements = Array.isArray(materialSpec.placements) ? materialSpec.placements : [];
  const overlays = Array.isArray(materialSpec.contentOverlays) ? materialSpec.contentOverlays : [];
  const assets = Array.isArray(materialSpec.assets) ? materialSpec.assets : [];
  const placementById = new Map(placements.map((placement) => [placement.placementId, placement]));
  const overlayById = new Map(overlays.map((overlay) => [overlay.overlayId, overlay]));
  const assetById = new Map(assets.map((asset) => [asset.assetId, asset]));
  const designRules = getDesignRules(input.worldPreset);
  const layoutAnatomy = input.worldPreset && input.worldPreset.qualityProfile && input.worldPreset.qualityProfile.layoutAnatomy
    ? input.worldPreset.qualityProfile.layoutAnatomy
    : {};
  const foundationTypes = Array.isArray(layoutAnatomy.foundationAssetTypes) && layoutAnatomy.foundationAssetTypes.length
    ? layoutAnatomy.foundationAssetTypes.map(String)
    : DEFAULT_FOUNDATION_ASSET_TYPES;

  const reviewedGroups = groups.map((group) => {
    const checks = [];
    const rootPlacement = placementById.get(group.rootPlacementId);
    const ruleByPlacement = getRuleByPlacement(group);
    const layerPlacementIds = list(group.layerPlacementIds);
    const childContentPlacementIds = list(group.childContentPlacementIds);
    const protectedOverlayIds = list(group.protectedOverlayIds);

    if (!rootPlacement) {
      checks.push(createCheck("fail", "missing_root", `Missing root placement ${group.rootPlacementId}.`, {
        groupId: group.groupId,
        rootPlacementId: group.rootPlacementId
      }));
    }
    if (!layerPlacementIds.length) {
      checks.push(createCheck("fail", "missing_layers", `${group.groupId} has no layerPlacementIds.`, {
        groupId: group.groupId
      }));
    }

    const rootBox = rootPlacement ? getPlacementBox(rootPlacement) : null;
    let bounds = rootBox ? expandBounds(null, rootBox) : null;
    const groupPlacementIds = new Set([...layerPlacementIds, ...childContentPlacementIds]);
    const layers = [];
    const childContent = [];

    for (const placementId of layerPlacementIds) {
      const placement = placementById.get(placementId);
      if (!placement) {
        checks.push(createCheck("fail", "missing_layer", `Missing layer placement ${placementId}.`, {
          groupId: group.groupId,
          placementId
        }));
        continue;
      }
      const asset = assetById.get(placement.assetId) || {};
      const box = getPlacementBox(placement);
      bounds = expandBounds(bounds, box);
      const fitRule = ruleByPlacement.get(placementId) || null;
      if (rootPlacement) {
        const rootAsset = assetById.get(rootPlacement.assetId) || {};
        checks.push(checkLayerFit({
          group,
          placement,
          rootPlacement,
          rule: fitRule,
          frameContext: {
            rootIsFoundation: foundationTypes.includes(rootAsset.assetType),
            layerIsFill: /fill/u.test(String(asset.role || "")),
            groupHasContentInset: group.contentInset !== undefined || group.minChildInset !== undefined,
            frameThickness: designRules.frameThickness,
            frameInset: group.frameInset === undefined ? null : normalizeInset(group.frameInset, 0)
          }
        }));
      }
      layers.push({
        placementId,
        assetId: placement.assetId,
        role: asset.role || "",
        assetType: asset.assetType || "",
        zIndex: placement.zIndex,
        box,
        fitRule
      });
    }

    const contentInset = normalizeInset(group.contentInset, 0);
    const minChildInset = normalizeInset(group.minChildInset, 0);
    const effectiveInset = mergeInsets(contentInset, minChildInset);
    const hasInset = group.contentInset !== undefined || group.minChildInset !== undefined;
    const contentBox = rootBox && hasInset
      ? boxToRect({
          left: rootBox.left + effectiveInset.left,
          top: rootBox.top + effectiveInset.top,
          right: rootBox.right - effectiveInset.right,
          bottom: rootBox.bottom - effectiveInset.bottom
        })
      : null;

    if (childContentPlacementIds.length && !contentBox) {
      checks.push(createCheck("warn", "missing_content_inset", `${group.groupId} has child content but no contentInset or minChildInset.`, {
        groupId: group.groupId
      }));
    }
    if (contentBox && (contentBox.width <= 0 || contentBox.height <= 0)) {
      checks.push(createCheck("fail", "invalid_content_inset", `${group.groupId} content inset leaves no usable area.`, {
        groupId: group.groupId,
        effectiveInset
      }));
    }
    if (group.frameInset !== undefined && hasInset) {
      const frameInset = normalizeInset(group.frameInset, 0);
      const offendingSide = ["top", "right", "bottom", "left"]
        .find((side) => frameInset[side] > effectiveInset[side] + TOLERANCE);
      if (offendingSide) {
        checks.push(createCheck("warn", "frame_inset_exceeds_content", `${group.groupId}: the painted frame band (${offendingSide}: ${frameInset[offendingSide]}px) is wider than the contentInset there (${effectiveInset[offendingSide]}px), so child content is allowed to sit on the frame ornament. Raise the contentInset or shrink the frame.`, {
          groupId: group.groupId,
          frameInset,
          effectiveInset
        }));
      }
    }

    for (const placementId of childContentPlacementIds) {
      const placement = placementById.get(placementId);
      if (!placement) {
        checks.push(createCheck("fail", "missing_child_content", `Missing child content placement ${placementId}.`, {
          groupId: group.groupId,
          placementId
        }));
        continue;
      }
      const asset = assetById.get(placement.assetId) || {};
      const box = getPlacementBox(placement);
      bounds = expandBounds(bounds, box);
      if (contentBox) {
        checks.push(containsBox(contentBox, box)
          ? createCheck("pass", "child_content_inset", `${placementId} stays inside the content inset.`, {
              groupId: group.groupId,
              placementId,
              contentBox
            })
          : createCheck("fail", "child_content_inset", `${placementId} escapes the content inset.`, {
              groupId: group.groupId,
              placementId,
              contentBox,
              box
            }));
      }
      childContent.push({
        placementId,
        assetId: placement.assetId,
        role: asset.role || "",
        assetType: asset.assetType || "",
        zIndex: placement.zIndex,
        box
      });
    }

    const maxGroupedZ = [...groupPlacementIds]
      .map((placementId) => placementById.get(placementId))
      .filter(Boolean)
      .reduce((max, placement) => Math.max(max, placement.zIndex), -Infinity);
    const protectedOverlays = [];
    for (const overlayId of protectedOverlayIds) {
      const overlay = overlayById.get(overlayId);
      if (!overlay) {
        checks.push(createCheck("fail", "missing_protected_overlay", `Missing protected overlay ${overlayId}.`, {
          groupId: group.groupId,
          overlayId
        }));
        continue;
      }
      const box = getOverlayBox(overlay, placementById);
      bounds = expandBounds(bounds, box);
      if (overlay.targetPlacementId && !groupPlacementIds.has(overlay.targetPlacementId)) {
        checks.push(createCheck("fail", "protected_overlay_target", `${overlayId} targets a placement outside ${group.groupId}.`, {
          groupId: group.groupId,
          overlayId,
          targetPlacementId: overlay.targetPlacementId
        }));
      } else {
        checks.push(createCheck("pass", "protected_overlay_target", `${overlayId} targets a placement in the group.`, {
          groupId: group.groupId,
          overlayId,
          targetPlacementId: overlay.targetPlacementId || ""
        }));
      }
      checks.push(typeof overlay.zIndex === "number" && overlay.zIndex > maxGroupedZ
        ? createCheck("pass", "protected_overlay_z", `${overlayId} renders above grouped placements.`, {
            groupId: group.groupId,
            overlayId,
            zIndex: overlay.zIndex,
            maxGroupedZ
          })
        : createCheck("fail", "protected_overlay_z", `${overlayId} must render above grouped placements.`, {
            groupId: group.groupId,
            overlayId,
            zIndex: overlay.zIndex,
            maxGroupedZ
          }));
      protectedOverlays.push({
        overlayId,
        kind: overlay.kind,
        sampleText: overlay.sampleText || overlay.text || "",
        targetPlacementId: overlay.targetPlacementId || "",
        zIndex: overlay.zIndex,
        box,
        slot: clone(overlay.slot)
      });
    }

    if (group.outputAssetId) {
      checks.push(assetById.has(group.outputAssetId)
        ? createCheck("pass", "output_asset", `${group.outputAssetId} is a known output asset.`, {
            groupId: group.groupId,
            outputAssetId: group.outputAssetId
          })
        : createCheck("fail", "output_asset", `${group.outputAssetId} is not defined in assets.`, {
            groupId: group.groupId,
            outputAssetId: group.outputAssetId
          }));
    }

    if (Array.isArray(group.qualityChecks) && group.qualityChecks.length) {
      checks.push(createCheck("pass", "authored_quality_checks", `${group.groupId} has authored composition quality checks.`, {
        groupId: group.groupId,
        count: group.qualityChecks.length
      }));
    } else {
      checks.push(createCheck("warn", "authored_quality_checks", `${group.groupId} has no authored qualityChecks.`, {
        groupId: group.groupId
      }));
    }

    const status = statusFromChecks(checks);
    return {
      groupId: group.groupId,
      kind: group.kind,
      rootPlacementId: group.rootPlacementId,
      outputAssetId: group.outputAssetId || "",
      layerPlacementIds,
      childContentPlacementIds,
      protectedOverlayIds,
      contentInset: group.contentInset === undefined ? null : clone(group.contentInset),
      minChildInset: group.minChildInset === undefined ? null : clone(group.minChildInset),
      frameInset: group.frameInset === undefined ? null : normalizeInset(group.frameInset, 0),
      effectiveInset,
      rootBox,
      contentBox,
      bounds: bounds ? boxToRect(bounds) : null,
      layers,
      childContent,
      protectedOverlays,
      layerFitRules: Array.isArray(group.layerFitRules) ? group.layerFitRules.map(normalizeFitRule).filter(Boolean) : [],
      qualityChecks: list(group.qualityChecks),
      notes: group.notes || "",
      checks,
      status,
      score: scoreFromChecks(checks),
      issueCounts: {
        fail: checks.filter((check) => check.status === "fail").length,
        warn: checks.filter((check) => check.status === "warn").length,
        pass: checks.filter((check) => check.status === "pass").length
      }
    };
  });

  const allChecks = reviewedGroups.flatMap((group) => group.checks);
  return {
    summary: {
      groupCount: reviewedGroups.length,
      passCount: reviewedGroups.filter((group) => group.status === "pass").length,
      warnCount: reviewedGroups.filter((group) => group.status === "warn").length,
      failCount: reviewedGroups.filter((group) => group.status === "fail").length,
      issueCount: allChecks.filter((check) => check.status !== "pass").length,
      score: allChecks.length ? scoreFromChecks(allChecks) : 100,
      status: statusFromChecks(allChecks)
    },
    groups: reviewedGroups
  };
}

module.exports = {
  buildCompositionReview,
  getOverlayBox,
  getPlacementBox,
  normalizeInset
};
