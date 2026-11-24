# SIPIKET Development Progress

Status per 2026-11-24. **Fase 1–5 (implementasi + pengujian otomatis) selesai; fase 6 (deployment nyata) belum dimulai.**

| Fase | Status | Catatan |
|---|---|---|
| 1. Perencanaan | Selesai | Kontrak API `v1.0.0` di `docs/API_DOCUMENTATION.md`; skema 19 sheet + `SESSIONS` di `docs/DATABASE_SCHEMA.md`; keputusan transport JSONP GET karena keterbatasan CORS GAS. |
| 2. Backend GAS | Selesai | 15 file `.gs`: `Code, Config, Utils, Store, Auth, Setup, Users, Students, Attendance, Permissions, Classes, Monitoring, Notifications, Reports, Backups`. Router envelope, bootstrap `SETUP_ADMIN_TOKEN`, otorisasi peran + jadwal piket, `LockService`, cache baca, idempotensi via `AUDIT_LOG`, backup Drive, restore dengan konfirmasi `RESTORE`. |
| 3. Frontend | Selesai | SPA vanilla JS ES6+ dengan hash router, guard peran & jadwal piket, seluruh halaman memanggil aksi API nyata, tidak ada tombol dummy. Token hanya di `sessionStorage`. |
| 4. PWA | Selesai | Manifest + shortcut, service worker app shell (tidak meng-cache endpoint GAS), ikon 192/512/maskable/apple-touch, antrean IndexedDB dengan UUID idempotency, status `MENUNGGU SINKRONISASI`, sinkron saat online/interval/manual, install prompt. |
| 5. Pengujian | Otomatis selesai | `npm test` 27/27 lolos; `npm run build` berhasil; smoke browser melawan mock GAS. Pengujian perangkat nyata **masih menunggu** (lihat `docs/TESTING_CHECKLIST.md`). |
| 6. Deployment | Menunggu | Belum ada deploy Apps Script/Netlify. Folder bukan repository git, belum ada commit/push. |

## Log

- 2026-11-24: Inisialisasi proyek, kontrak API final, skema 19 sheet + `SESSIONS`, keputusan transport JSONP GET.
- 2026-11-24: Backend modular selesai; hook konfigurasi `SIPIKET_Config`, `SIPIKET_Utils`, `SIPIKET_Auth`, `SIPIKET_Store`; fungsi editor `setupDatabase()`, `seedInitialData()`, `validateDatabase()`, `migrateDatabase()`, `backupDatabase()`, `installBackupTriggers()`.
- 2026-11-24: Frontend PWA selesai; rute `#/login`, `#/dashboard`, `#/scan/:session`, `#/attendance/:session`, `#/late`, `#/permits`, `#/movement/*`, `#/monitoring`, `#/substitutes`, master data, `#/reports`, `#/settings`, `#/notifications`, `#/audit`, `#/backups`.
- 2026-11-24: Dokumentasi operasional selesai dan diselaraskan dengan implementasi: `SETUP_ADMIN_TOKEN`, lima Script Property `SEED_*`, `dutyOpenMinutes` default `360`, tidak ada `createFirstSuperadmin()`.
- 2026-11-24: Test harness(mock GAS runtime) + 27 tes otomatis; perbaikan determinisme `spkDayCode`, iterator `DriveApp` pada mock, dan CSV newline.
- 2026-11-24: Smoke browser mock: login `admin`/`piket`, dashboard, scanner, daftar siswa, antrean offline, jalur konflik dan jalur sukses sinkron (dengan `MOCK_NOW=2026-11-24T00:10:00Z`), service worker aktif, 28 rute dengan guard peran. Temuan dan perbaikan: import `emptyState` hilang di `src/pages/movements.js`, `GURU_PIKET` belum mendapat izin `duty.list`, tombol tulis pada halaman master masih tampil untuk peran read-only. Semua sudah diperbaiki dan diverifikasi ulang.

## Bukti otomatis (mock, bukan produksi)

- `npm test` → **27/27 lolos**: kontrak backend, hash SHA-256 + salt, envelope JSONP, callback XSS ditolak, setup/seed/validate, login lima peran, idempotensi & duplikat scan, dua sesi, keterlambatan + konsekuensi, izin sakit → `SAKIT`, pergerakan keluar/kembali, pembatasan peran & pesan jadwal piket persis, utilitas frontend, manifest/service worker/Netlify, dan kelengkapan dokumen.
- `npm run build` → **berhasil**, 256 modul, tanpa error; chunk ZXing dimuat lazy.
- Server mock `scripts/mock-gas-server.js` memakai backend `.gs` yang sama di Node, mendukung `MOCK_NOW` untuk uji aturan jam. Kredensial lokal tercantum di `README.md`. **Tidak untuk produksi.**

## Masih manual / belum terbukti

- Deploy Web App Apps Script (**Execute as Me**, **Anyone**) dan `VITE_GAS_EXEC_URL` di Netlify.
- `ping` / login / refresh halaman dalam pada domain Netlify HTTPS.
- Kamera dan pembacaan barcode fisik di Android/iOS; install prompt PWA di perangkat nyata.
- Backup/restore Google Drive, trigger 6 jam, import CSV skala penuh, konkurensi multi-perangkat, dan seluruh baris A–J di `docs/TESTING_CHECKLIST.md`.

Jalur sinkron sudah diverifikasi dua kali di mock: tanpa `MOCK_NOW` menghasilkan `FAILED` + tombol Ulangi ketika sesi absensi ditutup, dengan `MOCK_NOW=2026-11-24T00:10:00Z` menghasilkan pengiriman sukses dan 1 baris `ATTENDANCE`/`HADIR` di `reports.get`.

> Jangan menaikkan status fase 5 menjadi "teruji di produksi" atau fase 6 menjadi "selesai" sebelum bukti pengujian nyata diisi di `docs/TESTING_CHECKLIST.md`.
