# HEVC(H.265) 動画が動画→棋譜変換で失敗する問題の診断

最終更新: 2026-08-14 / 診断レーン(Mac再起動を挟んで2セッション)

## 症状

iPhone 標準設定(高効率=HEVC/hvc1)で撮った対局動画を video.html に入れると、
環境によって「圧縮準備のまま長時間固まる → 失敗」に見える。

## 失敗段の特定(結論)

**失敗するのは web 側のブラウザ内圧縮(public/js/video-compress.js)だけ。
サーバ側(aws-nkkuma)は全段 HEVC を処理できる。**

| 段 | HEVC | 検証方法(2026-08-14) |
|---|---|---|
| web: ブラウザ内圧縮 | **環境依存で失敗** | 下記「原因」 |
| Lambda① extract (ffmpeg static 7.1) | OK | 本番コードを tools/local-runner/probe.mjs 経由でローカル実行。8bit mp4 / 10bit HLG mov とも probe.jpg 生成 |
| Lambda③ event-extract (cv2.VideoCapture) | OK | detect.py と同じ cv2 経路で両変種 50 フレームずつデコード成功。Dockerfile も 10bit HDR HEVC 前提の設計コメントあり |
| コンテナの ffmpeg ビルド | OK | mwader/static-ffmpeg は HEVC デコーダ内蔵。545MB 実 HEVC の処理実績が extract-keyframes.mjs のコメントに記録あり |

## 原因

WebCodecs の HEVC デコードは環境依存:

- 対応: Safari(iPhone/Mac)、Apple Silicon Mac の Chrome、HEVC HWデコーダ持ちの Windows 等
- 非対応: HWデコーダの無い PC の Chrome、プロプライエタリコーデック無しの Chromium 系

非対応環境では `VideoDecoder.isConfigSupported({codec:'hvc1...'})` が false になる。
従来の compress() はこの判定を **ファイル全量の demux が終わった後** にやっていた。

- 全サンプルをメモリに保持したまま全量を読む(500MB級で数分・実測 2026-08-13)
- 圧縮ONでは 20GB まで受けるため、GB級 HEVC ではタブがメモリで落ち、
  「そのままアップロード」フォールバックに到達すらできない = パイプライン失敗に見える

なお HEVC は「デコードできる環境なら」従来コードでも圧縮できていた
(hvcC description 抽出・QuickTime .mov コンテナとも問題なし。下記検証 T2/T3)。

## 修正内容(このブランチ)

public/js/video-compress.js に **moov だけ読むコーデック事前判定(プリフライト)** を追加:

- `probeCodec(file)`: mp4box の appendBuffer が返す「次に読みたいオフセット」に従って
  mdat を読み飛ばし、moov のみ読んでコーデック・寸法・description を得る
  (読み込み上限 64MB。moov に届かなければ null → 従来経路のまま)
- `preflightDecodeSupport(file)`: probe 結果で isConfigSupported を先に確認
- compress() 冒頭で非対応なら即 reject。エラーメッセージは従来と同一文字列
  (video.html の「圧縮に失敗したため、そのままアップロードします」表示互換)

フォールバック後は原本 HEVC がサーバへ行くが、上表のとおりサーバは HEVC 対応済みなので
2GB 以内なら棋譜化は成功する。

## 再現手順

```bash
# 素材生成(実対局動画から。直列1本ずつ)
ffmpeg -t 120 -i assembled.mp4 -c:v libx265 -preset fast -crf 26 -tag:v hvc1 -an hevc-8bit.mp4
ffmpeg -t 120 -i assembled.mp4 -c:v libx265 -preset fast -crf 26 -pix_fmt yuv420p10le \
  -color_primaries bt2020 -color_trc arib-std-b67 -colorspace bt2020nc -tag:v hvc1 -an hevc-10bit-hlg.mov
# 500MB級(HWエンコーダで高速生成)
ffmpeg -i assembled.mp4 -c:v hevc_videotoolbox -b:v 18M -tag:v hvc1 -an hevc-big.mp4

# サーバ段: 本番コードをそのままローカル実行
cd aws-nkkuma/tools/local-runner && node probe.mjs <hevcファイル> <workDir>
python3 -c "import cv2; cap=cv2.VideoCapture('<hevcファイル>'); print(cap.read()[0])"

# web段: mp4box/mp4-muxer/video-compress.js を読むハーネスページで
# VideoDecoder.isConfigSupported を hvc1 のとき false を返すよう差し替え、
# VideoCompress.compress() の失敗までの時間を測る
```

## 検証結果(2026-08-14, Apple Silicon Mac / Chrome系)

| テスト | 旧(master) | 新(このブランチ) |
|---|---|---|
| T2: 8bit HEVC mp4 (33MB) 圧縮 ※対応環境 | OK 2.3s → 30MB H.264 | OK 2.3s → 30MB(挙動不変) |
| T3: 10bit HLG .mov (33MB) 圧縮 ※対応環境 | OK 2.1s | OK 2.7s(挙動不変) |
| T4: 非対応環境模擬・540MB HEVC の失敗まで | 88ms・**全量540MBを読み samples 全保持** | 2ms・**読み込み≤16MB・サンプル保持なし** |
| 540MB HEVC 通常圧縮(対応環境・回帰) | — | OK 2.8s → 60MB H.264 |

注: T4 の旧実装 88ms は「メモリ上 blob」での数字。実際の File はストレージ I/O を伴い、
低速機では数分(2026-08-13 実測)。修正の本質は時間より **読み込み量(全量→moovのみ)と
メモリ(全サンプル保持→ゼロ)** で、GB級でのタブクラッシュを構造的に無くすこと。

## 本番反映に必要な手順

1. このブランチ(feature/hevc-compress-preflight)を PR → レビュー → master へマージ
2. `./deploy.sh --dryrun` で差分確認(変更が public/js/video-compress.js と docs のみであること)
3. **デプロイはオーナー事前許可の上で** `./deploy.sh`(S3 sync + CloudFront invalidation)
4. 反映後の実機確認: HEVC 非対応 PC(Windows Chrome 等)で HEVC 動画を選び、
   数秒で「圧縮に失敗したため、そのままアップロードします」に落ちて棋譜化まで通ること
5. サーバ側(aws-nkkuma)の変更・ECR 更新は不要

## 残課題(このレーン外)

- 非対応環境で 2GB 超の HEVC はフォールバック先の直接アップロード上限(2GB)で止まる。
  案内文言の改善 or サーバ側分割受け口の検討は別レーン
- aws-nkkuma extractProbeFrame の再走査が `-y` 欠落で空振りするバグを診断中に発見
  (HEVC 無関係)。別タスクとして切り出し済み
