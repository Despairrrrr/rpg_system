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
page = os.environ.get('GOAL_TEST_PAGE', 'index.html')
html = (ROOT / page).read_text()
html = re.sub(r'<script src="https:[^"]+"></script>', '', html)
html = re.sub(r'<link[^>]+https:[^>]+>', '', html)
html = re.sub(r'<script src="firebase.init.js[^"]*"></script>', '', html)
html = html.replace('<script src="statistics-model.js', '<script>localStorage.setItem("neonGoalTracker.v1", ' + json.dumps(json.dumps(seed)) + ');</script><script src="statistics-model.js')
instrumentation = """<script>
window.__browserErrors = [];
window.addEventListener('error', event => window.__browserErrors.push(event.message));
window.addEventListener('unhandledrejection', event => window.__browserErrors.push(String(event.reason)));
const originalError = console.error;
console.error = (...args) => { window.__browserErrors.push(args.join(' ')); originalError.apply(console, args); };
const originalWarn = console.warn;
console.warn = (...args) => { window.__browserErrors.push(args.join(' ')); originalWarn.apply(console, args); };
window.__notifications = [];
window.Notification = class {
  static permission = 'denied';
  static requests = 0;
  static result = 'granted';
  static requestPermission() { this.requests++; this.permission = this.result; return Promise.resolve(this.result); }
  constructor(title, options) { this.title = title; this.options = options; window.__notifications.push(this); }
  close() { this.closed = true; }
};
</script>"""
html = html.replace('<script src="statistics-model.js', instrumentation + '<script src="statistics-model.js')
test_script = os.environ.get('STATISTICS_TEST_SCRIPT', 'statistics-browser.js')
html = html.replace('</body>', f'<script src="tests/{test_script}"></script></body>')

class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def end_headers(self):
        # Defense in depth: even a mistaken fixture navigation cannot contact cloud services.
        self.send_header('Content-Security-Policy', "default-src 'self' data: blob:; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data: blob:")
        super().end_headers()

    def do_GET(self):
        if self.path.split('?')[0] == '/statistics-test':
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
    if os.environ.get('STATISTICS_REDUCED_MOTION') == '1':
        Gtk.Settings.get_default().set_property('gtk-enable-animations', False)
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
            if not value:
                GLib.timeout_add(200, check_result)
                return
            outcome.append(value)
            print(value)
            surface = window.get_surface()
            if surface:
                surface.write_to_png(os.environ.get('BROWSER_SCREENSHOT', '/tmp/statistics-' + width + '.png'))
        except Exception as error:
            print(error)
        Gtk.main_quit()

    def check_result():
        script = "window.__browserErrors?.length ? 'FAIL: browser console: ' + window.__browserErrors.join('; ') : document.getElementById('test-result')?.textContent || ''"
        view.evaluate_javascript(script, -1, None, None, None, result_ready, None)
        return False

    def loaded(webview, event):
        if event == WebKit2.LoadEvent.FINISHED:
            GLib.timeout_add(700, check_result)

    view.connect('load-changed', loaded)
    view.load_uri(f'http://127.0.0.1:{server.server_port}/statistics-test?id=math')
    GLib.timeout_add_seconds(30, lambda: Gtk.main_quit())
    Gtk.main()
    server.shutdown()
    raise SystemExit(0 if outcome and outcome[0].startswith('PASS:') else 1)

with tempfile.TemporaryDirectory(prefix='statistics-browser-') as profile:
    result = subprocess.run([
        sys.argv[1], '--headless', '--no-sandbox', '--disable-gpu', '--disable-background-networking',
        '--no-first-run', '--no-default-browser-check', '--disable-extensions', '--no-proxy-server', '--disable-dev-shm-usage',
        '--user-data-dir=' + profile, '--window-size=' + width + ',' + height,
        '--virtual-time-budget=15000', '--dump-dom', '--screenshot=/tmp/statistics-' + width + '.png',
        f'http://127.0.0.1:{server.server_port}/statistics-test?id=math',
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
