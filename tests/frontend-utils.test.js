import test from 'node:test';
import assert from 'node:assert/strict';
import { minutesToHHMM, toCSV, escapeCsv } from '../src/utils/format.js';
import { isUuid, isValidDate, validateLogin } from '../src/utils/validate.js';
import { escapeHtml } from '../src/utils/dom.js';

test('minutesToHHMM mengubah menit jadi jam', () => {
  assert.equal(minutesToHHMM(0), '00:00');
  assert.equal(minutesToHHMM(420), '07:00');
  assert.equal(minutesToHHMM(930), '15:30');
});

test('escapeCsv dan toCSV kompatibel Excel', () => {
  assert.equal(escapeCsv('a,b'), '"a,b"');
  assert.equal(escapeCsv('a"b'), '"a""b"');
  const csv = toCSV([['Nama', 'Kelas'], ['Siti', 'XII-1']]);
  assert.equal(csv, 'Nama,Kelas\nSiti,XII-1');
});

test('validasi UUID dan tanggal', () => {
  assert.equal(isUuid('00000000-0000-4000-8000-000000000001'), true);
  assert.equal(isUuid('abc'), false);
  assert.equal(isValidDate('2026-11-24'), true);
  assert.equal(isValidDate('2026-02-30'), false);
});

test('validasi login', () => {
  assert.equal(validateLogin({ username: 'guru', password: 'rahasia' }).valid, true);
  assert.equal(validateLogin({ username: '', password: 'x' }).valid, false);
  assert.equal(validateLogin({ username: 'guru', password: '' }).valid, false);
});

test('escapeHtml mencegah injeksi', () => {
  assert.equal(escapeHtml('<b>&</b>'), '&lt;b&gt;&amp;&lt;/b&gt;');
});
