# SIPIKET — Panduan Instalasi

Dokumen ini menjelaskan instalasi **SIPIKET** dari nol: Google Spreadsheet sebagai penyimpanan, Google Apps Script sebagai backend Web App, dan frontend PWA statis di Netlify.

Kontrak yang dipakai: `docs/API_DOCUMENTATION.md` versi `1.0.0` dan `docs/DATABASE_SCHEMA.md`. Jika ada perbedaan, kedua file itulah sumber kebenaran.

> Semua nilai password di bawah adalah **placeholder**. Jangan menaruh password produksi di dokumen, repository, atau screenshot.

## 0. Prasyarat

| Kebutuhan | Keterangan |
|---|---|
| Akun Google | Satu akun sebagai owner Spreadsheet + Apps Script + Web App. Disarankan akun organisasi sekolah, bukan akun pribadi. |
| Node.js |Versi `>=20` (lihat `package.json`). Netlify menggunakan `NODE_VERSION = "22"` (`netlify.toml`). |
| Akun Netlify | Untuk hosting frontend statis, atau akses ke CLI Netlify. |
| Browser modern | Chrome/Edge terbaru untuk pengujian kamera/barcode dan PWA. |
| Akses ke source | Folder `gas-backend/` (file `.gs`) dan repository frontend. |

Diagram deployment singkat:

```text
Browser / HP (PWA di Netlify)
   |  JSONP_GET: <script src=".../exec?callback=...&action=...&payload=...">
   v
Google Apps Script Web App (Execute as me, Anyone)
   |  SpreadsheetApp.openById(SPREADSHEET_ID)
   v
Google Spreadsheet (19 sheet + SESSIONS)  ---> Backup: folder Drive SIPIKET_BACKUPS
```

---

## 1. Buat Spreadsheet

1. Buka Google Sheets → **Blank spreadsheet**.
2. Beri nama, misalnya `SIPIKET Database - <Nama Sekolah>`.
3. Salin ID dari bilah alamat:

   ```text
   https://docs.google.com/spreadsheets/d/1AbCdEfGhIjKlMnOpQrStUvWxYz1234567890/edit
                                            \____________ SPREADSHEET_ID ___________/
   ```

4. **Jangan** bagikan spreadsheet ke "Anyone with the link". Spreadsheet diakses oleh kode Apps Script atas nama owner Web App.
5. Pastikan akun yang sama memiliki akses **Editor** pada spreadsheet tersebut.

> Sheet tidak perlu dibuat manual. `setupDatabase()` akan membuat/menghubungkan 19 sheet plus sheet tersembunyi `SESSIONS`.

---

## 2. Buat Apps Script project dan tempel file `.gs` berurutan

1. Buka <https://script.google.com> → **New project**.
2. Ganti nama project menjadi `SIPIKET Backend`.
3. Hapus file `Code.gs` bawaan jika berbeda isi, lalu buat file satu per satu dengan tombol **+ → Script**.
4. Beri nama file **tanpa** ekstensi di editor Apps Script (editor menambahkan `.gs` otomatis). Urutan berikut wajib dijaga karena Apps Script menjalankan deklarasi level-atas sesuai urutan file dalam project:

| Urutan | Nama file | Peran utama |
|---:|---|---|
| 1 | `Code` | Entry point `doGet(e)`, routing `action`, envelope respons JSONP |
| 2 | `Config` | Konstanta, daftar aksi, whitelist setting, versi kontrak |
| 3 | `Utils` | UUID, waktu `Asia/Jakarta`, validasi, helper JSON/Base64 |
| 4 | `Store` | Akses Spreadsheet/Range, tabel + indeks logik via CacheService |
| 5 | `Auth` | Login, hash salt + SHA-256, session token, rate limiting |
| 6 | `Setup` | `setupDatabase()`, `seedInitialData()`, validasi/migrasi skema |
| 7 | `Users` | CRUD user, guru, reset password, deaktivasi |
| 8 | `Students` | CRUD siswa, `barcode.lookup`, import CSV, regenerate barcode |
| 9 | `Attendance` | `attendance.scan/manual/correct`, `late.record`, konsekuensi |
| 10 | `Permissions` | Izin, `permits.approve`, pergerakan keluar/kembali, pulang awal |
| 11 | `Classes` | Kelas, mata pelajaran, jadwal, hari libur, jadwal piket |
| 12 | `Monitoring` | Monitoring KBM dan penugasan pengganti |
| 13 | `Notifications` | Notifikasi per role/kelas, tandai dibaca |
| 14 | `Reports` | Dashboard, laporan, audit log |
| 15 | `Backups` | `backup.create/list/restore` ke Drive |

5. Tempel isi setiap file `gas-backend/<Nama>.gs` ke file yang bersesuaian. Simpan dengan **Ctrl+S**.
6. Jika project memiliki `appsscript.json`, pastikan scope minimal mencakup Spreadsheet dan Drive. Jangan menambah scope yang tidak diperlukan.

> Bila implementasi memindahkan suatu fungsi ke file lain, tetap pertahankan urutan di atas dan pastikan tidak ada dua deklarasi fungsi dengan nama yang sama.

---

## 3. Set Script Properties

Buka **Project Settings** (ikon gear) → **Script Properties** → **Add script property**.

| Key | Wajib | Nilai contoh / placeholder | Fungsi |
|---|---|---|---|
| `SPREADSHEET_ID` | Ya | `1AbCdEfGhIjKlMnOpQrStUvWxYz1234567890` | ID spreadsheet dari langkah 1 |
| `SETUP_ADMIN_TOKEN` | Ya (bootstrap) | `<TOKEN_ACAK_PANJANG>` | Token bootstrap untuk aksi `setup.*` sebelum ada sesi superadmin. Beri nilai acak, bukan password |
| `SESSION_TTL_MS` | Tidak | `28800000` | Umur token session dalam ms; default 8 jam |
| `SEED_ADMIN_PASSWORD` | Untuk seed | `<SANDI_ADMIN>` | Password akun `admin` (SUPERADMIN) |
| `SEED_HEAD_PASSWORD` | Untuk seed | `<SANDI_KEPALA>` | Password akun `kepala` (KEPALA_SEKOLAH) |
| `SEED_DUTY_PASSWORD` | Untuk seed | `<SANDI_PIKET>` | Password akun `piket` (GURU_PIKET) |
| `SEED_SUBJECT_PASSWORD` | Untuk seed | `<SANDI_MAPEL>` | Password akun `mapel` (GURU_MAPEL) |
| `SEED_HOMEROOM_PASSWORD` | Untuk seed | `<SANDI_WALI>` | Password akun `wali` (WALI_KELAS) |

Catatan:

- Script Properties **berlaku per project Apps Script**, bukan per spreadsheet.
- Variabel `VITE_GAS_EXEC_URL` adalah environment variable **frontend Netlify**, bukan Script Property. Keduanya berbeda.
- `SETUP_ADMIN_TOKEN` diterima backend sebagai token sementara berhak superadmin untuk `setup.database`, `setup.seed`, `setup.validate`, dan `setup.migrate`. **Hapus atau rotasi** setelah inisialisasi selesai; jangan disimpan di browser.
- `seedInitialData()` mengembalikan kelima password sekali di respons. Simpan di tempat aman, lalu ganti lewat `users.setPassword`.
- Jangan pernah memakai password produksi sebagai placeholder dalam dokumentasi atau contoh.

---

## 4. Inisialisasi database dan data awal

Di editor Apps Script:

1. Pilih fungsi `setupDatabase` pada dropdown fungsi → klik **Run**.
2. Prompt otorisasi pertama kali: **Review permissions** → pilih akun owner → **Advanced** → **Go to SIPIKET Backend (unsafe)** → **Allow**. Ini normal untuk script pribadi yang belum diverifikasi Google.
3. Buka **Execution log** dan pastikan tidak ada error. Periksa Spreadsheet: harus muncul 19 sheet sesuai `DATABASE_SCHEMA.md` dan sheet tersembunyi `SESSIONS`.
4. Pilih fungsi `seedInitialData` → **Run**. Ini mengisi data contoh (user, guru, siswa, kelas, setting) dan hanya dijalankan bila `APP_CONFIG.seedDone != true`.
   - Aksi API yang bersesuaian: `setup.seed`.
   - Bila ingin mengulang seed, jangan menghapus sheet secara manual tanpa backup; gunakan `setup.status` / `setup.validate` untuk memeriksa kondisi.
5. Jalankan `validateDatabase()` di editor (atau aksi API `setup.validate` dengan token bootstrap) dan pastikan `valid: true`. Jika ada `issues`, perbaiki sesuai pesan sebelum deploy.
6. Periksa nilai `dutyOpenMinutes` di `SCHOOL_SETTINGS` (default `360` = 06:00). Ini **bukan** Script Property, melainkan setting sekolah yang diubah superadmin lewat `settings.save`. Nilai ini menentukan jam buka menu operasional guru piket; detail ada di `docs/SETTINGS.md` dan `docs/ADMIN_GUIDE.md`.

> `seedInitialData()` menghasilkan akun contoh. Ubah password seed sebelum dipakai operasional (lihat `ADMIN_GUIDE.md`).

> Setting jam buka piket (`dutyOpenMinutes`) berbeda dengan Script Property `SESSION_TTL_MS`: yang pertama mengatur jam akses menu operasional, yang terakhir mengatur umur token login.

---

## 5. Amankan akun superadmin hasil seed

`seedInitialData()` sudah membuat akun SUPERADMIN dengan username `admin` (dan empat akun peran lainnya). Tidak ada fungsi `createFirstSuperadmin()`.

1. Salin password `admin` dari hasil `seedInitialData()` / `setup.seed` saat itu juga (tidak ditampilkan lagi).
2. Login sebagai `admin` di aplikasi, lalu ganti password lewat aksi `users.setPassword`.
3. Hapus Script Property `SEED_*` dan `SETUP_ADMIN_TOKEN` bila tidak lagi memakai API setup. Jika masih perlu setup API, simpan token bootstrap dengan aman dan rotasi berkala.
4. Detail dan pertimbangan keamanan ada di `docs/ADMIN_GUIDE.md` bagian 2.

---

## 6. Deploy Web App

1. Di editor Apps Script: **Deploy → New deployment**.
2. Klik gear → **Web app**.
3. Isi:
   - **Description**: `SIPIKET v1`
   - **Execute as**: **Me** (penting: kode mengakses spreadsheet sebagai owner)
   - **Who has access**: **Anyone** (endpoint harus bisa dipanggil browser tanpa login Google)
4. Klik **Deploy**, setujui otorisasi bila diminta.
5. Salin **Web app URL**:

   ```text
   https://script.google.com/macros/s/<DEPLOYMENT_ID>/exec
   ```

6. Uji cepat dari browser (buka tab baru, alamat berikut; ganti placeholder):

   ```text
   https://script.google.com/macros/s/<DEPLOYMENT_ID>/exec?callback=__sipiketTest&action=ping&payload=%7B%7D&v=1
   ```

   Respons harus berupa JavaScript seperti:

   ```js
   window[__sipiketTest]({"ok":true,"data":{"pong":true,"serverTime":"...","version":"1.0.0","spreadsheetReady":true},...});
   ```

Setiap perubahan kode Apps Script: **Deploy → Manage deployments → Edit → Version: New version → Deploy**. URL `/exec` tetap sama. **Jangan** memakai URL `/dev` untuk produksi; URL tersebut berubah setiap kali kode disimpan dan memerlukan login Google.

---

## 7. Set environment variable Netlify

Frontend membaca `VITE_GAS_EXEC_URL` saat **build**, bukan saat runtime.

**Lewat UI Netlify**

1. Buka site → **Site configuration → Environment variables**.
2. Tambahkan variabel:

   ```text
   Key:   VITE_GAS_EXEC_URL
   Value: https://script.google.com/macros/s/<DEPLOYMENT_ID>/exec
   ```

3. Trigger deploy ulang agar nilai tersebut tertanam dalam bundle.

**Lewat Netlify CLI**

```bash
npm install -g netlify-cli
netlify env:set VITE_GAS_EXEC_URL "https://script.google.com/macros/s/<DEPLOYMENT_ID>/exec"
netlify deploy --prod --dir=dist
```

> Variabel berprefiks `VITE_` ikut tertanam di JavaScript yang dikirim ke browser. Jangan menaruh secret apa pun di sini; URL Web App bersifat publik dan sudah dirancang demikian.

---

## 8. Deploy frontend ke Netlify

**Opsi A — hubungkan repository Git**

| Pengaturan | Nilai |
|---|---|
| Build command | `npm run build` |
| Publish directory | `dist` |
| Node version | `22` (sudah ada di `netlify.toml`) |

**Opsi B — CLI dari folder proyek**

```bash
npm install
npm run build
netlify deploy --prod --dir=dist
```

`netlify.toml` yang sudah ada mengatur:

- `/* → /index.html` dengan status `200` (SPA fallback untuk deep link),
- `sw.js` dengan `Cache-Control: no-cache, no-store, must-revalidate`,
- `manifest.webmanifest` dengan `Content-Type: application/manifest+json`,
- aset `/assets/*` di-cache immutabel.

---

## 9. Uji `ping` dari frontend

Buka aplikasi Netlify, **DevTools → Console**, lalu jalankan:

```js
const cb = '__sipiketPing_' + Date.now();
window[cb] = (res) => console.log('ping:', res);
const s = document.createElement('script');
s.src = 'https://script.google.com/macros/s/<DEPLOYMENT_ID>/exec'
      + '?callback=' + cb + '&action=ping&payload=%7B%7D&v=1';
document.head.appendChild(s);
```

Ekspektasi:

- `res.ok === true`
- `res.data.pong === true`
- `res.data.spreadsheetReady === true`
- `res.version === "1.0.0"`
- `res.requestId` terisi.

Jika console menampilkan error, lihat bagian Troubleshooting di bawah.

---

## 10. Uji login tiap peran

1. Buka URL site Netlify (bukan URL Apps Script).
2. Login memakai username hasil seed (`admin`, `kepala`, `piket`, `mapel`, `wali`) dan password seed yang sesuai, misalnya placeholder:

   ```text
   username: admin
   password: <SANDI_ADMIN>
   ```

3. Setelah login, periksa di Console (atau lewat aksi `me`) bahwa:
   - `user.role` sesuai akun yang dipakai,
   - `settings.schoolName` dan `pollIntervalMs` terbaca,
   - `permissions` / `dutyToday` sesuai jadwal,
   - token tersimpan di **sessionStorage**, bukan localStorage.
4. Uji `logout`, lalu pastikan token di sessionStorage hilang dan aksi terautentikasi berikutnya ditolak `UNAUTHORIZED`.
5. Ulangi untuk peran `GURU_PIKET`, `GURU_MAPEL`, `WALI_KELAS`, `KEPALA_SEKOLAH` memakai akun contoh. Checklist lengkap ada di `docs/TESTING_CHECKLIST.md`.

---

## Troubleshooting

| Gejala | Penyebab likely | Tindakan |
|---|---|---|
| `No 'Access-Control-Allow-Origin' header` di Console | Frontend memanggil `/exec` dengan `fetch()` + header custom. GAS tidak mendukung CORS andal untuk kasus ini. | Pakai **JSONP_GET**: elemen `<script>` dengan parameter `callback`, `action`, `payload`, `v`. Jangan kirim header custom. Kontrak sengaja tidak memakai `Access-Control-Allow-Origin: *`. |
| `window[cb] is not a function` | Callback belum didefinisikan saat script respons dieksekusi, atau nama callback bentrok. | Definisikan `window[cb]` **sebelum** menambahkan `<script>`. Pakai nama unik per request (`__sipiketCb_<waktu>_<acak>`) dan hapus setelah selesai. |
| Request gagal / terpotong pada import banyak baris | URL terlalu panjang (batas praktis sekitar 8 KB per request JSONP GET). | Kirim maksimal 200 baris per panggilan `students.import`; frontend wajib chunking. Jangan mengirim foto/base64 besar lewat payload. |
| `UNAUTHORIZED` padahal sudah login | Token expired (default 8 jam), logout, atau sessionStorage berbeda (tab/browser lain). | Login ulang. Ingat: sessionStorage tidak dibagi antar-tab. |
| Pesan persis **"Anda tidak memiliki jadwal piket pada hari ini."** | User `GURU_PIKET` tidak punya `DUTY_SCHEDULES` aktif untuk tanggal server `Asia/Jakarta`. | Buat/aktifkan jadwal MAIN atau BACKUP di `duty.save`. Cek tanggal memakai waktu server, bukan waktu perangkat. |
| Pesan **"Menu piket belum dibuka pada waktu ini."** | Waktu server `Asia/Jakarta` belum melewati `SCHOOL_SETTINGS.dutyOpenMinutes` (default `360` = 06:00). | Tunggu sampai jam buka, atau minta superadmin mengubah `dutyOpenMinutes` lewat `settings.save`. Ini berbeda dengan pesan "tidak memiliki jadwal piket". |
| Halaman kosong / 404 saat refresh pada URL dalam | SPA fallback Netlify tidak aktif. | Pastikan `netlify.toml` ter-commit dengan redirect `/* → /index.html status 200`. Periksa tab Network di DevTools. |
| Tampilan lama tetap muncul setelah deploy | Service worker / cache browser menyimpan aset lama. | `sw.js` sudah `no-cache`; lakukan hard refresh, unregister service worker di DevTools → Application, lalu muat ulang. |
| Shortcut PWA `/#/scan/MORNING` tidak membuka halaman | Manifest memakai rute hash, frontend memakai rute history (atau sebaliknya). | Samakan strategi routing. Perlu diverifikasi di lingkungan nyata; lihat `IMPLEMENTATION_NOTES.md`. |
| `Spreadsheet not found` / `Permission denied` | `SPREADSHEET_ID` salah atau owner Web App bukan editor spreadsheet. | Periksa ID, buka spreadsheet dengan akun owner, pastikan akses Editor. Jangan menaruh spreadsheet di Drive akun lain tanpa share. |
| `Authorization required` | Otorisasi OAuth belum selesai atau dicabut. | Jalankan sembarang fungsi dari editor Apps Script dan setujui ulang, lalu deploy versi baru bila perlu. |
| Backup gagal membuat file | Folder `SIPIKET_BACKUPS` belum ada / owner tidak punya akses Drive. | Pastikan akun owner Web App bisa menulis di Drive dan folder tujuan tersedia. |
| `RATE_LIMITED` saat login | 5 kali gagal dalam periode singkat → kunci 15 menit. | Tunggu hingga `lockedUntil` lewat. Periksa sheet `USERS`; jangan melakukan brute force. |
| `Service invoked too many times` | Polling terlalu cepat / terlalu banyak klien. | Pakai `pollIntervalMs` 20000 (15–30 detik). Kurangi jumlah klien saat pengujian. |
| Mutasi ditolak di jaringan kantor | Proxy memblokir doGet untuk request dengan perubahan data. | Kontrak memakai doGet + token + LockService + idempotency. Fallback doPost `text/plain` dengan envelope sama **tidak diaktifkan default** dan perlu diimplementasikan/diuji bila diperlukan. |

## Checklist pasca-instalasi

- [ ] Spreadsheet hanya bisa diakses owner; `SPREADSHEET_ID` benar.
- [ ] 15 file `.gs` terpasang dengan urutan benar; tidak ada duplikasi fungsi.
- [ ] Script Properties terisi; tidak ada password produksi tertulis di dokumen.
- [ ] `setupDatabase()` selesai tanpa error; 19 sheet + `SESSIONS` ada.
- [ ] `seedInitialData()` / `setup.seed` dijalankan sekali; `seedDone = true`.
- [ ] `setup.validate` mengembalikan `valid: true`.
- [ ] `dutyOpenMinutes` sudah sesuai kebijakan sekolah (default `360` = 06:00; ubah lewat `settings.save` bila perlu).
- [ ] Web App: **Execute as Me**, **Anyone**, URL `/exec` tersalin.
- [ ] `VITE_GAS_EXEC_URL` terisi di Netlify dan frontend di-deploy ulang.
- [ ] `ping` mengembalikan `pong: true`.
- [ ] Login berhasil untuk peran yang diuji; token ada di sessionStorage.
- [ ] `docs/TESTING_CHECKLIST.md` diisi hasilnya sebelum dinyatakan siap pakai.
