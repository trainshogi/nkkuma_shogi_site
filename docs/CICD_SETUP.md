# CI/CD 初期設定手順

GitHub Actions (`.github/workflows/deploy-s3.yml`) が OIDC でAWSにログインし、
master への push (`public/**` 変更時) で S3 + CloudFront に自動デプロイする設定。

- 認証: OIDC（AWSの長期キーをGitHubに保存しない）
- APIキー注入: GitHub Secrets `SHOGI_API_KEY` から
- 安全ガード: 変数/シークレット未設定の間は job がスキップされる

手動デプロイ `./deploy.sh` は今後も併用可能（緊急時・ローカル確認用）。

---

## セットアップ (1回だけ)

### Step 1. AWS 側 — root プロファイルで実行

`local-claude` は IAM 権限を持たないため **root で** 実行してください。
`aws login`（無ければ `aws login --profile default`）で認証してから、以下を1ブロックで貼り付け:

```bash
export AWS_PROFILE=default   # rootプロファイル。console login のセッションが使える

# 1) GitHub OIDC プロバイダを登録（既に登録済みなら EntityAlreadyExists で無害）
aws iam create-open-id-connect-provider \
  --url https://token.actions.githubusercontent.com \
  --client-id-list sts.amazonaws.com \
  --thumbprint-list 6938fd4d98bab03faadb97b34396831e3780aea1 || true

# 2) 信頼ポリシー（このリポジトリの master ブランチからのみ引受可能）
cat > /tmp/trust-policy.json <<'EOF'
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Principal": { "Federated": "arn:aws:iam::281150801606:oidc-provider/token.actions.githubusercontent.com" },
    "Action": "sts:AssumeRoleWithWebIdentity",
    "Condition": {
      "StringEquals": { "token.actions.githubusercontent.com:aud": "sts.amazonaws.com" },
      "StringLike":   { "token.actions.githubusercontent.com:sub": "repo:trainshogi/nkkuma_shogi_site:*" }
    }
  }]
}
EOF

# 3) 権限ポリシー（S3 + CloudFront invalidation の最小権限）
cat > /tmp/permissions-policy.json <<'EOF'
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["s3:ListBucket"],
      "Resource": "arn:aws:s3:::shogi.nkkuma.tokyo"
    },
    {
      "Effect": "Allow",
      "Action": ["s3:PutObject", "s3:PutObjectAcl", "s3:GetObject", "s3:DeleteObject"],
      "Resource": "arn:aws:s3:::shogi.nkkuma.tokyo/*"
    },
    {
      "Effect": "Allow",
      "Action": ["cloudfront:CreateInvalidation"],
      "Resource": "arn:aws:cloudfront::281150801606:distribution/ECK0AXFXSKK8W"
    }
  ]
}
EOF

# 4) ロール作成 + ポリシー付与
aws iam create-role \
  --role-name github-deploy-shogi-site \
  --assume-role-policy-document file:///tmp/trust-policy.json
aws iam put-role-policy \
  --role-name github-deploy-shogi-site \
  --policy-name deploy-shogi-site \
  --policy-document file:///tmp/permissions-policy.json

# 5) 出来上がった Role ARN を控える（この値を GitHub 変数に入れる）
aws iam get-role --role-name github-deploy-shogi-site --query 'Role.Arn' --output text
```

出力例: `arn:aws:iam::281150801606:role/github-deploy-shogi-site`

### Step 2. GitHub 側 — 変数とシークレットを登録

`gh` CLI 認証済みなら、以下を1ブロックで:

```bash
REPO=trainshogi/nkkuma_shogi_site

# 変数(variables): 公開OK。ロール ARN を入れる
gh variable set AWS_ROLE_ARN --repo $REPO \
  --body "arn:aws:iam::281150801606:role/github-deploy-shogi-site"

# シークレット(secrets): APIキー。実キー(1行)を渡す
gh secret set SHOGI_API_KEY --repo $REPO --body "$(cat ~/.shogi_api_key)"
```

ブラウザ設定の場合:
- Settings → Secrets and variables → Actions →
  - **Variables** タブに `AWS_ROLE_ARN` = 上のRole ARN
  - **Secrets** タブに `SHOGI_API_KEY` = `~/.shogi_api_key` の中身（1行）

### Step 3. 動作確認

GitHub → Actions → "Deploy to S3" → **Run workflow** で手動実行。成功したら
https://shogi.nkkuma.tokyo/ を実機で確認。以降は master の `public/**` push で自動反映。

---

## ロールバック手段

- **S3バージョニング有効**: コンソールで各オブジェクトの前バージョンを復元
- **ローカルバックアップ**: `~/shogi_prod_backups/prod-<日時>/`（`./deploy.sh` 実行時に自動取得）
- **緊急時**: `./deploy.sh` でローカル状態を直接反映

---

## 触ってはいけない点

- Actions の secrets/variables は**ログにマスクされて出力される**が、workflow の run コマンドで `echo $SHOGI_API_KEY` は絶対に書かない（マスクはあくまで既知の文字列に対する後処理）
- 現在の workflow は `perl -i -pe` で置換していて、コマンドラインにキーは出さない設計
- 信頼ポリシーの `sub` は `repo:trainshogi/nkkuma_shogi_site:*` にしている（ブランチ問わずこのリポジトリのAction）。branch限定にしたければ `repo:trainshogi/nkkuma_shogi_site:ref:refs/heads/master` に絞る
