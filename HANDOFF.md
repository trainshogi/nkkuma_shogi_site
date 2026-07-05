# 引き継ぎドキュメント（将棋盤認識サイト改善）

最終更新: 2026-07-05 / 作成: Claude (Opus 4.8) / 次の担当AIへ

---

## 0. これは何か / ゴール

- **プロダクト**: 将棋盤の写真1枚から盤面を認識し KIF/SFEN に変換する Web アプリ。本番 https://shogi.nkkuma.tokyo/
- **直近ゴール**: **2025-08-04（8/4）福岡県行橋市のイベント**で使う。そこで使う盤・駒に特化して認識率を上げた版を出したい。
- **今日の依頼**: 諸々の改善版を今日中に出す ＋ 8/4 までのロードマップを作る。

---

## 1. インフラ / アクセス（最重要・ここを間違えると本番破壊）

| 項目 | 値 |
|---|---|
| 本番配信 | **S3 `s3://shogi.nkkuma.tokyo` + CloudFront `ECK0AXFXSKK8W`**（Firebaseではない。repo内のfirebase設定は死んでいる） |
| 認識API | `https://api.nkkuma.tokyo/recognize`（AWS API Gateway・独自ドメイン） |
| API CloudFront | `shogiapi.nkkuma.tokyo` = `E2GS2GTLUGKAZJ` |
| API本体repo | `/Users/akirasato/Documents/GitHub/shogiapi_appengine`（EC2 1台稼働） |
| AWS CLI | **`export AWS_PROFILE=local-claude`**（account 281150801606, ap-northeast-1）。`default`は期限切れ |
| 稼働中の本番JS | **`js/main_apigw.js`**（`js/main.js`ではない！index.htmlが読むのはこちら） |
| S3バージョニング | **有効**（過去版へロールバック可） |
| 関連バケット | `shogi-corrections`(ユーザ修正データ), `pic2shogi-db`, `pic2shogisite` |
| git remote | `origin` = github.com/trainshogi/nkkuma_shogi_site |

### デプロイ手順（`./deploy.sh` を作成済み）
```bash
./deploy.sh --dryrun   # 差分確認のみ（本番不変）。「差分ゼロ」なら repo==本番
./deploy.sh            # 実デプロイ: 本番を ~/shogi_prod_backups/ に自動バックアップ → s3 sync → CloudFront invalidation
```
除外: `firebase.json` `404.html` `mentenanse/*` `.DS_Store`（本番に配信しない）。

---

## 2. 最初の課題（ユーザ提示の14項目）

0. 見た目が古い
1. **API Keyが直書き** → `main_apigw.js` に `x-api-key:"0ulg7fN2RbuuX6GI3QLlaie66YCKVN4av50wMgO5"` が平文。静的サイトゆえ原理的に隠せない。**現状レート制限で当面容認・設計のみでOK**（ユーザ判断）
2. 結果の信頼度フィードバックが無い
3. 元写真と結果盤面を比較しづらい
4. 枠認識失敗時に再認識する手段が無い（`drawtrapezoid.js` 資産あり）
5. 開発者へのフィードバック手段が無い
6. ユーザの修正方法が面倒
7. 修正結果を回収できていない＋事前許諾（`privacy.html`あり／`shogi-corrections`バケット活用余地）
8. 認識結果から形勢判断をしたい
9. 広告・マネタイズ（Buy Me a Coffee は導入済）
10. API提供開始したが EC2 1台運用・GitHub→EC2 のCI/CDが未整備
11. **8/4 行橋イベント向けに、その盤・駒に特化して認識率を上げた版**
12. 使い方の公式動画・初回オンボーディング
13. `beta.html` は写真と結果が離れていて不評
14. 今日中に改善版＋8/4までのロードマップ

---

## 3. 今までやったこと（このセッション）

### (A) repo と本番の乖離を解消（reconcile）— **完了・コミット済**
- **重大発見**: repo は本番から大きく乖離していた。稼働JSは `main.js` ではなく `main_apigw.js`。もし旧repoをそのままデプロイしていたら GA/OGP/シェア/BuyMeACoffee/privacy/正しいAPIエンドポイントを全部巻き戻して本番破壊するところだった。
- S3全ファイルを `AWS_PROFILE=local-claude` でミラーし、repo を本番に一致させた。
- ブランチ **`sync-prod-baseline`** に2コミット:
  - `671e2c2` Reconcile repo with production S3
  - `edab699` Add S3 deploy script
- `./deploy.sh --dryrun` = **差分ゼロ**（repo==本番）を確認済。

### (B) UIの改善（#0/#3/#13）— **未コミット（作業中）**
- 現在ブランチ **`ui-wamodern`**（`sync-prod-baseline` から分岐）。**以下は未コミットの working tree 変更**:
  - `public/index.html`（改変）: DOM並べ替えで **「元の写真 → 認識結果盤」を隣接**（#13/#3解消）。操作を **撮影/画像を選ぶ/変換 の1列に統一**。**先手/後手トグルは非表示・デフォルト先手**（`#sengo-event` checked を hidden で保持）。ロゴ100%・くま画像常時表示に戻した。全ID/onclick/`main_apigw.js`は不変（認識機能は無傷）。
  - `public/css/modern.css`（新規）: **軽い今風化スキン**。β版(`app.css`)の白基調・淡グレー枠・角丸の路線を踏襲。`:has()` でJS変更ゼロの条件表示。
  - `.claude/`（新規）: プレビュー用（`launch.json`, `preview_server.py`）。
- **デザインの経緯（重要）**: 最初に「和モダン（明朝＋駒五角形）」で作り込んだが **ユーザに「全然良くない/ガラッと変えすぎ」と却下**。「前の感じを引き継ぎ最小変更で課題だけ直す」方針に転換して現状の案になった。**派手なテーマ変更はNG。既存の見た目・色・キャラを尊重すること。**
- Anthropic公式スキル **`frontend-design`** を `~/.claude/skills/` に導入済（Qiita記事 https://qiita.com/kamome_susume/items/41300417840aa107472e 経由）。

### (C) 盤の重なりバグ修正（#新規発見）— **未コミット**
- **本番にも存在するバグ**: 認識結果盤で **先手持ち駒と最下段の駒が重なる**。実測で原因特定 → 駒画像が縦長で、木目(`#board_img::before` padding-top:108%)を突き抜け、通常フロー配置の `#sente_mochi` と重なっていた。
- `modern.css` で `#board_img::before{padding-top:132%}` ＋ `#board_img{background-size:100% 100%}` に修正。重なりは解消。
- ⚠️ **ただしユーザ指摘「余白が多い」**。132%は余白過多。**要調整（後述）**。

---

## 4. 今の課題（未解決・要対応）

1. 🔴 **盤の余白調整**: `modern.css` の `#board_img::before{padding-top:132%}` は余白過多。**~120〜125% あたりに下げて再調整**（先手/後手持ち駒が重ならない下限を保ちつつ最小の余白に）。ブラウザ実測で `#board_koma.bottom` と `#sente_mochi.top` が重ならない最小値を探すのが確実。計算式は「grid底 ≈ 0.11*(P*w+持駒高) + 駒グリッド高(≒1.118w)、これが木目高(P*w)以下」。実測ベースで詰める。
2. 🟡 **UI変更は未コミット・未デプロイ**。本番はまだ旧UIのまま。`ui-wamodern` の変更をコミット→`./deploy.sh`していない。
3. 🟡 **`:has()` 依存**: 結果カードの条件表示・「元の写真」ラベル表示に CSS `:has()` を使用。古い端末（Safari15.4未満等）では枠/ラベルが出ないだけで隣接自体は機能（安全な劣化）。**8/4イベント端末の下限を確認**。
4. 🟡 **ロゴ/くま画像がビットマップ**で、今風化と少し浮く。CSSでは直せない＝アートワーク差し替えは別タスク。ユーザは「キャラは残す」意向。
5. 🟢 API Key直書き(#1): レート制限で当面容認。設計のみ（下記ロードマップ）。
6. 🟢 別ブランチに frontend ライブラリ移行の実験（PR#2/#3, codex作業）が未マージで存在。**どの方向（素HTML継続 vs フレームワーク移行）で行くか未決**。現行の改善は素HTML前提。

---

## 5. 今後やるべきこと（8/4までのロードマップ）

### すぐ（今日〜数日）
- [ ] **盤の余白を再調整**（課題4-1）してから `ui-wamodern` をコミット → `./deploy.sh --dryrun` → `./deploy.sh` で本番反映（#0/#3/#13完了）。
- [ ] 実機（iPhone/Android）で撮影→変換→結果の一連を確認。
- [ ] マルチデバイス確認: iPhone SE(375×667)/iPhone16(393×852)/iPhone17 Pro Max(≈440×956)/Pixel9(412×915)/PC。**このタスクは途中で中断**（下記「未完了タスク」）。

### 8/4に向けて（優先度順）
- [ ] **#11 イベント特化認識**（最重要）: 行橋で使う盤・駒の写真を集め、`shogiapi_appengine` の認識モデル/前処理をその条件に最適化。
- [ ] **#12 オンボーディング/使い方動画**: 初回訪問者向けステップ表示（β版に coach-mark 実装あり＝`app.js`/`app.css` 参照）。
- [ ] **#4 再認識手段**: 枠認識失敗時に手動で台形補正して再送。`drawtrapezoid.js` が資産。β版に近い発想あり。
- [ ] **#2 信頼度フィードバック**: API側で各マスの確信度を返し、低確信マスをハイライト。API改修必要。
- [ ] **#5/#7 フィードバック＆修正データ回収**: 事前許諾（privacy.html）→ 修正後の盤面を `shogi-corrections` バケットへ送信する導線。**今日はUI未実装・設計のみの方針だった**。
- [ ] **#10 API CI/CD & 可用性**: `shogiapi_appengine` の GitHub→EC2 自動デプロイ。EC2 1台のスケール懸念 → Lambda/コンテナ化 or オートスケール検討。
- [ ] **#1 APIキー対策の設計**: 「軽量プロキシ(Lambda)でキーをサーバ側注入」or「Origin/Referer制限＋WAF＋使用量プラン＋キーローテーション」。静的サイトでは隠蔽不可が前提。
- [ ] **#8 形勢判断**: 認識結果(SFEN)をエンジン評価に渡し形勢バーを出す。KENTO/やねうら王API等の連携を検討。
- [ ] **#9 マネタイズ**: Buy Me a Coffee導入済。広告(moshimoのコメントアウトあり)/API有料プランを検討。

---

## 6. 開発の実務メモ

### ローカルプレビュー（重要な落とし穴）
- 本番配信は静的ファイル。ローカル確認は Python http.server。
- ⚠️ **`~/Documents` は macOS TCC 保護下**で、サンドボックスのプレビュープロセスが読めない。→ **`public/` を scratchpad にコピーして配信**している（`.claude/preview_server.py` が `os.chdir` 後に serve）。編集後は scratchpad へコピーし直す必要あり。
- 結果画面の擬似表示: `disp_koma_json(平手のresult_json)` + `after_reco()` を eval で叩く（`before_reco()`で認識中、`#pic1`にsrcセットで撮影後状態）。

### 触ってはいけない不変条件（認識機能を壊さない）
- 保持必須のID: `board_img` `board` `board_koma` `kekka_text` `copy_btn` `link_btn` `guruguru` `reco_err_img` `again` `myform` `upfile` `sengo-event` `pic1_parent` `pic1` `format` `back` / class `.contents` `.mochigoma-list` `.horizontal-list`
- 保持必須の関数(onclick): `file_upload` `set_camera` `set_library` `get_js_variable` `ban_click` `fix` `fix_mochigoma` `clip_text` `save_text` `jump_piyo` `jump_kento` `again` `clear_form_inner`
- `makecanvas.js` は読込時に `$('.contents').width()` を取得 → `#pic1_parent.contents` は常に幅を持って可視であること（display:noneの親に入れない）。

### 主要ファイル
- `public/index.html` … 本体（改変・未コミット）
- `public/js/main_apigw.js` … 稼働ロジック（API呼び出し・結果描画トリガ）
- `public/js/util.js` … KIF/SFEN変換・盤描画（`disp_koma_json`, `json_to_kif` 等）
- `public/js/makecanvas.js` … 画像読込・EXIF回転
- `public/css/shogiban.css` … 盤レイアウト（`#board_img::before` の縦横比が今回の争点）
- `public/css/modern.css` … 今回の改修レイヤー（新規・未コミット）
- `public/beta.html` + `js/app.js` + `css/app.css` … β版（STEP式UI・coach-mark・lightbox。ユーザが「まだマシ」と評価＝参考になる）
- `public/alpha.html` … 別の試作

---

## 7. 未完了タスク（中断時点）

- **マルチデバイスのプレビュー＋スクショまとめ**: ユーザ依頼「iPhone SE/iPhone16/iPhone17 Pro Max/Pixel9/PC でプレビューを出し、見やすくスクショを表形式かHTMLでまとめてリンク」→ **未着手のまま中断**。プレビューサーバのスクショはファイル保存できないため、Chrome headless で各ビューポートを撮影→`gallery.html`に並べて配信、が現実的（要 `google-chrome --headless --screenshot`）。

---

## 8. git 状態（2026-07-05時点）
- `master` = `c067930`（素HTML。frontendライブラリ移行PR#2/#3は未マージの別ブランチ）
- `sync-prod-baseline` = reconcile + deploy.sh（コミット済、本番と一致）
- `ui-wamodern`（現在地）= UI改善 + 盤バグ修正（**未コミット**: `public/index.html`変更, `public/css/modern.css`新規, `.claude/`新規）
- **本番はまだ何も反映していない**（旧UIのまま）。

---

## 9. Codexで試したこと / できなかったこと（2026-07-06追記）

### ユーザから受けた課題
- `modern.css` の `#board_img::before{padding-top:132%}` は、先手持ち駒と盤下段の重なりは解消するが、認識結果盤と先手持ち駒の間の木目余白が広すぎる。
- iPhone SE / iPhone 12 Pro / iPhone XR / iPad Air など実際に確認したいデバイス幅で破綻しないようにしたい。
- 盤面部分の調整が難しいなら、この部分だけは元CSSがきちんと適用される状態に戻してほしい。

### 試した調整
- `#board_img::before` の `padding-top` を `132% -> 125% -> 118% -> 108% -> 113%` と段階的に変更。
- `#sente_mochi{padding-top:0}` を追加して、先手持ち駒自体の上余白を削減。
- 小幅端末向けに `@media (max-width:380px)` / `@media (max-width:400px)` で `116%` / `118%` を適用する案を試行。
- `#sente_mochi` に負の `margin-top` を入れて持ち駒を上へ寄せる案を試行。
- 8123番の既存プレビューが不安定だったため、`python3 -m http.server 8124 --bind 127.0.0.1 --directory public` で別ポートのプレビューを起動。
- Chrome DevTools ProtocolでDOM実測を試したが、CDP操作が安定せず、確実な自動計測には至らなかった。

### 結果
- `125%` / `118%`: 重なりは軽減するが、木目余白がまだ広く、ユーザ評価は「まだまだ広い」。
- `108%`: 元CSS相当まで戻すと、iPhone SE / iPhone 12 Pro / Pixel系などで先手持ち駒が最下段の駒に食い込む。
- `113%`: iPhone XR / Pixel / iPadでは多少マシだが、iPhone SE / iPhone 12 Proではまだ重なる。
- `max-width` で端末別に `118%` を当てる案も、UI全体として「今よりダメ」と評価。
- 負の `margin-top` は明確に悪化。先手持ち駒が盤面グリッドへ重なったため不採用。

### 重要な結論
- 問題の本質は `padding-top` の数値調整だけではない。`shogiban.css` の盤面は、`#board_img::before` で高さを作り、`#board_koma` と `#gote_mochi` は絶対配置、`#sente_mochi` は通常フローという繊細な構造になっている。
- `modern.css` から外側だけで `padding-top` / `background-size` / `margin` を上書きすると、端末幅ごとに盤グリッド・木目背景・持ち駒・下部ボタンの関係が崩れやすい。
- 次にやるなら、数値チューニングではなく、盤面コンポーネントだけをHTML/CSSとして整理し直す方がよい。特に `#board_img` 内を「後手持ち駒 / 9x9盤 / 先手持ち駒」の3ブロックで明示的にレイアウトする方が安全。
- ただし、既存JSは `#board_img`, `#board_koma`, `.mochigoma-list`, `#gote_mochi`, `#sente_mochi` に依存しているため、ID/classとクリック関数は維持必須。

### 現在の状態
- Codexで試したCSS変更は、引き継ぎ時点の `132%` 案へ戻した。
- つまり `public/css/modern.css` は再び `#board_img{background-size:100% 100%}` と `#board_img::before{padding-top:132%}` を含む状態。
- Codexが追加した一時計測スクリプト `.claude/measure_layout.js` は削除済み。
- 8124番のローカルプレビューを起動したが、最終判断には使わないこと。必要ならプロセスを止めて立て直す。

---

## 10. UI完全リプレイスの試みと課題（2026-07-06追記・最新状態）

### 試したこと
- 既存の `shogiban.html`（tableや絶対配置のハック）に限界を感じ、ユーザの許可を得て **UI（index.html, modern.css）を完全にゼロから作り直すアプローチ** に切り替えた。
- `shogiban.html` の中身を `index.html` にインラインで展開し、盤面のレイアウトをFlexboxと `aspect-ratio` を用いたモダンな構造に書き直した。
- これにより、盤面と駒がずれる問題は構造的に完全に解決した（CSSのみで厳密に縦横比と重なりを制御できたため）。

### 発生した課題と未解決のバグ
- リプレイス後、「画像を選んでも表示されない、変換ボタンが押せない」というバグが発生した。
- 原因として、元の `index.html` で読み込んでいた外部JS群（`makecanvas.js`, `compressor.min.js`, `megapix-image.js` など）の読み込みが漏れていたため、再度追記して修正した。
- しかし、JS群を復活させても画像のプレビューが正常に動いていない（「画像見えないけど」という状態）。
- おそらく `makecanvas.js` などの古いJSが、旧 `index.html` の特定のDOM構造（例えば、非表示要素の挙動や特定の親要素の存在）に強く依存しており、HTMLを綺麗に書き直したことでJS側のイベントバインディング（`#upfile` の `change` イベントなど）やCanvas描画が空振りしている可能性が高い。

### 次の担当者への引き継ぎ事項
- 最新の変更（UI完全リプレイスとJSタグの修正）は `ui-wamodern` ブランチにコミット済み（`1fa58a2 Complete UI rebuild with modern standards`）。
- CSSのレイアウト（盤面崩れ）自体はこの新構造で解決できているので、あとは **既存のJS（特に `makecanvas.js`, `preview.js`, `util.js`）が新しい `index.html` のDOM上で正常に動くようにJS側の繋ぎ込みを直す** ことが最短ルート。
- `makecanvas.js` は画像選択時の `FileReader` 処理やEXIF回転処理を持っており、これと `<input type="file" id="upfile">` の連動部分をデバッグする必要がある。
- このUIリプレイス路線を継続するか、元の古いHTMLに切り戻して泥臭くCSS調整を続けるかは次の担当者の判断に委ねる。

---

## 11. 0ベース再構築 完了（2026-07-06・Claude Opus 4.8・最新状態）

§9/§10の試行錯誤を受け、ユーザ指示「0ベースで作り直せ。API・外部連携仕様のみ維持、コードは自由」により全面再実装した。

- **ブランチ**: `rebuild-v2`（`sync-prod-baseline` から分岐。§9/§10の試行は `ui-wamodern` に温存）
- **仕様書**: `docs/REBUILD_SPEC.md`（外部契約・状態機械・盤コンポーネント・受け入れ基準10項目）
- **成果物**: `public/index.html`(197行) / `public/css/site.css` / `public/js/site.js`(637行)。依存はCompressor.js CDNのみ
- **§10の未解決バグは全て解消**: 旧JSとの繋ぎ込み問題は旧JSを使わないことで消滅。盤は CSS Grid＋テキスト駒・持駒は通常フローで、「先手持駒と最下段の重なり」「木目余白」問題は構造的に不可能になった
- **検証済み**: 5状態(empty/photo/busy/done/error)のブラウザ実描画、マスタップ→パレット編集、持駒個数循環（上限で一周・実測1行表示）、手番切替、KIF/SFEN出力が旧util.jsと完全一致（KIF全文・SFEN平手 `lnsgkgsnl/... b - 1`）、KENTO URL組み立て（持駒付きSFEN反映）、リセットで完全初期化、コンソールエラー0
- **未検証（実機/本番のみ可能）**: 実カメラ撮影のcapture挙動、実APIレスポンス（ローカルから本番APIは叩いていない）、piyoshogi://スキーム起動
- **旧ファイルは無変更で温存**: util.js / main_apigw.js / shogiban.html / css群 / beta.html（他ページが使用）
- **未デプロイ**: 本番反映は `./deploy.sh --dryrun` → `./deploy.sh`。反映後に実機で1枚撮影→変換の疎通確認をすること
