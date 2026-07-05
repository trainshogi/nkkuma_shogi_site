#!/usr/bin/env bash
#
# shogi.nkkuma.tokyo デプロイスクリプト
#   本番 = S3バケット s3://shogi.nkkuma.tokyo + CloudFront(ECK0AXFXSKK8W)
#
# 使い方:
#   ./deploy.sh --dryrun   # 何がアップロードされるか表示するだけ（本番は変更しない）
#   ./deploy.sh            # 実デプロイ（本番バックアップ → S3同期 → CloudFrontキャッシュ破棄）
#
# ロールバック:
#   1) S3バージョニング有効 → コンソール/CLIで過去バージョンに復元可
#   2) 実デプロイ前に ~/shogi_prod_backups/prod-<日時>/ に丸ごとバックアップを自動取得
#      復元例: AWS_PROFILE=local-claude aws s3 sync ~/shogi_prod_backups/prod-<日時>/ s3://shogi.nkkuma.tokyo
#
set -euo pipefail

export AWS_PROFILE="${AWS_PROFILE:-local-claude}"
BUCKET="s3://shogi.nkkuma.tokyo"
DIST_ID="ECK0AXFXSKK8W"
SRC="$(cd "$(dirname "$0")" && pwd)/public/"

# 本番に配信しないリポジトリ独自ファイル / 権限の無いファイル
EXCLUDES=(
  --exclude "firebase.json"
  --exclude "404.html"
  --exclude "mentenanse/*"
  --exclude "*.DS_Store"
  --exclude ".git/*"
)

if [[ "${1:-}" == "--dryrun" ]]; then
  echo ">> DRYRUN: $SRC -> $BUCKET （本番は変更しません）"
  out=$(aws s3 sync "$SRC" "$BUCKET" "${EXCLUDES[@]}" --dryrun 2>&1)
  if [[ -z "$out" ]]; then
    echo "✅ 差分ゼロ：public/ は本番と完全一致しています"
  else
    echo "$out"
    echo "---"
    echo "上記 $(echo "$out" | grep -c upload) 件がアップロード対象です"
  fi
  exit 0
fi

# ---- 実デプロイ ----
TS=$(date +%Y%m%d-%H%M%S)
BK="$HOME/shogi_prod_backups/prod-$TS"
echo ">> [1/3] 現本番をバックアップ -> $BK"
mkdir -p "$BK"
# 権限のない古いオブジェクト(mentenanse等)が数件あり sync が exit 1 を返すため許容する
aws s3 sync "$BUCKET" "$BK" --quiet || true
BK_COUNT=$(find "$BK" -type f | wc -l | tr -d ' ')
if [ "$BK_COUNT" -lt 80 ]; then
  echo "!! バックアップが少なすぎます($BK_COUNT files)。中断します"; exit 1
fi
echo "$BK" > "$HOME/shogi_prod_backups/LATEST.txt"
echo "   backup: $BK_COUNT files"

echo ">> [2/3] S3へ同期"
# このバケットはオブジェクトACL(public-read)で配信している。ACL無しで上げると
# CloudFrontがAccessDeniedになりサイトが落ちる(2026-07-06に実際に発生)。必ず付与する
aws s3 sync "$SRC" "$BUCKET" "${EXCLUDES[@]}" --acl public-read

echo ">> [3/3] CloudFrontキャッシュ破棄 (dist $DIST_ID)"
aws cloudfront create-invalidation --distribution-id "$DIST_ID" --paths '/*' \
  --query 'Invalidation.{Id:Id,Status:Status}' --output table

echo "✅ デプロイ完了: https://shogi.nkkuma.tokyo/  （反映まで数分）"
