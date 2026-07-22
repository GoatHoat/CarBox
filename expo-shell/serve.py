"""CarBox dev static server — serves ../app and ALWAYS returns the full file
(HTTP 200), never a 304 "use your cache". This defeats the Expo/WKWebView
cache so every code change shows up on a normal reload.

Run:  python expo-shell/serve.py
Point the WebView (expo-shell/App.js) at http://<this-machine-ip>:8000/index.html
"""
import http.server
import socketserver
import os

PORT = 8000
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "app")


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    def _strip_conditional(self):
        # Remove the client's "only send if changed" headers so send_head()
        # can never answer 304 — it always streams the current file.
        for h in ("If-Modified-Since", "If-None-Match"):
            while h in self.headers:
                del self.headers[h]

    def do_GET(self):
        self._strip_conditional()
        super().do_GET()

    def do_HEAD(self):
        self._strip_conditional()
        super().do_HEAD()

    def end_headers(self):
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()


socketserver.TCPServer.allow_reuse_address = True
with socketserver.TCPServer(("0.0.0.0", PORT), NoCacheHandler) as httpd:
    print("CarBox dev server (always-200) serving %s on 0.0.0.0:%d" % (os.path.abspath(ROOT), PORT))
    httpd.serve_forever()
