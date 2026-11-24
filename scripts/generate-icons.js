/**
 * Generator ikon PWA tanpa dependency. Membuat PNG solid navy dengan huruf S putih.
 * Jalankan: node scripts/generate-icons.js
 */
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = resolve(root, 'public/icons');
mkdirSync(outDir, { recursive: true });

const NAVY = [11, 31, 58, 255];
const GREEN = [34, 197, 94, 255];
const WHITE = [255, 255, 255, 255];

// Font 5x7 untuk "S"
const S = [
  '01111',
  '10000',
  '10000',
  '01110',
  '00001',
  '00001',
  '11110'
];

function crc32(buf) {
  let c = ~0;
  for (const byte of buf) {
    c ^= byte;
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td), 0);
  return Buffer.concat([len, td, crc]);
}

function makePng(size, { maskable = false } = {}) {
  const raw = Buffer.alloc(size * (1 + size * 4));
  const scale = Math.max(2, Math.floor(size / (maskable ? 11 : 9)));
  const gw = 5 * scale;
  const gh = 7 * scale;
  const gx0 = Math.floor((size - gw) / 2);
  const gy0 = Math.floor((size - gh) / 2);

  for (let y = 0; y < size; y++) {
    const row = y * (1 + size * 4);
    raw[row] = 0; // filter none
    for (let x = 0; x < size; x++) {
      const p = row + 1 + x * 4;
      let color = NAVY;

      // Aksen hijau kecil di kanan atas sebagai penanda "aktif".
      const dotR = maskable ? size * 0.045 : size * 0.035;
      const dx = x - size * (maskable ? 0.76 : 0.78);
      const dy = y - size * (maskable ? 0.24 : 0.22);
      if (dx * dx + dy * dy <= dotR * dotR) color = GREEN;

      const ix = Math.floor((x - gx0) / scale);
      const iy = Math.floor((y - gy0) / scale);
      if (ix >= 0 && ix < 5 && iy >= 0 && iy < 7 && S[iy][ix] === '1') color = WHITE;

      raw[p] = color[0];
      raw[p + 1] = color[1];
      raw[p + 2] = color[2];
      raw[p + 3] = color[3];
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 6;  // RGBA
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

writeFileSync(resolve(outDir, 'icon-192.png'), makePng(192));
writeFileSync(resolve(outDir, 'icon-512.png'), makePng(512));
writeFileSync(resolve(outDir, 'maskable-512.png'), makePng(512, { maskable: true }));
writeFileSync(resolve(outDir, 'apple-touch-icon.png'), makePng(180));

writeFileSync(resolve(outDir, 'icon.svg'), `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" role="img" aria-label="SIPIKET">
  <rect width="512" height="512" rx="96" fill="#0b1f3a"/>
  <circle cx="400" cy="112" r="22" fill="#22c55e"/>
  <path d="M328 154H206c-48 0-78 25-78 62 0 35 24 53 70 61l48 8c25 4 33 10 33 21 0 13-12 20-34 20h-92v62h104c52 0 84-27 84-67 0-36-24-55-72-63l-48-8c-23-4-31-9-31-19 0-11 11-17 31-17h107z" fill="#fff"/>
</svg>
`);

console.log('Ikon PWA dibuat di public/icons');
