# 将棋盤認識サイト 0ベース再構築 仕様書 (rebuild-v2)

設計: Claude Opus 4.8 / 2026-07-06
実装対象: `public/index.html`(書換), `public/css/site.css`(新規), `public/js/site.js`(新規)
**旧ファイル（shogiban.html, js/util.js, js/main_apigw.js, js/makecanvas.js, css/shogiban.css, css/style.css, beta.html 等）は一切変更しない**（他ページが使う。新indexはそれらを読み込まない）。

---

## 1. プロダクトの本質（これだけやる）

> 写真を撮る → 盤面認識の結果が出る → 間違いを指でいじって直せる → KIF/SFENでコピー・保存・他アプリ（ぴよ将棋/KENTO）に渡せる。

余計な機能は入れない。1ページ・1カラム・モバイルファースト。

---

## 2. 変更してはいけない外部契約

### 2.1 認識API
```
POST https://api.nkkuma.tokyo/recognize
Header: x-api-key: <APIキー・秘匿。デプロイ時に置換される。site.js内では '__API_KEY__' プレースホルダ>
Body: multipart/form-data
  - upfile: 画像Blob（Compressor.jsで quality:0.9, maxWidth:2000, maxHeight:2000 に圧縮したもの）
  - hidden_rotate: "0"（固定。EXIF回転はCompressorが吸収する）
  - hidden_sengo: "true"（固定。先手番デフォルト）
Response: JSON
  {
    "ban_result": { "<筋><段>": "<駒コード>", ... },   // 例 "76":" fu", "82":"vhi"。空マスは" * "または未定義
    "sente_mochi": { "fu": 2, "ky": 1, ... },          // 無い駒はキー無し。値1は 1 または "" の場合あり
    "gote_mochi":  { ... },
    "teban": "sente" | "gote"
  }
駒コード: 先頭1文字 ' '=先手/'v'=後手 ＋ 2文字 fu香=ky 桂=ke 銀=gi 金=ki 角=ka 飛=hi 玉=ou
成駒: to(と) ny(杏) nk(圭) ng(全) um(馬) ry(龍)
```

### 2.2 ぴよ将棋連携
```
GET https://us-central1-shogiban2kif.cloudfunctions.net/save_kif?message=<KIF文字列(URLエンコード)>
→ レスポンスbody(テキスト=URL) を受け取り location.href = "piyoshogi://?url=" + <そのURL>
失敗時: alert("連携に失敗しました。")
```

### 2.3 KENTO連携
```
window.open("https://www.kento-shogi.com/?initpos=" + SFEN文字列.split("+").join("%2B"), "_blank")
```

### 2.4 KIF出力形式（1文字も変えない。ぴよ将棋がこれをパースする）
```
後手の持駒：飛　金二　\n            ← 各駒 <漢字><個数漢字>＋全角空白。個数1は漢字省略。無しなら「後手の持駒：\n」
  ９ ８ ７ ６ ５ ４ ３ ２ １\n
+---------------------------+\n
|v香v桂 ・ ・ ・ ・ ・ ・ ・|一\n   ← 各マス2文字: 先手=' '+漢字 / 後手='v'+漢字 / 空=' ・'
（…9段…）
+---------------------------+\n
先手の持駒：歩二　\n
\n
先手番                              ← teban: sente=先手番 / gote=後手番（末尾改行なし）
```
- 持駒の列挙順: 飛,角,金,銀,桂,香,歩（この順で存在するものだけ）
- 個数→漢数字: 1=省略, 2=二...9=九,10=十,11=十一...18=十八

### 2.5 SFEN出力形式（KENTOがこれをパースする）
- 9段を1段目から `/` 区切り。先手=大文字(P L N S G B R K)、後手=小文字、成=+P等、空連続は数字
- ` b` or ` w`（sente=b）
- 持駒: 先手(大文字)→後手(小文字)、順序どちらも 飛,角,金,銀,桂,香,歩、個数2以上は数字前置(例 2P)、両者無しなら `-`
- 末尾 ` 1`

### 2.6 サイト装飾（そのまま残す）
- GA: gtag `G-BG7XXMB0B1`（headに現行スニペットのまま）
- OGP/Twitterメタ一式（現行のまま）
- タイトル: `Shogiban to Kif developed by えぬっくま`
- X/Facebookシェア（share.jsは使わず同等ロジックをsite.jsに内蔵: text="写真1枚で簡単KIF作成！", via=nkkuma_service, url=location.href）
- Buy Me a Coffee: https://www.buymeacoffee.com/nkkuma （現行の画像ボタン）
- privacy.html への同意文とリンク、© 表記、FAQボタン(./faq.html)
- FC2カウンター: `//counter1.fc2.com/counter.php?id=33316434&main=1` ＋「人目の訪問です。」
- Twitterフォローボタン（現行のまま）
- ロゴ `img/SHOGIWEB_TITLE.png`（幅100%）とくま画像 `img/shogi_intro.png`（幅100%・常時表示）

---

## 3. 外部依存（これ以外の外部JS/CSSを読み込まない）

- **Compressor.js**: `https://cdn.jsdelivr.net/gh/fengyuanchen/compressorjs/dist/compressor.min.js`（実績あり・EXIF回転を自動補正）
- jQuery / Bootstrap / popper / font-awesome / bootstrap-icons / bootstrap-toggle / exif-js / load-image / megapix-image は**使わない**
- アイコンが要る場所はインラインSVGか絵文字・テキストで

---

## 4. 状態機械（body[data-state] で管理）

```
empty  … 初期。ロゴ＋くま使い方画像＋[📷 撮影する][🖼 画像を選ぶ]
photo  … 写真選択済。写真プレビュー＋[変換する(赤・大)]＋[選び直す]
busy   … 認識中。写真の上に半透明オーバーレイ＋スピナー＋「盤面を認識しています…」。ボタン無効
done   … 結果表示。写真(そのまま上に残す)→直下に盤→編集UI→出力ボタン群→[最初からやり直す]
error  … 認識失敗。「認識できませんでした。盤全体が写るように撮り直してみてください」＋[もう一度変換][選び直す]（写真は保持）
```
- 遷移: empty→(file選択)→photo→(変換)→busy→done / error。error→(もう一度変換)→busy。done→(最初から)→empty
- 撮影ボタン: `input.setAttribute('capture','environment')` してから click()。選ぶボタン: removeAttribute('capture')。inputは `accept="image/*"` の単一hidden input

## 5. 画面構成（上から。1カラム, max-width 480px 中央寄せ）

1. ロゴ（幅100%）
2. くま使い方画像（幅100%・常時表示）
3. 操作列（empty/photoで表示）: 状態に応じたボタン（§4）
4. **結果カード**（photo以降で表示・角丸カード）:
   - 「元の写真」ラベル＋写真プレビュー（幅100%）
   - busy: オーバーレイ
   - done: 「認識結果（駒をタップで修正）」ラベル → **盤コンポーネント** → 手番セグメント[先手番|後手番] → 出力ボタン群
5. 出力ボタン群（doneのみ）:
   - 検討アプリ: [ぴよ将棋(img/piyo_link.png)] [KENTO(img/kento.png)]
   - 形式セレクト[KIF|SFEN]＋[コピー][ファイル保存]（保存: KIF=kyokumen.kif, SFEN=kyokumen.txt, Blob+aタグdownload）
   - コピー: navigator.clipboard.writeText → 失敗時 execCommand フォールバック → 成功で「コピーしました」トースト（alertでなく2秒で消える小トースト）
6. [最初からやり直す]（done/errorで表示）
7. フッター（§2.6の装飾一式）

## 6. 盤コンポーネント（今回の要）

**画像を使わない。CSSとテキストだけで描く。**（旧ban.png＋絶対配置table＋駒PNGが重なりバグの根源だったため）

```
<div class="board-unit">
  <div class="hand hand--gote">…後手持駒chips…</div>
  <div class="board">…81マス…</div>
  <div class="hand hand--sente">…先手持駒chips…</div>
</div>
```

- `.board`: `display:grid; grid-template-columns:repeat(9,1fr); aspect-ratio: 9/9.7;`（将棋のマスは縦長1:1.078）
  - 地色: 単色~ごく薄いlinear-gradientの木色（#f0c574系）。`border:2px solid #5a3d1e`、マス罫線は各セル `border:0.5px solid #8a6a3a` などで均一に
  - 星4点: `.board` に ::before/::after は使いにくいので、position:absolute の小さな丸div×4（left/top: 33.33%/66.66% 交点、視覚装飾なのでaria-hidden）
- マス `.sq`: 中央配置。`data-pos="<筋><段>"` を持つ
- 駒 = テキスト。serif系（"Hiragino Mincho ProN", "Yu Mincho", serif）、太め。
  - 先手: そのまま。後手: `transform: rotate(180deg)`
  - 成駒(と杏圭全馬龍): `color:#c0392b`
  - フォントサイズは `clamp()` かコンテナ幅比で。マスからはみ出さないこと
- 筋番号(9..1)を盤の上、段(一..九)を盤の右に小さく表示（色は薄グレー）
- 持駒chips `.hand`: flex横並び。7種(歩香桂銀金角飛)を常時表示、`<span class=koma>歩</span><span class=cnt>×2</span>`。0個は opacity .35。後手行は駒文字を180度回転。行の高さはコンテンツなり（**絶対配置禁止** — これで重なり問題は構造的に消える）

## 7. 編集UX

- **盤マス編集**: マスをタップ → 選択ハイライト＋盤直下にパレット出現。
  - パレット: 3行グリッド「空マス／先手14駒（歩香桂銀金角飛玉と杏圭全馬龍）／後手14駒(180度回転表示)」＋[閉じる]
  - 駒を選ぶと即反映しパレット閉じる。現在の駒はパレット内でハイライト
- **持駒編集**: chipタップで個数+1、上限超で0に戻る（上限: 歩18 香4 桂4 銀4 金4 角2 飛2）
- **手番**: セグメントボタン[先手番|後手番]。出力のKIF末尾/SFENのb/wに反映
- 全編集は内部状態 `state.result`（APIレスポンスと同形）を書き換えて盤を再描画する。KIF/SFENは出力時に都度生成

## 8. デザイントークン（作り込まない。クリーン系）

```
--bg:#fff  --text:#1b1b1d  --muted:#6b7280  --line:#e6e6ea  --soft:#f4f5f7
--accent:#dc4a37 (変換CTA・重要アクション)  --board:#f0c574  --board-line:#8a6a3a
font: system-ui,-apple-system,"Hiragino Sans","Noto Sans JP",sans-serif（駒だけ明朝）
radius:12px / カード影は薄く(0 4px 16px rgba(0,0,0,.06))
```
- ボタンは全て同一の高さ・角丸で統一感を出す。CTA(変換)のみ赤面。他は白面＋グレー枠
- prefers-reduced-motion 対応（アニメはスピナーとトーストのみ）
- タップ領域44px以上、:focus-visible にoutline

## 9. 実装メモ

- site.js は IIFE か type=module。グローバル汚染しない。onclick属性は使わずaddEventListener
- fetch でAPI呼び出し（$.ajaxは無い）。FormDataを送る際 Content-Type は**手動設定しない**
- 写真プレビューは `URL.createObjectURL(compressedBlob)`。古いURLは revoke
- Compressor失敗時（非対応形式等）は「この画像は読み込めませんでした」トースト
- 画像でない file.type は弾く（image/*チェック）
- FC2カウンターは document.write を使う古典スクリプトなので、**フッター内のその位置に同期scriptタグのまま**置く（asyncにしない）
- ページ内に `{{ message|safe }}` のようなテンプレート残骸は入れない
- HTML先頭コメントに「このページは docs/REBUILD_SPEC.md に基づく再実装」と1行残す

## 10. 受け入れ基準（実装後に自己チェック）

1. 初期表示: ロゴ・くま・2ボタンのみ。コンソールエラー0
2. 画像選択→写真が表示され「変換する」が現れる
3. 変換→busyオーバーレイ→(API成功で)盤表示。**先手持駒と最下段の駒が重ならない**（構造的に不可能なこと）
4. 盤マスタップ→パレット→駒変更が盤に反映
5. 持駒タップ→個数が回る。0で薄表示
6. KIFコピー結果が §2.4 と一致（平手初期局面でスナップショット比較）
7. SFENコピー結果が §2.5 と一致（平手: `lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b - 1`）
8. ぴよ将棋/KENTOボタンが §2.2/2.3 のURLを組み立てる
9. 375px(iPhone SE)〜desktopで横スクロール無し・盤が枠内
10. done→最初からやり直す→empty に完全リセット（写真URL revoke含む）

## 11. テスト用スタブ

開発検証用に、site.js 内に `window.__debugSetResult(json)` を残す（本番でも無害）。
平手局面JSONを渡すと done 状態に遷移して盤を描画する。これで実APIを叩かずに結果画面を確認できる。
