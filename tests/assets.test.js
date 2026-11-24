import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(resolve(root, p), 'utf8');

test('manifest PWA lengkap', () => {
  const manifest = JSON.parse(read('public/manifest.webmanifest'));
  assert.equal(manifest.display, 'standalone');
  assert.equal(manifest.start_url, '/?source=pwa');
  assert.equal(manifest.icons.length >= 3, true);
  assert.ok(manifest.icons.some((i) => i.purpose === 'maskable'));
  for (const icon of manifest.icons) {
    assert.equal(existsSync(resolve(root, 'public', icon.src.replace(/^\//, ''))), true, `${icon.src} harus ada`);
  }
});

test('service worker tidak meng-cache endpoint GAS', () => {
  const sw = read('public/sw.js');
  assert.match(sw, /CACHE_NAME|sipiket-v/);
  assert.match(sw, /script\.google\.com/);
  assert.match(sw, /offline\.html/);
  assert.match(sw, /fetch/);
});

test('konfigurasi Netlify mengarah ke dist', () => {
  const netlify = read('netlify.toml');
  assert.match(netlify, /command\s*=\s*"npm run build"/);
  assert.match(netlify, /publish\s*=\s*"dist"/);
  assert.match(netlify, /Service-Worker-Allowed/);
});
