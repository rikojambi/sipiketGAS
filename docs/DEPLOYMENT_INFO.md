# SIPIKET — Informasi Deployment (real)

Catatan: file ini **tidak berisi password/token**. Kredensial seed dibuat sekali saat provisioning dan disimpan terpisah oleh pemilik akun.

## Akun Google
- Owner / deployer: `riko.hd@gmail.com`

## Google Sheets (database)
- Nama: `SIPIKET_Database`
- Spreadsheet ID: `1G7-uktZ9LvC9hU7Obexfpa0lDHWM3c6Tc1mNLnf8Q7s`
- URL: https://docs.google.com/spreadsheets/d/1G7-uktZ9LvC9hU7Obexfpa0lDHWM3c6Tc1mNLnf8Q7s/edit
- Isi: 19 sheet utama + `SESSIONS` (tersembunyi), header sesuai `docs/DATABASE_SCHEMA.md`.

## Google Apps Script
- Nama project: `SIPIKET_Database` (terikat pada spreadsheet di atas)
- Script ID: `1udL3j-6QfswW5DaniqEEvJ58JLsGZun0kyAEsh1Qh6TmzW_rR2PRHLqR`
- Editor: https://script.google.com/d/1udL3j-6QfswW5DaniqEEvJ58JLsGZun0kyAEsh1Qh6TmzW_rR2PRHLqR/edit
- Manifest: `gas-backend/appsscript.json` (timezone `Asia/Jakarta`, Web App `USER_DEPLOYING` + `ANYONE_ANONYMOUS`).

## Web App (backend API)
- Deployment aktif: `@3` — `SIPIKET_v1.0.0_final`
- Deployment ID: `AKfycbxpH6GaCgRKZXJAXYEbKIxDitweYZUqLps2RvJ22N2-_5Vv7AUE3eGxWBXvhXwtr3t1Rg`
- URL `/exec`: https://script.google.com/macros/s/AKfycbxpH6GaCgRKZXJAXYEbKIxDitweYZUqLps2RvJ22N2-_5Vv7AUE3eGxWBXvhXwtr3t1Rg/exec

Setel nilai ini di Netlify sebagai `VITE_GAS_EXEC_URL`, lalu jalankan `npm run build` sebelum deploy frontend.

## Status provisioning (2026-11-24)
- `ping` → `ok:true`, `spreadsheetReady:true`.
- `setup.database` → `initialized:true`, 20 sheet terdaftar.
- `setup.seed` → `seeded:true`, akun `admin`, `kepala`, `piket`, `mapel`, `wali` + 1 kelas, 1 guru, 3 siswa contoh.
- `setup.validate` → `valid:true`, `issues:[]`, `checkedSheets:20`.
- Login `admin` (SUPERADMIN), `piket` (GURU_PIKET), `wali` (WALI_KELAS) → `ok:true`, token diterbitkan.
- Kode bootstrap sementara yang dipakai untuk mengisi Script Properties sudah dihapus; deployment lama yang memuatnya sudah di-undeploy.

## Catatan operasional
- `SETUP_ADMIN_TOKEN` dan `SEED_*` tersimpan di **Script Properties** project Apps Script. Setelah password seed dipakai untuk login, segera ganti lewat `users.setPassword` lalu hapus/rotasi `SETUP_ADMIN_TOKEN` dan property `SEED_*`.
- `GURU_PIKET` memerlukan jadwal piket hari ini di sheet `DUTY_SCHEDULES` dan waktu server melewati `dutyOpenMinutes` (default 06:00 WIB). Seed tidak membuat jadwal piket hari ini, sehingga menu piket akan menampilkan pesan "Anda tidak memiliki jadwal piket pada hari ini." sampai jadwal dibuat oleh superadmin.
- Untuk memperbarui backend setelah perubahan kode: `npx @google/clasp push --force`, lalu `npx @google/clasp deploy`, lalu perbarui `VITE_GAS_EXEC_URL` jika deployment ID berubah.
