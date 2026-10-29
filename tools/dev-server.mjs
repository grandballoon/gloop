// tools/dev-server.mjs
// The local dev server: serves public/ as static files on the loopback
// address only.
//
// Run from the repo root:  node tools/dev-server.mjs [port]   (default 5530)
//
// The decisions are pure exported functions (test/dev_server_test.mjs);
// the rest is the shell that reads files and answers requests.

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const PUBLIC = fileURLToPath(new URL('../public/', import.meta.url));
const HOST = '127.0.0.1';

const TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.ico': 'image/x-icon',
};

export function contentType(path) {
    return TYPES[extname(path).toLowerCase()] ?? 'application/octet-stream';
}

// The file under public/ that a GET for `urlPath` reads, or null for a
// path that leaves public/.
export function resolvePath(urlPath) {
    let path;
    try {
        path = decodeURIComponent(urlPath.split('?')[0]);
    } catch {
        return null;
    }
    const rel = normalize(path.replace(/^\/+/, ''));
    if (rel === '..' || rel.startsWith(`..${sep}`) || rel.includes('\0')) return null;
    return rel === '.' || rel === '' || path.endsWith('/') ? join(rel, 'index.html') : rel;
}

function serve(port) {
    createServer(async (req, res) => {
        if (req.method !== 'GET' && req.method !== 'HEAD') {
            res.writeHead(405).end();
            return;
        }
        const rel = resolvePath(req.url);
        if (rel == null) {
            res.writeHead(404).end();
            return;
        }
        try {
            const body = await readFile(join(PUBLIC, rel));
            res.writeHead(200, { 'Content-Type': contentType(rel), 'Cache-Control': 'no-store' });
            res.end(req.method === 'HEAD' ? undefined : body);
        } catch {
            res.writeHead(404).end();
        }
    }).listen(port, HOST, () => console.log(`gloop: http://127.0.0.1:${port}/`));
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) serve(Number(process.argv[2] ?? 5530));
