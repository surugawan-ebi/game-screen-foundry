# 星港アトラス HOME 組み立て設計

## 方針

この画面は `KV の見た目をそのまま 1 枚絵化する` のではなく、`本番実装で差し替えや再利用が効く粒度` で分解する。

重要な方針は以下。

- 大きな箱は外枠、見出し帯、中身ボタン、進捗バー、報酬チップに分解する
- 文字、数値、通知数、残り時間は生成アセットに焼き込まず `contentOverlays` として別管理する
- 上部HUBは `プロフィール塊 + リソースカプセル + 丸ボタン` に分ける
- 左パネルと右パネルは、`枠だけ` で終わらせず、中身の操作要素まで placement に出す
- 同形状の部品は asset を再利用し、placement と overlay で意味を切り替える

## 今回の分解単位

### 1. 上部HUB

- `hub_profile_shell`
- `crest_anchor_badge`
- `bar_profile_exp_base`
- `bar_profile_exp_fill`
- `hub_resource_capsule` x 3
- `btn_top_utility_round` x 3
- 各種アイコン

これで `上部が一体パネルに見えるが、実装上は別部品` という状態を表現する。

### 2. 左プレイヤーパネル

- `frame_player_profile_outer`
- `tab_player_profile_header`
- `emblem_rank_compass`
- `bar_rank_progress_base`
- `bar_rank_progress_fill`
- `tile_profile_action` x 4
- 各タイル内アイコン

ポイントは、`実績/図鑑/ランキング/フレンド` を枠の中に焼き込まず、4つの小ボタンとして独立させたこと。
`frame_player_profile_outer` は外枠だけを持ち、見出しタブ、紋章、進捗バー、小ボタンは焼き込まない。
見出しは `tab_player_profile_header` を別 placement として重ねる。

`tile_profile_action` の内側は 4 タイルとも同じローカル座標を使う。

| 要素 | ローカル座標 | サイズ | 備考 |
| --- | --- | --- | --- |
| アイコン | x=17, y=8 | 24 x 24 | 上端に寄せすぎず、ラベルと分離する |
| ラベル | x=0, y=36 | 58 x 18 | 全タイル共通。長い文言だけ fontSize を下げる |

同じボタン素材の中で、アイコン位置だけを個別調整しない。  
差分は `icon_action_*` の絵柄と、ラベルの文字列・fontSize だけに限定する。

### 3. イベントバナー

- `art_event_banner_fill`
- `frame_event_banner_outer`
- `ribbon_event_live`
- `carousel_dot_active`
- `carousel_dot_idle`

イベント絵面と額縁を分けることで、差し替えが効く。

### 4. 右デイリー任務パネル

- `frame_daily_mission_outer`
- `strip_daily_mission_header`
- `panel_mission_row` x 3
- `bar_mission_progress_base` / `bar_mission_progress_fill`
- `btn_mission_action` x 3
- `chip_reward_small` x 2
- `btn_receive_all`

ここは `右の大きい枠` ではなく、`行UIを組み立てるモジュール群` として扱う。
`frame_daily_mission_outer` は外枠だけを持ち、見出し帯、任務行、行区切り、下部ボタンは焼き込まない。
見出しは `strip_daily_mission_header`、行は `panel_mission_row`、一括受取は `btn_receive_all` が担当する。

`panel_mission_row` の内側は 3 行とも同じローカル座標を使う。

| 要素 | ローカル座標 | サイズ | 備考 |
| --- | --- | --- | --- |
| 任務文言 | x=14, y=9 | 可変幅 x 20 | 行ごとに文言長が違うため幅だけ調整可 |
| 進捗バー土台 | x=14, y=35 | 116 x 12 | 全行共通 |
| 進捗バー塗り | x=16, y=37 | 可変幅 x 8 | 進捗率で幅だけ変える |
| 進捗数値 | x=55, y=30 | 42 x 16 | `1/1` / `0/1` など |
| 報酬チップ | x=153, y=10 | 44 x 34 | 報酬がある行だけ配置 |
| 報酬数値 | x=1, y=18 | 42 x 14 | `chip_reward_small` 内の共通スロット |
| 行ボタン | x=201, y=8 | 84 x 38 | 全行共通 |
| 行ボタンラベル | x=7, y=9 | 70 x 20 | `btn_mission_action` 内の共通スロット |

重要なのは、短い文字や報酬なしの行でも別レイアウトにしないこと。  
同じ asset を使うなら、同じ部品スロットに載せる。差分は `幅` や `表示有無` だけに限定する。

### 5. 左右CTA

- `card_gift_cta_shell`
- `card_gacha_cta_shell`
- `icon_gift_crate`
- `icon_gacha_orb`
- `badge_notification_count`

ギフトとガチャはCTAとして似ているが、土台assetは共用しない。  
`card_gift_cta_shell` は丸座なし、`card_gacha_cta_shell` は右側にオーブ用丸座あり、と責務を分ける。

| CTA | 要素 | ローカル座標 | サイズ | 備考 |
| --- | --- | --- | --- | --- |
| ギフト | タイトル | x=90, y=18 | 118 x 30 | 箱アイコン右側の text lane |
| ギフト | 補足 | x=90, y=52 | 120 x 26 | 下枠に触れない |
| ギフト | 通知バッジ | 箱アイコン右上 | 30 x 30 | 赤系の塗り付き丸バッジ |
| ガチャ | タイトル | x=20, y=18 | 104 x 30 | 右のオーブ安全域には入れない |
| ガチャ | 補足 | x=20, y=50 | 112 x 34 | 2行表示、fontSize 13 / lineHeight 15 |

ガチャCTAでは右側の丸座に `icon_gacha_orb` が重なる。  
そのため、テキストはカード左側の矩形レーンに固定し、文言が短くても右へ寄せない。
ギフトCTAでは右側の丸座を持たない。箱アイコンと通知バッジを別placementで重ねる。

### 6. 下部ナビ

- `panel_bottom_nav`
- `btn_nav_active`
- `btn_nav_default`
- 各タブアイコン

`ホーム` だけ選択状態で、他4件は通常状態として扱う。

`panel_bottom_nav` は下部ナビ全体の背面レールだけを持つ。  
この asset の中に、5つのタブ枠、アイコン、ラベル、区切り線を焼き込まない。

| 要素 | 役割 | サイズ | 備考 |
| --- | --- | --- | --- |
| `panel_bottom_nav` | 背面レール | 1260 x 116 | 全ボタンの下に敷く土台。個別タブ枠は禁止 |
| `btn_nav_active` | 選択中タブ | 228 x 96 | `ホーム` 用 |
| `btn_nav_default` | 通常タブ | 228 x 96 | 4タブで再利用 |
| `icon_nav_*` | タブアイコン | 40 x 40 | 各ボタン内に配置 |
| `ov_nav_*` | タブラベル | 可変 | 各ボタン内の runtime overlay |

この分解により、選択状態やタブ追加時に `panel_bottom_nav` を再生成せず、ボタンだけ差し替えられる。

## レイアウト安全ルール

主要UI同士の兄弟レイヤー重なりは、原則として禁止する。
許可する重なりは `assemblyPolicy.layoutSafetyPolicy.allowedOverlaps` に明示する。

- `gift_cta_badge` は `gift_cta_crate` 右上への重なりを許可する
- `gacha_cta_orb` は `gacha_cta_shell` 右側ソケットへの重なりを許可する
- `sortie_button_base` / `sortie_button_anchor` と `bottom_nav_shell` の重なりは禁止する
- `daily_mission_receive_all` は `daily_mission_outer` 内に収め、ガチャCTAと重ねない

## Overlay を分けた理由

この画面では、以下を asset に含めない。

- プレイヤー名
- レベル値
- 通貨数
- タイマー
- 任務文言
- ボタンテキスト
- 通知件数

理由は、これらは世界観よりもアプリ状態に依存するため。  
見た目の器は asset、状態依存の中身は overlay で持った方が、本番実装に近い。

## ただし、全部を overlay にしない

この画面では、文字を 2 種に分ける。

- `runtime_overlay`: 値やラベルとして後載せする文字
- `baked_in_asset`: 素材の意匠として作り込む文字

### runtime_overlay にするもの

- プレイヤー名
- レベル値
- 通貨数
- タイマー
- 任務文言
- 通知件数
- ナビラベル

### baked_in_asset にするもの

- イベントバナーの `青空交易祭`
- イベントバナーのサブコピー
- `開催中！` リボン

理由は、これらは単なる数値表示ではなく、イベント演出の一部だから。

## 一括生成の意味

このサンプルでは、`素材を一括生成` を以下として定義する。

- 各 asset の `generationPlan` に従って、初回本生成ジョブをまとめて走らせる
- 同形状の共通部品は `family batch` として1回で確定する
- 背景やイベント絵のような独自絵面は `image batch` として個別に本生成する
- 個別再生成は、初回一括生成のあとに差分修正するときだけ使う

つまり、`一括生成したあとに、全素材をまた個別に imagegen し直す` のは設計として誤り。

## KV との関係

この組み立て仕様は KV と同じシルエットと情報密度を目指すが、ピクセル単位一致は目的にしない。

- KV は完成イメージ
- material spec は再構成可能な部品表

この 2 つを分けることで、`見た目の方向性` と `実装可能な設計` を両立する。
