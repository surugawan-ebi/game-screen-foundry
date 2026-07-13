# Review And Regeneration

Use this when reviewing a generated screen, translating feedback into asset changes, or building Codex/imagegen regeneration requests.

## Review Priority

Review from screen-level hierarchy down to individual assets:

1. Background and large framing surfaces.
2. Primary CTA and navigation.
3. Major panels and repeated row/card shells.
4. Icons, badges, progress bars, and small accents.
5. Runtime text overlays and slot readability.

When `material-spec.json` has `compositionGroups`, review the grouped
composition as the quality unit before judging the individual layer PNGs. A
layered button or CTA card can only pass when the composed group preserves its
protected overlay slots and each layer keeps its own responsibility.
For groups with `childContentPlacementIds`, also verify that child content stays
inside the declared `contentInset`/`minChildInset`; full-width child content
touching the parent frame is usually a quality failure unless it is an explicit
decorative overhang modeled as a visual layer.

## Commercial Quality Bar

Use purchased or licensed assets only to infer quality criteria, never to copy a
specific pack. A commercial-grade asset should have:

- readable silhouette at target size
- clean functional lane for runtime text or child content
- strong edge separation from busy backgrounds
- controlled ornament density
- clear material and lighting direction
- clean alpha boundary and implementation-ready padding
- no accidental runtime text baked into PNGs

For foundation assets such as panels, card frames, button bases, nav rails, and
chips, also check the anatomy:

- decoration belongs on the outer rim, corners, sockets, tabs, or silhouette
  breaks
- content-model slots, runtime text slots, and child-placement zones stay
  visually quiet and empty until their separate child/runtime content is added
- the boundary between frame decoration and usable content is readable through
  bevel, shadow, highlight, color step, or material transition
- parent shells do not bake fake rows, labels, child icons, buttons, or progress
  bars that belong to separate placements

Read `docs/quality-rubric.md` when the task is about defining, checking, or
prompting for "good" assets.

## Feedback Scope

Keep visual feedback scoped to an asset unless the user explicitly asks for layout changes.

Good asset feedback:

- "Increase contrast and readability for the primary CTA frame."
- "Make this panel shell closer to the brass-and-blue KV style, but keep the text lane empty."
- "Reduce ornament density on the mission row shell."

Avoid vague full-screen redraw feedback:

- "Make the whole screen better."
- "Regenerate everything."

## Regeneration Queue Rules

- Queue only assets that need changes.
- Keep locked assets untouched.
- Preserve placement coordinates, z-index, parent-child relationships, and text slots.
- For transparent assets, preserve transparency or the agreed chroma-key policy.
- Do not bake runtime overlay text into PNGs.
- For `baked_in_asset`, only bake the explicitly listed baked text blocks.

## Codex/Imagegen Request Shape

A useful request uses the same structured `generationContract` as initial generation. It should include:

- screen id, screen name, canvas size
- world preset and reference image paths
- target asset ids
- current image path, if any
- required output path
- required pixel size
- transparency policy
- placement context and child placements
- related text overlays
- protected slot / child-zone anatomy for foundation assets
- user comment and AI review comment
- operation (`generate` or `edit`), input-image roles, `change`, and `preserve`
- deterministic postprocess policy and acceptance checks
- explicit "do not change layout" instruction

The app can generate this markdown through `/api/build-regeneration-request`; prefer using that endpoint or the UI button rather than hand-writing a request from scratch.

## Adoption Check

After PNGs are generated:

1. Inspect the isolated generated asset and make at most one targeted retry for a visible invariant failure.
2. Save each image to the requested `generated-assets/<assetId>.png` path.
3. Use `生成済みPNGを再取り込み`. The app removes a detected green chroma key, normalizes size, and rejects invalid alpha or residue before adoption.
4. Run `生成後を表示`.
5. Review major overlaps and runtime text lanes.
6. Run `npm run release:check` before committing repository changes.
