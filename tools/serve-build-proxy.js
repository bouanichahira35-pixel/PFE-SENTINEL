// BLOC 1 - Role du fichier.
// Ce fichier sert d'outil local pour serve-build-proxy.
// Point de vigilance: modifier avec prudence car ce fichier peut etre importe par plusieurs modules.

/* eslint-disable no-console */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

const ROOT = path.resolve(__dirname, '..');
const BUILD_DIR = path.join(ROOT, 'build');

const PORT = Number(process.env.PORT || 8080);
const BACKEND_ORIGIN = process.env.BACKEND_ORIGIN || 'http://127.0.0.1:5000';

const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

function safeJoin(baseDir, requestedPath) {
  const resolved = path.resolve(baseDir, `.${requestedPath}`);
  if (!resolved.startsWith(baseDir + path.sep) && resolved !== baseDir) return null;
  return resolved;
}

function send(res, statusCode, body, headers = {}) {
  res.writeHead(statusCode, { 'Cache-Control': 'no-store', ...headers });
  res.end(body);
}

function proxyToBackend(req, res) {
  const backendUrl = new URL(BACKEND_ORIGIN);

  const options = {
    protocol: backendUrl.protocol,
    hostname: backendUrl.hostname,
    port: backendUrl.port || (backendUrl.protocol === 'https:' ? 443 : 80),
    method: req.method,
    path: req.url,
    headers: {
      ...req.headers,
      host: backendUrl.host,
    },
  };

  const upstream = http.request(options, (upstreamRes) => {
    res.writeHead(upstreamRes.statusCode || 502, upstreamRes.headers);
    upstreamRes.pipe(res);
  });

  upstream.on('error', (err) => {
    send(res, 502, JSON.stringify({ error: 'Backend unreachable', details: err.message }));
  });

  req.pipe(upstream);
}

function serveStatic(req, res) {
  const urlObj = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = urlObj.pathname || '/';

  if (pathname === '/healthz') return send(res, 200, 'ok');

  // Direct file request
  const filePath = safeJoin(BUILD_DIR, pathname);
  if (!filePath) return send(res, 400, 'Bad path');

  const hasExt = path.extname(filePath) !== '';
  const candidate = hasExt ? filePath : path.join(BUILD_DIR, 'index.html');

  fs.stat(candidate, (err, stat) => {
    if (err || !stat.isFile()) {
      // SPA fallback (route React)
      const indexPath = path.join(BUILD_DIR, 'index.html');
      return fs.readFile(indexPath, (indexErr, indexBuf) => {
        if (indexErr) return send(res, 500, 'Missing build/index.html');
        return send(res, 200, indexBuf, { 'Content-Type': 'text/html; charset=utf-8' });
      });
    }

    const ext = path.extname(candidate).toLowerCase();
    const contentType = mimeTypes[ext] || 'application/octet-stream';

    const stream = fs.createReadStream(candidate);
    stream.on('error', () => send(res, 500, 'Read error'));
    res.writeHead(200, { 'Content-Type': contentType });
    stream.pipe(res);
  });
}

const server = http.createServer((req, res) => {
  if (!req.url) return send(res, 400, 'Bad request');
  if (req.url.startsWith('/api/')) return proxyToBackend(req, res);
  return serveStatic(req, res);
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`[serve-build-proxy] listening on http://127.0.0.1:${PORT}`);
  console.log(`[serve-build-proxy] proxy /api/* -> ${BACKEND_ORIGIN}`);
  console.log(`[serve-build-proxy] serving ${BUILD_DIR}`);
});

