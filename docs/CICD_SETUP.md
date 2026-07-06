# CI/CD 初期設定手順（1回だけ・root権限のAWSで実行）

GitHub Actions（`.github/workflows/deploy-s3.yml`）が OIDC で AWS にログインし、
master への push で S3 + CloudFront に自動デプロイするための設定。
**リポジトリ変数 `AWS_ROLE_ARN` を設定するまで workflow はスキップされる**（安全）。

手動デプロイ（`./deploy.sh`）はこの後も併用可能（緊急時・ローカル確認用）。

---

## 手順1: GitHub OIDC プロバイダを IAM に登録（未登録なら）

AWSコンソール → IAM → IDプロバイダ → プロバイダを追加
- プロバイダのタイプ: OpenID Connect
- プロバイダのURL: `https://token.actions.githubusercontent.com`
- 対象者(Audience): `sts.amazonaws.com`

CLI（rootプロファイル）なら:
```bash
aws iam create-open-id-connect-provider \
  --url https://token.actions.githubusercontent.com \
  --client-id-list sts.amazonaws.com
```
（`EntityAlreadyExists` エラーなら登録済みなのでスキップ）

## 手順2: デプロイ用IAMロールを作成

### 信頼ポリシー（trust-policy.json）
`trainshogi/nkkuma_shogi_site` の **master ブランチからのみ** 引受可能に制限:
```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Principal": { "Federated": "arn:aws:iam::281150801606:oidc-provider/token.actions.githubusercontent.com" },
    "Action": "sts:AssumeRoleWithWebIdentity",
    "Condition": {
      "StringEquals": { "token.actions.githubusercontent.com:aud": "sts.amazonaws.com" },
      "StringLike": { "token.actions.githubusercontent.com:sub": "repo:trainshogi/nkkuma_shogi_site:ref:refs/heads/master" }
    }
  }]
}
```

### 権限ポリシー（permissions-policy.json）— 必要最小限
```json
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
```

### CLI一括作成
```bash
aws iam create-role --role-name github-deploy-shogi-site \
  --assume-role-policy-document file://trust-policy.json
aws iam put-role-policy --role-name github-deploy-shogi-site \
  --policy-name deploy-shogi-site --policy-document file://permissions-policy.json
```
出力の `Role.Arn`（`arn:aws:iam::281150801606:role/github-deploy-shogi-site`）を控える。

## 手順3: GitHub リポジトリ変数を設定

GitHub → `trainshogi/nkkuma_shogi_site` → Settings → Secrets and variables → Actions → **Variables** タブ
- Name: `AWS_ROLE_ARN`
- Value: `arn:aws:iam::281150801606:role/github-deploy-shogi-site`

CLI（gh）なら:
```bash
gh variable set AWS_ROLE_ARN --repo trainshogi/nkkuma_shogi_site \
  --body "arn:aws:iam::281150801606:role/github-deploy-shogi-site"
```

## 手順4: 動作確認

GitHub → Actions → "Deploy to S3" → Run workflow（workflow_dispatch）で手動起動し、
成功したら https://shogi.nkkuma.tokyo/ を確認。以後は master への push（public/ 変更時）で自動。

---

## ロールバック手段（従来どおり）
- S3バージョニング有効（過去版に復元可）
- ローカルバックアップ: `~/shogi_prod_backups/`（deploy.sh 実行時に自動取得）
- 緊急時は `./deploy.sh` で任意のローカル状態を直接反映
