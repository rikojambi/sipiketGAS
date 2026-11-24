import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(resolve(root, p), 'utf8');

const requiredDocs = [
  'README.md',
  'docs/INSTALLATION.md',
  'docs/ADMIN_GUIDE.md',
  'docs/USER_GUIDE.md',
  'docs/API_DOCUMENTATION.md',
  'docs/DATABASE_SCHEMA.md',
  'docs/TESTING_CHECKLIST.md',
  'DEVELOPMENT_PROGRESS.md'
];

test('semua dokumen wajib ada dan tidak kosong', () => {
  for (const file of requiredDocs) {
    const content = read(file);
    assert.ok(content.trim().length > 200, `${file} terlalu pendek`);
  }
});

test('panduan instalasi menyebut langkah kritis', () => {
  const doc = read('docs/INSTALLATION.md');
  for (const needle of ['SPREADSHEET_ID', 'SETUP_ADMIN_TOKEN', 'setupDatabase()', 'seedInitialData()', 'SEED_ADMIN_PASSWORD', 'VITE_GAS_EXEC_URL', 'Anyone', 'Netlify']) {
    assert.ok(doc.includes(needle), `INSTALLATION.md harus menyebut ${needle}`);
  }
});

test('checklist pengujian mencakup kasus khusus', () => {
  const doc = read('docs/TESTING_CHECKLIST.md');
  for (const needle of ['piket', 'barcode', 'offline', 'keterlambatan', 'kelas kosong', 'backup']) {
    assert.ok(doc.toLowerCase().includes(needle.toLowerCase()), `checklist harus mencakup ${needle}`);
  }
});

test('tidak ada password contoh yang tampak seperti kredensial produksi', () => {
  const readme = read('README.md');
  assert.ok(!/password\s*=\s*["']?admin123/i.test(readme));
});
