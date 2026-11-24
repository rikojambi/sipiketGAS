# SIPIKET — Checklist Pengujian (FASE 5)

Dokumen ini adalah **rencana pengujian**, bukan bukti pengujian. Seluruh baris berstatus `Belum` saat dibuat. Isi kolom **Hasil** dan **Catatan/Bukti** setelah pengujian dijalankan di lingkungan nyata.

Legenda hasil:

| Singkatan | Arti |
|---|---|
| `L` | Lulus — ekspektasi terpenuhi |
| `G` | Gagal — ada temuan; isi detail di Catatan/Bukti |
| `Belum` | Belum diuji |

Rujukan: `docs/API_DOCUMENTATION.md` v1.0.0, `docs/DATABASE_SCHEMA.md`, `docs/SETTINGS.md`, `docs/IMPLEMENTATION_NOTES.md`.

---

## 0. Lingkungan pengujian

Isi sebelum mulai:

| Item | Nilai / catatan |
|---|---|
| URL frontend | `<URL_NETLIFY>` |
| URL Web App | `https://script.google.com/macros/s/<DEPLOYMENT_ID>/exec` |
| Spreadsheet ID | `<SPREADSHEET_ID>` |
| Browser & versi | Contoh: Chrome 1xx di Windows; Safari di iOS |
| Perangkat | Laptop + minimal 2 HP (simulasi dua scanner) |
| Akun uji | `<USERNAME_SUPERADMIN>`, `<USERNAME_KEPALASEKOLAH>`, `<USERNAME_GURUPIKET>`, `<USERNAME_GURUMAPEL>`, `<USERNAME_WALIKELAS>` (password placeholder) |
| Tanggal & jam server | Catat dari respons `ping` / `me` (Asia/Jakarta) |
| Penguji & tanggal | `<NAMA_PENGUJI>`, `<TANGGAL>` |
| Cadangan sebelum uji | `fileId` backup: `<FILE_ID>` |

> Gunakan password placeholder di dokumen ini. Jangan menulis password asli ke sini.

---

## 0b. Bukti pengujian otomatis (mock, bukan lingkungan nyata)

Bagian ini **bukan** pengganti pengujian A–J di Apps Script/Netlify/perangkat nyata. Semua baris di bawah memakai `scripts/mock-gas-server.js` atau `tests/helpers/gas-runtime.js` di mesin lokal.

| Bukti | Cara menjalankan | Hasil |
|---|---|---|
| 27 tes otomatis | `npm test` | Lolos 27/27 (backend unit + integrasi, util frontend, aset/PWA, dokumentasi) |
| Build produksi | `npm run build` | Berhasil, 256 modul, tanpa error |
| Smoke browser | `set VITE_GAS_EXEC_URL=http://localhost:4178/gas&& npm run dev:mock` | Login `admin` dan `piket` berhasil; dashboard, scanner, dan daftar siswa tampil; console tanpa error setelah perbaikan `emptyState` |
| Guard peran | Smoke browser 28 rute sebagai `GURU_PIKET` | Rute tanpa izin menampilkan 403; tidak ada halaman kosong |
| Antrean offline | Simulasi `navigator.onLine = false` lalu scan manual | Status **MENUNGGU SINKRONISASI**, badge antrean `1`, tanpa console error |
| Konflik saat sinkron | Kembalikan `onLine = true` lalu sinkron (waktu server nyata di luar jam) | Backend menolak karena sesi absensi sudah ditutup; antrean berstatus `FAILED` dengan tombol **Ulangi**, tidak ada duplikat |
| Sinkron sukses | Ulangi dengan `MOCK_NOW=2026-11-24T00:10:00Z` (07:10 WIB) | Antrean `PENDING` terkirim dan hilang dari IndexedDB; `reports.get` menunjukkan 1 baris `ATTENDANCE` `MORNING`/`HADIR` |
| Service worker | Inspeksi browser | Registrasi aktif pada origin mock; tes aset memastikan `sw.js` tidak meng-cache endpoint GAS |
| Manifest & ikon | Tes `assets.test.js` + HTTP mock | `manifest.webmanifest` valid, ikon 192/512/maskable/apple-touch tersedia |

Cakupan tes backend integrasi (lihat `tests/backend-integration.test.js`):

| Skenario | Bukti otomatis |
|---|---|
| Setup + seed + validasi 19 sheet + `SESSIONS` | `integrasi setup + login lima peran + validasi database` |
| Login lima peran, `me` tanpa hash/salt, `settings.public.dutyOpenMinutes` | `integrasi setup + login lima peran + validasi database` |
| Scan pagi, duplikat, `alreadyRecorded`, sesi siang terpisah, laporan | `integrasi absensi apel pagi: idempotensi dan duplikat scan` |
| Terlambat otomatis + konsekuensi | `integrasi keterlambatan otomatis dan konsekuensi` |
| Keluar ganda dicegah + kembali dengan durasi | `integrasi izin keluar dan kembali mencatat durasi` |
| Izin sakit disetujui wali kelas → status `SAKIT` | `integrasi izin sakit disetujui wali kelas memengaruhi status absensi` |
| `FORBIDDEN` peran, pesan jadwal piket persis | `integrasi pembatasan peran dan jadwal piket` |
| Callback JSONP berbahaya tidak direfleksikan | `callback JSONP berbahaya ditolak tanpa refleksi` |

**Belum terverifikasi otomatis:** kamera/barcode fisik, PWA install prompt di HP, deploy Apps Script/Netlify, backup/restore Drive, dan seluruh skenario yang memerlukan perangkat/jaringan sekolah. Jalur konflik dan jalur sukses antrean sudah diuji di mock dengan dua konfigurasi waktu yang berbeda.

---

## A. 15 kondisi validasi wajib

| No | Skenario | Langkah singkat | Ekspektasi | Hasil | Catatan/Bukti |
|---:|---|---|---|---|---|
| 1 | Envelope respons | Panggil `ping`, `me` sukses, dan satu aksi error | Ada `ok`, `data`/`null`, `error`, `requestId`, `serverTime`, `version: "1.0.0"`; kode error sesuai daftar standar | Belum | |
| 2 | Username unik | Buat user, lalu buat lagi dengan huruf besar/kecil berbeda | Kedua gagal dengan `CONFLICT`; tidak ada dua baris `USERS` | Belum | |
| 3 | Password & rate limit | Cek sheet `USERS`; login salah 5 kali | Tidak ada plaintext; ada `salt` + `passwordHash`; ke-5 `RATE_LIMITED`, kunci 15 menit | Belum | |
| 4 | Session token | Login, cek Storage, logout, lalu panggil `me` | Token hanya di `sessionStorage`; setelah logout `UNAUTHORIZED`; expired token ditolak | Belum | |
| 5 | Role dari server | Login sebagai guru, kirim payload dengan `role: SUPERADMIN` | Role tetap sesuai `USERS`; aksi superadmin ditolak `FORBIDDEN` | Belum | |
| 6 | Hak guru piket | Login piket tanpa jadwal lalu dengan jadwal `MAIN` aktif | Tanpa jadwal: `FORBIDDEN` + pesan persis **"Anda tidak memiliki jadwal piket pada hari ini."**; dengan jadwal: diizinkan | Belum | |
| 7 | Hak wali kelas | `students.list` dan `students.get` untuk kelas lain | Hanya kelas sendiri yang tampil / akses lain ditolak | Belum | |
| 8 | Hak kepala sekolah | Coba `users.create`, lalu lakukan `attendance.correct` dengan alasan | `users.create` ditolak; koreksi berhasil dan muncul di `audit.list` | Belum | |
| 9 | Jam apel & batas terlambat | Scan tepat sebelum/sesudah `bellMorningMinutes + lateLimitMinutes` | Status `HADIR`/`TERLAMBAT` sesuai **jam server** Asia/Jakarta, bukan jam HP | Belum | |
| 10 | Idempotency scan | Scan barcode yang sama dua kali pada sesi sama | `alreadyRecorded: true`, data lama dikembalikan, hanya satu baris `ATTENDANCE` | Belum | |
| 11 | Dua sesi & jam tutup | Scan `MORNING`, lalu `AFTERNOON`; coba scan setelah jam tutup | Kedua sesi tercatat terpisah; scan setelah tutup `CONFLICT` | Belum | |
| 12 | Izin aktif | Setujui izin `SICK`, lalu scan siswa tersebut | Status mengikuti `SAKIT`/`IZIN` + warning; izin `PENDING` belum mengubah status | Belum | |
| 13 | Movement | Keluar dua kali, kembali tanpa `OPEN`, pulang awal lalu scan lagi | Keluar ganda dicegah; return tanpa `OPEN` → `CONFLICT`; setelah pulang awal scan → `CONFLICT` | Belum | |
| 14 | Hari libur | Buat holiday aktif, lalu scan sebagai piket dan sebagai superadmin | Piket `CONFLICT`; superadmin masih bisa (sesuai kontrak) | Belum | |
| 15 | Offline & sync | Matikan jaringan, scan, nyalakan lagi, tekan sinkron | Status `MENUNGGU SINKRONISASI` → `Tersinkronisasi` setelah `ok:true`; konflik → `GAGAL – butuh tindakan`; retry tidak duplikat | Belum | |

---

## B. Login dan hak per peran

| No | Skenario | Langkah singkat | Ekspektasi | Hasil | Catatan/Bukti |
|---:|---|---|---|---|---|
| B1 | Login SUPERADMIN | Login + buka `me` | Dashboard admin; aksi setup/backup tersedia | Belum | |
| B2 | Login KEPALA_SEKOLAH | Login + buka dashboard/laporan | Statistik & laporan tampil; tidak ada tombol create transaksi | Belum | |
| B3 | Login GURU_PIKET | Login + buka `me` | `dutyToday` sesuai jadwal; `notificationsUnread` terbaca | Belum | |
| B4 | Login GURU_MAPEL | Login + buka `me` | Dashboard personal; notifikasi & tugas tampil | Belum | |
| B5 | Login WALI_KELAS | Login + buka `me` | `classId` terisi; daftar siswa terfilter kelasnya | Belum | |
| B6 | Kunci akun | 5x login gagal, tunggu 15 menit | `RATE_LIMITED`, lalu login normal setelah masa kunci | Belum | |
| B7 | Session lintas tab | Login di tab A, buka tab B | Tab B belum login (sessionStorage tidak dibagi) | Belum | |

---

## C. Jadwal piket dan jam buka (`dutyOpenMinutes`)

| No | Skenario | Langkah singkat | Ekspektasi | Hasil | Catatan/Bukti |
|---:|---|---|---|---|---|
| C1 | Jadwal `MAIN` | `duty.save` untuk tanggal uji, login piket | Aksi operasional diizinkan setelah jam buka | Belum | |
| C2 | Jadwal `BACKUP` nonaktif | Simpan BACKUP `active:false`, login guru cadangan | Ditolak dengan pesan jadwal | Belum | |
| C3 | Aktivasi `BACKUP` | Aktifkan mode cadangan, login guru cadangan | Aksi piket diizinkan | Belum | |
| C4 | Sebelum jam buka | Set `dutyOpenMinutes` ke jam di depan waktu server; buka menu piket | `FORBIDDEN` + pesan persis **"Menu piket belum dibuka pada waktu ini."** | Belum | |
| C5 | Sesudah jam buka | Set `dutyOpenMinutes` ke jam di belakang waktu server; ulangi | Menu piket dapat dipakai (jadwal tetap wajib) | Belum | |
| C6 | Jam buka vs jadwal | Uji kombinasi: sebelum jam buka + tanpa jadwal | Pesan yang muncul sesuai prioritas implementasi; catat hasilnya | Belum | |
| C7 | Jam perangkat diubah | Ubah jam HP ke sebelum/sesudah jam buka | Tidak berpengaruh; server yang menentukan | Belum | |
| C8 | Kembalikan setting | `settings.save` → `dutyOpenMinutes: 360` | Kembali ke default 06:00; nilai terbaca di `settings.list` | Belum | |

---

## D. Scan absensi dan dua sesi

| No | Skenario | Langkah singkat | Ekspektasi | Hasil | Catatan/Bukti |
|---:|---|---|---|---|---|
| D1 | Scan pagi `HADIR` | Scan barcode sebelum batas terlambat | Status `HADIR`, nama/kelas sesuai | Belum | |
| D2 | Scan pagi `TERLAMBAT` | Scan setelah batas | Status `TERLAMBAT`; `late.record` tercatat | Belum | |
| D3 | Scan manual | Barcode rusak → input nama/kelas | `attendance.manual` berhasil dengan `studentId` | Belum | |
| D4 | Barcode tidak dikenal | Scan token acak | `NOT_FOUND` / pesan jelas, tidak ada baris absensi | Belum | |
| D5 | Scan siang | Scan `AFTERNOON` untuk siswa sama | Tercatat terpisah dari `MORNING` | Belum | |
| D6 | Scan ulang | Ulangi scan pada sesi sama | `alreadyRecorded: true`, bukan duplikat | Belum | |
| D7 | Sesi ditutup | Scan setelah `attendance*CloseMinutes` | `CONFLICT` | Belum | |
| D8 | Siswa sudah pulang | Scan setelah `earlyLeave` | `CONFLICT` | Belum | |
| D9 | Dua scanner | Dua HP scan siswa berbeda bersamaan | Keduanya tersimpan; tidak ada yang hilang | Belum | |

---

## E. Izin, pergerakan, dan konsekuensi

| No | Skenario | Langkah singkat | Ekspektasi | Hasil | Catatan/Bukti |
|---:|---|---|---|---|---|
| E1 | Buat izin | Guru mapel buat `LEAVE` dengan `approve:false` | Status `PENDING`, notifikasi ke wali kelas | Belum | |
| E2 | Setujui izin | Wali kelas `permits.approve: APPROVED` | Status berubah; audit tercatat; scan berikutnya mengikuti izin | Belum | |
| E3 | Tolak / minta klarifikasi | `REJECTED`, `NEED_CLARIFICATION` | Status & notifikasi sesuai; alasan/catatan tersimpan | Belum | |
| E4 | Persetujuan tanpa hak | Guru mapel memanggil `permits.approve` | Ditolak `FORBIDDEN` | Belum | |
| E5 | Keluar siswa | `movement.out` dengan tujuan & pemberi izin | Movement `OPEN`; pencegahan keluar ganda berfungsi | Belum | |
| E6 | Kembali siswa | `movement.return` via barcode | Movement ditutup; `durationMinutes` terisi | Belum | |
| E7 | Return tanpa OPEN | Return untuk siswa di kelas | `CONFLICT` | Belum | |
| E8 | Pulang awal | `movement.earlyLeave` | Permit `EARLY_LEAVE` tercatat; scan berikutnya ditolak | Belum | |
| E9 | Konsekuensi | Buat `consequence.create` dari keterlambatan | Kategori sesuai `consequenceCategories`; status bisa diperbarui | Belum | |

---

## F. Monitoring KBM dan pengganti

| No | Skenario | Langkah singkat | Ekspektasi | Hasil | Catatan/Bukti |
|---:|---|---|---|---|---|
| F1 | Daftar monitoring | Buka `monitoring.list` | Jadwal + hasil monitoring + penugasan tampil | Belum | |
| F2 | Status kelas kosong | Simpan `KELAS_KOSONG` + catatan | Tersimpan; status verifikasi terlihat | Belum | |
| F3 | Verifikasi | Ubah ke `VERIFIED` | Perubahan tercatat; tidak ada simpulan otomatis tanpa verifikasi | Belum | |
| F4 | Penugasan pengganti | `substitute.assign` dengan `taskType` | Guru yang dituju melihat notifikasi/tugas | Belum | |
| F5 | Status penugasan | Update `PENDING → ONGOING → DONE` | Status berubah; `NEED_FOLLOWUP` tersedia | Belum | |
| F6 | Ringkasan | `monitoring.summary` | Angka kelas kosong/substitusi/KBM sesuai data | Belum | |

---

## G. Offline, PWA, dan perangkat

| No | Skenario | Langkah singkat | Ekspektasi | Hasil | Catatan/Bukti |
|---:|---|---|---|---|---|
| G1 | Antrean offline | Matikan jaringan, lakukan scan & izin | Status `MENUNGGU SINKRONISASI`, bukan "berhasil" | Belum | |
| G2 | Sinkron otomatis | Nyalakan jaringan, tunggu polling | Antrean terkirim; status berubah setelah `ok:true` | Belum | |
| G3 | Sinkron manual | Tekan tombol sinkron | Antrean segera diproses | Belum | |
| G4 | Konflik saat sinkron | Tutup sesi saat transaksi offline, lalu sinkron | `GAGAL – butuh tindakan`; ada tombol ulang/hapus | Belum | |
| G5 | Retry ganda | Tekan ulang setelah sukses | Tidak ada duplikat berkat `idempotencyKey` | Belum | |
| G6 | Token hilang saat offline | Tutup tab saat offline, buka lagi | Perlu login; antrean IndexedDB masih ada | Belum | |
| G7 | Manifest | Cek `/manifest.webmanifest` | `Content-Type: application/manifest+json`, ikon 192/512/maskable ada | Belum | |
| G8 | Service worker | Install PWA, lalu deploy ulang | Aset terbaru tampil; `sw.js` tidak di-cache lama | Belum | |
| G9 | Shortcut PWA | Pakai shortcut "Scan Pagi" | Rute `/#/scan/MORNING` membuka halaman yang benar | Belum | |
| G10 | Kamera | Scan di HP Android & iOS | Kamera izin & pembacaan barcode berfungsi | Belum | |

---

## H. Administrasi, data, dan laporan

| No | Skenario | Langkah singkat | Ekspektasi | Hasil | Catatan/Bukti |
|---:|---|---|---|---|---|
| H1 | Setup | Jalankan `setupDatabase()` + `validateDatabase()` di editor | 19 sheet + `SESSIONS`; `valid:true` | Belum | |
| H2 | Seed sekali | Jalankan `seedInitialData()` dua kali | Data contoh tidak dobel; `seedDone:true`; password tidak ditampilkan lagi | Belum | |
| H3 | Superadmin hasil seed | Login `admin`, `users.setPassword`, hapus `SETUP_ADMIN_TOKEN`/`SEED_*` | Akun SUPERADMIN ada; password seed tidak tersisa di Script Properties | Belum | |
| H4 | Settings | `settings.save` untuk jam apel, batas terlambat, `dutyOpenMinutes` | Nilai terbaca di `settings.list`; efek sesuai pengujian C/D | Belum | |
| H5 | Import guru | CSV guru ≤200 baris | Data masuk; duplikat nip terdeteksi | Belum | |
| H6 | Import kelas | CSV kelas dengan ID guru valid | Relasi `homeroomTeacherId` benar | Belum | |
| H7 | Import siswa | CSV siswa per chunk 200 baris | `classId` valid; barcode tidak diisi dari NISN | Belum | |
| H8 | Import jadwal | CSV jadwal dengan `MON`–`FRI` | Jadwal tampil di monitoring & piket | Belum | |
| H9 | Barcode | `students.regenerateBarcode`, lookup token lama & baru | Token baru unik; token lama tidak berlaku; NISN bukan token | Belum | |
| H10 | Backup | `backup.create` dengan alasan | File muncul di folder `SIPIKET_BACKUPS`; `fileId` tercatat | Belum | |
| H11 | Restore (uji) | `backup.restore` dengan `confirmPhrase: "RESTORE"` di lingkungan uji | Konfirmasi 2 langkah; data kembali; audit tercatat | Belum | |
| H12 | Laporan | `reports.get` untuk tiap `type` dengan filter tanggal/kelas | Kolom/baris sesuai filter; CSV dapat diekspor | Belum | |
| H13 | Notifikasi | Buat izin → cek notifikasi per role → tandai dibaca | Hanya penerima yang relevan; status `read` berubah | Belum | |
| H14 | Audit | Cek `audit.list` setelah koreksi/approval/restore | `actorId`, `reason`, `beforeJson`, `afterJson`, `requestId` terisi | Belum | |
| H15 | Hari libur | Tambah/hapus holiday | Transaksi ditolak saat aktif; kembali normal setelah dihapus | Belum | |

---

## I. Batas teknis dan performa

| No | Skenario | Langkah singkat | Ekspektasi | Hasil | Catatan/Bukti |
|---:|---|---|---|---|---|
| I1 | Panjang payload | Import 200 baris dengan field panjang | Request masih berhasil; lebih dari itu gagal/perlu chunk | Belum | |
| I2 | Eksekusi panjang | Import besar & backup dengan banyak data | Selesai di bawah batas 6 menit atau terpecah aman | Belum | |
| I3 | Konkurensi | Dua perangkat tulis siswa/keterlambatan sama | LockService mencegah duplikat/timpaan | Belum | |
| I4 | Polling | Jalankan 10–20 klien dengan `pollIntervalMs` 20000 | Tidak ada `RATE_LIMITED`/quota error | Belum | |
| I5 | Cache dingin | Clear cache/ restart script, lalu scan | Indeks logik terbangun; tidak ada duplikat | Belum | |
| I6 | Akses publik | Panggil aksi tanpa token dari konsol | Semua kecuali `ping`/`login` ditolak | Belum | |

---

## J. Deployment dan jaringan

| No | Skenario | Langkah singkat | Ekspektasi | Hasil | Catatan/Bukti |
|---:|---|---|---|---|---|
| J1 | `ping` | Jalankan snippet JSONP dari INSTALLATION.md | `pong:true`, `spreadsheetReady:true`, `version:"1.0.0"` | Belum | |
| J2 | URL `/exec` | Cek URL yang dipakai frontend | Bukan `/dev`; stabil setelah deploy versi baru | Belum | |
| J3 | CORS | Amati Network/Console saat aksi | Tidak ada error CORS; response `application/javascript` | Belum | |
| J4 | Callback | Cek nama callback tiap request | Unik, didefinisikan sebelum script, dibersihkan setelahnya | Belum | |
| J5 | Netlify redirect | Refresh halaman dalam (deep link) | `/* → /index.html` status 200; tidak 404 | Belum | |
| J6 | Env var | Ubah `VITE_GAS_EXEC_URL`, build ulang | Nilai baru tertanam di bundle | Belum | |
| J7 | Proxy kantor | Uji dari jaringan sekolah | JSONP tidak diblokir; bila diblokir, catat untuk fallback doPost | Belum | |
| J8 | Izin Drive | Cek owner Web App & folder backup | Spreadsheet & `SIPIKET_BACKUPS` dapat diakses owner | Belum | |

---

## K. Template catatan temuan

Salin per temuan:

```text
ID temuan      : BUG-001
Tanggal        : <TANGGAL>
Penguji        : <NAMA>
Lingkungan     : <browser/perangkat/URL>
Skenario       : <nomor pada checklist ini>
Langkah ulang  : <1. ... 2. ...>
Ekspektasi     : <...>
Aktual         : <...>
Error code     : <BAD_REQUEST / FORBIDDEN / ...>
Bukti          : <path screenshot / potongan log / requestId>
Dampak         : <Rendah / Sedang / Tinggi>
```

---

## L. Ringkasan hasil akhir

| Bagian | Total skenario | Lulus | Gagal | Belum |
|---|---:|---:|---:|---:|
| 0b. Otomatis (mock GAS + browser) | 8 kelompok bukti | 8 | 0 | 0 |
| A. Validasi wajib (lingkungan nyata) | 15 | 0 | 0 | 15 |
| B–J. Pengujian lanjutan (lingkungan nyata) | isi setelah uji | | | |

> Bukti otomatis tercatat di bagian `0b` dan di log `npm test` / `npm run build`. **Belum ada hasil pengujian lingkungan nyata** yang dicatat. Jangan mengubah ringkasan A–J menjadi "lulus" tanpa bukti pada kolom Catatan/Bukti. Hasil mock tidak boleh diklaim sebagai hasil pengujian produksi.
