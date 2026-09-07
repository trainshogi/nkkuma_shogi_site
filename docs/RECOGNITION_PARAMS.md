# 認識APIに送るパラメータ台帳（写真→棋譜の3ページ）

最終更新: 2026-09-08 / 対象コミット: `fix/hand-edit-and-engine-parity`

写真から局面を読む画面は3つあり、いずれも同じ受け口
`POST https://scv8fb0ca0.execute-api.ap-northeast-1.amazonaws.com/alpha/recognize`
（shogiapi-green 直結。ヘッダ `x-api-key` はデプロイ時に注入）を叩く。

| ページ | 実装ファイル | 位置づけ |
| --- | --- | --- |
| `index.html` | `public/js/site.js` | 本番トップ（新デザイン） |
| `classic.html` | `public/js/main_apigw.js` | 本番・旧デザイン（index から「以前のデザインで使う」で到達） |
| `beta.html` | `public/js/site-beta.js` | β（枠オーバーレイ・形勢判断つき） |
| `alpha.html` | `public/js/site-alpha.js` | 実験用。**台帳の対象外**（画面上のトグルで各値を切り替えるのが目的のページ） |

## 1. 送っているフィールド

`(空欄)` = そのフィールドを送っていない = サーバー既定値で動く。

### 変更前（origin/master・2026-09-08 時点の本番）

| フィールド | index | classic | beta |
| --- | --- | --- | --- |
| `hidden_rotate` | `0` | `0`（フォーム由来） | `0` |
| `hidden_sengo` | `true` | `true`/`false`（先手後手トグル由来） | `0` |
| `mode` | (空欄) | (空欄) | `all` |
| `model` | `v3` | `v3` | `v3` |
| `decoder` | `1` | `1` | `1` |
| `waku` | `v2` | **(空欄)** | `v2` |
| `mochi_crop` | **(空欄)** | **(空欄)** | `v2` |
| `mochi_ocr` | (空欄) | (空欄) | `1` |
| `mochi_postproc` | (空欄) | (空欄) | `0` |
| `joint` | (空欄) | (空欄) | `0` |
| 503/中断の自動リトライ | なし | なし | 1回 |

### 変更後（このブランチ）

| フィールド | index | classic | beta |
| --- | --- | --- | --- |
| `hidden_rotate` | `0` | `0`（フォーム由来） | `0` |
| `hidden_sengo` | `true` | `true`/`false`（先手後手トグル由来） | `true` |
| `mode` | `all` | `all` | `all` |
| `model` | `v3` | `v3` | `v3` |
| `decoder` | `1` | `1` | `1` |
| `waku` | `v2` | `v2` | `v2` |
| `mochi_crop` | `v2` | `v2` | `v2` |
| `mochi_ocr` | `1` | `1` | `1` |
| `mochi_postproc` | `0` | `0` | `0` |
| `joint` | `0` | `0` | `0` |
| 503/中断の自動リトライ | 1回 | なし（旧デザインは据え置き） | 1回 |

`beta.html` には認識設定のトグルが無い（`data-model` / `data-waku` の要素なし）ため、
`site-beta.js` の `state.modelVersion` などはページ内で常に初期値のまま使われる。
つまり β の実効値は上表のとおり固定である。

送信画像の作り方は3ページとも同じ（Compressor.js `quality:0.9 / maxWidth:2000 / maxHeight:2000`）。

## 2. 各フィールドが何に効くか（2026-09-08 ローカル認識API `127.0.0.1:8080` で1個ずつ外して実測）

| フィールド | 外したときの影響 |
| --- | --- |
| `waku` | **大**。既定 v1（旧UNet）に落ちる。ビニール盤+木目の床の1枚で盤上27枚→3枚、B01 で7マス相違 |
| `mochi_crop` | **中**。既定 v1 に落ち、駒台に無い持ち駒が湧く（B01: 後手に飛1金1、B02: 後手に金1、ビニール盤: 金1が消える） |
| `hidden_sengo` | 返る `teban` だけが変わる。**文字列 `'true'` のときだけ先手番**。`'0'` `'1'` `''` `'false'` はすべて後手番になる |
| `mode` / `mochi_ocr` / `mochi_postproc` / `joint` | 3枚では出力の差なし（既定値と同じ値を明示しているため）。明示は「既定が変わったときに巻き込まれない」ための保険 |
| `model` / `decoder` | 3ページとも従来から `v3` / `1` で一致していたため今回は不変 |

`hidden_sengo` は `docs/REBUILD_SPEC.md` §2.1 で `"true"`（固定・先手番デフォルト）と決めてある。
β の `'0'` はこの契約から外れており、β だけ毎回「後手番」で開いていた（今回 `'true'` に是正）。

## 3. 決めごと

- 認識エンジンの設定は **3ファイル（`site.js` / `site-beta.js` / `main_apigw.js`）で必ず同値**にする。
  どれか1つだけ直さない。直したらこの台帳も更新する。
- `hidden_rotate` / `hidden_sengo` は「エンジン」ではなく画面の入力なので、
  classic のフォーム由来の値はそのまま残す（回転ボタン・先手後手トグルを殺さないため）。
- 一致確認は `tools/check-recognition-params.js` で機械的にできる。

```
node tools/check-recognition-params.js
```
