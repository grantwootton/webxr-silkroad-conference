#!/usr/bin/env node
/**
 * HTTPS static server for WebXR / Quest testing.
 * Usage: npm run https
 * Open https://<this-machine-lan-ip>:8443 on Quest Browser (same Wi‑Fi).
 */
const https = require('https');
const fs = require('fs');
const path = require('path');
const os = require('os');

const root = path.join(__dirname, '..');
const PORT = Number(process.env.PORT) || 8443;
const HOST = process.env.HOST || '0.0.0.0';

const keyPath = path.join(root, 'cert.key');
const certPath = path.join(root, 'cert.crt');

if (!fs.existsSync(keyPath) || !fs.existsSync(certPath)) {
  console.error('Missing cert.key / cert.crt. Run: npm run https:certs');
  process.exit(1);
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.glb': 'model/gltf-binary',
  '.gltf': 'model/gltf+json',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.wav': 'audio/wav',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.wasm': 'application/wasm',
  '.pdf': 'application/pdf',
  '.map': 'application/json'
};

function lanIPv4() {
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] || []) {
      if (net.family === 'IPv4' && !net.internal) return net.address;
    }
  }
  return null;
}

function safeJoin(base, reqPath) {
  const decoded = decodeURIComponent((reqPath || '/').split('?')[0]);
  const cleaned = path.normalize(decoded).replace(/^(\.\.[/\\])+/, '');
  const full = path.join(base, cleaned);
  if (!full.startsWith(base)) return null;
  return full;
}

function sendFile(res, filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const type = MIME[ext] || 'application/octet-stream';
  const stat = fs.statSync(filePath);
  const range = res.req.headers.range;

  // Byte-range support (important for video seeking on Quest)
  if (range && ext === '.mp4') {
    const m = /^bytes=(\d*)-(\d*)$/.exec(range);
    if (m) {
      const start = m[1] ? parseInt(m[1], 10) : 0;
      const end = m[2] ? parseInt(m[2], 10) : stat.size - 1;
      if (start >= stat.size || end >= stat.size) {
        res.writeHead(416, { 'Content-Range': `bytes */${stat.size}` });
        res.end();
        return;
      }
      res.writeHead(206, {
        'Content-Type': type,
        'Content-Length': end - start + 1,
        'Content-Range': `bytes ${start}-${end}/${stat.size}`,
        'Accept-Ranges': 'bytes',
        'Access-Control-Allow-Origin': '*'
      });
      fs.createReadStream(filePath, { start, end }).pipe(res);
      return;
    }
  }

  res.writeHead(200, {
    'Content-Type': type,
    'Content-Length': stat.size,
    'Accept-Ranges': 'bytes',
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=3600'
  });
  fs.createReadStream(filePath).pipe(res);
}

const server = https.createServer(
  {
    key: fs.readFileSync(keyPath),
    cert: fs.readFileSync(certPath)
  },
  (req, res) => {
    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
        'Access-Control-Allow-Headers': 'Range, Content-Type'
      });
      res.end();
      return;
    }

    let filePath = safeJoin(root, req.url === '/' ? '/index.html' : req.url);
    if (!filePath) {
      res.writeHead(403);
      res.end('Forbidden');
      return;
    }

    // Directory → index.html
    if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
      filePath = path.join(filePath, 'index.html');
    }

    if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not found');
      return;
    }

    try {
      res.req = req;
      sendFile(res, filePath);
    } catch (err) {
      console.error(err);
      res.writeHead(500);
      res.end('Server error');
    }
  }
);

server.listen(PORT, HOST, () => {
  const ip = lanIPv4();
  console.log('');
  console.log('  Silk Road WebXR — HTTPS (for Quest / WebXR)');
  console.log('  -----------------------------------------');
  console.log(`  Local:   https://localhost:${PORT}`);
  if (ip) console.log(`  Quest:   https://${ip}:${PORT}`);
  console.log('');
  console.log('  On Quest Browser: open the Quest URL, accept the');
  console.log('  certificate warning (Advanced → Proceed), then Enter VR.');
  console.log('  Press Ctrl+C to stop.');
  console.log('');
});
