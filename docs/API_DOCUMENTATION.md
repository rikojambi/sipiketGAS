# SIPIKET API Documentation (kontrak resmi)

Versi kontrak: `1.0.0`. Semua modus (backend, frontend, pengujian, dokumentasi) wajib mengikuti file ini.

## 1. Transport

Google Apps Script Web App tidak mendukung CORS lintas domain yang andal untuk header custom. SIPIKET memakai **JSONP_GET** yang kompatibel dengan Netlify → Apps Script:

```js
const cb = '__sipiketCb_' + Date.now() + '_' + Math.random().toString(36).slice(2);
const qs = new URLSearchParams({
  callback: cb,
  action: 'me',
  payload: JSON.stringify({}),
  v: '1'
});
const s = document.createElement('script');
s.src = EXEC_URL + '?' + qs.toString();
document.head.appendChild(s);
// backend memanggil: window[cb]({ ok: true, data: {...}, ... })
```

- Backend: `doGet(e)` membaca `e.parameter.callback`, `e.parameter.action`, `e.parameter.payload`.
- Respons selalu JavaScript: `window[callback](<json>);` dengan MIME `application/javascript`.
- `Access-Control-Allow-Origin: *` tidak dipakai karena JSONP tidak memerlukannya.
- Jangan mengirim secret frontend. Endpoint Web App bersifat publik tetapi **semua aksi tetap diautentikasi** kecuali `ping` dan `login`.
- Session token dikirim di payload sebagai `token`; backend hanya menyimpan hash token.
- Frontend menyimpan token di `sessionStorage` (bukan `localStorage`), dan menghapus saat logout/expired.

### Envelope respons

```json
{
  "ok": true,
  "data": {},
  "error": null,
  "requestId": "uuid",
  "serverTime": "2026-11-24T07:30:00+07:00",
  "version": "1.0.0"
}
```

Error:

```json
{
  "ok": false,
  "data": null,
  "error": { "code": "FORBIDDEN", "message": "Anda tidak memiliki jadwal piket pada hari ini.", "details": {} },
  "requestId": "uuid",
  "serverTime": "...",
  "version": "1.0.0"
}
```

Kode error standar: `BAD_REQUEST`, `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`, `CONFLICT`, `RATE_LIMITED`, `EXPIRED`, `SERVER_ERROR`, `OFFLINE`.

## 2. Aturan otorisasi umum

- Role: `SUPERADMIN`, `KEPALA_SEKOLAH`, `GURU_PIKET`, `GURU_MAPEL`, `WALI_KELAS`.
- Backend **tidak pernah** mempercayai role dari frontend; role diambil dari session token → USERS.
- Semua write memakai `LockService.getScriptLock()` + UUID idempotency key (`requestId` / `idempotencyKey`).
- `GURU_PIKET` hanya boleh aksi operasional yang tercantum di `Config.ROLE_PERMISSIONS` (`attendance.*`, `late.record`, `consequence.*`, `permits.*`, `movement.*`, `monitoring.*`, `substitute.*`, `students.list/get`, `barcode.lookup`, `duty.list`, `dashboard.get`, `notifications.*`, `settings.public`). Aksi operasional yang bergerbang jadwal mensyaratkan tanggal server Asia/Jakarta termasuk `DUTY_SCHEDULES` untuk user tersebut (MAIN atau BACKUP yang diaktifkan) atau mode `BACKUP_ACTIVATED`, **dan** waktu server sudah melewati `SCHOOL_SETTINGS.dutyOpenMinutes` (default 06:00). `duty.list`, `notifications.*`, `settings.public`, dan `dashboard.get` dengan `scope:'personal'` tidak bergerbang jadwal. Jika tidak bertugas: `FORBIDDEN` dengan pesan persis **"Anda tidak memiliki jadwal piket pada hari ini."** Jika belum waktunya: `FORBIDDEN` dengan pesan **"Menu piket belum dibuka pada waktu ini."**
- `WALI_KELAS` hanya mengelola siswa dengan `classId` yang sama dengan `users.classId`.
- `KEPALA_SEKOLAH` tidak boleh create/update/delete transaksi; hanya read + report + `audit.list`. Koreksi wajib lewat aksi `*.correct` dan tercatat di AUDIT_LOG.
- Semua tanggal/jam dihitung server dengan timezone `Asia/Jakarta`. Frontend tidak boleh menentukan status hadir/terlambat final.
- Hari libur / hari khusus: transaksi absensi ditolak dengan `CONFLICT` kecuali superadmin.

## 3. Aksi publik

### `ping`
Payload `{}`. Respons `{ pong: true, serverTime, version, spreadsheetReady }`.

### `login`
Payload `{ username, password }`. Respons:
```json
{ "token": "base64url-random", "expiresAt": "ISO", "user": { "id": "...", "username": "...", "role": "...", "fullName": "...", "classId": "...", "teacherId": "..." }, "settings": { "schoolName": "...", "pollIntervalMs": 20000 } }
```
- Password diverifikasi dengan salt + SHA-256 (`Utilities.computeDigest`).
- 5 percobaan gagal → kunci 15 menit; respons `RATE_LIMITED`.
- Token berlaku 8 jam (dapat dikonfigurasi `SESSION_TTL_MS`).

## 4. Aksi terautentikasi (umum)

| action | payload | hasil | akses |
|---|---|---|---|
| `logout` | `{token}` | `{}` | semua |
| `me` | `{token}` | `{user, permissions, dutyToday, settings, notificationsUnread}` | semua |
| `notifications.list` | `{token, limit?}` | `{items}` | semua (filter role/class) |
| `notifications.read` | `{token, id}` | `{item}` | pemilik/role terkait |
| `settings.public` | `{token}` | `{schoolName, npsn, logoUrl, academicYear, semester, bellMorning, bellAfternoon, lateLimitMinutes, dutyOpenMinutes, schoolDays, pollIntervalMs}` | semua |

## 5. Superadmin / manajemen

| action | payload | catatan |
|---|---|---|
| `setup.status` | `{token}` | `{initialized, spreadsheetUrl, sheets, version}` |
| `setup.database` | `{token, force?}` | membuat/menghubungkan spreadsheet + 19 sheet + header |
| `setup.seed` | `{token}` | data contoh **hanya jika** `APP_CONFIG.seedDone != true` |
| `setup.validate` | `{token}` | `{valid, issues[]}` |
| `setup.migrate` | `{token}` | menambah kolom baru tanpa menghapus data |
| `backup.create` | `{token, reason?}` | `{fileId, fileName, url}` ke Google Drive |
| `backup.list` | `{token}` | `{items}` |
| `backup.restore` | `{token, fileId, confirmPhrase}` | `confirmPhrase` harus `RESTORE`; di UI wajib konfirmasi 2 langkah |
| `users.list` | `{token}` | user tanpa hash/salt |
| `users.create` | `{token, username, password, role, fullName, email?, teacherId?, classId?, phone?}` | password di-hash backend |
| `users.update` | `{token, id, patch}` | patch tidak boleh berisi passwordHash/salt |
| `users.setPassword` | `{token, id, password}` | |
| `users.deactivate` | `{token, id, reason}` | |

Catatan bootstrap: belum ada fungsi `createFirstSuperadmin()`. Akun SUPERADMIN (`admin`) dibuat oleh `seedInitialData()` / `setup.seed` bersama empat akun peran lainnya, dengan password dari Script Properties `SEED_ADMIN_PASSWORD`, `SEED_HEAD_PASSWORD`, `SEED_DUTY_PASSWORD`, `SEED_SUBJECT_PASSWORD`, dan `SEED_HOMEROOM_PASSWORD`. Hasil seed mengembalikan password sekali. Aksi `setup.*` memakai `token` berupa `SETUP_ADMIN_TOKEN` (bootstrap, berlaku seperti superadmin) sebelum ada sesi login; setelah ada admin, session token superadmin juga diterima. Token bootstrap sebaiknya dihapus/rotasi setelah inisialisasi. Fungsi editor yang tersedia: `setupDatabase()`, `seedInitialData()`, `validateDatabase()`, `migrateDatabase()`, `backupDatabase()`, `installBackupTriggers()`.
| `teachers.list/create/update` | standar CRUD | |
| `students.list` | `{token, classId?, search?, activeOnly?}` | wali kelas otomatis filter kelasnya |
| `students.get` | `{token, id}` | |
| `students.create/update` | `{token, ...}` | wali kelas hanya kelasnya |
| `students.import` | `{token, rows: [{nis, name, classId, ...}], replace?}` | maks 200 baris per panggilan; frontend chunking |
| `students.regenerateBarcode` | `{token, id}` | barcode token baru via UUID |
| `barcode.lookup` | `{token, tokenId}` | `{student}`; tokenId bukan NISN |
| `classes.list/create/update` | standar CRUD | |
| `subjects.list/create/update` | standar CRUD | |
| `schedules.list` | `{token, day?, classId?}` | |
| `schedules.save` | `{token, ...}` | |
| `duty.list` | `{token, date?, from?, to?}` | |
| `duty.save` | `{token, date, teacherId, role: MAIN\|BACKUP, active, notes?}` | |
| `settings.list` | `{token}` | semua key SCHOOL_SETTINGS |
| `settings.save` | `{token, values: {key: value}}` | whitelist key |
| `holidays.list/create/delete` | standar CRUD | |

## 6. Absensi & pergerakan

### `attendance.scan`
Payload:
```json
{ "token": "...", "session": "MORNING" | "AFTERNOON", "tokenId": "BC-...", "studentId": null, "idempotencyKey": "uuid", "note": "", "source": "SCANNER" | "MANUAL" }
```
Respons:
```json
{
  "attendance": { "id": "...", "date": "2026-11-24", "session": "MORNING", "status": "HADIR" | "TERLAMBAT" | "IZIN" | "SAKIT" | "TANPA_KETERANGAN" | "BELUM_HADIR", "scannedAt": ISO, "lateMinutes": 0 },
  "student": { "id": "...", "name": "...", "className": "...", "photoUrl": "" },
  "warnings": ["Siswa memiliki izin sakit aktif"],
  "alreadyRecorded": false
}
```
- Duplikat scan dalam sesi yang sama mengembalikan `alreadyRecorded: true` + data lama, bukan error (idempotency).
- Jika `session` sudah ditutup (`settings.attendanceCloseMorning/...`) → `CONFLICT`.
- Jika siswa sudah `EARLY_LEAVE`/`SUDAH_PULANG` → `CONFLICT`.
- Jika ada izin sah aktif, status mengikuti izin (`IZIN`/`SAKIT`) dan warning muncul.
- Status final dihitung backend berdasarkan `lateLimitMinutes`, jam apel, dan hari libur.
- Afternoon tidak menimpa morning: primary key logika `(date, session, studentId)`.

### `attendance.manual`
Sama dengan `attendance.scan` tapi wajib `studentId`; dipakai fallback nama/kelas.

### `attendance.correct`
Payload `{token, id, reason, patch}` → audit log wajib. Akses superadmin, kepala sekolah (koreksi tercatat), guru piket bertugas.

### `late.record`
Payload `{token, studentId, date?, arrivalAt?, note?, idempotencyKey}` → `{lateRecord}`. Dipanggil otomatis oleh frontend setelah `attendance.scan` status TERLAMBAT, atau manual.

### `consequence.create`
Payload `{token, lateRecordId, studentId, category, description, note, status}` → `{consequence}`. Kategori dari `SCHOOL_SETTINGS.consequenceCategories` (JSON).

### `consequence.list`
Payload `{token, studentId?, classId?, from?, to?}` → `{items}`.

### `permits.create`
Payload:
```json
{ "token": "..." , "studentId": "...", "type": "SICK|LEAVE|ABSENT|EARLY_LEAVE", "date": "YYYY-MM-DD", "reason": "...", "detail": "...", "evidenceUrl": "", "approve": false, "idempotencyKey": "uuid" }
```
`approve: true` hanya untuk wali kelas/guru piket bertugas/superadmin. Respons `{permit, notification}`.

### `permits.list`
Payload `{token, date?, from?, to?, classId?, studentId?, status?}` → `{items}`.

### `permits.approve`
Payload `{token, id, decision: APPROVED|REJECTED|NEED_CLARIFICATION, note?}` → `{permit, audit}`.

### `movement.out`
Payload `{token, studentId, purpose, grantedBy, estimateReturnAt?, note?, idempotencyKey}` → `{movement, warnings}`. Hanya guru piket bertugas / superadmin. Mencegah keluar ganda jika masih OPEN.

### `movement.return`
Payload `{token, tokenId|studentId, idempotencyKey}` → `{movement, durationMinutes}`. Menutup movement OPEN terakhir. Jika tidak ada movement OPEN, `CONFLICT`.

### `movement.earlyLeave`
Payload `{token, studentId, reason, grantedBy, note?, idempotencyKey}` → `{movement, permit}`. Mencegah scan kembali setelah pulang.

### `movement.list`
Payload `{token, date?, classId?, status?}` → `{items}`.

## 7. Monitoring KBM

### `monitoring.list`
Payload `{token, date?}` → `{items}` (gabung SCHEDULES + CLASS_MONITORING + SUBSTITUTE_ASSIGNMENTS).

### `monitoring.save`
Payload `{token, scheduleId, status, note, verificationStatus, idempotencyKey}`. Status: `KBM_BERJALAN`, `GURU_BELUM_HADIR`, `KELAS_KOSONG`, `GURU_IZIN`, `GURU_SAKIT`, `GURU_TERLAMBAT`, `DIGANTIKAN`, `TUGAS_MANDIRI`. `verificationStatus`: `UNVERIFIED|VERIFIED`. Frontend tidak boleh menyimpulkan "guru tidak hadir" tanpa verifikasi.

### `substitute.assign`
Payload `{token, scheduleId, substituteTeacherId?, taskType, taskDescription, note?, idempotencyKey}`. `taskType`: `GURU_PENGGANTI`, `GURU_PIKET_LAIN`, `TUGAS_MANDIRI`, `TUGAS_GURU_MAPEL`, `TUGAS_LITERASI_NUMERASI`, `TUGAS_PROYEK`. Respons `{assignment}`.

### `substitute.list` / `substitute.update`
`update` patch status `PENDING|ONGOING|DONE|NEED_FOLLOWUP`.

### `monitoring.summary`
Payload `{token, date?, from?, to?}` → `{monitoredPeriods, emptyClasses, lateTeachers, substituteClasses, selfStudyClasses, kbmPercentage}`.

## 8. Dashboard & laporan

### `dashboard.get`
Payload `{token, date?}` →
```json
{
  "role": "GURU_PIKET",
  "date": "2026-11-24",
  "stats": {
    "present": 0, "late": 0, "permit": 0, "sick": 0, "absent": 0,
    "outside": 0, "notReturned": 0, "earlyLeft": 0,
    "monitoredClasses": 0, "checkedClasses": 0, "emptyClasses": 0, "substitutedClasses": 0,
    "kbmMonitored": 0, "totalStudents": 0
  },
  "quickActions": ["attendance.scan", "movement.out", "movement.return", "monitoring.list"],
  "recentActivity": [],
  "charts": { "attendanceByClass": [], "lateByDay": [], "kbmStatus": [] }
}
```
Role piket tanpa jadwal: backend mengembalikan `FORBIDDEN` + pesan jadwal untuk dashboard operasional; frontend tetap menampilkan dashboard pengguna biasa lewat `dashboard.get` dengan `scope: 'personal'`.

### `reports.get`
Payload `{token, type, from, to, classId?, studentId?, teacherId?, transactionType?, format?}`.
`type`: `attendance|late|permits|movements|kbm|duty|audit|teacher_activity`.
Respons `{ columns: [], rows: [], meta: { filters, generatedAt } }`. Format `csv` juga dapat dihasilkan frontend dari columns/rows; backend menyediakan `reports.export` untuk CSV bila diminta.

### `audit.list`
Payload `{token, from?, to?, actorId?, entity?}` → `{items}`.

## 9. Idempotency & offline

- Setiap mutasi wajib menerima `idempotencyKey` (UUID v4 dari frontend). Backend menyimpan hash/UUID di `AUDIT_LOG.requestId` dan menolak duplikat dengan mengembalikan hasil lama bila tersedia.
- Frontend IndexedDB `outbox` menyimpan `{id: uuid, action, payload, status, attempts, lastError, createdAt}`.
- Status di UI: `MENUNGGU SINKRONISASI` sampai backend membalas `ok: true`. Tidak boleh ditampilkan sebagai "berhasil".
- Sinkronisasi: online event + interval + tombol manual; tidak bergantung pada Background Sync.
- Konflik (misal sesi ditutup) ditandai `GAGAL – butuh tindakan` dengan tombol ulang/hapus.

## 10. Batasan Apps Script & solusi

1. Tidak ada WebSocket → polling 15–30 detik.
2. CORS tidak andal → JSONP GET via `<script>`; payload dibatasi < 8 KB per request (chunking import).
3. Tidak ada bcrypt native → SHA-256 + salt unik per user + rate limiting + token session berumur pendek. Untuk produksi sensitif, disarankan migrasi ke Auth library eksternal, tetapi tidak dipakai di versi ini agar tetap tanpa server berbayar.
4. Eksekusi Web App 6 menit (consumer) → semua aksi dipecah, backup memakai copy spreadsheet (bukan export manual besar).
5. doGet untuk mutasi: masih berfungsi; semua mutasi dilindungi token + LockService + idempotency. Jika deployment corporate memblokir doGet mutation, siapkan fallback doPost `text/plain` dengan envelope yang sama (tidak diaktifkan default).
