/**
 * Server lokal untuk pengujian: menyajikan dist/ dan endpoint GAS tiruan.
 * BUKAN untuk produksi. Jalankan setelah npm run build:
 *   node scripts/mock-gas-server.js
 * Lalu buka http://localhost:4178 dan set VITE_GAS_EXEC_URL=http://localhost:4178/gas saat build.
 */
import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { resolve, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createGasRuntime, loadBackend } from '../tests/helpers/gas-runtime.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.PORT || 4178);
const ADMIN_USERNAME = process.env.MOCK_ADMIN_USERNAME || 'superadmin';
const ADMIN_PASSWORD = process.env.MOCK_ADMIN_PASSWORD || 'SipiketAdmin123!';

const ctx = createGasRuntime({
  // MOCK_NOW berguna untuk menguji aturan jam (Asia/Jakarta) secara deterministik.
  now: process.env.MOCK_NOW ? new Date(process.env.MOCK_NOW) : new Date(),
  properties: {
    SPREADSHEET_ID: 'mock-spreadsheet',
    SETUP_ADMIN_TOKEN: process.env.MOCK_SETUP_TOKEN || 'mock-setup-token-local',
    SEED_ADMIN_PASSWORD: ADMIN_PASSWORD,
    SEED_HEAD_PASSWORD: 'Kepala12345!',
    SEED_DUTY_PASSWORD: 'Guru12345!',
    SEED_SUBJECT_PASSWORD: 'Mapel12345!',
    SEED_HOMEROOM_PASSWORD: 'Wali12345!'
  }
});
loadBackend(ctx, resolve(root, 'gas-backend'));

function safeCall(action, payload = {}) {
  try {
    return ctx.spkHandleAction(action, payload);
  } catch (err) {
    return { ok: false, data: null, error: { code: 'SERVER_ERROR', message: err.message }, requestId: 'mock', serverTime: new Date().toISOString(), version: '1.0.0' };
  }
}

const setupToken = process.env.MOCK_SETUP_TOKEN || 'mock-setup-token-local';
const setup = safeCall('setup.database', { token: setupToken });
const seeded = safeCall('setup.seed', { token: setupToken });
console.log('[mock] setup.database:', setup.ok ? 'OK' : JSON.stringify(setup.error));
console.log('[mock] setup.seed:', seeded.ok ? 'OK' : JSON.stringify(seeded.error));
console.log(`[mock] login: ${ADMIN_USERNAME} / ${ADMIN_PASSWORD}`);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  if (url.pathname === '/gas') {
    const params = Object.fromEntries(url.searchParams.entries());
    try {
      const out = ctx.doGet({ parameter: params });
      res.writeHead(200, { 'Content-Type': out.getMimeType() + '; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(out.getContent());
    } catch (err) {
      res.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8' });
      res.end(`window[${JSON.stringify(params.callback || 'cb')}](${JSON.stringify({ ok: false, error: { code: 'SERVER_ERROR', message: err.message } })});`);
    }
    return;
  }

  let pathname = decodeURIComponent(url.pathname);
  if (pathname === '/' || !extname(pathname)) pathname = '/index.html';
  const filePath = resolve(root, 'dist', pathname.replace(/^\/+/, ''));
  try {
    const info = await stat(filePath);
    if (!info.isFile()) throw new Error('bukan file');
    const body = await readFile(filePath);
    res.writeHead(200, { 'Content-Type': MIME[extname(filePath)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(body);
  } catch {
    try {
      const body = await readFile(resolve(root, 'dist/index.html'));
      res.writeHead(200, { 'Content-Type': MIME['.html'], 'Cache-Control': 'no-store' });
      res.end(body);
    } catch {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Belum ada build. Jalankan npm run build terlebih dahulu.');
    }
  }
});

server.listen(PORT, () => console.log(`[mock] SIPIKET siap di http://localhost:${PORT}`));
