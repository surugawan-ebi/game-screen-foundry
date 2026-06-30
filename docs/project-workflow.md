# Project Workflow

このベータは、ツール本体とゲーム側の成果物を分離して使う。

- ツール本体: ゲームリポジトリ内に clone / submodule / subtree として置く。
- 正本データ: ゲームリポジトリ側の `creative/` 配下に置く。
- 画面単位: `screen-kv.json`、`material-spec.json`、`world-preset.json`、`generated-assets/` を1セットとして管理する。
- 生成作業: ブラウザで仕様を読み、Codex 対話で PNG を作り、画面フォルダの `generated-assets/` に戻す。

## Recommended Layout

```text
game-repo/
  tools/
    game-creative-generation-tool/
      beta/
        public/
        server.js
        package.json

  creative/
    game-creative-project.json
    .game-creative-generation/
      imagegen-jobs/
      imagegen-status/
    screens/
      home/
        screen-kv.json
        material-spec.json
        world-preset.json
        key-visual.png
        generated-assets/
          bg_home.png
          btn_start.png
        imagegen-assets.json
        notes.md
      shop/
        screen-kv.json
        material-spec.json
        world-preset.json
        key-visual.png
        generated-assets/
        imagegen-assets.json
```

## Project CLI

新規導入では、テンプレートを手でコピーする代わりに CLI を使える。

```sh
npm run init-project -- /path/to/game-repo/creative \
  --project-id sky_port_atlas \
  --project-name "星港アトラス" \
  --screen-id home \
  --screen-name HOME

npm run add-screen -- /path/to/game-repo/creative shop --screen-name SHOP
npm run validate:project -- /path/to/game-repo/creative shop
```

`init-project` は `creative/` 一式を作り、`add-screen` は manifest と
`screens/<screenId>/` を追加する。`validate:project` は外部プロジェクトでも
読み込み、レンダリング、composition quality を確認する。

## Project Manifest

`creative/game-creative-project.json` は、複数画面の索引として使う。

```json
{
  "projectId": "sky_port_atlas",
  "projectName": "星港アトラス",
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

読み込み欄には次を指定する。

```text
/path/to/game-repo/creative
/path/to/game-repo/creative#home
/path/to/game-repo/creative#shop
/path/to/game-repo/creative/screens/home
```

- `creative` だけを指定した場合は `defaultScreenId` を読む。
- `creative#screenId` を指定した場合は、その画面を読む。
- 画面フォルダを直接指定した場合は manifest を使わず、その画面だけを読む。
- `creative` を読み込むと、ブラウザの画面セレクトから manifest 内の別画面へ切り替えられる。

## Screen Folder Contract

各画面フォルダは、単体で画面を再現できる必要がある。

必須:

- `screen-kv.json`: 画面ID、画面名、キャンバスサイズ、画面ロール、基準解像度。
- `material-spec.json`: 素材一覧、配置、重なり順、runtime text overlay、レイアウト安全ルール。
- `world-preset.json`: 世界観、画風、色、素材感、KV参照、imagegen workflow。

任意:

- `key-visual.png`: 完成画面KV。背景画ではなく UI 配置込みの参照画像。
- `imagegen-assets.json`: 生成済み素材の明示登録。
- `generated-assets/`: 生成済み PNG の置き場。
- `bundle.json`: 上記3JSONを1ファイルにまとめた互換形式。

## Generated Asset Registry

素材の採用元は `worldPreset.imagegenAssets` または `imagegen-assets.json` に登録する。

```json
{
  "assets": [
    {
      "assetId": "btn_start_sortie",
      "path": "generated-assets/btn_start_sortie.png",
      "backend": "codex_cli_imagegen",
      "usesImagegen": true,
      "prompt": "採用時の生成指示や要点"
    }
  ]
}
```

`imagegen-assets.json` がない場合でも、`generated-assets/<assetId>.png` または `generated-assets/**/<assetId>.png` が存在すれば読み込み時に自動登録する。basename が `material-spec.json` の `assetId` と一致する PNG / JPG / WebP が対象。

## Default Output Paths

外部プロジェクトから読み込んだ場合、未指定の生成先は自動補正される。

- `worldPreset.imagegenWorkflow.outputDir`: 読み込んだ画面フォルダの `generated-assets/`
- `worldPreset.imagegenWorkflow.jobDir`: プロジェクトルートの `.game-creative-generation/imagegen-jobs/`
- imagegen status sidecar: `worldPreset.imagegenWorkflow.jobDir` の sibling にある `.game-creative-generation/imagegen-status/`

これにより、生成ジョブやPNGがツール本体の `examples/` に混ざらない。

既存の `outputDir` が相対パスの場合は画面フォルダ基準で解決する。既存の `jobDir` が相対パスの場合は、manifest 経由の読み込みでは project root 基準、画面フォルダを直接読む場合は画面フォルダ基準で解決する。

## Reference-Derived Quality Profile

購入済み素材や参照用UI素材から学習済みモデルを作るのではなく、まずは定量的な `reference-derived quality profile` を作る。

- 参照フォルダはローカルで読むだけ。購入素材そのものはこの repo や外部プロジェクトへコピーしない。
- `asset.md` の `category` がある場合は `ui-button`, `ui-panel`, `ui-icon` などでカテゴリ別に集計する。
- `asset.md` がないフォルダでは、ファイル名から UI カテゴリを推定して集計する。
- 測る対象は PNG の透明余白、非透明 bounds、alpha edge、中央/外周の detail density。
- ブラウザの `参照品質プロファイル` で compact profile を `worldPreset.qualityProfile.referenceDerived` に反映できる。
- imagegen job prompt は `referenceDerived` からカテゴリ別の余白、エッジ、外周/中央分離のガイダンスを受け取る。
- 生成済みPNG監査は、不足している透明余白、汚いalpha edge、中心が忙しすぎる foundation asset、配置比率ズレを warning として出す。

CLI:

```sh
npm run profile:reference -- /path/to/assets/purchased/organized --out /path/to/reference-quality-profile.json --max-files 500
```

公開用にコミットしてよいのは compact profile などの品質基準だけ。参照元の絶対パス、購入素材、抽出画像はコミットしない。

## Multi-Screen Production Flow

1. `creative/game-creative-project.json` に画面を追加する。
2. `creative/screens/<screenId>/` を作り、3つの正本JSONと `key-visual.png` を置く。
3. ブラウザで `creative` を読み込み、画面セレクトから対象 screen を選ぶ。
4. 初期表示の生成済み画面と `仮組み確認` を切り替え、仕様の粒度を確認する。
5. `AI で画面レビュー` と人間のコメントで、修正対象素材を再生成キューに溜める。
6. `Codex依頼文を作成` で対話用プロンプトを作る。
7. Codex / imagegen で PNG を生成し、同じ画面フォルダの `generated-assets/` に保存する。
8. 生成できない素材は、偽PNGではなく `<assetId>.blocked.json` などの blocker sidecar に理由を書く。
9. `生成済みPNGを再取り込み` で採用し、ブラウザで画面を再確認する。
10. 参照品質プロファイルがある場合は `生成PNG監査` を実行し、余白、エッジ、外周/中央分離の warning を確認する。
11. `実装レポート作成` で layer order、runtime overlay、採用PNG、composition quality をまとめる。
12. 採用したPNG、`imagegen-assets.json`、実装レポートをゲームリポジトリ側で確認・コミットする。
13. 次の画面に移る。共通素材はコピーではなく、後続で shared asset registry として切り出す。

## Responsibility Rules

- ツール本体は正本を持たない。`examples/` はデモだけ。
- 画面フォルダは単体で再現可能にする。
- 画面間の共通化は、最初から抽象化しすぎない。2画面以上で同じ素材が必要になってから shared 化する。
- `material-spec.json` は素材の責務を曖昧にしない。親枠、ヘッダー、行、アイコン、runtime text は別レイヤーとして明示する。
- `generated-assets/` は最終候補だけを置く。没案や履歴は必要になってから `history/` に分ける。
- imagegen が失敗したときは placeholder PNG を採用しない。`status=blocked` の JSON sidecar で理由を残す。
- 外部ゲーム repo の `.gitignore` では `creative/.game-creative-generation/` を除外する。採用済みの `generated-assets/` はゲーム実装で使うならコミット対象にする。
- `commandHint` に出る絶対パスは実行環境の clone 先なので、別PCや README へ転記するときは読み替える。
