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

# ブログ以外で sitemap.xml に載せるページ。ビルドのたびに消えないようここに書く
EXTRA_SITEMAP_PATHS = (
    "/komadori/gear.html",
    "/komadori/howto.html",
    "/komadori/placement.html",
    "/komadori/tottemita.html",
)


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


X_POST_RE = re.compile(r"^https://(?:x|twitter)\.com/([A-Za-z0-9_]{1,15})/status/([0-9]+)$")
X_WIDGETS = '<script async src="https://platform.twitter.com/widgets.js" charset="utf-8"></script>'


def x_posts_html(meta, path):
    """front matter の x_posts から「X の投稿」の節を作る。

    x_posts: https://x.com/<名前>/status/<番号> 表示名, https://x.com/... 表示名
    のように、カンマ区切りで並べる（表示名は省略できる）。
    X の埋め込み（blockquote.twitter-tweet + widgets.js）で出し、
    スクリプトが動かないときも投稿へのリンクとして読めるようにする。
    """
    raw = meta.get("x_posts", "")
    if not raw:
        return ""
    items = []
    for entry in raw.split(","):
        entry = entry.strip()
        if not entry:
            continue
        url, _, name = entry.partition(" ")
        m = X_POST_RE.match(url)
        if not m:
            sys.exit(f"{path}: x_posts の URL は https://x.com/<名前>/status/<番号> の形にしてください: {url}")
        handle, status = m.groups()
        url = f"https://x.com/{handle}/status/{status}"
        who = f"{html.escape(name.strip())}（@{handle}）の投稿" if name.strip() else f"@{handle} の投稿"
        items.append(
            '<blockquote class="twitter-tweet" data-lang="ja" data-dnt="true">'
            f'<p>{who}</p>'
            f'<p><a href="{url}">X で見る</a></p></blockquote>'
        )
    return (
        '<section class="x-posts">\n<h2>X の投稿</h2>\n'
        + "\n".join(items)
        + "\n</section>\n"
        + X_WIDGETS
    )


def render(template, meta, content_html):
    out = template
    for k in ("title", "description", "slug", "date"):
        out = out.replace("{{" + k + "}}", html.escape(meta[k]) if k != "date" else meta[k])
    out = out.replace("{{canonical}}", f"{SITE}/blog/{meta['slug']}.html")
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
        # 本文の {{x_posts}} の行に「X の投稿」の節を置く（無ければ本文の最後）
        x_html = x_posts_html(meta, path)
        if "<p>{{x_posts}}</p>" in content:
            content = content.replace("<p>{{x_posts}}</p>", x_html)
        elif x_html:
            content += "\n" + x_html
        page = render(template, meta, content)
        # このサイトのCloudFront構成はサブディレクトリのindex自動配信をしない
        # (ルートのDefaultRootObjectのみ)。既存(faq.html等)と同じフラットな
        # .html ファイルで出す。記事URLは /blog/<slug>.html
        os.makedirs(OUT_DIR, exist_ok=True)
        with open(os.path.join(OUT_DIR, meta["slug"] + ".html"), "w", encoding="utf-8") as f:
            f.write(page)
        articles.append(meta)
        print(f"  built: /blog/{meta['slug']}.html  ({meta['title']})")

    # 新しい日付順に並べる
    articles.sort(key=lambda a: a["date"], reverse=True)

    # 記事一覧ページ（/blog.html）
    items = "\n".join(
        f'      <li><a href="/blog/{a["slug"]}.html">{html.escape(a["title"])}</a>'
        f'<span class="d">{a["date"]}</span></li>'
        for a in articles
    )
    index_html = (
        template
        .replace("{{title}}", "記事一覧")
        .replace("{{description}}", "将棋の棋譜・KIF形式・盤面認識に関する解説記事")
        .replace("{{slug}}", "")
        .replace("{{canonical}}", f"{SITE}/blog.html")
        .replace("{{date}}", "")
        .replace(
            "{{content}}",
            "<style>.post-list{list-style:none;padding:0}"
            ".post-list li{margin:0 0 14px}"
            ".post-list .d{color:#999;font-size:12.5px;margin-left:10px}</style>\n"
            f'    <ul class="post-list">\n{items}\n    </ul>',
        )
    )
    with open(os.path.join(ROOT, "public", "blog.html"), "w", encoding="utf-8") as f:
        f.write(index_html)
    print("  built: /blog.html  (一覧)")

    # sitemap.xml（トップ・ブログ一覧・各記事）
    urls = (
        [f"{SITE}/", f"{SITE}/blog.html"]
        + [f"{SITE}/blog/{a['slug']}.html" for a in articles]
        + [f"{SITE}{p}" for p in EXTRA_SITEMAP_PATHS]
    )
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
