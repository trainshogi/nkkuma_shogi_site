#!/usr/bin/env bash
#
# shogi.nkkuma.tokyo デプロイスクリプト
#   本番 = S3バケット s3://shogi.nkkuma.tokyo + CloudFront(ECK0AXFXSKK8W)
#
# 使い方:
#   ./deploy.sh --dryrun   # 何がアップロードされるか表示するだけ（本番は変更しない）
#   ./deploy.sh            # 実デプロイ（バックアップ → キー注入 → S3同期 → CloudFrontキャッシュ破棄）
#
# APIキー:
#   ~/.shogi_api_key （1行だけキー。git管理外・パーミッション600）
#   コード上は '__API_KEY__' プレースホルダのままcommitし、デプロイ時にこのファイルの内容で置換する。
#   これによりキーは repo/GitHub には一切載らない（GitGuardian対策）。
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
ROOT="$(cd "$(dirname "$0")" && pwd)"
SRC="$ROOT/public/"
KEY_FILE="$HOME/.shogi_api_key"

EXCLUDES=(
  --exclude "firebase.json"
  --exclude "404.html"
  --exclude "mentenanse/*"
  --exclude "*.DS_Store"
  --exclude ".git/*"
)

# ---- ステージング: プレースホルダを実キーに置換した一時 public/ を作る ----
prepare_stage() {
  if [ ! -f "$KEY_FILE" ]; then
    echo "!! $KEY_FILE がありません。APIキーを1行だけ入れてください:"
    echo "   printf '<key>\\n' > $KEY_FILE && chmod 600 $KEY_FILE"
    exit 1
  fi
  API_KEY=$(head -1 "$KEY_FILE" | tr -d '\r\n ')
  if [ -z "$API_KEY" ]; then echo "!! $KEY_FILE が空です"; exit 1; fi

  STAGE=$(mktemp -d -t shogi-deploy)
  # ドットファイル含めコピー
  (cd "$SRC" && tar cf - .) | (cd "$STAGE" && tar xf -)

  # __API_KEY__ を含むファイルだけ置換（macOS/BSD sed 対応で -i '' を使う）
  local hits
  hits=$(grep -rl "__API_KEY__" "$STAGE" || true)
  if [ -z "$hits" ]; then
    echo "!! __API_KEY__ プレースホルダが見つかりません。site.jsを確認してください"; exit 1
  fi
  echo "$hits" | while read -r f; do
    sed -i '' "s|__API_KEY__|$API_KEY|g" "$f"
  done
  echo "   key injected into $(echo "$hits" | wc -l | tr -d ' ') file(s)"
}

cleanup_stage() { [ -n "${STAGE:-}" ] && rm -rf "$STAGE"; }
trap cleanup_stage EXIT

if [[ "${1:-}" == "--dryrun" ]]; then
  prepare_stage
  echo ">> DRYRUN: $STAGE/ -> $BUCKET （本番は変更しません）"
  out=$(aws s3 sync "$STAGE/" "$BUCKET" "${EXCLUDES[@]}" --dryrun 2>&1)
  if [[ -z "$out" ]]; then
    echo "✅ 差分ゼロ：public/ は本番と完全一致しています（キー注入後）"
  else
    # キーそのものを画面に出さない
    echo "$out" | sed "s|__API_KEY__|<key>|g"
    echo "---"
    echo "上記 $(echo "$out" | grep -c upload) 件がアップロード対象です"
  fi
  exit 0
fi

# ---- 実デプロイ ----
TS=$(date +%Y%m%d-%H%M%S)
BK="$HOME/shogi_prod_backups/prod-$TS"
echo ">> [1/4] 現本番をバックアップ -> $BK"
mkdir -p "$BK"
aws s3 sync "$BUCKET" "$BK" --quiet || true
BK_COUNT=$(find "$BK" -type f | wc -l | tr -d ' ')
if [ "$BK_COUNT" -lt 80 ]; then
  echo "!! バックアップが少なすぎます($BK_COUNT files)。中断します"; exit 1
fi
echo "$BK" > "$HOME/shogi_prod_backups/LATEST.txt"
echo "   backup: $BK_COUNT files"

echo ">> [2/4] APIキーを注入した一時公開ディレクトリを作成"
prepare_stage

echo ">> [3/4] S3へ同期"
# このバケットはオブジェクトACL(public-read)で配信している。ACL無しで上げると
# CloudFrontがAccessDeniedになりサイトが落ちる。必ず付与する
aws s3 sync "$STAGE/" "$BUCKET" "${EXCLUDES[@]}" --acl public-read

echo ">> [4/4] CloudFrontキャッシュ破棄 (dist $DIST_ID)"
aws cloudfront create-invalidation --distribution-id "$DIST_ID" --paths '/*' \
  --query 'Invalidation.{Id:Id,Status:Status}' --output table

echo "✅ デプロイ完了: https://shogi.nkkuma.tokyo/  （反映まで数分）"
