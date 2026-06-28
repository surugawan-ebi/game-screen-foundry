# Game Screen Foundry

ゲーム画面アセットを、仕様から生成・組み立て・レビューするためのローカルワークベンチです。  
Spec-driven local workbench for generating, assembling, and reviewing game screen assets.

Game Screen Foundry は、ゲーム開発者が `screen KV + 素材仕様書` から、ゲーム内で再利用しやすい UI / 2D アセットを作るためのローカルブラウザツールです。販促画像ジェネレーターではありません。

Game Screen Foundry is a local browser tool for game developers who want to turn a screen KV and a material specification into reusable in-game UI assets. It is not a marketing image generator.

```text
screen KV + material spec
  -> generated asset PNGs
  -> assembled game screen preview
  -> review / comments
  -> regeneration queue
  -> re-import generated PNGs
```

現在は public beta 品質です。制作ループの検証には使えますが、schema と UI は今後も変わる前提です。  
The project is currently beta-quality. It is useful for validating a production loop, but the schema and UI are still expected to change.

## できること / What It Does

- 画面 KV、素材仕様書、世界観プリセットを読み込みます。  
  Loads a screen KV, material spec, and world preset.
- パネル、ボタン、アイコン、背景、バッジ、runtime text、overlay などをレイヤーとして組み立てます。  
  Assembles the screen from separate layers such as panels, buttons, icons, backgrounds, badges, runtime text, and overlays.
- 生成済み PNG 版を表示し、構造確認用の wireframe preview も確認できます。  
  Shows the generated PNG version, with a structural wireframe-style preview for layout checks.
- エディタ内JSON、レンダリング可能性、composition quality をブラウザ内でチェックできます。  
  Checks editor JSON, renderability, and composition quality in the browser.
- placement と composition inset をフォームで編集し、JSON と仮組みプレビューへ反映できます。
  Edits placements and composition insets through structured controls, then syncs JSON and draft preview.
- 素材ごとのコメント、固定、履歴、再生成キューを扱います。  
  Tracks per-asset comments, locks, history, and regeneration queues.
- 選択した素材の Codex/imagegen 向け依頼文を作ります。  
  Builds Codex/imagegen-ready prompts for selected assets.
- 生成済み PNG を画面フォルダから再取り込みします。  
  Re-imports generated PNGs from a project folder.
- layer order、runtime overlay、採用PNG、composition quality を実装レポートとして出力します。  
  Exports an implementation handoff report with layer order, runtime overlays, adopted PNGs, and composition quality.
- `game-creative-project.json` による複数画面プロジェクトを扱えます。  
  Supports multi-screen projects through a `game-creative-project.json` manifest.

## できないこと / What It Is Not

- 汎用画像生成ツールではありません。  
  It is not a general-purpose image generator.
- ストアスクリーンショットやマーケティングバナー用のツールではありません。  
  It is not a store screenshot or marketing banner tool.
- ホスト型サービスではありません。ローカルで動き、ローカルのプロジェクトフォルダを読みます。  
  It does not run a hosted service. The app is local-first and reads files from local project folders.
- 基本プレビューに Codex/imagegen は必須ではありません。PNG を `generated-assets/` に手で置く運用もできます。  
  It does not require Codex/imagegen for basic preview. You can place PNGs manually in `generated-assets/`.

## クイックスタート / Quick Start

前提: Node.js 20 以上。  
Prerequisite: Node.js 20 or newer.

```sh
git clone https://github.com/surugawan-ebi/game-screen-foundry.git
cd game-screen-foundry
npm test
npm run dev
```

ブラウザで開きます。  
Open:

```text
http://127.0.0.1:4311
```

起動すると同梱デモが自動で読み込まれます。  
The bundled demo loads automatically.

## プロジェクト作成CLI / Project CLI

外部ゲームリポジトリへ導入する場合は、blank template を手でコピーする代わりに CLI を使えます。
For external game repositories, use the CLI instead of copying the blank template manually.

```sh
npm run init-project -- /path/to/game-repo/creative \
  --project-id sky_port_atlas \
  --project-name "Sky Port Atlas" \
  --screen-id home \
  --screen-name HOME

npm run add-screen -- /path/to/game-repo/creative shop --screen-name SHOP

npm run validate:project -- /path/to/game-repo/creative shop
```

- `init-project` は読み込み可能な `creative/` 一式を作ります。
  `init-project` creates a loadable `creative/` project.
- `add-screen` は既存 project manifest に画面を追加します。
  `add-screen` adds a screen to an existing project manifest.
- `validate:project` は任意の project / screen folder を読み込み、renderability と composition quality を確認します。
  `validate:project` checks renderability and composition quality for any project or screen folder.

## 外部プロジェクト構成 / External Project Layout

実運用では、このツール本体とゲーム側の成果物を分けて管理する想定です。  
For real use, keep this tool separate from your game assets.

推奨構成:  
Recommended layout:

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

ブラウザのフォルダ入力には次の形式を指定できます。  
Load a project folder from the browser input:

```text
/path/to/game-repo/creative
/path/to/game-repo/creative#home
/path/to/game-repo/creative#shop
/path/to/game-repo/creative/screens/home
```

- `creative` だけなら manifest の default screen を読みます。  
  `creative` loads the manifest default screen.
- `creative#screenId` なら、その screen を読みます。  
  `creative#screenId` loads a specific screen from the manifest.
- `creative` 読み込み後は、ブラウザの画面セレクトから manifest 内の screen を切り替えられます。  
  After loading `creative`, use the browser screen selector to switch screens from the manifest.
- 画面フォルダを直接指定すると、manifest を使わずその画面を読みます。  
  A direct screen folder loads that screen without using a manifest.

詳しい運用モデルは [docs/project-workflow.md](docs/project-workflow.md) を参照してください。  
See [docs/project-workflow.md](docs/project-workflow.md) for the full operational model.

ファイル契約の短い説明は [docs/schema.md](docs/schema.md) にあります。  
For the concise file contract, see [docs/schema.md](docs/schema.md).

フォーマットチェックは `npm run validate` で実行できます。`compositionGroups` の placement / overlay 参照整合性、`layerFitRules`、子要素が `contentInset` 内に収まるかを確認します。  
Run `npm run validate` for format checks, including `compositionGroups` placement/overlay references, `layerFitRules`, and child-content inset validation.

販売素材レベルの品質基準は [docs/quality-rubric.md](docs/quality-rubric.md) にあります。  
The commercial-grade asset quality rubric is documented in [docs/quality-rubric.md](docs/quality-rubric.md).

## プロジェクト Manifest / Project Manifest

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

JSON Schema は [schemas/project-manifest.schema.json](schemas/project-manifest.schema.json) にあります。  
The JSON Schema is available at [schemas/project-manifest.schema.json](schemas/project-manifest.schema.json).

## 画面フォルダ契約 / Screen Folder Contract

必須ファイル:  
Required files:

- `screen-kv.json`: 画面 ID、画面名、画面ロール、キャンバスサイズなど。  
  Screen identity, size, role, and high-level intent.
- `material-spec.json`: 素材一覧、配置、重なり順、構成グループ、runtime text overlay、レイアウト安全ルール。  
  Assets, placements, z-order, composition groups, runtime text overlays, and layout safety rules.
- `world-preset.json`: 世界観、画風、色、参照画像、imagegen workflow。  
  Style direction, palette, reference images, and imagegen workflow.

任意ファイル:  
Optional files:

- `key-visual.png`: 完成画面 KV。背景画ではなく UI 配置込みの参照画像。  
  Finished screen KV used as visual reference.
- `imagegen-assets.json`: 生成済み PNG の明示登録。  
  Explicit generated PNG registry.
- `generated-assets/`: 生成済み PNG の置き場。  
  Generated PNG output folder.
- `bundle.json`: 必須 3 JSON をまとめた互換形式。  
  Compatibility format that combines the three required JSON files.

`imagegen-assets.json` がない場合でも、`generated-assets/<assetId>.png` が存在すれば読み込み時に自動登録します。  
If `imagegen-assets.json` is not present, files named `generated-assets/<assetId>.png` are auto-registered when loading a screen folder.

## 空プロジェクトテンプレート / Blank Project Template

最小構成の読み込み可能なテンプレートを [templates/blank-project](templates/blank-project) に置いています。`creative/` フォルダをゲームリポジトリへコピーして、画面 JSON と生成済み PNG を差し替えてください。

A minimal loadable project template is available at [templates/blank-project](templates/blank-project). Copy its `creative/` folder into a game repository, then replace the sample screen JSON and generated PNGs with project-specific data.

## Imagegen ワークフロー / Imagegen Workflow

推奨 beta workflow は、あえて対話型にしています。  
The recommended beta workflow is intentionally conversational:

1. 画面フォルダを読み込む。  
   Load a screen folder.
2. 生成後プレビューを確認する。  
   Review the generated screen preview.
3. 素材ごとにコメントを書く。  
   Add comments to specific assets.
4. 対象素材を再生成キューへ追加する。  
   Add those assets to the regeneration queue.
5. Codex 依頼文を作る。  
   Build the Codex request text.
6. Codex/imagegen または別ツールで PNG を生成する。  
   Generate PNGs through Codex/imagegen or another tool.
7. PNG を画面フォルダの `generated-assets/` に保存する。  
   Save the PNGs to the screen folder's `generated-assets/`.
8. `生成済みPNGを再取り込み` を押す。  
   Click `生成済みPNGを再取り込み`.

環境変数:  
Environment variables:

- `BETA_AI_MODE=auto|codex|heuristic|mock`
- `BETA_CODEX_BIN=/path/to/codex`
- `BETA_IMAGEGEN_MODE=off|mock|codex|command`
- `BETA_IMAGEGEN_AUTORUN=1`
- `BETA_IMAGEGEN_RUNNER='your-command'`
- `BETA_IMAGEGEN_TIMEOUT_MS=120000`
- `PORT=4311`

デフォルトでは imagegen 実行は off です。アプリは job file と prompt text を作り、画像生成自体は外部で行う想定です。  
By default, imagegen execution is off. The app creates job files and prompt text, then expects you to generate PNGs externally.

## ローカルファイル安全性 / Local File Safety

ブラウザ UI はローカルサーバー経由で画像を表示します。安全のため、`/api/source-file` が配信する画像は次に限定しています。  
The browser UI can show local images through the local server. For safety, `/api/source-file` only serves images from:

- このリポジトリフォルダ。  
  This repository folder.
- `フォルダから読み込む` で明示的に読み込んだフォルダ。  
  Folders explicitly loaded through `フォルダから読み込む`.
- 手動採用した asset PNG があるフォルダ。  
  Folders containing manually imported asset PNGs.

これにより、任意のローカルファイルが preview server から見えることを防ぎます。  
This keeps arbitrary local files from being exposed through the preview server.

## デモ素材 / Demo Assets

同梱の `examples/` は workflow 検証用の demo fixture です。本番ゲーム用アセットパックではありません。実プロジェクトでは自分の screen folder に差し替えてください。

The included `examples/` are demo fixtures for validating the workflow. They are not a production game asset pack. Replace them with your own screen folders for real projects.

## Roadmap / TODO

公開 beta の引き継ぎメモ、短期 cleanup、roadmap は [TODO.md](TODO.md) にあります。  
See [TODO.md](TODO.md) for the public beta handoff notes, near-term cleanup tasks, and roadmap.

公開前チェックリストは [docs/release-checklist.md](docs/release-checklist.md) にあります。  
The release checklist is available at [docs/release-checklist.md](docs/release-checklist.md).

開発参加の基本ルールは [CONTRIBUTING.md](CONTRIBUTING.md)、ローカルファイル安全性の方針は [SECURITY.md](SECURITY.md) を参照してください。  
See [CONTRIBUTING.md](CONTRIBUTING.md) for contribution guidelines and [SECURITY.md](SECURITY.md) for the local file safety policy.

## AI 導入 / AI Adoption

Codex 向け skill を [skills/game-screen-foundry](skills/game-screen-foundry) に同梱しています。別環境で使う場合は、このフォルダを `$CODEX_HOME/skills` または `~/.codex/skills` にコピーしてください。  
A Codex skill is bundled at [skills/game-screen-foundry](skills/game-screen-foundry). To use it in another environment, copy that folder into `$CODEX_HOME/skills` or `~/.codex/skills`.

この repo から直接インストールする場合:  
To install it directly from this repository:

```sh
npm run skill:install
```

この skill は、画面フォルダ作成、素材仕様編集、再生成レビュー、release check の手順を AI に渡すための最小ガイドです。  
The skill gives AI agents the minimum workflow guidance for screen folder creation, material spec edits, regeneration review, and release checks.

## テスト / Tests

```sh
npm test
```

公開前のまとめチェック:  
Full pre-release check:

```sh
npm run release:check
```

GitHub Actions でも Node 20.x / 22.x で `npm run release:check` を実行します。  
GitHub Actions also runs `npm run release:check` on Node 20.x / 22.x.

テスト対象:  
The test suite covers:

- render model generation
- screen assembly rules
- runtime text slot safety
- overlap constraints
- folder loading
- multi-screen manifest loading
- generated PNG adoption
- regeneration request generation
- source file allow/deny behavior
- blank project template loading
- portable relative imagegen asset paths

追加の check script:  
Additional check scripts:

- `npm run lint`: JavaScript syntax check.
- `npm run validate`: JSON parse and loadable project validation.
- `npm run check`: lint, validation, and tests.
- `npm run release:check`: full release gate, including local path and tracked imagegen output checks.

## ライセンス / License

コードは MIT License です。[LICENSE](LICENSE) を参照してください。  
Code is released under the MIT License. See [LICENSE](LICENSE).

同梱の `examples/` は、workflow の説明とテストのための demo fixture として含めています。再利用可能なゲームアセットパックとして扱わないでください。

The bundled `examples/` are included as demo fixtures for testing and explaining the workflow. They should be treated as sample project data, not as a reusable game asset pack.
