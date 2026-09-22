// server.js - Auto HTTPS Server for WebXR (Quest Pro Ready)
const https = require('https');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const PORT = 8080;
const ROOT = path.resolve('.');
const KEY_FILE = path.join(ROOT, 'cert.key');
const CERT_FILE = path.join(ROOT, 'cert.crt');

function generateCertificate() {
    if (fs.existsSync(KEY_FILE) && fs.existsSync(CERT_FILE)) {
        console.log('✅ Using existing certificates');
        return;
    }

    console.log('🔑 Generating self-signed certificate for localhost...');
    try {
        execSync(
            `openssl req -x509 -newkey rsa:4096 -keyout ${KEY_FILE} -out ${CERT_FILE} -days 365 -nodes -subj "/C=US/ST=Local/L=Local/O=WebXR/CN=localhost"`,
            { stdio: 'inherit' }
        );
        console.log('✅ Certificate generated successfully');
    } catch (err) {
        console.error('❌ Failed to generate certificate. Make sure OpenSSL is installed.');
        process.exit(1);
    }
}

generateCertificate();

const options = {
    key: fs.readFileSync(KEY_FILE),
    cert: fs.readFileSync(CERT_FILE)
};

const MIME = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.mjs': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.webp': 'image/webp',
    '.ktx2': 'image/ktx2',
    '.glb': 'model/gltf-binary',
    '.gltf': 'model/gltf+json',
    '.bin': 'application/octet-stream',
    '.mp4': 'video/mp4',
    '.webm': 'video/webm',
    '.mp3': 'audio/mpeg',
    '.wav': 'audio/wav',
    '.ogg': 'audio/ogg',
    '.ico': 'image/x-icon',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.ttf': 'font/ttf',
    '.wasm': 'application/wasm'
};

const CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Range, Content-Type',
    'Access-Control-Expose-Headers': 'Accept-Ranges, Content-Length, Content-Range',
    'Accept-Ranges': 'bytes'
};

function safeJoin(urlPath) {
    const decoded = decodeURIComponent(urlPath.split('?')[0]);
    const resolved = path.resolve(path.join(ROOT, decoded));
    if (resolved !== ROOT && !resolved.startsWith(ROOT + path.sep)) {
        return null;
    }
    return resolved;
}

function parseRange(rangeHeader, size) {
    const m = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader || '');
    if (!m) return null;
    let start = m[1] === '' ? NaN : Number(m[1]);
    let end = m[2] === '' ? NaN : Number(m[2]);
    if (Number.isNaN(start) && Number.isNaN(end)) return null;
    if (Number.isNaN(start)) {
        start = Math.max(size - end, 0);
        end = size - 1;
    } else if (Number.isNaN(end)) {
        end = size - 1;
    }
    if (start < 0 || end >= size || start > end) return null;
    return { start, end };
}

function sendFile(req, res, filePath) {
    fs.stat(filePath, (err, st) => {
        if (err) {
            if (err.code === 'ENOENT') {
                res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8', ...CORS });
                res.end('File not found: ' + req.url);
            } else {
                res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8', ...CORS });
                res.end('Server Error: ' + err.code);
            }
            return;
        }

        if (st.isDirectory()) {
            const indexPath = path.join(filePath, 'index.html');
            sendFile(req, res, indexPath);
            return;
        }

        const ext = path.extname(filePath).toLowerCase();
        const contentType = MIME[ext] || 'application/octet-stream';
        const size = st.size;
        const range = parseRange(req.headers.range, size);

        if (req.headers.range && !range) {
            res.writeHead(416, {
                'Content-Type': 'text/plain; charset=utf-8',
                'Content-Range': `bytes */${size}`,
                ...CORS
            });
            res.end('Range Not Satisfiable');
            return;
        }

        if (range) {
            const { start, end } = range;
            res.writeHead(206, {
                'Content-Type': contentType,
                'Content-Length': end - start + 1,
                'Content-Range': `bytes ${start}-${end}/${size}`,
                ...CORS
            });
            if (req.method === 'HEAD') {
                res.end();
                return;
            }
            fs.createReadStream(filePath, { start, end }).on('error', () => res.destroy()).pipe(res);
            return;
        }

        res.writeHead(200, {
            'Content-Type': contentType,
            'Content-Length': size,
            ...CORS
        });
        if (req.method === 'HEAD') {
            res.end();
            return;
        }
        fs.createReadStream(filePath).on('error', () => res.destroy()).pipe(res);
    });
}

const server = https.createServer(options, (req, res) => {
    if (req.method === 'OPTIONS') {
        res.writeHead(204, CORS);
        res.end();
        return;
    }

    if (req.method !== 'GET' && req.method !== 'HEAD') {
        res.writeHead(405, { 'Content-Type': 'text/plain; charset=utf-8', ...CORS });
        res.end('Method Not Allowed');
        return;
    }

    let urlPath = (req.url || '/').split('?')[0];
    if (urlPath === '/' || urlPath === '') {
        urlPath = '/index.html';
    }

    const filePath = safeJoin(urlPath);
    if (!filePath) {
        res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8', ...CORS });
        res.end('Forbidden');
        return;
    }

    sendFile(req, res, filePath);
});

server.listen(PORT, '0.0.0.0', () => {
    console.log(`\n🚀 HTTPS Server running at https://localhost:${PORT}`);
    console.log(`   Landing → https://localhost:${PORT}/`);
    console.log(`   Scene   → https://localhost:${PORT}/room.html`);
    console.log(`\n📱 For Meta Quest:`);
    console.log(`   1. Connect Quest via USB`);
    console.log(`   2. Run: adb reverse tcp:${PORT} tcp:${PORT}`);
    console.log(`   3. Open in Quest Browser → https://localhost:${PORT}`);
    console.log(`\nPress Ctrl+C to stop the server\n`);
});
