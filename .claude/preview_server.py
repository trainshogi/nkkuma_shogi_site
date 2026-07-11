#!/usr/bin/env python3
"""ローカルプレビュー用の静的サーバ。

このスクリプトからの相対で ../public を配信する（マシン固有の絶対パスに依存しない）。
APIキーはプレースホルダ(__API_KEY__ 等)のまま配信されるため、この簡易プレビューでは
実際の認識APIは叩けない。実キーで動かしたい場合は public/ を別ディレクトリにコピーし、
sed でキーを注入したものを配信する。
"""
import http.server
import os
import socketserver

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "public")
PORT = int(os.environ.get("PORT", "8123"))

os.chdir(ROOT)
socketserver.TCPServer.allow_reuse_address = True
with socketserver.TCPServer(("127.0.0.1", PORT), http.server.SimpleHTTPRequestHandler) as httpd:
    print(f"serving {os.path.realpath(ROOT)} at http://127.0.0.1:{PORT}")
    httpd.serve_forever()
