# Game Screen Foundry

Spec-driven workbench for generating, assembling, and reviewing game screen assets.

Game Screen Foundry is a local browser tool for game developers who want to turn a screen KV and a material specification into reusable in-game UI assets. It is not a marketing image generator. The core workflow is:

```text
screen KV + material spec
  -> generated asset PNGs
  -> assembled game screen preview
  -> review / comments
  -> regeneration queue
  -> re-import generated PNGs
```

The project is currently beta-quality. It is useful for validating a production loop, but the schema and UI are still expected to change.

## What It Does

- Loads a screen KV, material spec, and world preset.
- Assembles the screen from separate layers such as panels, buttons, icons, backgrounds, badges, runtime text, and overlays.
- Shows the generated PNG version by default, with a toggle for structural wireframe-style preview.
- Tracks per-asset comments and regeneration queues.
- Builds Codex/imagegen-ready prompts for selected assets.
- Re-imports generated PNGs from a project folder.
- Supports multi-screen projects through a `game-creative-project.json` manifest.

## What It Is Not

- It is not a general-purpose image generator.
- It is not a store screenshot or marketing banner tool.
- It does not run a hosted service. The app is local-first and reads files from local project folders.
- It does not require Codex/imagegen for basic preview. You can place PNGs manually in `generated-assets/`.

## Quick Start

```sh
git clone https://github.com/surugawan-ebi/game-screen-foundry.git
cd game-screen-foundry
npm test
npm run dev
```

Open:

```text
http://127.0.0.1:4311
```

The bundled demo loads automatically.

## External Project Layout

For real use, keep this tool separate from your game assets. A recommended layout is:

```text
game-repo/
  tools/
    game-screen-foundry/

  creative/
    game-creative-project.json
    .game-creative-generation/
      imagegen-jobs/
    screens/
      home/
        screen-kv.json
        material-spec.json
        world-preset.json
        key-visual.png
        generated-assets/
        imagegen-assets.json
      shop/
        screen-kv.json
        material-spec.json
        world-preset.json
        key-visual.png
        generated-assets/
        imagegen-assets.json
```

Load a project folder from the browser input:

```text
/path/to/game-repo/creative
/path/to/game-repo/creative#home
/path/to/game-repo/creative#shop
/path/to/game-repo/creative/screens/home
```

- `creative` loads the manifest default screen.
- `creative#screenId` loads a specific screen from the manifest.
- A direct screen folder loads that screen without using a manifest.

See [docs/project-workflow.md](docs/project-workflow.md) for the full operational model.

## Project Manifest

```json
{
  "projectId": "sample_game",
  "projectName": "Sample Game",
  "defaultScreenId": "home",
  "screens": [
    {
      "screenId": "home",
      "name": "HOME",
      "path": "screens/home"
    },
    {
      "screenId": "shop",
      "name": "SHOP",
      "path": "screens/shop"
    }
  ]
}
```

## Screen Folder Contract

Required files:

- `screen-kv.json`: screen identity, size, role, and high-level intent.
- `material-spec.json`: assets, placements, z-order, runtime text overlays, and layout safety rules.
- `world-preset.json`: style direction, palette, reference images, and imagegen workflow.

Optional files:

- `key-visual.png`: finished screen KV used as visual reference.
- `imagegen-assets.json`: explicit generated PNG registry.
- `generated-assets/`: generated PNG output folder.
- `bundle.json`: compatibility format that combines the three required JSON files.

If `imagegen-assets.json` is not present, files named `generated-assets/<assetId>.png` are auto-registered when loading a screen folder.

## Imagegen Workflow

The recommended beta workflow is intentionally conversational:

1. Load a screen folder.
2. Review the generated screen preview.
3. Add comments to specific assets.
4. Add those assets to the regeneration queue.
5. Build the Codex request text.
6. Generate PNGs through Codex/imagegen or another tool.
7. Save the PNGs to the screen folder's `generated-assets/`.
8. Click `生成済みPNGを再取り込み`.

Environment variables:

- `BETA_AI_MODE=auto|codex|heuristic|mock`
- `BETA_CODEX_BIN=/path/to/codex`
- `BETA_IMAGEGEN_MODE=off|mock|codex|command`
- `BETA_IMAGEGEN_AUTORUN=1`
- `BETA_IMAGEGEN_RUNNER='your-command'`
- `BETA_IMAGEGEN_TIMEOUT_MS=120000`
- `PORT=4311`

By default, imagegen execution is off. The app creates job files and prompt text, then expects you to generate PNGs externally.

## Local File Safety

The browser UI can show local images through the local server. For safety, `/api/source-file` only serves images from:

- this repository folder
- folders explicitly loaded through `フォルダから読み込む`
- folders containing manually imported asset PNGs

This keeps arbitrary local files from being exposed through the preview server.

## Demo Assets

The included `examples/` are demo fixtures for validating the workflow. They are not a production game asset pack. Replace them with your own screen folders for real projects.

## Roadmap

See [TODO.md](TODO.md) for the public beta handoff notes, near-term cleanup tasks, and roadmap.

## Tests

```sh
npm test
```

The test suite covers:

- render model generation
- screen assembly rules
- runtime text slot safety
- overlap constraints
- folder loading
- multi-screen manifest loading
- generated PNG adoption
- regeneration request generation

## License

Code is released under the MIT License. See [LICENSE](LICENSE).

The bundled `examples/` are included as demo fixtures for testing and explaining the workflow. They should be treated as sample project data, not as a reusable game asset pack.
