# Quality Rubric

This rubric defines "commercial-grade game asset" quality for Game Screen
Foundry. It is meant to translate observations from licensed or purchased game
assets into safe, reusable quality criteria.

Important boundary: do not prompt the model to copy, imitate, or reproduce a
specific purchased asset pack. Use purchased assets only as references for
quality attributes such as readability, spacing, edge treatment, material
clarity, and implementation readiness.

## Good Single Asset

A good generated asset is not just a pretty image. It is a production-ready game
UI part that can be dropped into a screen.

Required qualities:

- **Readable silhouette**: the shape remains recognizable at the target size and
  at smaller in-game display sizes.
- **Clean functional area**: buttons, panels, and cards keep a clear lane for
  runtime text, icons, or child content.
- **Strong edge separation**: outline, rim light, shadow, or contrast separates
  the asset from likely backgrounds.
- **Controlled ornament density**: decorative detail raises perceived value but
  does not compete with labels, icons, or gameplay information.
- **Material clarity**: metal, stone, cloth, glass, parchment, wood, and gem
  accents read as intentional materials rather than noisy texture.
- **Implementation-ready alpha**: transparent assets have clean boundaries,
  useful padding, and no accidental background residue.
- **Consistent family logic**: assets in the same family share shape language,
  bevel depth, lighting direction, line weight, and color hierarchy.
- **No accidental text**: runtime labels, values, timers, and notification counts
  are not baked into the PNG unless explicitly listed as baked text.
- **Target-size fit**: the final raster respects the requested pixel size and
  does not rely on later cropping.

## Foundation Asset Anatomy

Panels, card frames, button bases, nav rails, chips, and other "foundation"
assets need a stronger structural model than ordinary decorative assets. When
studying commercial or purchased UI packs, focus on how the asset separates
three areas:

- **Decorative perimeter**: the outside rim, corners, tabs, sockets, end caps,
  bevels, bolts, gems, wings, and silhouette breaks. This is where most
  ornament belongs.
- **Functional content surface**: the inner surface where runtime text, values,
  icons, child rows, progress bars, or art will be placed. This area should be
  calmer, lower contrast, and less busy.
- **Readable boundary**: the visual transition between the perimeter and
  content surface, usually handled by a bevel, inset shadow, rim highlight,
  color step, material change, or thin separator line.

Commercial-grade foundation assets usually make the separation obvious even
without labels. The viewer should understand where decoration ends and usable
content begins. A common failure mode in generated UI art is to add attractive
ornament across the center lane, which makes the final game UI harder to use.

When generating a foundation asset:

- keep runtime text slots visually empty and readable
- keep content-model slots visually empty, including child icons, badges, count
  bubbles, art crops, and runtime text
- keep child-placement rectangles free of baked child UI
- put high-frequency detail on the outer rim and corners
- use lower-detail material inside content surfaces
- avoid fake labels, unreadable glyphs, row dividers, icons, or buttons inside a
  parent shell unless they are explicitly owned by that asset
- reserve enough internal breathing room around every overlay slot
- keep the frame/content boundary visible at the final pixel size

## Good Screen

A good assembled screen uses generated assets as reusable implementation parts,
not as one flattened illustration.

Required qualities:

- **Clear hierarchy**: primary CTA, navigation, status, panels, and secondary
  actions are visually distinct.
- **Stable layout**: major surfaces do not overlap unless the spec explicitly
  allows it.
- **Readable overlays**: runtime text slots fit sample text without automatic
  shrinking or clipping.
- **Modular reconstruction**: parent frames, row shells, child icons, buttons,
  progress bars, and text overlays stay separate.
- **Locked good work**: stable assets are locked so later regeneration does not
  damage them.
- **Real image pass for key assets**: SVG/wireframe output is acceptable for
  structure checks, but high scores require generated or imported raster assets
  for key visual carriers.

## Reject Criteria

Reject or regenerate an asset when any of these are true:

- It looks like a placeholder vector shape rather than a production game asset.
- It has baked text that should be runtime overlay text.
- The transparent edge is dirty, clipped, or visibly chroma-key contaminated.
- Ornament fills the area reserved for labels or child content.
- The asset cannot be recognized at the target size.
- It changes the intended layout by adding sockets, labels, icons, or child UI
  that belong to separate placements.
- It has unclear material direction or mismatched lighting compared with the
  world preset.

## Prompt Pattern

Use quality criteria as structural constraints, not as style-copy instructions.

Good:

```text
Create a commercial-grade mobile game UI button frame. Keep the center lane
clean for runtime text. Use a readable silhouette, strong edge separation,
polished bevels, controlled ornament density, and clear material highlights.
Avoid placeholder vector shapes, baked text, cluttered center details, and
ambiguous transparent edges.
```

Avoid:

```text
Copy this purchased asset pack's button style exactly.
```

## Composition Quality Checks

`material-spec.compositionGroups` bridges visual asset quality and screen
assembly quality. The renderer exposes a composition quality report, and the
browser UI highlights the selected group on the canvas.

Use these checks for UI asset groups:

- Root/base layers should either share the intended canvas (`same_canvas`) or
  declare how they attach to it.
- Child decorative layers should leave visible breathing room with
  `inside_root` and `minInset`, unless the design intentionally crosses an
  edge.
- Related controls that sit beside a root surface, rather than on top of it,
  should use `sibling` with `minGap`; this checks separation without forcing a
  parent/child containment relationship.
- Edge badges, sockets, gems, and emblems should use `edge_attached` or
  `decorative_overlap` with explicit `allowedOverflow`.
- Real content rows, buttons, and child widgets inside a panel should use
  `childContentPlacementIds` plus `contentInset` or `minChildInset`.
- Protected runtime text/number overlays must render above the grouped layers
  and remain visually quiet enough to read.

The same group context is injected into imagegen job prompts, so a single asset
can be generated with awareness of its sibling layers and protected runtime
slots.

## Reference-Derived Quality Profile

The reference-derived profile is not model training. It is a measured quality
profile built from local reference PNGs. It lets the tool turn "this purchased
asset pack feels commercially made" into checks and prompt constraints without
copying the asset.

Measured signals:

- **Transparent margin**: how much breathing room exists between the visible
  object and the PNG canvas edge.
- **Non-transparent bounds**: the effective visible rectangle inside the export.
- **Edge alpha dirt**: semi-transparent pixels near the canvas edge that can
  composite poorly.
- **Center detail density**: local luminance change inside the likely content
  surface.
- **Perimeter detail density**: local luminance change in the decorative ring.
- **Perimeter/center detail ratio**: a proxy for whether a foundation asset puts
  ornament outside and keeps the content lane calmer.

Use the profile as a guardrail:

- A generated child or icon should usually be inset from its canvas instead of
  filling the entire parent width.
- A foundation asset should not have equal detail density everywhere. Perimeter
  and corners should carry more ornament than the runtime content area.
- A clean alpha export matters more than a visually impressive standalone PNG
  when the asset must layer over a live game screen.
- Aspect ratio should stay close to the target placement so scaling does not
  squeeze bevels, text lanes, or child content margins.

Do not use the profile as a style-copy license. The profile describes spacing,
edge treatment, and structure, not the exact look of the reference pack.

## `qualityProfile`

`world-preset.json` can include a `qualityProfile` object. It provides reusable
quality instructions that are injected into imagegen job prompts.

Recommended shape:

```json
{
  "qualityProfile": {
    "id": "commercial_mobile_ui_v1",
    "targetLevel": "commercial-grade mobile game asset",
    "sourcePolicy": "Use purchased assets only to derive quality criteria, not to imitate specific art.",
    "principles": [
      "Readable silhouette at target size",
      "Clean functional lane for runtime content",
      "Strong edge separation from busy backgrounds"
    ],
    "productionChecks": [
      "Target-size fit with clean alpha",
      "Controlled ornament density",
      "Consistent material and lighting direction"
    ],
    "layoutAnatomy": {
      "foundationAssetTypes": ["panel", "card_frame", "button"],
      "outerDecoration": "Use the outer rim, corners, sockets, and silhouette breaks as the decorative zone.",
      "contentSurface": "Keep runtime text slots and child-placement areas calm, empty, and low-detail.",
      "boundaryTreatment": "Separate decoration and content with a bevel, inset shadow, rim highlight, or material step.",
      "checks": [
        "Decoration frames the usable content area instead of covering it",
        "Do not bake fake labels, rows, icons, or child widgets into reusable base assets"
      ],
      "assetTypeRules": {
        "card_frame": {
          "contentSurface": "Leave a broad readable center area for child rows, art, titles, and runtime copy."
        },
        "button": {
          "contentSurface": "Preserve the center label lane as a clean surface for runtime text."
        }
      },
      "roleRules": {
        "primary_cta": {
          "contentSurface": "The center label slot must stay clear even when the button edge is ornate."
        }
      }
    },
    "promptAdditions": [
      "Use polished bevels, intentional rim highlights, and production-ready padding."
    ],
    "referenceDerived": {
      "schema": "game-screen-foundry.reference-quality-profile.compact.v1",
      "sourceSummary": {
        "analyzed": 500,
        "categories": ["ui-button", "ui-panel", "ui-icon"]
      },
      "thresholds": {
        "transparentMarginMinRatio": { "warnBelow": 0.01 },
        "edgeAlphaDirtyRatio": { "warnAbove": 0.04 },
        "perimeterToCenterDetailRatio": { "warnBelowFoundation": 1.1 }
      },
      "promptGuidance": {
        "global": [
          "Keep alpha edges clean and leave measured breathing room around isolated UI assets.",
          "For shell/base assets, separate decorated perimeter from a calmer content surface."
        ],
        "byCategory": {
          "ui-button": [
            "Preserve a readable center lane and push stronger detail toward the rim."
          ]
        }
      }
    },
    "avoid": [
      "copied purchased asset pack style",
      "placeholder vector geometry",
      "baked runtime text",
      "dirty transparent edges"
    ],
    "assetTypeChecks": {
      "button": [
        "Preserve a clear center text lane",
        "Make the pressable silhouette obvious"
      ],
      "icon": [
        "Keep the icon readable at 64px",
        "Use a simple high-contrast interior symbol"
      ]
    },
    "roleChecks": {
      "primary_cta": [
        "Highest call-to-action contrast among buttons",
        "Readable text lane remains empty"
      ]
    }
  }
}
```
