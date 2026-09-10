import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const mime = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' };
const port = Number(process.env.PORT || 3030);
http.createServer(async (req, res) => {
  try {
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    const target = path.resolve(root, '.' + pathname);
    if (target !== root && !target.startsWith(root + path.sep)) throw new Error('Invalid path');
    const relative = path.relative(root, target);
    if (relative.split(path.sep).some(part => part.startsWith('.'))) throw new Error('Hidden file');
    const file = (await stat(target)).isDirectory() ? path.join(target, 'index.html') : target;
    const body = await readFile(file);
    res.writeHead(200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(body);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('This little corner does not exist. Head back home.');
  }
}).listen(port, '127.0.0.1', () => console.log(`Birthday magic is live at http://localhost:${port}`));
