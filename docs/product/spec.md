---
title: ゲーム用クリエイティブ生成ツール MVP Spec
updated: 2026-06-19
summary: UIボタン、アイコン、カード枠に絞った MVP の対象範囲、素材仕様書の入力契約、生成フロー、世界観プリセット、書き出し方針、差別化ポイント、画面構成、最小データ構造
---

# ゲーム用クリエイティブ生成ツール MVP Spec

## 1. Product Positioning

このツールは販促画像ジェネレーターではない。  
主語は **ゲーム制作中に使う 2D アセット量産ツール** であり、プロトタイプから本番手前までの「大量の小物アセット不足」を埋める。

MVP の目的は 3 つに絞る。

1. 同一世界観で小物アセットを揃えられるか
2. 1 回の指定から実用的な差分をまとめて量産できるか
3. 生成結果をそのままゲーム実装へ流し込めるか

## 2. MVP で最初に絞るアセット種別

MVP は以下の 3 種だけを対象にする。

1. UIボタン / 小型パネル
2. アイコン
3. カード枠 / スロット枠

この 3 種を選ぶ理由は以下。

- ゲーム内で使用頻度が高い
- 1 枚絵よりも状態差分とサイズ差分の需要が大きい
- 透過、余白制御、9-slice、量産テンプレートの価値が出やすい
- 2D ラスタ中心でも MVP を成立させやすい

逆に MVP では以下を削る。

- 背景全景
- 複雑なタイルセット自動生成
- 敵立ち絵や大型オブジェクト
- フレーム単位のアニメーション
- 3D モデル

ただし、**背景全景はプロダクトとして明確にやりたい対象** として別扱いにする。  
背景全景は需要が大きい一方で、UI 系とは要求がかなり違う。  
そのため、MVP の成否判定には混ぜず、Phase 2 の主要拡張として仕様を先に固定しておく。

## 3. 想定ユーザーと刺さる工程

主な対象ユーザーは以下。

- 個人ゲーム開発者
- 2 人から 5 人程度のインディーチーム
- プロトタイプ段階で仮アセットを大量に必要とする開発者

特に刺さる工程は以下。

1. 画面実装前後に UI の見た目を早く揃えたい時
2. 仮アイコンを大量に置きたい時
3. カードゲームやインベントリで枠差分をまとめて作りたい時
4. 既存アセットに寄せた差分を増やしたい時

## 4. 初期に与えられる入力

このツールが最初に受け取る入力は 2 種だけに絞る。

1. 画面単位の KV
2. 素材の仕様書

重要なのは、**素材の仕様書だけで画面を再現できること** である。  
つまり仕様書には、単に「どんな素材が欲しいか」だけではなく、**どの画面サイズのどこに、どのサイズの素材を、どの順番で重ねるか** まで入っていなければならない。

### 4.1 画面単位の KV

画面単位の KV は、その画面の前提条件を短く固定するメタ情報である。

最低限持たせる項目は以下。

- `screen_id`
- `screen_name`
- `screen_role`
- `canvas_width`
- `canvas_height`
- `base_resolution`
- `world_preset_id`
- `ui_density`
- `safe_areas`
- `state_variant_keys`

例:

```json
{
  "screen_id": "battle_reward",
  "screen_name": "Battle Reward",
  "screen_role": "reward_modal",
  "canvas_width": 1920,
  "canvas_height": 1080,
  "base_resolution": "1920x1080",
  "world_preset_id": "preset_dark_fantasy_01",
  "ui_density": "medium",
  "safe_areas": {
    "top": 80,
    "right": 120,
    "bottom": 100,
    "left": 120
  },
  "state_variant_keys": ["normal", "claim_ready", "claimed"]
}
```

### 4.2 素材の仕様書

素材の仕様書は、画面を構成する部材一覧ではなく、**画面再現可能な assembly spec** として定義する。

最低限、以下の 2 層を持つ必要がある。

1. `screen composition`
2. `asset requirements`

`screen composition` は配置と重なり順を定義する。  
`asset requirements` は各素材が何者で、何のために存在し、どんな見た目であるべきかを定義する。

### 4.3 入力ソース

ベータ版では入力ソースを 2 系統持つ。

1. `bundle.json` の直接読み込み
2. フォルダ指定で `screen-kv.json` `material-spec.json` `world-preset.json` と画像群を取り込む

これにより、単一ファイルで持ち運ぶ運用と、既存の仕様フォルダをそのまま指す運用の両方に対応する。

## 5. 素材の仕様書で必須にする内容

素材の仕様書は、「素材を作れば画面が組み立つ」状態まで具体化する必要がある。  
そのため、最低でも以下を必須にする。

### 5.1 画面再現情報

まず必要なのは、画面再現に直接必要な情報である。

- 対象画面サイズ
- 座標系
- 各素材の配置位置
- 各素材の表示サイズ
- 各素材のアンカー
- 各素材の重なり順
- 親子関係
- 状態別差分の切り替え条件

これがない仕様書は、見た目を再構成できないので不足とみなす。

### 5.2 素材の役割情報

次に、各素材の役割が要る。

- ボタンなのか
- アイコンなのか
- 背景土台なのか
- 枠なのか
- 装飾なのか
- 情報を載せるための土台なのか

これにより、単なる見た目ではなく、用途に応じた生成ルールを持てる。

### 5.3 素材の見た目要件

さらに、見た目の指示が要る。

- 世界観との関係
- 質感
- 形状
- 装飾密度
- 目立ち度
- 他素材との関係
- 避けたい表現

ここまで入ってはじめて、ツールは「配置可能な部材」として素材を生成できる。

## 6. 素材仕様書のフォーマット

素材仕様書は以下の 4 部構成にする。

1. `screen_meta`
2. `placements`
3. `assets`
4. `content_overlays` 任意

### 6.1 `screen_meta`

画面全体の前提を持つ。

- `screen_id`
- `canvas`
- `coordinate_space`
- `safe_areas`
- `default_state`
- `supported_states`

### 6.2 `placements`

画面上に何をどう置くかを持つ。  
ここが「再現できるかどうか」の中核になる。

各 placement の必須項目は以下。

- `placement_id`
- `asset_id`
- `x`
- `y`
- `width`
- `height`
- `anchor`
- `z_index`
- `blend_mode`
- `opacity`
- `state_visibility`

必要に応じて追加する項目は以下。

- `parent_id`
- `nine_slice_rect`
- `tile_rule`
- `pivot`
- `padding`
- `notes`

### 6.3 `assets`

素材そのものの要求を持つ。

各 asset の必須項目は以下。

- `asset_id`
- `asset_type`
- `role`
- `purpose`
- `render_group`
- `visual_priority`
- `style_notes`
- `function_notes`
- `export_requirements`

必要に応じて追加する項目は以下。

- `states`
- `size_variants`
- `parts`
- `negative_notes`
- `reference_assets`
- `generation_plan`
- `text_handling`

### 6.4 `content_overlays`

`content_overlays` は、生成アセットに焼き込まない文字や数値を組み立て仕様として持つための層。

これを使う対象は以下。

- プレイヤー名
- レベル値
- 通貨数
- 任務文言
- ボタンラベル
- 通知数
- タイマー

つまり、`見た目の器` は asset、`状態に応じて変わる中身` は overlay として分ける。

各 overlay の最低項目は以下。

- `overlay_id`
- `kind`
- `x`
- `y`
- `width`
- `height`
- `anchor`
- `z_index`

必要に応じて以下を追加する。

- `binding_key`
- `sample_text`
- `font_size`
- `font_weight`
- `align`
- `color`
- `stroke_color`
- `line_height`

### 6.5 テキストの ownership を分ける

設計上は、すべての文字を一律に overlay へ逃がしてはいけない。  
文字には少なくとも 2 種ある。

1. `runtime_overlay`
2. `baked_in_asset`

### `runtime_overlay`

ゲーム状態や言語設定で変わる文字。  
これは素材に焼き込まず、overlay か実行時テキストとして扱う。

例:

- プレイヤー名
- レベル値
- 通貨数
- 残り時間
- 任務進捗値
- 通知件数

### `baked_in_asset`

その素材の演出や意匠の一部であり、画像として作り込む文字。  
これは asset 側の要求として持つ。

例:

- イベントバナーのタイトルロゴ
- バナー内コピー
- 世界観装飾としての見出し

たとえば `青空交易祭` のようなイベントタイトルは、単なるUIラベルではなくバナー意匠の一部なので、`baked_in_asset` として扱う方が自然である。

### 6.6 `generation_plan`

`素材を一括生成` を意味ある操作にするには、asset ごとに `初回一括生成で何を走らせるか` が必要である。

最低限、以下を持つ。

- `first_pass_mode`
- `backend_class`
- `batch_group`
- `targeted_regenerate`
- `note`

考え方は次の通り。

- `image_batch`
  - 背景、イベント絵、大型エンブレムなど、独自絵面を画像生成する
- `template_family_batch`
  - ボタン土台、共通パネル、共通カプセルなど、同形状の部品をファミリー単位でまとめて生成する
- `symbol_batch`
  - 小型アイコン群をセットとして生成する

これにより、`一括生成 = 全素材の初回本生成ジョブをまとめて走らせる操作` と定義できる。  
個別再生成は、その後の差分修正にだけ使う。

## 7. `placements` で最低限定義すべきこと

`placements` は「どこに置くか」だけでは足りない。  
**どの順番で重ねるか** と **どの状態で見えるか** が必要である。

最低限の定義ルールは以下。

1. すべての素材は `canvas` 基準の絶対座標か、親 placement 基準の相対座標を持つ
2. すべての素材は表示サイズを明示する
3. すべての素材は `z_index` で重なり順を持つ
4. すべての素材は `anchor` を持つ
5. 状態差分がある素材は `state_visibility` を持つ
6. 伸縮前提の素材は `nine_slice_rect` を持つ
7. タイル前提の素材は `tile_rule` を持つ

例:

```json
{
  "placement_id": "reward_button_base",
  "asset_id": "btn_claim_reward",
  "x": 960,
  "y": 888,
  "width": 420,
  "height": 132,
  "anchor": "center",
  "z_index": 40,
  "blend_mode": "normal",
  "opacity": 1,
  "state_visibility": {
    "claim_ready": true,
    "claimed": false
  },
  "nine_slice_rect": {
    "left": 24,
    "right": 24,
    "top": 24,
    "bottom": 24
  }
}
```

## 8. `assets` で最低限定義すべきこと

`assets` は見た目メモではなく、生成要求そのものである。

最低限の定義ルールは以下。

1. その素材が何をするためのものかを書く
2. UI 上でどの情報を支えるかを書く
3. 世界観プリセットのどの要素に従うかを書く
4. 禁止事項を書く
5. 出力形式を書く
6. 状態差分とサイズ差分の必要有無を書く

例:

```json
{
  "asset_id": "btn_claim_reward",
  "asset_type": "button",
  "role": "primary_cta",
  "purpose": "報酬獲得アクションを押させる主ボタン",
  "render_group": "ui_interactive",
  "visual_priority": "high",
  "style_notes": [
    "dark fantasy brass frame",
    "reward feeling",
    "center text readability first"
  ],
  "function_notes": [
    "text label sits on top",
    "must support default hover pressed disabled"
  ],
  "negative_notes": [
    "no photoreal metal",
    "no modern mobile gradient button"
  ],
  "export_requirements": {
    "transparent": true,
    "nine_slice": true,
    "sizes": ["420x132", "320x104"],
    "states": ["default", "hover", "pressed", "disabled"]
  }
}
```

## 9. 画面再現可能性の判定基準

素材仕様書は、以下を満たした時だけ「画面再現可能」とみなす。

1. 全 placement に対応する asset が存在する
2. すべての placement に位置、サイズ、重なり順がある
3. 状態差分の表示条件がある
4. 伸縮素材は 9-slice か tile rule がある
5. 各 asset に用途と見た目要件がある
6. 書き出し形式が定義されている

逆に、以下の状態は不十分とみなす。

- 見た目の説明はあるが座標がない
- 座標はあるが素材の役割がない
- 素材はあるが重なり順がない
- 差分状態があるのに切り替え条件がない
- 画面サイズがない

## 10. 1 回の生成フロー

MVP の基本フローは `指定 → 生成 → 差分量産 → 書き出し` で固定する。

### 10.1 指定

ユーザーは最初に以下を指定する。

- プロジェクト
- 世界観プリセット
- アセット種別
- ベース用途
- バリエーション軸
- 出力サイズ

アセット種別ごとの最小入力は以下。

#### UIボタン / 小型パネル

- 用途: `primary` `secondary` `danger` `reward` など
- 状態: `default` `hover` `pressed` `disabled`
- サイズ: `small` `medium` `large`
- 角の雰囲気: 丸い / 四角い / 装飾強め
- テキスト有無

#### アイコン

- モチーフ: 剣、コイン、回復薬、炎、毒など
- 系統: アイテム / スキル / 状態異常 / 通貨
- 背景有無
- 線の強さ
- 塗りの密度
- サイズ: `32` `64` `128`

#### カード枠 / スロット枠

- 用途: キャラカード / 装備カード / レア枠 / インベントリ枠
- レア度差分: `common` `rare` `epic`
- 横長か縦長か
- 中央の抜き領域比率
- 装飾密度

### 10.2 生成

生成フェーズでは 1 回の要求から「単発画像」ではなく「ベース案の候補」を返す。

返すものは以下。

- ベース案 4 件
- 各案の透過プレビュー
- 世界観プリセットとの一致度
- 量産に向くかどうかの簡易判定

MVP では、ここで最も重要なのは美麗さより **差分展開しやすい骨格** である。  
そのため候補選定では以下を優先する。

- シルエットが読みやすい
- 余白が破綻していない
- 装飾が過剰でない
- 状態差分を足しやすい

### 10.3 差分量産

ベース案を 1 つ選んだ後、差分量産フェーズへ進む。  
ここでは人が 1 件ずつ再プロンプトするのではなく、テンプレート化したバリエーション軸でまとめて展開する。

MVP の差分軸は以下。

- 色違い
- 状態違い
- レア度違い
- 装飾密度違い
- 明暗違い
- 枠太さ違い

例:

1. ボタンなら `default / hover / pressed / disabled`
2. アイコンなら `normal / rare / cursed`
3. カード枠なら `common / rare / epic`

ここで重要なのは「毎回ゼロから描き直さない」こと。  
MVP の思想は **ベース骨格を保ったまま、ルールに従って差分を量産する** ことにある。

### 10.4 書き出し

書き出しでは画像だけでなく、実装向けメタデータもセットで出す。

MVP の基本出力は以下。

- 透過 PNG
- 参照用 WebP プレビュー
- バリエーション一覧コンタクトシート
- JSON メタデータ

アセット種別別の追加出力は以下。

- ボタン / パネル: 9-slice 用メタデータ
- アイコン: サイズ別出力とスプライトシート
- カード枠 / スロット枠: 内側安全領域と装飾境界のメタデータ

## 11. AI 支援ループ

単に `Generate` を繰り返すだけだと、ユーザーが素材ガチャを回すだけになる。  
そのため、ベータ版では AI を **生成器** ではなく、**批評と収束支援** に使う。

AI が担う役割は以下。

1. コメント正規化
2. 画面全体レビュー
3. lock 推奨
4. 差分再生成の提案
5. 一貫性チェック

### 11.1 コメント正規化

ユーザーの自然文コメントを、そのまま再生成に流さない。  
まず AI が以下に変換する。

- 何が問題か
- 再生成か retouch か reposition か
- 明度、コントラスト、装飾量、強調度などの構造化 directive

### 11.2 画面全体レビュー

生成後に AI が assembled screen を見て、直すべき上位素材を出す。

- どれを先に直すべきか
- どれはもう lock してよいか
- どの修正が他素材に波及するか

### 11.3 lock 推奨

収束した素材を AI が lock 推奨する。  
これにより、次の再生成で良い素材まで巻き込まれるのを防ぐ。

### 11.4 差分再生成

毎回フル生成しない。  
主に以下を対象に差分再生成する。

- 特定素材 1 件
- 特定状態差分
- 特定質感や装飾量

### 11.5 一貫性チェック

再生成した素材が他とズレた場合、AI がそのズレを指摘する。  
たとえば線幅、明度、装飾密度、UI 階層の不整合を見つける。

## 12. 世界観プリセットに持たせるもの

世界観プリセットは「良さそうな prompt 保存」ではなく、プロジェクト全体で画風を揃えるための構造化データとして持つ。

MVP で持たせる項目は以下。

- `preset_id`
- `name`
- `genre`
- `mood_keywords`
- `negative_keywords`
- `shape_language`
- `material_keywords`
- `palette`
- `line_treatment`
- `lighting_style`
- `detail_density`
- `ornament_rules`
- `ui_tone`
- `reference_images`
- `target_resolution`
- `background_policy`
- `export_defaults`

各項目の意味は以下。

### `genre`

例:

- dark fantasy
- sci-fi
- cute casual
- retro RPG

### `mood_keywords`

世界観の感情方向を定義する。  
例: `ancient` `warm` `mysterious` `mechanical`

### `negative_keywords`

避けたい表現を固定する。  
例: `photorealistic` `modern smartphone UI` `oversaturated`

### `shape_language`

形の癖を持たせる。  
例:

- rounded
- sharp
- chunky
- elegant

### `material_keywords`

木、石、鉄、クリスタル、革、紙などの主要材質を持たせる。  
ボタンや枠の質感統一に効く。

### `palette`

最低限以下を持つ。

- primary
- secondary
- accent
- danger
- success
- neutral_dark
- neutral_light

### `line_treatment`

輪郭線の強さ、線色、線の太さ傾向を持つ。  
例: `thin dark outline` `no outline` `soft inner shadow`

### `lighting_style`

ハイライトの強さ、影の方向、発光表現の有無を持つ。

### `detail_density`

装飾量の基準。  
例: `low` `medium` `high`

### `ornament_rules`

装飾モチーフを許可制で持つ。  
例:

- allowed: 葉、金属リベット、宝石
- disallowed: 骨、血痕、近未来ホログラム

### `ui_tone`

UI の空気感を定義する。  
例:

- readable_first
- ornate_but_clean
- toy_like

### `reference_images`

最大 5 件程度の参照アセットを登録する。  
MVP では各参照に以下だけ持てればよい。

- `path`
- `role`
- `notes`

### `background_policy`

MVP では `transparent_only` を基本にする。  
必要なら `transparent_with_shadow` を許容する。

### `export_defaults`

デフォルトの出力形式とサイズをまとめる。  
例:

- png
- webp_preview
- icon_sizes
- button_base_size

## 13. 透過、パーツ分離、サイズ違い、9-slice、スプライトシートの対応方針

### 13.1 透過

透過はオプションではなく基本仕様にする。

- MVP 対象 3 種はすべて透過前提
- 背景付きプレビューは別出力にする
- 白背景に依存した縁取りは不許可
- 影を付ける場合もアルファ付きで保持する

### 13.2 パーツ分離

MVP では完全 PSD 分解まではやらない。  
ただし再利用性の高い単位では論理パーツを持つ。

対象ごとの方針:

- ボタン / パネル: `frame` `fill` `highlight` `shadow`
- アイコン: `glyph` `backplate` `glow`
- カード枠 / スロット枠: `outer_frame` `inner_frame` `corner_ornaments` `rarity_fx`

MVP ではレイヤーファイルそのものではなく、パーツごとの透過 PNG とメタデータ参照で扱う。

### 13.3 サイズ違い

サイズ違いは単純拡大縮小ではなく、カテゴリ別ルールで出す。

- ボタン / パネル: ベースサイズ + 9-slice 再構成
- アイコン: `32 / 64 / 128` を個別最適化して出す
- カード枠 / スロット枠: 比率固定で `small / medium / large`

特にアイコンは縮小で読めなくなりやすいので、MVP では `small size readability check` を入れる。

### 13.4 9-slice

9-slice は MVP の差別化要素として最初から対応する。  
対象はボタン / 小型パネル / カード枠の一部。

出力する情報は以下。

- 元画像サイズ
- `slice_left`
- `slice_right`
- `slice_top`
- `slice_bottom`
- `content_padding`

MVP では Unity と一般 UI 実装で使いやすい JSON を出せれば十分。

### 13.5 スプライトシート

MVP でのスプライトシート対応は「アニメーション生成」ではない。  
目的は **量産した差分を一括で実装に流し込むこと** にある。

対象:

- アイコン一式
- ボタン状態差分
- カード枠レア度差分

出力する情報は以下。

- atlas PNG
- 各スプライトの座標
- サイズ
- pivot
- variant key

## 14. 汎用画像生成ツールとの差別化ポイント

このツールの差分は「画像が作れること」ではない。  
差分は **ゲーム実装向けに、統一感ある差分を再利用可能な形で量産できること** にある。

差別化ポイントは以下。

1. 世界観プリセットがプロジェクト単位で残る
2. アセット種別ごとの生成テンプレートがある
3. 単発生成ではなく差分マトリクスを一気に出せる
4. 透過、余白、安全領域、9-slice、atlas まで面倒を見る
5. パーツ単位の再利用を前提にする
6. 既存アセット参照からの寄せを運用に組み込む

汎用画像生成は「良い 1 枚」を出す方向に強い。  
このツールは「実装で困らない 20 枚」を揃える方向に寄せる。

背景全景でもこの思想は同じで、狙うのは「綺麗な背景 1 枚」だけではない。  
狙うのは **同じ世界観で複数画面、複数時間帯、複数レイヤー差分を運用できる背景セット** である。

## 15. 背景全景の扱い

背景全景はやる。  
ただし、MVP の UI 系アセットと同じ枠組みで無理に始めると、品質要求と生成コストが跳ねる。  
そこで背景全景は **Phase 2 の主要対象** として、以下の仕様で扱う。

### 15.1 背景全景で狙うユースケース

最初に狙うのは以下。

1. タイトル画面背景
2. 会話画面やメニューの背景
3. ステージの基調背景
4. 昼夜や平常 / 危険状態の差分背景

広告用キービジュアルではなく、**ゲーム画面の背面として使う背景** を主対象にする。

### 15.2 背景全景の最小仕様

背景全景は 1 枚の完成絵としてだけでなく、レイヤーと差分を前提に持つ。

最低限必要な要素は以下。

- `sky` または遠景
- `midground`
- `foreground`
- `lighting_overlay`
- `fx_overlay` 任意
- `safe_area` 情報

MVP 後の最初の背景対応では、完全な PSD 再編集よりも、**レイヤー別 PNG + JSON メタデータ** を優先する。

### 15.3 背景全景の生成フロー

背景全景では `指定 → ラフ生成 → レイヤー確定 → 差分量産 → 書き出し` に変える。

#### 指定

- シーン種別: 街 / ダンジョン / 森 / 宇宙船内 など
- カメラ距離: 近景寄り / 中景寄り / 遠景寄り
- 用途: タイトル / 会話 / バトル / ホーム
- UI 被り領域: 上部 HUD / 下部メニュー / 左右余白
- 差分軸: 昼夜 / 天候 / 危険度 / イベント状態

#### ラフ生成

まずは 3 から 4 案の構図ラフを返す。

確認観点は以下。

- UI を載せる余白があるか
- 世界観プリセットと合っているか
- 差分展開しやすいか
- 主要オブジェクト配置が破綻していないか

#### レイヤー確定

採用ラフに対して、遠景、中景、前景、光、演出オーバーレイを分ける。  
ここが単発画像ツールとの実務差分になる。

#### 差分量産

背景全景の差分軸は以下を優先する。

- 昼 / 夕 / 夜
- 平常 / 戦闘 / 汚染 / 祝祭
- 晴れ / 雨 / 霧
- 装飾物あり / なし

#### 書き出し

出力は以下。

- 背景統合 PNG
- レイヤー別 PNG
- プレビュー WebP
- レイヤー順 JSON
- UI 安全領域 JSON

### 15.4 背景全景で必要な世界観プリセット追加項目

背景全景を扱う場合、既存プリセットに以下を追加する。

- `environment_keywords`
- `architecture_style`
- `nature_rules`
- `atmosphere_rules`
- `camera_language`
- `ui_safe_area_defaults`

これにより、単に色味を合わせるだけでなく、地形、建築、空気感、カメラの寄せ方まで固定できる。

### 15.5 背景全景での差別化ポイント

背景全景における差別化は以下。

1. UI を載せる安全領域を前提に生成する
2. 世界観プリセットに沿って複数シーンを揃える
3. 昼夜や状態差分をセットで量産する
4. レイヤー分離された形で書き出す
5. 会話画面、ホーム画面、ステージ背景で流用しやすい

## 16. MVP で削る要素

MVP に入れないものを明確にする。

- 3D モデル生成
- 複雑なフレームアニメーション
- キャラクター立ち絵本体
- 告知画像、ストア素材、広告クリエイティブ
- ピクセルアート専用補正
- Figma / Photoshop 直接連携
- チーム共同編集
- モデル学習基盤や専用 fine-tuning
- 完全自動の品質判定

ここでいう「MVP に入れない」は「やらない」ではない。  
背景全景は上の Phase 2 対象として明示的に残す。

## 17. 後から拡張する要素

MVP 後の拡張候補は以下。

- 背景全景生成
- タイルセット生成
- 背景パーツ生成
- 敵やアイテム差分の量産
- エフェクト素材生成
- ピクセルアートモード
- Unity / Godot 向けエクスポーター
- 既存アセットからのスタイル継承強化
- ベクター風 UI 出力
- ルールベースの命名規約とフォルダ自動整理

背景全景はこの中でも優先度が高く、Phase 2 の先頭候補に置く。

## 18. プロトタイプで最低限必要な画面

最低限必要な画面は 4 つで足りる。

### 18.1 Project / Preset 画面

役割:

- プロジェクトの作成
- 世界観プリセットの編集
- 参考画像の登録
- デフォルト出力設定の保存

### 18.2 Asset Request 画面

役割:

- アセット種別の選択
- 用途、状態、サイズ、レア度などの指定
- バリエーション軸の設定
- 生成ジョブの開始

### 18.3 Variant Review 画面

役割:

- ベース候補 4 件の比較
- 採用案の選択
- 差分一括生成の実行
- 不要案の除外

### 18.4 Export / Library 画面

役割:

- 生成済みアセット一覧
- サイズ別プレビュー
- 9-slice と atlas の確認
- PNG / JSON の書き出し

背景全景を次段で入れる場合は、この画面に `layer preview` と `safe area preview` を追加する。

## 19. プロトタイプで最低限必要なデータ構造

MVP の最小データ構造は以下。

### 19.1 Project

```json
{
  "id": "proj_moon_forge",
  "name": "Moon Forge",
  "presetId": "preset_dark_fantasy_01",
  "defaultExportProfileId": "export_ui_default",
  "createdAt": "2026-06-19T10:00:00Z"
}
```

### 19.2 WorldPreset

```json
{
  "id": "preset_dark_fantasy_01",
  "name": "Dark Fantasy Brass UI",
  "genre": "dark fantasy",
  "moodKeywords": ["ancient", "heavy", "mysterious"],
  "negativeKeywords": ["photorealistic", "sleek mobile app"],
  "shapeLanguage": "chunky_sharp",
  "materialKeywords": ["aged brass", "dark wood", "dim crystal"],
  "palette": {
    "primary": "#7b5c2e",
    "secondary": "#37404a",
    "accent": "#67c3d9",
    "danger": "#b84a4a",
    "success": "#71a85b",
    "neutralDark": "#1c1a1a",
    "neutralLight": "#d9cfb8"
  },
  "lineTreatment": "dark_outline_medium",
  "lightingStyle": "top_left_soft_specular",
  "detailDensity": "medium",
  "uiTone": "readable_first",
  "backgroundPolicy": "transparent_only",
  "referenceImages": [
    {
      "path": "refs/ui-button-01.png",
      "role": "button_reference",
      "notes": "corner metal treatment"
    }
  ]
}
```

### 19.3 AssetRequest

```json
{
  "id": "req_001",
  "projectId": "proj_moon_forge",
  "screenId": "battle_reward",
  "assetType": "button",
  "intent": "primary_cta",
  "states": ["default", "hover", "pressed", "disabled"],
  "sizes": ["small", "medium", "large"],
  "variantAxes": ["state", "tone"],
  "notes": "battle reward claim button"
}
```

### 19.4 ScreenKv

```json
{
  "screenId": "battle_reward",
  "screenName": "Battle Reward",
  "screenRole": "reward_modal",
  "canvasWidth": 1920,
  "canvasHeight": 1080,
  "worldPresetId": "preset_dark_fantasy_01",
  "safeAreas": {
    "top": 80,
    "right": 120,
    "bottom": 100,
    "left": 120
  },
  "stateVariantKeys": ["normal", "claim_ready", "claimed"]
}
```

### 19.5 MaterialSpecSheet

```json
{
  "screenMeta": {
    "screenId": "battle_reward",
    "canvas": {
      "width": 1920,
      "height": 1080
    },
    "coordinateSpace": "screen_pixels",
    "defaultState": "claim_ready",
    "supportedStates": ["normal", "claim_ready", "claimed"]
  },
  "placements": [
    {
      "placementId": "reward_panel_base",
      "assetId": "panel_reward_modal",
      "x": 960,
      "y": 540,
      "width": 1120,
      "height": 680,
      "anchor": "center",
      "zIndex": 10,
      "blendMode": "normal",
      "opacity": 1
    },
    {
      "placementId": "reward_button_base",
      "assetId": "btn_claim_reward",
      "x": 960,
      "y": 888,
      "width": 420,
      "height": 132,
      "anchor": "center",
      "zIndex": 40,
      "blendMode": "normal",
      "opacity": 1,
      "stateVisibility": {
        "claim_ready": true,
        "claimed": false
      }
    }
  ],
  "assets": [
    {
      "assetId": "panel_reward_modal",
      "assetType": "panel",
      "role": "modal_base",
      "purpose": "報酬一覧と説明文を載せる土台",
      "renderGroup": "ui_base",
      "visualPriority": "medium",
      "styleNotes": [
        "dark fantasy carved stone and brass",
        "readability first",
        "center content safe"
      ],
      "exportRequirements": {
        "transparent": true,
        "nineSlice": true
      }
    },
    {
      "assetId": "btn_claim_reward",
      "assetType": "button",
      "role": "primary_cta",
      "purpose": "報酬獲得アクションを押させる主ボタン",
      "renderGroup": "ui_interactive",
      "visualPriority": "high",
      "styleNotes": [
        "reward feeling",
        "brass frame",
        "text readability first"
      ],
      "exportRequirements": {
        "transparent": true,
        "nineSlice": true,
        "states": ["default", "hover", "pressed", "disabled"]
      }
    }
  ]
}
```

### 19.6 GenerationJob

```json
{
  "id": "job_001",
  "requestId": "req_001",
  "presetId": "preset_dark_fantasy_01",
  "status": "reviewing_base_candidates",
  "baseCandidateIds": ["cand_a", "cand_b", "cand_c", "cand_d"],
  "selectedCandidateId": "cand_b"
}
```

### 19.7 AssetVariant

```json
{
  "id": "variant_btn_primary_hover_m",
  "jobId": "job_001",
  "assetType": "button",
  "variantKey": {
    "state": "hover",
    "size": "medium",
    "tone": "primary"
  },
  "filePath": "exports/buttons/btn_primary_hover_m.png",
  "parts": [
    "exports/buttons/parts/btn_primary_hover_m_frame.png",
    "exports/buttons/parts/btn_primary_hover_m_fill.png"
  ],
  "slice": {
    "left": 12,
    "right": 12,
    "top": 12,
    "bottom": 12
  }
}
```

### 19.8 ExportBundle

```json
{
  "id": "bundle_001",
  "jobId": "job_001",
  "pngFiles": [
    "exports/buttons/btn_primary_default_m.png",
    "exports/buttons/btn_primary_hover_m.png"
  ],
  "atlasPath": "exports/buttons/buttons_atlas.png",
  "atlasMetaPath": "exports/buttons/buttons_atlas.json",
  "manifestPath": "exports/buttons/manifest.json"
}
```

背景全景を追加する段階では、以下のような構造を足す。

### 19.9 SceneBackgroundRequest

```json
{
  "id": "bg_req_001",
  "projectId": "proj_moon_forge",
  "sceneType": "town_square",
  "usage": "home_screen",
  "cameraDistance": "mid",
  "variantAxes": ["time_of_day", "danger_state"],
  "uiSafeAreaProfile": "top_hud_bottom_menu"
}
```

### 19.10 SceneBackgroundVariant

```json
{
  "id": "bg_variant_001",
  "requestId": "bg_req_001",
  "variantKey": {
    "timeOfDay": "night",
    "dangerState": "normal"
  },
  "flattenedPath": "exports/backgrounds/town_square_night.png",
  "layers": [
    "exports/backgrounds/layers/town_square_night_sky.png",
    "exports/backgrounds/layers/town_square_night_midground.png",
    "exports/backgrounds/layers/town_square_night_foreground.png"
  ],
  "safeArea": {
    "top": 120,
    "right": 80,
    "bottom": 220,
    "left": 80
  }
}
```

## 20. MVP の成功条件

プロトタイプ段階では以下を満たせば前進とみなせる。

1. 1 つの世界観プリセットから、ボタン、アイコン、カード枠が統一感を持って出る
2. 1 つのベース案から 8 個以上の差分を短時間で出せる
3. 透過 PNG と JSON を Unity か Web UI の試作へそのまま流し込める
4. 手作業の微修正が必要でも、ゼロから描くより明確に速い
5. `screen KV + 素材仕様書` だけで、別実装者が同じ画面構成を再現できる

背景全景の Phase 2 成功条件は別で置く。

1. 同一プリセットで 3 シーン以上の背景全景を揃えられる
2. 1 シーンから昼夜差分を短時間で展開できる
3. UI を重ねても視認性が崩れない
4. レイヤー別 PNG が実装で再利用できる

## 21. 実装優先順位

着手順は以下が妥当。

1. `screen KV` と `素材仕様書` の schema 固定
2. 世界観プリセット保存
3. ボタン生成と 9-slice 出力
4. アイコン生成とサイズ違い出力
5. カード枠生成と安全領域メタデータ
6. atlas 出力
7. 参考画像によるスタイル寄せ改善
8. 背景全景のラフ生成
9. 背景全景のレイヤー分離と safe area 出力

この順なら、最初の検証で「本当にゲーム制作に刺さるか」を最も早く見られる。
