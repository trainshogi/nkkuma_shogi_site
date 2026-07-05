import os, http.server, socketserver
ROOT = "/Users/akirasato/Documents/GitHub/nkkuma_shogi_site/public"
os.chdir(ROOT)
PORT = 8123
Handler = http.server.SimpleHTTPRequestHandler
socketserver.TCPServer.allow_reuse_address = True
with socketserver.TCPServer(("127.0.0.1", PORT), Handler) as httpd:
    print(f"serving {ROOT} at http://127.0.0.1:{PORT}")
    httpd.serve_forever()
