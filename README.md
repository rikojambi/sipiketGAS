# SIPIKET

**Sistem Informasi Piket Guru dan Monitoring Kehadiran Siswa.**

SIPIKET membantu sekolah mencatat kehadiran siswa (apel pagi/siang), izin dan pergerakan keluar, keterlambatan beserta konsekuensinya, monitoring kelas saat KBM, serta penugasan guru pengganti. Aplikasi berjalan sebagai PWA di HP/laptop dan memakai Google Apps Script + Google Sheets sebagai backend tanpa server berbayar.

> Status pengujian: **27 tes otomatis lolos** (mock GAS runtime + aset + dokumentasi) dan build produksi berhasil. **Belum ada pengujian di lingkungan nyata** (Google Apps Script/Netlify/HP). Lihat `docs/TESTING_CHECKLIST.md` bagian `0b` untuk bukti otomatis dan `DEVELOPMENT_PROGRESS.md` untuk status tiap fase. Jangan menganggap fitur "teruji di produksi" hanya karena lolos di mock.

---

## Arsitektur ringkas

```text
┌───────────────────────┐        JSONP_GET (script tag + callback)        ┌────────────────────────┐
│  Browser / HP (PWA)   │ ──────────────────────────────────────────────▶ │ Google Apps Script     │
│  Netlify (statis)     │ ◀────────────────────────────────────────────── │ Web App (/exec)        │
│  - sessionStorage     │  window[cb]({ok,data,error,requestId,...})      │ - doGet(e) router      │
│  - IndexedDB outbox   │                                                │ - Auth + LockService   │
│  - service worker     │                                                │ - 15 modul .gs         │
└───────────┬───────────┘                                                └───────────┬────────────┘
            │ polling 15–30 detik (tanpa WebSocket)                                  │ SpreadsheetApp.openById
            ▼                                                                        ▼
     ┌─────────────┐                                                    ┌──────────────────────────┐
     │ Outbox      │  offline → MENUNGGU SINKRONISASI → online          │ Google Spreadsheet       │
     │ (IndexedDB) │                                                    │ 19 sheet + SESSIONS      │
     └─────────────┘                                                    │ → Drive: SIPIKET_BACKUPS │
                                                                        └──────────────────────────┘
```

Prinsip penting:

- Kontrak API `v1.0.0` memakai **JSONP_GET**, bukan REST/CORS, karena keterbatasan Apps Script.
- Role dan keputusan akhir (hadir/terlambat, izin, jadwal piket) dihitung **server** dengan timezone `Asia/Jakarta`.
- Semua mutasi memakai token, `LockService`, dan `idempotencyKey`.
- Token session disimpan di `sessionStorage`; antrean offline di IndexedDB.

---

## Struktur folder

```text
open14/
├── docs/
│   ├── API_DOCUMENTATION.md      # kontrak API v1.0.0 (sumber kebenaran)
│   ├── DATABASE_SCHEMA.md        # 19 sheet + SESSIONS, header, relasi
│   ├── INSTALLATION.md           # instalasi Sheet + GAS + Netlify
│   ├── ADMIN_GUIDE.md            # panduan superadmin/operator
│   ├── USER_GUIDE.md             # panduan 4 peran pengguna
│   ├── IMPLEMENTATION_NOTES.md   # keterbatasan GAS & keputusan desain
│   ├── SETTINGS.md               # referensi SCHOOL_SETTINGS, termasuk dutyOpenMinutes
│   └── TESTING_CHECKLIST.md      # checklist FASE 5 + bukti pengujian otomatis
├── gas-backend/                  # 15 file .gs: Code, Config, Utils, Store, Auth,
│                                 # Setup, Users, Students, Attendance, Permissions,
│                                 # Classes, Monitoring, Notifications, Reports, Backups
├── src/                          # frontend VANILLA JS SPA + PWA
├── tests/                        # pengujian unit + mock GAS runtime
├── public/
│   ├── manifest.webmanifest      # PWA manifest, ikon, shortcut hash route
│   └── icons/                    # ikon 192/512/maskable/apple-touch
├── scripts/generate-icons.js     # generator ikon
├── scripts/mock-gas-server.js    # server lokal + mock GAS untuk uji browser (bukan produksi)
├── index.html                    # entry point Vite
├── vite.config.js                # build ke dist/, target es2020
├── netlify.toml                  # build, header cache, SPA redirect
├── package.json                  # scripts & dependensi
└── DEVELOPMENT_PROGRESS.md       # status fase pengembangan
```

> Struktur `gas-backend/`, `src/`, `tests/`, dan `public/` sudah terisi sesuai kontrak. rincian status ada di `DEVELOPMENT_PROGRESS.md`.

---

## Quickstart 9 langkah

1. Buat Spreadsheet kosong dan salin `SPREADSHEET_ID` dari URL-nya.
2. Buat Apps Script project baru bernama `SIPIKET Backend`.
3. Tempel 15 file `.gs` dari `gas-backend/` **dengan urutan**: Code, Config, Utils, Store, Auth, Setup, Users, Students, Attendance, Permissions, Classes, Monitoring, Notifications, Reports, Backups.
4. Isi Script Properties: `SPREADSHEET_ID`, `SETUP_ADMIN_TOKEN` (bootstrap setup API), `SEED_ADMIN_PASSWORD`, `SEED_HEAD_PASSWORD`, `SEED_DUTY_PASSWORD`, `SEED_SUBJECT_PASSWORD`, `SEED_HOMEROOM_PASSWORD`, dan opsional `SESSION_TTL_MS`.
5. Di editor Apps Script jalankan `setupDatabase()`, lalu `seedInitialData()`, lalu `validateDatabase()`. `seedInitialData()` membuat akun `admin`, `kepala`, `piket`, `mapel`, `wali` dan **mengembalikan password sekali** — simpan sekarang.
6. Login sebagai `admin`, ganti password seed lewat `users.setPassword`, lalu hapus/rotate `SETUP_ADMIN_TOKEN` dan property `SEED_*` setelah tidak diperlukan.
7. Deploy Web App: **Execute as Me**, **Anyone** → salin URL `.../exec`.
8. Set `VITE_GAS_EXEC_URL` di Netlify = URL `/exec` tersebut, lalu deploy frontend (`npm run build` → `dist`).
9. Uji `action=ping` dan login peran dari aplikasi Netlify, lalu isi `docs/TESTING_CHECKLIST.md` bagian hasil pengujian nyata sebelum dipakai operasional.

Rincian ada di `docs/INSTALLATION.md`.

---

## Perintah umum

```bash
npm install        # pasang dependensi (@zxing/browser, vite)
npm run dev        # server dev Vite di http://localhost:5173
npm test           # node --test tests/**/*.test.js
npm run build      # build produksi ke dist/
npm run preview    # pratinjau hasil build di http://localhost:4173
npm run check      # npm test && npm run build
npm run dev:mock   # build + server lokal http://localhost:4178 dengan mock GAS
```

Untuk uji browser tanpa deploy, arahkan frontend ke server mock lalu jalankan:

```bash
# Windows (cmd)
set VITE_GAS_EXEC_URL=http://localhost:4178/gas&& npm run dev:mock

# macOS/Linux
VITE_GAS_EXEC_URL=http://localhost:4178/gas npm run dev:mock
```

Server mock memakai backend Apps Script yang sama di dalam Node, **hanya untuk pengembangan**. Kredensial seed lokal: `admin`/`SipiketAdmin123!`, `kepala`/`Kepala12345!`, `piket`/`Guru12345!`, `mapel`/`Mapel12345!`, `wali`/`Wali12345!`. Opsi `MOCK_NOW=2026-11-24T00:10:00Z` memaksa waktu server untuk uji aturan jam. Jangan gunakan server ini di produksi.

Butuh Node.js `>=20` (Netlify memakai 22). Detail deploy ada di `docs/INSTALLATION.md` bagian 6–7.

---

## Fitur per peran

| Peran | Fitur utama |
|---|---|
| **Superadmin** | Setup & validasi database, kelola user/role (termasuk akun seed `admin`), setting sekolah, impor data, backup/restore, audit log. |
| **Kepala Sekolah** | Dashboard dan laporan (read-only), koreksi transaksi lewat aksi `*.correct` yang tercatat di audit. Tidak bisa create/update/delete transaksi langsung. |
| **Guru Piket** | Scan apel pagi/siang, izin keluar & kembali, pulang awal, catat keterlambatan & konsekuensi, monitoring kelas kosong, penugasan pengganti. Hanya saat ada jadwal piket aktif. |
| **Guru Mapel** | Lapor sakit/izin/terlambat, melihat notifikasi dan tugas/pengganti yang ditugaskan. |
| **Wali Kelas** | Melihat data kelasnya, mengonfirmasi izin siswa, membuat/mencetak barcode siswa, merekap absensi/izin/keterlambatan kelas. |

Alur pengguna ada di `docs/USER_GUIDE.md`; panduan operator ada di `docs/ADMIN_GUIDE.md`.

---

## Dokumentasi

- [API Documentation — kontrak v1.0.0](docs/API_DOCUMENTATION.md)
- [Database Schema — Google Sheets](docs/DATABASE_SCHEMA.md)
- [Installation](docs/INSTALLATION.md)
- [Admin Guide](docs/ADMIN_GUIDE.md)
- [User Guide](docs/USER_GUIDE.md)
- [Implementation Notes](docs/IMPLEMENTATION_NOTES.md)
- [Settings Reference](docs/SETTINGS.md) — termasuk jam buka menu piket `dutyOpenMinutes`
- [Testing Checklist](docs/TESTING_CHECKLIST.md)
- [Development Progress](DEVELOPMENT_PROGRESS.md)

---

## Status fase

Ringkasan (rinci di `DEVELOPMENT_PROGRESS.md`):

| Fase | Status di `DEVELOPMENT_PROGRESS.md` |
|---|---|
| 1. Perencanaan | Selesai — kontrak API & skema database ditetapkan |
| 2. Backend GAS | Selesai — 15 modul `.gs`, router, otorisasi, audit, backup |
| 3. Frontend | Selesai — SPA vanilla JS, seluruh rute dan aksi nyata |
| 4. PWA | Selesai — manifest, service worker, ikon, antrean IndexedDB |
| 5. Pengujian | Otomatis selesai (27 tes + smoke browser mock); pengujian perangkat nyata **menunggu** |
| 6. Deployment | Menunggu — belum ada deploy Apps Script/Netlify nyata |

Dokumen ini tidak menyatakan fitur "teruji di produksi". Hasil pengujian nyata harus diisi dan ditandatangani di `docs/TESTING_CHECKLIST.md`.
