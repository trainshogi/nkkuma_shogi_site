#!/usr/bin/env python3
"""ブログのビルドスクリプト。

articles/*.md を読み、blog/template.html に流し込んで public/blog/ へ出力する。
生成物は git にコミットする運用（ビルド環境が無くてもデプロイできるようにするため）。

使い方:
    python3 blog/build.py

必要なもの: pip install markdown

生成されるもの:
    public/blog/<slug>/index.html   … 各記事
    public/blog/index.html          … 記事一覧
    public/sitemap.xml              … サイトマップ（トップ・ブログ含む）

記事の書き方は blog/README.md を参照。
"""
import html
import os
import re
import sys

try:
    import markdown
except ImportError:
    sys.exit("markdown パッケージがありません。 pip3 install markdown してください")

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ARTICLES_DIR = os.path.join(ROOT, "articles")
TEMPLATE = os.path.join(ROOT, "blog", "template.html")
OUT_DIR = os.path.join(ROOT, "public", "blog")
SITE = "https://shogi.nkkuma.tokyo"

REQUIRED_KEYS = ("title", "description", "slug", "date")


def parse_front_matter(text, path):
    """先頭の --- で囲まれた key: value を辞書で返す。本文も返す。"""
    m = re.match(r"\A---\s*\n(.*?)\n---\s*\n", text, re.DOTALL)
    if not m:
        sys.exit(f"{path}: 先頭に front matter (--- で囲む) がありません")
    meta = {}
    for line in m.group(1).splitlines():
        if ":" not in line:
            continue
        k, v = line.split(":", 1)
        meta[k.strip()] = v.strip()
    for k in REQUIRED_KEYS:
        if not meta.get(k):
            sys.exit(f"{path}: front matter に {k} がありません")
    if not re.match(r"^[a-z0-9-]+$", meta["slug"]):
        sys.exit(f"{path}: slug は英小文字・数字・ハイフンのみにしてください: {meta['slug']}")
    return meta, text[m.end():]


def render(template, meta, content_html):
    out = template
    for k in ("title", "description", "slug", "date"):
        out = out.replace("{{" + k + "}}", html.escape(meta[k]) if k != "date" else meta[k])
    return out.replace("{{content}}", content_html)


def main():
    with open(TEMPLATE, encoding="utf-8") as f:
        template = f.read()

    articles = []
    for name in sorted(os.listdir(ARTICLES_DIR)):
        if not name.endswith(".md"):
            continue
        path = os.path.join(ARTICLES_DIR, name)
        with open(path, encoding="utf-8") as f:
            meta, body = parse_front_matter(f.read(), path)
        content = markdown.markdown(body, extensions=["extra", "sane_lists"])
        page = render(template, meta, content)
        out_dir = os.path.join(OUT_DIR, meta["slug"])
        os.makedirs(out_dir, exist_ok=True)
        with open(os.path.join(out_dir, "index.html"), "w", encoding="utf-8") as f:
            f.write(page)
        articles.append(meta)
        print(f"  built: /blog/{meta['slug']}/  ({meta['title']})")

    # 新しい日付順に並べる
    articles.sort(key=lambda a: a["date"], reverse=True)

    # 記事一覧ページ
    items = "\n".join(
        f'      <li><a href="/blog/{a["slug"]}/">{html.escape(a["title"])}</a>'
        f'<span class="d">{a["date"]}</span></li>'
        for a in articles
    )
    index_html = (
        template
        .replace("{{title}}", "記事一覧")
        .replace("{{description}}", "将棋の棋譜・KIF形式・盤面認識に関する解説記事")
        .replace("{{slug}}", "")
        .replace("{{date}}", "")
        .replace(
            "{{content}}",
            "<style>.post-list{list-style:none;padding:0}"
            ".post-list li{margin:0 0 14px}"
            ".post-list .d{color:#999;font-size:12.5px;margin-left:10px}</style>\n"
            f'    <ul class="post-list">\n{items}\n    </ul>',
        )
    )
    with open(os.path.join(OUT_DIR, "index.html"), "w", encoding="utf-8") as f:
        f.write(index_html)
    print("  built: /blog/  (一覧)")

    # sitemap.xml（トップ・ブログ一覧・各記事）
    urls = [f"{SITE}/", f"{SITE}/blog/"] + [f"{SITE}/blog/{a['slug']}/" for a in articles]
    body = "\n".join(f"  <url><loc>{u}</loc></url>" for u in urls)
    sitemap = (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
        f"{body}\n</urlset>\n"
    )
    with open(os.path.join(ROOT, "public", "sitemap.xml"), "w", encoding="utf-8") as f:
        f.write(sitemap)
    print("  built: /sitemap.xml")

    print(f"完了: 記事 {len(articles)} 本")


if __name__ == "__main__":
    main()
