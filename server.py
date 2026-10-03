#!/usr/bin/env python3
"""
ME.js paste-image upload receiver — zero-dependency (Python stdlib only).

A tiny optional companion for the ME.js editor: when the editor's
`uploadUrl` option points at this server, images pasted into the editor
are uploaded here and inserted as clean URLs instead of base64 blobs.

Endpoints:
  GET  /                  serve index.html (the editor demo) & open it in browser
  POST /upload            multipart/form-data, field "file" -> { "url": "/uploads/xxx.png" }
                          also accepts raw image bodies (image/png etc.)
  GET  /uploads/<name>    serve uploaded files

Run:
  python server.py          # listens on 0.0.0.0:1688
  python server.py 9000     # custom port

Security notes:
  - filenames are sanitized (safe charset, length-capped, UUID suffix)
  - extensions are derived from magic bytes when missing/unknown
  - CORS is fully open so the editor works from file:// or any origin
  - this is a development/standalone tool, not hardened for hostile networks
"""
import os
import sys
import re
import time
import uuid
import mimetypes
from http.server import HTTPServer, BaseHTTPRequestHandler, SimpleHTTPRequestHandler


def parse_header(line):
    """Parse 'multipart/form-data; boundary=xxx' -> (main, {'boundary': 'xxx'})."""
    parts = (line or '').split(';')
    main = parts[0].strip().lower()
    params = {}
    for p in parts[1:]:
        if '=' in p:
            k, v = p.split('=', 1)
            v = v.strip().strip('"')
            params[k.strip().lower()] = v
    return main, params

import email.parser
import email.policy

HOST = '0.0.0.0'
PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 1688
UPLOAD_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'uploads')
os.makedirs(UPLOAD_DIR, exist_ok=True)

SAFE_NAME = re.compile(r'[^A-Za-z0-9._-]')

EXT_BY_MIME = {
    'image/png': '.png',
    'image/jpeg': '.jpg',
    'image/gif': '.gif',
    'image/webp': '.webp',
    'image/svg+xml': '.svg',
    'image/bmp': '.bmp',
}


def save_upload(filename: str, data: bytes) -> str:
    """Persist bytes under uploads/ with a unique safe name; return web path."""
    ext = os.path.splitext(filename)[1].lower()
    if ext not in ('.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.bmp'):
        # unknown/missing extension: derive from magic bytes
        ext = '.png'
        if data[:3] == b'\xff\xd8\xff':
            ext = '.jpg'
        elif data[:6] in (b'GIF87a', b'GIF89a'):
            ext = '.gif'
        elif data[:4] == b'RIFF' and data[8:12] == b'WEBP':
            ext = '.webp'
    base = SAFE_NAME.sub('_', os.path.splitext(os.path.basename(filename))[0])[:40] or 'img'
    name = f"{base}_{time.strftime('%Y%m%d')}_{uuid.uuid4().hex[:8]}{ext}"
    with open(os.path.join(UPLOAD_DIR, name), 'wb') as f:
        f.write(data)
    return '/uploads/' + name


class Handler(SimpleHTTPRequestHandler):
    # serve files from the script directory (uploads/ lives there)
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=os.path.dirname(os.path.abspath(__file__)), **kwargs)

    def log_message(self, fmt, *args):
        sys.stderr.write('[%s] %s\n' % (self.log_date_time_string(), fmt % args))

    # ---- CORS for editor pages on file:// or other origins ----
    def _cors(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'POST, GET, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')

    def do_OPTIONS(self):
        self.send_response(204)
        self._cors()
        self.end_headers()

    # ---- upload endpoint ----
    def do_POST(self):
        if self.path.split('?')[0] != '/upload':
            self.send_error(404, 'Unknown endpoint; use POST /upload')
            return

        ctype = self.headers.get('Content-Type', '')
        length = int(self.headers.get('Content-Length', 0) or 0)
        if length <= 0:
            self._json(400, {'error': 'Empty request body'})
            return
        body = self.rfile.read(length)

        mime_main, params = parse_header(ctype)
        if mime_main == 'multipart/form-data':
            url, err = self._parse_multipart(params.get('boundary', '').encode(), body)
        elif mime_main in ('image/png', 'image/jpeg', 'image/gif', 'image/webp',
                           'application/octet-stream'):
            # raw body upload
            name = params.get('filename', 'paste.png') if params else 'paste.png'
            url = save_upload(name, body)
            err = None
        else:
            url, err = None, f'Unsupported Content-Type: {ctype}'

        if err:
            self._json(400, {'error': err})
            return
        self._json(200, {'url': url})

    def _parse_multipart(self, boundary, body):
        """Minimal multipart parser (field name: file)."""
        delim = b'--' + boundary
        for part in body.split(delim):
            part = part.strip(b'\r\n')
            if not part or part == b'--':
                continue
            if b'\r\n\r\n' not in part:
                continue
            raw_headers, data = part.split(b'\r\n\r\n', 1)
            if data.endswith(b'\r\n'):
                data = data[:-2]
            headers = {}
            for line in raw_headers.decode('utf-8', 'replace').split('\r\n'):
                if ':' in line:
                    k, v = line.split(':', 1)
                    headers[k.strip().lower()] = v.strip()
            disp = headers.get('content-disposition', '')
            name_m = re.search(r'name="([^"]*)"', disp)
            file_m = re.search(r'filename="([^"]*)"', disp)
            field = name_m.group(1) if name_m else ''
            if field != 'file' and file_m is None:
                continue  # skip non-file fields
            filename = file_m.group(1) if file_m else 'paste.png'
            if not filename:
                filename = 'paste.png'
            return save_upload(filename, data), None
        return None, 'No file field found in multipart body'

    def do_GET(self):
        # serve index.html as the homepage
        if self.path.split('?')[0] == '/':
            self.path = '/index.html'
        super().do_GET()

    def _json(self, code, obj):
        import json
        payload = json.dumps(obj).encode()
        self.send_response(code)
        self._cors()
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)


import threading
import webbrowser

if __name__ == '__main__':
    server = HTTPServer((HOST, PORT), Handler)
    url = f'http://localhost:{PORT}'
    print(f'ME.js upload server running at {url}')
    print(f'  GET  /               <- editor homepage (index.html)')
    print(f'  POST /upload         <- paste-image uploads')
    print(f'  GET  /uploads/<f>    <- served images')
    print(f'  uploads dir: {UPLOAD_DIR}')
    # open the editor homepage in the default browser
    threading.Timer(0.5, lambda: webbrowser.open(url)).start()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print('\nbye')
