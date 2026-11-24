import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { createGasRuntime, loadBackend, seedSheet } from './helpers/gas-runtime.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function boot(options = {}) {
  const ctx = createGasRuntime(options);
  loadBackend(ctx, resolve(root, 'gas-backend'));
  if (typeof ctx.spkSetSpreadsheet === 'function') ctx.spkSetSpreadsheet(ctx.__mock.spreadsheet);
  return ctx;
}

test('kontrak dasar backend tersedia', () => {
  const ctx = boot();
  assert.equal(typeof ctx.doGet, 'function');
  assert.equal(typeof ctx.spkHandleAction, 'function');
  assert.ok(ctx.SIPIKET_Config, 'SIPIKET_Config harus tersedia');
});

test('skema memuat 19 sheet utama + SESSIONS', () => {
  const ctx = boot();
  const keys = Object.keys(ctx.SIPIKET_Config.SHEET_SCHEMAS);
  assert.equal(keys.length, 20);
  for (const name of ['USERS', 'STUDENTS', 'ATTENDANCE', 'STUDENT_MOVEMENTS', 'SCHOOL_SETTINGS', 'AUDIT_LOG', 'SESSIONS']) {
    assert.ok(keys.includes(name), `${name} harus ada`);
  }
  assert.ok(ctx.SIPIKET_Config.SHEET_SCHEMAS.ATTENDANCE.includes('attendanceStatus'));
  assert.ok(!ctx.SIPIKET_Config.SHEET_SCHEMAS.ATTENDANCE.includes('status,date,session,studentId,classId,status'));
});

test('setting default sesuai zona waktu Indonesia', () => {
  const ctx = boot();
  assert.equal(ctx.SIPIKET_Config.DEFAULT_SETTINGS.timezone, 'Asia/Jakarta');
  assert.equal(ctx.SIPIKET_Config.DEFAULT_SETTINGS.lateLimitMinutes, 15);
  assert.equal(ctx.SIPIKET_Config.DEFAULT_SETTINGS.bellMorningMinutes, 420);
  assert.equal(ctx.SIPIKET_Config.DEFAULT_SETTINGS.pollIntervalMs, 20000);
});

test('hashText deterministik SHA-256', () => {
  const ctx = boot();
  const expected = createHash('sha256').update('sipiket').digest('base64');
  assert.equal(ctx.SIPIKET_Utils.hashText('sipiket'), expected);
});

test('hash password memakai salt dan verifikasi konsisten', () => {
  const ctx = boot();
  const salt = ctx.Utilities.base64Encode([1, 2, 3, 4, 5, 6, 7, 8]);
  const hash = ctx.SIPIKET_Auth.hashPassword('rahasia123', salt);
  assert.notEqual(hash, 'rahasia123');
  assert.equal(hash, ctx.SIPIKET_Auth.hashPassword('rahasia123', salt));
  assert.equal(ctx.SIPIKET_Auth.verifyPassword('rahasia123', salt, hash), true);
  assert.equal(ctx.SIPIKET_Auth.verifyPassword('salah', salt, hash), false);
});

test('doGet mengembalikan JSONP envelope', () => {
  const ctx = boot();
  const out = ctx.doGet({ parameter: { callback: 'cbTest', action: 'ping', payload: '{}', v: '1' } });
  assert.match(out.getMimeType(), /javascript/);
  const json = out.getContent().replace(/^cbTest\(/, '').replace(/\);$/, '');
  const res = JSON.parse(json);
  assert.equal(res.ok, true);
  assert.equal(res.data.pong, true);
  assert.equal(res.version, '1.0.0');
  assert.ok(res.requestId);
});

test('action tanpa token ditolak', () => {
  const ctx = boot();
  const res = ctx.spkHandleAction('me', {});
  assert.equal(res.ok, false);
  assert.equal(res.error.code, 'UNAUTHORIZED');
});

test('requireDuty menolak guru tanpa jadwal dengan pesan yang tepat', () => {
  const ctx = boot();
  seedSheet(ctx, 'DUTY_SCHEDULES', []);
  seedSheet(ctx, 'APP_CONFIG', []);
  seedSheet(ctx, 'SCHOOL_SETTINGS', []);
  const user = { id: 'u-1', role: 'GURU_PIKET', teacherId: 't-1', fullName: 'Guru A' };
  assert.throws(
    () => ctx.SIPIKET_Auth.requireDuty(user, '2026-11-24'),
    (err) => err.code === 'FORBIDDEN' && err.message === 'Anda tidak memiliki jadwal piket pada hari ini.'
  );
});
