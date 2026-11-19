// A tiny static server for game/ (Node 22, standard library only), so the
// entry can be played locally without a build step: `node serve.ts` serves
// game/ on http://localhost:8080 (or --port <n>). It sends the MIME types a
// browser game needs, refuses any path outside game/, and otherwise does
// nothing clever: this is a development convenience, not a web server for
// the internet.
import { createReadStream, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('./game', import.meta.url)));
const DEFAULT_PORT = 8080;
const HOST = '127.0.0.1';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.glb': 'model/gltf-binary',
  '.gltf': 'model/gltf+json',
  '.bin': 'application/octet-stream',
  '.wasm': 'application/wasm',
  '.wav': 'audio/wav',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.txt': 'text/plain; charset=utf-8',
};

/** Parse `--port <n>` from argv; fall back to the default on bad input. */
function parsePort(argv) {
  const portIndex = argv.indexOf('--port');
  if (portIndex === -1) return DEFAULT_PORT;
  const requested = Number(argv[portIndex + 1]);
  if (Number.isInteger(requested) && requested > 0 && requested < 65536) return requested;
  return DEFAULT_PORT;
}

/** Resolve a request path to a file under the game root, or null if unsafe. */
function resolveFile(pathname) {
  let path = pathname;
  if (path.endsWith('/')) path += 'index.html';
  const file = resolve(join(root, normalize(path)));
  if (file !== root && !file.startsWith(root + sep)) return null;
  return file;
}

function serveFile(file, response) {
  let size;
  try {
    const stats = statSync(file);
    if (!stats.isFile()) throw new Error('not a file');
    size = stats.size;
  } catch {
    response.writeHead(404).end('not found');
    return;
  }
  response.writeHead(200, {
    'content-type': MIME[extname(file).toLowerCase()] ?? 'application/octet-stream',
    'content-length': size,
    'cache-control': 'no-store',
  });
  createReadStream(file).pipe(response);
}

const port = parsePort(process.argv.slice(2));

createServer((request, response) => {
  const url = new URL(request.url ?? '/', 'http://localhost');
  let pathname;
  try {
    pathname = decodeURIComponent(url.pathname);
  } catch {
    response.writeHead(400).end('bad request');
    return;
  }
  const file = resolveFile(pathname);
  if (file === null) {
    response.writeHead(403).end('forbidden');
    return;
  }
  serveFile(file, response);
}).listen(port, HOST, () => {
  console.log(`game/ is on http://${HOST}:${port}`);
});
