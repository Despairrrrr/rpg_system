"""Run: python3 tests/statistics-browser.py /path/to/chromium [width height].
Uses a temporary browser profile; never reads or writes the user's browser data.
External scripts are omitted so the test cannot contact Firebase.
"""
import http.server
import json
import os
import pathlib
import re
import subprocess
import sys
import tempfile
import threading

ROOT = pathlib.Path(__file__).resolve().parent.parent
seed = {"updatedAt": 17, "skills": [{"id": "math", "name": "Math", "goal": "", "xp": 100}], "goals": []}
html = (ROOT / 'index.html').read_text()
html = re.sub(r'<script src="https:[^"]+"></script>', '', html)
html = re.sub(r'<link[^>]+https:[^>]+>', '', html)
html = re.sub(r'<script src="firebase.init.js[^"]*"></script>', '', html)
html = html.replace('<script src="statistics-model.js', '<script>localStorage.setItem("neonGoalTracker.v1", ' + json.dumps(json.dumps(seed)) + ');</script><script src="statistics-model.js')
html = html.replace('</body>', '<script src="tests/statistics-browser.js"></script></body>')

class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def do_GET(self):
        if self.path == '/statistics-test':
            body = html.encode()
            self.send_response(200)
            self.send_header('Content-Type', 'text/html; charset=utf-8')
            self.send_header('Content-Length', str(len(body)))
            self.end_headers()
            self.wfile.write(body)
        else:
            super().do_GET()

    def log_message(self, *args):
        pass

server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), Handler)
threading.Thread(target=server.serve_forever, daemon=True).start()
width, height = sys.argv[2:4] if len(sys.argv) > 3 else ('1440', '1100')
if sys.argv[1] == 'webkit':
    # Offscreen WebKit is useful on Linux installations without headless Chromium.
    for key in ['LD_LIBRARY_PATH', 'GTK_PATH', 'GTK_EXE_PREFIX', 'GTK_MODULES', 'GIO_EXTRA_MODULES', 'GIO_MODULE_DIR']:
        os.environ.pop(key, None)
    os.environ['WEBKIT_DISABLE_COMPOSITING_MODE'] = '1'
    import gi
    gi.require_version('Gtk', '3.0')
    gi.require_version('WebKit2', '4.1')
    from gi.repository import Gtk, WebKit2, GLib
    context = WebKit2.WebContext.new_ephemeral()
    view = WebKit2.WebView.new_with_context(context)
    window = Gtk.OffscreenWindow()
    window.set_default_size(int(width), int(height))
    window.add(view)
    window.show_all()
    outcome = []

    def result_ready(webview, result, *_):
        try:
            value = webview.evaluate_javascript_finish(result).to_string()
            outcome.append(value)
            print(value)
            surface = window.get_surface()
            if surface:
                surface.write_to_png('/tmp/statistics-' + width + '.png')
        except Exception as error:
            print(error)
        Gtk.main_quit()

    def loaded(webview, event):
        if event == WebKit2.LoadEvent.FINISHED:
            script = "document.getElementById('test-result')?.textContent || 'FAIL: test did not finish'"
            GLib.timeout_add(500, lambda: webview.evaluate_javascript(script, -1, None, None, None, result_ready, None))

    view.connect('load-changed', loaded)
    view.load_uri(f'http://127.0.0.1:{server.server_port}/statistics-test')
    GLib.timeout_add_seconds(30, lambda: Gtk.main_quit())
    Gtk.main()
    server.shutdown()
    raise SystemExit(0 if outcome and outcome[0].startswith('PASS:') else 1)

with tempfile.TemporaryDirectory(prefix='statistics-browser-') as profile:
    result = subprocess.run([
        sys.argv[1], '--headless', '--no-sandbox', '--disable-gpu', '--disable-background-networking',
        '--no-first-run', '--no-default-browser-check', '--disable-extensions', '--no-proxy-server', '--disable-dev-shm-usage',
        '--user-data-dir=' + profile, '--window-size=' + width + ',' + height,
        '--virtual-time-budget=3000', '--dump-dom', '--screenshot=/tmp/statistics-' + width + '.png',
        f'http://127.0.0.1:{server.server_port}/statistics-test',
    ], capture_output=True, text=True, timeout=45)
    match = re.search(r'<pre id="test-result"[^>]*>(.*?)</pre>', result.stdout, re.S)
    if not match:
        print(result.stderr[-3000:])
        print(result.stdout[-3000:])
        raise SystemExit('FAIL: browser test did not finish')
    print(match.group(1))
    if not match.group(1).startswith('PASS:'):
        raise SystemExit(1)
server.shutdown()
