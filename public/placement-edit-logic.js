(function attachPlacementEditLogic(root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
    return;
  }
  root.GameScreenFoundryPlacementEditLogic = factory();
})(typeof globalThis !== "undefined" ? globalThis : window, function createPlacementEditLogic() {
  function placementBox(placement) {
    return {
      left: placement.x - placement.width / 2,
      top: placement.y - placement.height / 2,
      right: placement.x + placement.width / 2,
      bottom: placement.y + placement.height / 2
    };
  }

  function collectDependentPlacementIds({ placements = [], compositionGroups = [], rootPlacementId }) {
    const rootPlacement = placements.find((placement) => placement.placementId === rootPlacementId);
    if (!rootPlacement) {
      return [];
    }

    const movedIds = new Set([rootPlacement.placementId]);
    let changed = true;
    while (changed) {
      changed = false;

      for (const placement of placements) {
        if (movedIds.has(placement.placementId)) {
          continue;
        }
        if (placement.parentId && movedIds.has(placement.parentId)) {
          movedIds.add(placement.placementId);
          changed = true;
        }
      }

      for (const group of compositionGroups) {
        if (!movedIds.has(group.rootPlacementId)) {
          continue;
        }
        const members = [
          ...(Array.isArray(group.layerPlacementIds) ? group.layerPlacementIds : []),
          ...(Array.isArray(group.childContentPlacementIds) ? group.childContentPlacementIds : [])
        ];
        for (const memberId of members) {
          if (memberId && !movedIds.has(memberId)) {
            movedIds.add(memberId);
            changed = true;
          }
        }
      }

      const rootBox = placementBox(rootPlacement);
      const paddedRoot = {
        left: rootBox.left - 1.5,
        top: rootBox.top - 1.5,
        right: rootBox.right + 1.5,
        bottom: rootBox.bottom + 1.5
      };
      for (const placement of placements) {
        if (movedIds.has(placement.placementId)) {
          continue;
        }
        if (placement.parentId && !movedIds.has(placement.parentId)) {
          continue;
        }
        if (placement.zIndex <= rootPlacement.zIndex) {
          continue;
        }
        const box = placementBox(placement);
        if (
          box.left >= paddedRoot.left
          && box.top >= paddedRoot.top
          && box.right <= paddedRoot.right
          && box.bottom <= paddedRoot.bottom
        ) {
          movedIds.add(placement.placementId);
          changed = true;
        }
      }
    }

    movedIds.delete(rootPlacement.placementId);
    return [...movedIds];
  }

  function syncOverlayAbsoluteGeometryForSpec(materialSpecSheet) {
    const overlays = materialSpecSheet && Array.isArray(materialSpecSheet.contentOverlays)
      ? materialSpecSheet.contentOverlays
      : [];
    const placements = materialSpecSheet && Array.isArray(materialSpecSheet.placements)
      ? materialSpecSheet.placements
      : [];
    const placementById = new Map(placements.map((placement) => [placement.placementId, placement]));
    let updated = 0;

    for (const overlay of overlays) {
      if (!overlay.slot || !overlay.targetPlacementId || !placementById.has(overlay.targetPlacementId)) {
        continue;
      }
      const target = placementById.get(overlay.targetPlacementId);
      const targetLeft = target.x - target.width / 2;
      const targetTop = target.y - target.height / 2;
      const slot = overlay.slot;
      const width = Math.max(Number(slot.width || overlay.width || 1), 1);
      const height = Math.max(Number(slot.height || overlay.height || 1), 1);
      const offsetX = Number(slot.offsetX || 0);
      const offsetY = Number(slot.offsetY || 0);
      const left = Object.prototype.hasOwnProperty.call(slot, "x")
        ? targetLeft + Number(slot.x) + offsetX
        : Object.prototype.hasOwnProperty.call(slot, "right")
          ? targetLeft + target.width - Number(slot.right) - width + offsetX
          : targetLeft + (target.width - width) / 2 + offsetX;
      const top = Object.prototype.hasOwnProperty.call(slot, "y")
        ? targetTop + Number(slot.y) + offsetY
        : Object.prototype.hasOwnProperty.call(slot, "bottom")
          ? targetTop + target.height - Number(slot.bottom) - height + offsetY
          : targetTop + (target.height - height) / 2 + offsetY;

      overlay.x = Math.round((left + width / 2) * 10) / 10;
      overlay.y = Math.round((top + height / 2) * 10) / 10;
      overlay.width = width;
      overlay.height = height;
      updated += 1;
    }

    return updated;
  }

  return {
    collectDependentPlacementIds,
    syncOverlayAbsoluteGeometryForSpec
  };
});
