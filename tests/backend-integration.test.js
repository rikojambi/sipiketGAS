import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { createGasRuntime, loadBackend, action, doGet } from './helpers/gas-runtime.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SETUP_KEY = 'setup-test-token';
const PASSWORDS = {
  admin: 'AdminSipiket123!',
  kepala: 'KepalaSipiket123!',
  piket: 'PiketSipiket123!',
  mapel: 'MapelSipiket123!',
  wali: 'WaliSipiket123!'
};

function boot(now = '2026-11-24T00:10:00.000Z') {
  const ctx = createGasRuntime({
    now,
    properties: {
      SPREADSHEET_ID: 'sheet-integration',
      SETUP_ADMIN_TOKEN: SETUP_KEY,
      SEED_ADMIN_PASSWORD: PASSWORDS.admin,
      SEED_HEAD_PASSWORD: PASSWORDS.kepala,
      SEED_DUTY_PASSWORD: PASSWORDS.piket,
      SEED_SUBJECT_PASSWORD: PASSWORDS.mapel,
      SEED_HOMEROOM_PASSWORD: PASSWORDS.wali
    }
  });
  loadBackend(ctx, resolve(root, 'gas-backend'));
  return ctx;
}

function bootstrap(ctx) {
  const setup = action(ctx, 'setup.database', { token: SETUP_KEY });
  assert.equal(setup.ok, true, JSON.stringify(setup.error));
  const seed = action(ctx, 'setup.seed', { token: SETUP_KEY });
  assert.equal(seed.ok, true, JSON.stringify(seed.error));
  const validate = action(ctx, 'setup.validate', { token: SETUP_KEY });
  assert.equal(validate.ok, true, JSON.stringify(validate.error));
  assert.equal(validate.data.valid, true, JSON.stringify(validate.data.issues));
  return seed.data;
}

function login(ctx, username) {
  const res = action(ctx, 'login', { username, password: PASSWORDS[username] });
  assert.equal(res.ok, true, `${username}: ${JSON.stringify(res.error)}`);
  assert.ok(res.data.token);
  return res.data.token;
}

test('integrasi setup + login lima peran + validasi database', () => {
  const ctx = boot();
  const seeded = bootstrap(ctx);
  assert.equal(seeded.seeded, true);
  assert.equal(seeded.students.length, 3);

  for (const username of Object.keys(PASSWORDS)) {
    const token = login(ctx, username);
    const me = action(ctx, 'me', { token });
    assert.equal(me.ok, true, `${username}: ${JSON.stringify(me.error)}`);
    assert.equal(me.data.user.username, username);
    assert.equal(me.data.user.passwordHash, undefined);
    assert.equal(me.data.user.salt, undefined);
  }

  const publicSettings = action(ctx, 'settings.public', { token: login(ctx, 'piket') });
  assert.equal(publicSettings.ok, true);
  assert.equal(publicSettings.data.dutyOpenMinutes, 360);
});

test('integrasi absensi apel pagi: idempotensi dan duplikat scan', () => {
  const ctx = boot();
  const seeded = bootstrap(ctx);
  const token = login(ctx, 'piket');
  const student = seeded.students[0];

  const first = action(ctx, 'attendance.scan', {
    token,
    session: 'MORNING',
    tokenId: student.barcodeToken,
    idempotencyKey: 'scan-1',
    source: 'SCANNER'
  });
  assert.equal(first.ok, true, JSON.stringify(first.error));
  assert.equal(first.data.attendance.attendanceStatus, 'HADIR');
  assert.equal(first.data.alreadyRecorded, false);

  const dup = action(ctx, 'attendance.scan', {
    token,
    session: 'MORNING',
    tokenId: student.barcodeToken,
    idempotencyKey: 'scan-2',
    source: 'SCANNER'
  });
  assert.equal(dup.ok, true, JSON.stringify(dup.error));
  assert.equal(dup.data.alreadyRecorded, true);
  assert.equal(dup.data.attendance.id, first.data.attendance.id);

  const afternoon = action(ctx, 'attendance.scan', {
    token,
    session: 'AFTERNOON',
    tokenId: student.barcodeToken,
    idempotencyKey: 'scan-3'
  });
  assert.equal(afternoon.ok, true, JSON.stringify(afternoon.error));
  assert.notEqual(afternoon.data.attendance.id, first.data.attendance.id);

  const admin = login(ctx, 'admin');
  const attendanceRows = action(ctx, 'reports.get', {
    token: admin,
    type: 'attendance',
    from: '2026-11-24',
    to: '2026-11-24'
  });
  assert.equal(attendanceRows.ok, true, JSON.stringify(attendanceRows.error));
  assert.equal(attendanceRows.data.rows.length, 2);
});

test('integrasi keterlambatan otomatis dan konsekuensi', () => {
  const ctx = boot('2026-11-24T00:35:00.000Z'); // 07:35 WIB
  const seeded = bootstrap(ctx);
  const token = login(ctx, 'piket');
  const student = seeded.students[1];

  const scan = action(ctx, 'attendance.scan', {
    token,
    session: 'MORNING',
    tokenId: student.barcodeToken,
    idempotencyKey: 'late-scan-1'
  });
  assert.equal(scan.ok, true, JSON.stringify(scan.error));
  assert.equal(scan.data.attendance.attendanceStatus, 'TERLAMBAT');
  assert.equal(scan.data.lateMinutes, 20);

  const admin = login(ctx, 'admin');
  const late = action(ctx, 'reports.get', { token: admin, type: 'late', from: '2026-11-24', to: '2026-11-24' });
  assert.equal(late.ok, true, JSON.stringify(late.error));
  assert.equal(late.data.rows.length, 1);

  const consequence = action(ctx, 'consequence.create', {
    token,
    studentId: student.id,
    lateRecordId: late.data.rows[0].id,
    category: 'PEMBINAAN',
    description: 'Pembinaan dan pengarahan',
    note: 'Refleksi kedisiplinan',
    status: 'PENDING',
    idempotencyKey: 'cons-1'
  });
  assert.equal(consequence.ok, true, JSON.stringify(consequence.error));
});

test('integrasi izin keluar dan kembali mencatat durasi', () => {
  const ctx = boot('2026-11-24T00:10:00.000Z');
  const seeded = bootstrap(ctx);
  const token = login(ctx, 'piket');
  const student = seeded.students[0];

  const out = action(ctx, 'movement.out', {
    token,
    tokenId: student.barcodeToken,
    purpose: 'Membeli keperluan praktik',
    grantedBy: 'Guru Piket',
    idempotencyKey: 'out-1'
  });
  assert.equal(out.ok, true, JSON.stringify(out.error));
  assert.equal(out.data.movement.movementStatus, 'OPEN');

  const dup = action(ctx, 'movement.out', {
    token,
    tokenId: student.barcodeToken,
    purpose: 'Keluar lagi',
    grantedBy: 'Guru Piket',
    idempotencyKey: 'out-2'
  });
  assert.equal(dup.ok, false);
  assert.equal(dup.error.code, 'CONFLICT');

  const ret = action(ctx, 'movement.return', {
    token,
    tokenId: student.barcodeToken,
    idempotencyKey: 'return-1'
  });
  assert.equal(ret.ok, true, JSON.stringify(ret.error));
  assert.equal(ret.data.movement.movementStatus, 'CLOSED');
  assert.equal(typeof ret.data.durationMinutes, 'number');
});

test('integrasi izin sakit disetujui wali kelas memengaruhi status absensi', () => {
  const ctx = boot();
  const seeded = bootstrap(ctx);
  const wali = login(ctx, 'wali');
  const piket = login(ctx, 'piket');
  const student = seeded.students[2];

  const permit = action(ctx, 'permits.create', {
    token: wali,
    studentId: student.id,
    type: 'SICK',
    reason: 'Demam',
    approve: true,
    idempotencyKey: 'permit-1'
  });
  assert.equal(permit.ok, true, JSON.stringify(permit.error));
  assert.equal(permit.data.permit.approvalStatus, 'APPROVED');

  const scan = action(ctx, 'attendance.scan', {
    token: piket,
    session: 'MORNING',
    tokenId: student.barcodeToken,
    idempotencyKey: 'permit-scan-1'
  });
  assert.equal(scan.ok, true, JSON.stringify(scan.error));
  assert.equal(scan.data.attendance.attendanceStatus, 'SAKIT');
  assert.ok(scan.data.warnings.some((w) => /izin sakit/i.test(w)));
});

test('integrasi pembatasan peran dan jadwal piket', () => {
  const ctx = boot();
  bootstrap(ctx);
  const mapel = login(ctx, 'mapel');
  const kepala = login(ctx, 'kepala');
  const piketAllowed = login(ctx, 'piket');
  const dutyList = action(ctx, 'duty.list', { token: piketAllowed });
  assert.equal(dutyList.ok, true, JSON.stringify(dutyList.error));
  const seededStudents = ctx.SIPIKET_Store.getRows('STUDENTS');
  const student = seededStudents[0];

  const mapelScan = action(ctx, 'attendance.scan', {
    token: mapel, session: 'MORNING', tokenId: student.barcodeToken, idempotencyKey: 'forbidden-1'
  });
  assert.equal(mapelScan.ok, false);
  assert.equal(mapelScan.error.code, 'FORBIDDEN');

  const kepalaCreate = action(ctx, 'permits.create', {
    token: kepala, studentId: student.id, type: 'LEAVE', reason: 'Libur', idempotencyKey: 'forbidden-2'
  });
  assert.equal(kepalaCreate.ok, false);
  assert.equal(kepalaCreate.error.code, 'FORBIDDEN');

  // Hapus jadwal piket hari ini lalu pastikan pesan persis muncul.
  const dutyRows = ctx.SIPIKET_Store.getRows('DUTY_SCHEDULES');
  for (const row of dutyRows) ctx.SIPIKET_Store.updateRow('DUTY_SCHEDULES', row.id, { active: false });
  const piket = piketAllowed;
  const noDuty = action(ctx, 'attendance.scan', {
    token: piket, session: 'MORNING', tokenId: student.barcodeToken, idempotencyKey: 'forbidden-3'
  });
  assert.equal(noDuty.ok, false);
  assert.equal(noDuty.error.message, 'Anda tidak memiliki jadwal piket pada hari ini.');
});

test('callback JSONP berbahaya ditolak tanpa refleksi', () => {
  const ctx = boot();
  const out = doGet(ctx, { callback: 'alert(1)', action: 'ping', payload: '{}' });
  assert.match(out.getMimeType(), /json/);
  assert.doesNotMatch(out.getContent(), /alert\(1\)/);
  const res = JSON.parse(out.getContent());
  assert.equal(res.ok, false);
  assert.equal(res.error.code, 'BAD_REQUEST');
});
