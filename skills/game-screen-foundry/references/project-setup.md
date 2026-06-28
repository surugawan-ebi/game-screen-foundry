# Project Setup

Use this when creating a new Game Screen Foundry project, adding a new screen, or helping another AI agent introduce the tool into a game repository.

## Recommended External Layout

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
```

## Fastest Safe Path

1. Copy `templates/blank-project/creative` into the target game repository.
2. Rename `projectId`, `projectName`, and screen ids.
3. Add or edit screens under `creative/screens/<screenId>/`.
4. Keep generated PNGs under each screen folder's `generated-assets/`.
5. Keep job files under `creative/.game-creative-generation/imagegen-jobs/`.
6. Load either `creative`, `creative#screenId`, or a direct screen folder in the browser UI.

## Manifest Rules

`game-creative-project.json` points to screen folders:

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
    }
  ]
}
```

Prefer `screens[].path`. The loader also accepts `folderPath` and `dir` for compatibility.

## Path Rules

- In `imagegen-assets.json`, relative paths resolve from the file's folder.
- In inline `world-preset.json.imagegenAssets`, relative paths resolve from the loaded screen folder when the file exists there.
- Avoid committed absolute paths.
- Prefer `generated-assets/<assetId>.png`.

## Handoff Check

After creating or editing a project template in this repository, run:

```sh
npm run release:check
```

