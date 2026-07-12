# ブログの書き方・公開手順

## 記事を書く

1. `articles/` に Markdown ファイルを1つ作る（例: `articles/kif-guide.md`）
2. 先頭に front matter を付ける:

```
---
title: 記事タイトル（検索結果に出る。32文字前後が目安）
description: メタディスクリプション（検索結果の説明文。80〜120字目安）
slug: kif-guide        ← URLになる。英小文字とハイフンのみ
date: 2026-07-13
---

ここから本文をMarkdownで。
```

3. ビルドして生成物を確認:

```bash
python3 blog/build.py      # public/blog/ と public/sitemap.xml が更新される
python3 .claude/preview_server.py &   # http://127.0.0.1:8123/blog/ で確認
```

4. **生成物ごと**コミットしてPRを出す（master直pushは保護で不可）:

```bash
git checkout -b post/記事名
git add articles/ public/blog/ public/sitemap.xml
git commit -m "post: 記事タイトル"
git push origin HEAD
gh pr create --fill
```

5. PRをマージすると GitHub Actions が自動で本番（S3+CloudFront）に反映する

## 仕組み

- `blog/template.html` … 全記事共通の見た目（GA・OGP・ツールへの導線込み）
- `blog/build.py` … articles/*.md → public/blog/ を生成。sitemap.xml も作る
- 生成物をコミットする方式なので、CI にビルド環境は不要（今の deploy がそのまま動く）

## 書くときの注意

- 記事内から本体ツールへは `/`、他記事へは `/blog/slug/` で内部リンク
- 画像を使う場合は `public/img/blog/` に置いて `/img/blog/ファイル名` で参照
- AdSense 審査に通ったら `blog/template.html` の `<!-- AdSense -->` コメント部分にコードを貼って全記事を再ビルド
