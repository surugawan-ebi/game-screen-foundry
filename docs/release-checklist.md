# Release Checklist

Use this checklist before tagging or announcing a public beta release.

## Required Checks

```sh
npm run release:check
```

This runs JavaScript syntax checks, JSON/project validation, the full test suite,
skill validation, local path scanning, and tracked imagegen output checks.
Project validation includes `compositionGroups` reference checks for placement,
overlay, child group, output asset, child-content inset, and runtime overlay
z-order consistency.

## Repository Hygiene

- Confirm `git status --short` contains only intentional changes.
- Confirm `imagegen-jobs/` has only `.gitkeep` as a tracked file.
- Confirm generated job files remain ignored by Git.
- Confirm `.env` files and external project workspaces are not tracked.

## Fresh Clone Smoke Test

- Clone the repository into a clean directory.
- Run `npm test`.
- Run `npm run dev`.
- Open `http://127.0.0.1:4311`.
- Confirm the bundled demo loads automatically.
- Confirm generated PNG previews are visible.
- Load `templates/blank-project/creative` through the folder input.
- Confirm the blank template renders a draft screen.

## Documentation

- Confirm [README.md](../README.md) describes the current workflow in Japanese
  and English.
- Confirm [docs/schema.md](schema.md) matches the loader behavior.
- Confirm [TODO.md](../TODO.md) separates remaining roadmap items from completed
  handoff cleanup.

## Release Boundary

- Do not present this as a general AI image generator.
- Do not promise hosted or fully automated image generation.
- Do not treat bundled demo assets as a reusable production asset pack.
- Tag beta releases only after the schema changes for that release are
  documented.
