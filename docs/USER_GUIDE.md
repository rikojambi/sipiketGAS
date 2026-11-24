# SIPIKET — Panduan Pengguna

Panduan ini untuk pengguna harian: **Guru Piket**, **Guru Mapel**, **Wali Kelas**, dan **Kepala Sekolah**. Panduan superadmin ada di `docs/ADMIN_GUIDE.md`.

Semua status final (hadir, terlambat, izin, dll.) dihitung oleh server dengan timezone `Asia/Jakarta`. Perangkat boleh offline, tetapi status "berhasil" hanya muncul setelah server membalas `ok: true`.

---

## 0. Hal umum

### Login

1. Buka alamat aplikasi SIPIKET (site Netlify), bukan alamat Apps Script.
2. Masukkan username dan password yang diberikan operator.
3. Setelah login, beranda menampilkan dashboard sesuai peran, notifikasi, dan pengaturan sekolah (`settings.public`).

Token login tersimpan di **sessionStorage**:

- hilang saat tab ditutup,
- tidak dibagi ke tab/browser lain,
- berlaku sekitar 8 jam (dapat diubah administrator lewat `SESSION_TTL_MS`).

Gunakan tombol **Logout** di akhir pemakaian, terutama di perangkat bersama.

### Dua sesi absensi

SIPIKET mengenal dua sesi:

| Sesi | Waktu default (server) | Kegunaan |
|---|---|---|
| `MORNING` | Apel 07:00, ditutup 08:30 | Scan apel pagi |
| `AFTERNOON` | Apel 13:00, ditutup 14:30 | Scan apel siang |

Keduanya **tidak saling menimpa**: satu siswa memiliki satu catatan per `(tanggal, sesi, studentId)`. Scan ulang pada sesi sama tidak membuat baris baru; respons menampilkan `alreadyRecorded: true` beserta data lama.

### Istilah status yang sering muncul

| Istilah | Arti |
|---|---|
| `HADIR` / `TERLAMBAT` | Hasil scan dibandingkan jam apel + batas keterlambatan. |
| `IZIN` / `SAKIT` | Scan mengikuti izin aktif; muncul warning pada respons. |
| `TANPA_KETERANGAN` / `BELUM_HADIR` | Belum ada keterangan / belum ter-scan. |
| `OPEN` (movement) | Siswa masih di luar kelas, belum kembali. |
| `PENDING` (izin) | Menunggu keputusan wali kelas / piket. |
| `APPROVED` / `REJECTED` / `NEED_CLARIFICATION` | Keputusan izin. |
| `UNVERIFIED` / `VERIFIED` | Status verifikasi monitoring KBM. Jangan menyimpulkan "guru tidak hadir" sebelum `VERIFIED`. |
| `MENUNGGU SINKRONISASI` | Transaksi tersimpan lokal, **belum** sampai ke server. |

---

## 1. Guru Piket

### 1.1 Syarat bertugas

Aksi operasional piket hanya berhasil bila tanggal server (`Asia/Jakarta`) tercantum di `DUTY_SCHEDULES` untuk akun Anda (sebagai `MAIN` atau `BACKUP` yang aktif).

Jika tidak, muncul pesan persis:

> Anda tidak memiliki jadwal piket pada hari ini.

Hubungi administrator untuk menambah/aktivasi jadwal. Dashboard personal tetap bisa dibuka.

Selain jadwal, backend juga memeriksa **jam buka menu piket** (`dutyOpenMinutes`, default 06:00 waktu server `Asia/Jakarta`). Sebelum jam itu, meskipun jadwal sudah ada, muncul pesan:

> Menu piket belum dibuka pada waktu ini.

Jam buka diatur oleh superadmin sesuai kebijakan sekolah; detail ada di `docs/SETTINGS.md`. Mengubah jam di perangkat tidak memengaruhi pemeriksaan ini.

### 1.2 Scan apel pagi / siang

1. Buka menu **Scan** → pilih **Apel Pagi** (`MORNING`) atau **Apel Siang** (`AFTERNOON`).
2. Arahkan kamera ke barcode siswa (atau gunakan input manual nama/kelas bila barcode rusak).
3. Setelah terbaca, tunggu konfirmasi dari server. Perhatikan nama dan kelas siswa sebelum melanjutkan.
4. Perhatikan status yang dikembalikan:
   - `HADIR` — tepat waktu.
   - `TERLAMBAT` — otomatis memicu pencatatan keterlambatan; lanjutkan ke bagian 1.5.
   - `IZIN`/`SAKIT` — ada izin aktif; periksa warning.
   - `CONFLICT` — sesi sudah ditutup, siswa sudah pulang awal, atau hari libur.

Hal yang perlu diingat:

- Duplikat scan pada sesi yang sama **bukan error**, tetapi menampilkan data lama (`alreadyRecorded: true`).
- Scan siang tidak mengubah catatan pagi.
- Jangan mengklaim "berhasil" bila status masih `MENUNGGU SINKRONISASI`.

### 1.3 Izin keluar dan kembali

**Keluar (`movement.out`)**

1. Catat siswa yang akan keluar (scan barcode atau pilih nama).
2. Isi keperluan, pemberi izin (`grantedBy`), serta perkiraan waktu kembali bila ada.
3. Kirim. Server menolak keluar ganda bila masih ada movement `OPEN`.

**Kembali (`movement.return`)**

1. Scan barcode siswa yang kembali (atau pilih nama).
2. Sistem menutup movement `OPEN` terakhir dan menghitung lama di luar (`durationMinutes`).
3. Jika tidak ada movement `OPEN`, muncul `CONFLICT` — cek apakah data sudah ditutup orang lain.

### 1.4 Pulang awal

1. Gunakan menu **Pulang Awal** (`movement.earlyLeave`).
2. Isi alasan dan pemberi izin.
3. Setelah tercatat, siswa **tidak boleh di-scan kembali** pada sesi tersebut; server mengembalikan `CONFLICT`.
4. Pastikan izin pulang awal tercatat (`EARLY_LEAVE`) agar wali kelas bisa melihatnya.

### 1.5 Keterlambatan dan konsekuensi

1. Saat scan menghasilkan `TERLAMBAT`, sistem dapat mencatat keterlambatan otomatis (`late.record`). Bila tidak otomatis, gunakan menu **Catat Keterlambatan** dan isi waktu tiba/catatan.
2. Buka daftar keterlambatan, pilih siswa, lalu buat konsekuensi (`consequence.create`):
   - pilih `category` dari daftar yang ditentukan administrator,
   - isi deskripsi dan catatan,
   - tentukan status awal sesuai alur sekolah.
3. Pantau konsekuensi yang belum selesai dan tandai selesai/verifikasi bila berwenang.

### 1.6 Monitoring kelas kosong / KBM

1. Buka **Monitoring Kelas** (`monitoring.list`); daftar menggabungkan jadwal, hasil monitoring, dan penugasan pengganti.
2. Klik jam pelajaran yang perlu dicek, lalu simpan status (`monitoring.save`), misalnya:
   - `KBM_BERJALAN`,
   - `GURU_BELUM_HADIR`,
   - `KELAS_KOSONG`,
   - `GURU_IZIN`, `GURU_SAKIT`, `GURU_TERLAMBAT`,
   - `DIGANTIKAN`, `TUGAS_MANDIRI`.
3. Isi catatan dan **verifikasi** bila Anda memang melihat langsung kondisi kelas (`verificationStatus = VERIFIED`).

> Status `UNVERIFIED` adalah observasi awal. Jangan melaporkan "guru tidak hadir" sebagai fakta sebelum diverifikasi.

### 1.7 Penugasan pengganti

1. Dari kelas yang bermasalah, pilih **Tugaskan Pengganti** (`substitute.assign`).
2. Isi `taskType`:
   - `GURU_PENGGANTI`,
   - `GURU_PIKET_LAIN`,
   - `TUGAS_MANDIRI`,
   - `TUGAS_GURU_MAPEL`,
   - `TUGAS_LITERASI_NUMERASI`,
   - `TUGAS_PROYEK`.
3. Tulis deskripsi tugas yang jelas, lalu kirim.
4. Pantau status penugasan: `PENDING` → `ONGOING` → `DONE` (atau `NEED_FOLLOWUP`).

---

## 2. Guru Mapel

### 2.1 Lapor sakit, izin, atau terlambat

1. Buka menu **Lapor Ketidakhadiran**.
2. Pilih jenis:
   - `SICK` — sakit,
   - `LEAVE` — izin,
   - `ABSENT` — tidak hadir dengan keterangan,
   - `EARLY_LEAVE` — pulang awal.
3. Isi tanggal, alasan (`reason`), detail (`detail`), dan bukti bila ada (`evidenceUrl`).
4. Kirim sebagai laporan (`permits.create` dengan `approve: false`). Status awal adalah menunggu keputusan wali kelas/piket.
5. Untuk keterlambatan, sampaikan juga ke guru piket agar tercatat di `LATE_RECORDS` bila diperlukan.

> Anda tidak dapat menyetujui izin sendiri. Persetujuan ada di wali kelas, guru piket bertugas, atau superadmin.

### 2.2 Melihat tugas dan notifikasi

- Buka **Notifikasi** untuk melihat izin yang disetujui, panggilan menggantikan kelas, atau hasil verifikasi.
- Buka **Tugas Saya** / penugasan pengganti (`substitute.list`) untuk melihat tugas yang ditujukan kepada Anda beserta statusnya.
- Tandai notifikasi sebagai dibaca setelah ditindaklanjuti (`notifications.read`).

---

## 3. Wali Kelas

### 3.1 Melihat kelas dan siswa

1. Buka **Kelas Saya**. Sistem otomatis membatasi data hanya pada `classId` yang terdaftar di akun Anda.
2. Lihat daftar siswa, status kehadiran, izin, dan keterlambatan kelas.
3. Bila ada siswa yang tampak tidak sesuai kelasnya, laporkan ke administrator (jangan mengubah `classId` sendiri bila tidak berwenang).

### 3.2 Mengonfirmasi izin siswa

1. Buka **Izin Menunggu** (`permits.list` dengan status `PENDING`).
2. Baca alasan, detail, dan bukti yang dilampirkan.
3. Pilih keputusan (`permits.approve`):
   - `APPROVED` — izin disetujui,
   - `REJECTED` — ditolak,
   - `NEED_CLARIFICATION` — minta keterangan tambahan.
4. Isi catatan keputusan. Keputusan tercatat di audit log.
5. Izin yang disetujui memengaruhi status absensi: scan siswa akan mengikuti `IZIN` atau `SAKIT` disertai warning.

### 3.3 Membuat dan mencetak barcode siswa

1. Buka detail siswa → **Barcode**.
2. Jika belum ada/perlu diganti, pilih **Regenerate** (`students.regenerateBarcode`). Token barcode baru dibuat server (UUID).
3. Cetak kartu barcode dari tampilan yang tersedia, atau salin token untuk keperluan pencetakan oleh sekolah.
4. Gunakan **tokenId** untuk lookup (`barcode.lookup`), **bukan NISN**.
5. Setelah regenerasi, barcode lama tidak berlaku. Beri tahu guru piket bila ada kartu lama yang masih beredar.

### 3.4 Rekap kelas

1. Buka **Rekap** (`reports.get`) dan pilih jenis laporan:
   - `attendance` — kehadiran,
   - `late` — keterlambatan,
   - `permits` — izin,
   - `movements` — pergerakan siswa,
   - `kbm` — monitoring kelas.
2. Isi rentang tanggal (`from`, `to`) dan `classId` kelas Anda.
3. Periksa tabel hasil; CSV dapat dibuat dari `columns` dan `rows` yang dikembalikan server (atau lewat `reports.export` bila tersedia).
4. Sebelum membagikan rekap, pastikan tidak ada transaksi berstatus `MENUNGGU SINKRONISASI` yang belum masuk server.

---

## 4. Kepala Sekolah

### 4.1 Dashboard

Buka **Dashboard** (`dashboard.get`). Tampilan memuat ringkasan seperti jumlah hadir, terlambat, izin, sakit, tidak hadir, siswa di luar kelas, belum kembali, pulang awal, kelas ter-monitoring, kelas kosong, dan persentase KBM.

Dashboard bersifat **read-only**. Bila Anda juga berperan sebagai guru piket, hak piket baru aktif saat ada jadwal bertugas.

### 4.2 Laporan

Gunakan menu **Laporan** (`reports.get`) dengan jenis:

`attendance`, `late`, `permits`, `movements`, `kbm`, `duty`, `audit`, `teacher_activity`.

Filter yang tersedia: `from`, `to`, `classId`, `studentId`, `teacherId`, `transactionType`, `format`. Respons berisi `columns`, `rows`, dan `meta` (filter + waktu generate). Ekspor CSV bisa dibuat frontend dari `columns`/`rows`, atau lewat `reports.export` bila diaktifkan.

Gunakan laporan untuk:

- rekap kehadiran harian/mingguan,
- tren keterlambatan,
- beban piket dan aktivitas guru,
- penelusuran koreksi lewat `audit`.

### 4.3 Koreksi ber-audit

Kepala Sekolah **tidak** create/update/delete transaksi langsung. Gunakan aksi koreksi:

1. Buka detail transaksi (misalnya absensi) → **Koreksi** (`attendance.correct`).
2. Isi `reason` (wajib) dan `patch` berisi field yang diubah.
3. Kirim. Server mencatat `AUDIT_LOG` berisi pelaku, sebelum/sesudah, alasan, dan `requestId`.
4. Verifikasi hasil koreksi di menu **Audit** (`audit.list`) dengan filter tanggal/actor/entity.

Prinsip: **setiap koreksi harus bisa dijelaskan**. Hindari koreksi massal tanpa alasan dan backup.

---

## 5. Alur offline dan arti "MENUNGGU SINKRONISASI"

SIPIKET tetap bisa dipakai saat jaringan putus, tetapi statusnya jujur:

```text
[Input transaksi saat offline]
        │
        ▼
[Simpan ke IndexedDB outbox] ──▶ UI: "MENUNGGU SINKRONISASI"
        │
        ├── online event / interval polling / tombol "Sinkronkan sekarang"
        ▼
[Kirim ke server dengan idempotencyKey]
        │
        ├── ok: true  ──▶ UI: "Tersinkronisasi"
        └── CONFLICT / error ──▶ UI: "GAGAL – butuh tindakan"
                                  (tombol ulang / hapus)
```

Aturan yang berlaku:

- **Jangan** menampilkan transaksi offline sebagai "berhasil". Status resminya `MENUNGGU SINKRONISASI` sampai server menjawab `ok: true`.
- Sinkronisasi terjadi saat koneksi kembali, lewat interval, atau tombol manual. SIPIKET **tidak** bergantung pada Background Sync browser.
- Setiap mutasi membawa `idempotencyKey` (UUID). Bila tombol ditekan dua kali atau retry setelah timeout, server mengembalikan hasil lama, bukan duplikat.
- Konflik umum: sesi sudah ditutup, jadwal piket berubah, izin sudah diproses orang lain, atau token expired. Status berubah menjadi `GAGAL – butuh tindakan`; baca pesan error sebelum menekan ulang.
- Setelah sinkron, muat ulang/melihat daftar untuk memastikan status final dari server (misalnya `TERLAMBAT` versus `HADIR`).
- Token disimpan di sessionStorage. Jika tab ditutup saat offline, login ulang diperlukan setelah jaringan kembali; antrean outbox tetap ada di IndexedDB browser.

### Tips koneksi

- Scan beberapa siswa secara berurutan saat sinyal buruk; sistem mengantre transaksi.
- Gunakan tombol **Sinkronkan sekarang** sebelum menutup perangkat.
- Bila antrean menumpuk, cek apakah server mengalami `RATE_LIMITED` atau `SERVICE_ERROR`; jangan menghapus antrean sebelum memahami penyebabnya.
- Untuk perangkat bersama, selalu logout agar session tidak tertinggal.

---

## 6. Jika ada masalah

| Gejala | Yang bisa dilakukan pengguna |
|---|---|
| Pesan jadwal piket | Hubungi administrator untuk mengaktifkan jadwal MAIN/BACKUP hari ini. |
| Scan ditolak `CONFLICT` | Cek apakah sesi sudah tutup, siswa sudah pulang, atau hari libur. |
| Barcode tidak terbaca | Gunakan input manual (nama/kelas) bila tersedia; minta wali kelas regenerate barcode. |
| Status tidak berubah setelah sinkron | Tunggu satu siklus polling (sekitar 20 detik) atau tekan **Sinkronkan sekarang**. |
| Tidak bisa login | Cek username/password, apakah akun sedang terkunci 15 menit, lalu hubungi administrator. |

Untuk pengujian formal dan pelaporan bug, lihat `docs/TESTING_CHECKLIST.md`.
