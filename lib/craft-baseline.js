"use strict";

// Craft baselines derived from measured distributions of commercial 2D game
// asset packs (aggregate statistics only — no source imagery). They encode
// what makes sold sprite sets read as professional:
//
//   - a consistent dark outline along the whole silhouette
//     (measured outlineCoverage p25 was 0.7-0.95 for buttons/items),
//   - a small number of decisive cel shading bands instead of muddy soft
//     gradients (luminanceBandCount p10-p90 was 3-10),
//   - a restrained palette with one hue identity (quantizedColorCount 3-17),
//   - calm foundation interiors (centerGradientDensity p90 ~0.12-0.22).
//
// The craft style is opt-in through worldPreset.designRules.craftStyle.

const CRAFT_STYLES = {
  outlined_cel: {
    label: "outlined cel-shaded sprite (commercial 2D asset pack quality)",
    classes: {
      foundation: {
        outlineCoverageMin: 0.6,
        outlineContrastMin: 0.12,
        bandRange: [3, 9],
        colorRange: [3, 24],
        centerGradientMax: 0.25
      },
      icon: {
        outlineCoverageMin: 0.55,
        outlineContrastMin: 0.1,
        bandRange: [2, 10],
        colorRange: [2, 28],
        centerGradientMax: 0.4
      },
      item: {
        outlineCoverageMin: 0.7,
        outlineContrastMin: 0.12,
        bandRange: [4, 12],
        colorRange: [5, 32],
        centerGradientMax: 0.45
      },
      default: {
        outlineCoverageMin: 0,
        outlineContrastMin: 0,
        bandRange: [2, 14],
        colorRange: [2, 64],
        centerGradientMax: 1
      }
    },
    promptLines: [
      "Craft spec (outlined cel): draw one clean silhouette with a consistent dark outline along the entire edge — uniform width, roughly 4-6% of the sprite size (2-4px at 64px). Shade with 3-6 decisive flat cel bands: base tone, one or two shadow tones, and a top/rim highlight. No soft airbrushed gradients, no photo-real noise.",
      "Give the piece physical weight: a darker bottom thickness band inside the outline, light from the top. Keep interior texture subtle and low-contrast so content surfaces stay readable. Limit the palette to about 3-8 dominant tones with one clear hue identity per asset.",
      "Family consistency: every asset in this set uses the same outline width, corner radius language, palette, and light direction, so all pieces read as one purchased asset pack."
    ]
  },
  flat_minimal: {
    label: "flat minimal GUI kit",
    classes: {
      foundation: {
        outlineCoverageMin: 0,
        outlineContrastMin: 0,
        bandRange: [1, 6],
        colorRange: [1, 16],
        centerGradientMax: 0.1
      },
      icon: {
        outlineCoverageMin: 0,
        outlineContrastMin: 0,
        bandRange: [1, 6],
        colorRange: [1, 16],
        centerGradientMax: 0.2
      },
      item: {
        outlineCoverageMin: 0,
        outlineContrastMin: 0,
        bandRange: [1, 8],
        colorRange: [1, 24],
        centerGradientMax: 0.3
      },
      default: {
        outlineCoverageMin: 0,
        outlineContrastMin: 0,
        bandRange: [1, 10],
        colorRange: [1, 32],
        centerGradientMax: 1
      }
    },
    promptLines: [
      "Craft spec (flat minimal): flat fills, uniform stroke widths, geometric corner radii from one scale, generous even padding, no textures or outlines, one restrained accent color system. Every glyph is optically centered and built on the same grid."
    ]
  },
  painterly: {
    label: "painterly game UI production art",
    classes: {
      foundation: {
        outlineCoverageMin: 0,
        outlineContrastMin: 0,
        bandRange: [3, 14],
        colorRange: [6, 96],
        centerGradientMax: 0.3
      },
      icon: {
        outlineCoverageMin: 0,
        outlineContrastMin: 0,
        bandRange: [3, 14],
        colorRange: [6, 96],
        centerGradientMax: 0.5
      },
      item: {
        outlineCoverageMin: 0,
        outlineContrastMin: 0,
        bandRange: [3, 16],
        colorRange: [8, 128],
        centerGradientMax: 0.6
      },
      default: {
        outlineCoverageMin: 0,
        outlineContrastMin: 0,
        bandRange: [2, 18],
        colorRange: [4, 160],
        centerGradientMax: 1
      }
    },
    promptLines: [
      "Craft spec (painterly): paint with confident brush economy — large readable planes first, values organized into clear light/mid/shadow groupings, detail concentrated at focal points and perimeter ornament. Edges stay crisp against the alpha. Avoid both flat placeholder fills and noisy photo-real gradients."
    ]
  }
};

const FOUNDATION_TYPES = new Set(["panel", "card_frame", "button"]);
const ICON_TYPES = /icon|badge|token|emblem|crest|cursor/u;
const ITEM_TYPES = /item|prop|chip|reward/u;

function craftClassForAsset(asset) {
  const type = String(asset.assetType || "");
  const role = String(asset.role || "");
  if (FOUNDATION_TYPES.has(type)) {
    return "foundation";
  }
  if (ICON_TYPES.test(type) || ICON_TYPES.test(role)) {
    return "icon";
  }
  if (ITEM_TYPES.test(type) || ITEM_TYPES.test(role)) {
    return "item";
  }
  return "default";
}

function getCraftStyle(designRules) {
  const name = String(designRules && designRules.craftStyle ? designRules.craftStyle : "");
  return CRAFT_STYLES[name] ? { name, ...CRAFT_STYLES[name] } : null;
}

function buildCraftPromptLines(designRules, asset) {
  const style = getCraftStyle(designRules);
  if (!style) {
    return [];
  }
  return [`Craft quality target: ${style.label}.`, ...style.promptLines];
}

// Evaluates measured PNG craft metrics against the declared craft style.
// Returns {status, code, message, refs} checks; empty when no style declared.
function auditCraftMetrics({ metrics, asset, designRules }) {
  const style = getCraftStyle(designRules);
  if (!style || String(asset.assetType || "") === "background") {
    return [];
  }
  const craftClass = craftClassForAsset(asset);
  const rules = style.classes[craftClass] || style.classes.default;
  const checks = [];
  const refs = {
    assetId: asset.assetId,
    craftStyle: style.name,
    craftClass,
    outlineCoverage: metrics.outlineCoverage,
    outlineContrast: metrics.outlineContrast,
    luminanceBandCount: metrics.luminanceBandCount,
    quantizedColorCount: metrics.quantizedColorCount
  };

  if (rules.outlineCoverageMin > 0
    && (metrics.outlineCoverage < rules.outlineCoverageMin || metrics.outlineContrast < rules.outlineContrastMin)) {
    checks.push({
      status: "warn",
      code: "craft_outline_weak",
      message: `${asset.assetId}: only ${Math.round((metrics.outlineCoverage || 0) * 100)}% of the silhouette has a clearly darker outline (contrast ${metrics.outlineContrast}). The ${style.name} style expects a consistent dark outline around the whole edge; regenerate with the craft spec.`,
      refs
    });
  }
  if (metrics.luminanceBandCount < rules.bandRange[0] || metrics.quantizedColorCount < rules.colorRange[0]) {
    checks.push({
      status: "warn",
      code: "craft_shading_flat",
      message: `${asset.assetId}: ${metrics.luminanceBandCount} luminance band(s) and ${metrics.quantizedColorCount} quantized color(s) read as a flat placeholder fill; the ${style.name} style expects ${rules.bandRange[0]}-${rules.bandRange[1]} decisive shading bands.`,
      refs
    });
  } else if (metrics.luminanceBandCount > rules.bandRange[1] && metrics.quantizedColorCount > rules.colorRange[1]) {
    checks.push({
      status: "warn",
      code: "craft_shading_muddy",
      message: `${asset.assetId}: ${metrics.luminanceBandCount} luminance bands over ${metrics.quantizedColorCount} colors read as muddy soft gradients; the ${style.name} style expects at most ${rules.bandRange[1]} decisive bands. Regenerate with flat cel shading.`,
      refs
    });
  }
  if (craftClass === "foundation" && metrics.centerGradientDensity > rules.centerGradientMax) {
    checks.push({
      status: "warn",
      code: "craft_interior_busy",
      message: `${asset.assetId}: interior detail density ${metrics.centerGradientDensity} exceeds the calm-surface budget ${rules.centerGradientMax} for foundation assets; runtime text will fight the texture.`,
      refs
    });
  }
  return checks;
}

// Suggests a craftStyle from measured metrics of existing artwork (adopted
// asset PNGs or reference sprites). Used when designRules.craftStyle is not
// declared, so an agent can pick the value that matches the art direction
// instead of guessing.
function suggestCraftStyle(metricsList) {
  const usable = metricsList.filter((metrics) => metrics && Number.isFinite(metrics.luminanceBandCount));
  if (usable.length < 2) {
    return null;
  }
  const median = (key) => {
    const values = usable.map((metrics) => Number(metrics[key] || 0)).sort((a, b) => a - b);
    return values[Math.floor(values.length / 2)];
  };
  const outline = median("outlineCoverage");
  const bands = median("luminanceBandCount");
  const colors = median("quantizedColorCount");
  if (outline >= 0.5 && bands <= 10 && colors <= 32) {
    return {
      craftStyle: "outlined_cel",
      reason: `sampled artwork has a consistent silhouette outline (median coverage ${outline}) and ${bands} decisive shading bands`
    };
  }
  if (colors <= 8 && bands <= 4) {
    return {
      craftStyle: "flat_minimal",
      reason: `sampled artwork is flat with few tones (median ${colors} colors, ${bands} bands) and no outline treatment`
    };
  }
  return {
    craftStyle: "painterly",
    reason: `sampled artwork uses rich tonal ranges (median ${colors} colors, ${bands} bands) without a hard outline`
  };
}

module.exports = {
  CRAFT_STYLES,
  auditCraftMetrics,
  buildCraftPromptLines,
  craftClassForAsset,
  getCraftStyle,
  suggestCraftStyle
};
