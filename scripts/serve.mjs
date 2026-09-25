// Minimal static file server for the built site. Runs under pm2 on the AWS box.
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, extname, normalize } from 'node:path';

const ROOT = join(process.cwd(), 'dist');
const PORT = Number(process.env.PORT || 4321);
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.json': 'application/json',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.webp': 'image/webp', '.ico': 'image/x-icon', '.xml': 'application/xml',
  '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8',
};

async function resolve(urlPath) {
  const clean = normalize(decodeURIComponent(urlPath.split('?')[0])).replace(/^(\.\.[/\\])+/, '');
  let p = join(ROOT, clean);
  try {
    const s = await stat(p);
    if (s.isDirectory()) p = join(p, 'index.html');
    return p;
  } catch {
    if (!extname(p)) {
      try { await stat(p + '/index.html'); return p + '/index.html'; } catch {}
      try { await stat(p + '.html'); return p + '.html'; } catch {}
    }
    return null;
  }
}

createServer(async (req, res) => {
  const file = await resolve(req.url || '/');
  if (!file) {
    const nf = await readFile(join(ROOT, '404.html')).catch(() => Buffer.from('Not found'));
    res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
    return res.end(nf);
  }
  try {
    const body = await readFile(file);
    res.writeHead(200, {
      'Content-Type': TYPES[extname(file)] || 'application/octet-stream',
      'Cache-Control': extname(file) === '.html' ? 'public, max-age=0, must-revalidate' : 'public, max-age=31536000, immutable',
      'X-Content-Type-Options': 'nosniff',
    });
    res.end(body);
  } catch {
    res.writeHead(500).end('Server error');
  }
}).listen(PORT, '127.0.0.1', () => console.log(`saram-blog listening on 127.0.0.1:${PORT}`));
