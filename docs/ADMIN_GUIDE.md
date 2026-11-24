# SIPIKET — Panduan Administrator / Superadmin

Panduan ini untuk **superadmin** dan operator yang ditunjuk. Semua aksi memakai kontrak `docs/API_DOCUMENTATION.md` v1.0.0; struktur data ada di `docs/DATABASE_SCHEMA.md`.

> Semua password di bawah adalah placeholder. Jangan pernah menuliskan password produksi di dokumen, chat, atau screenshot.

---

## 1. Prinsip kerja administrator

- Semua keputusan hak akses dihitung **server** dari token session → tabel `USERS`. Frontend tidak bisa "mengirim role" untuk menaikkan hak.
- `KEPALA_SEKOLAH` bersifat **read-only** untuk transaksi; koreksi wajib lewat aksi `*.correct` dan tercatat di `AUDIT_LOG`.
- `GURU_PIKET` hanya bisa transaksi operasional bila tanggal server (`Asia/Jakarta`) masuk `DUTY_SCHEDULES` aktif untuk akunnya.
- `WALI_KELAS` hanya melihat/mengubah siswa dengan `classId` yang sama dengan `users.classId`.
- Hari libur menolak transaksi absensi dengan `CONFLICT`, kecuali superadmin.
- Setiap perubahan penting sebaiknya didahului **backup**.

---

## 2. Mengamankan superadmin hasil seed

Akun SUPERADMIN pertama dibuat oleh `seedInitialData()`, bukan oleh fungsi `createFirstSuperadmin()` (fungsi tersebut tidak ada).

1. Siapkan Spreadsheet + Apps Script sesuai `INSTALLATION.md`. Pastikan Script Properties `SETUP_ADMIN_TOKEN` dan kelima `SEED_*` sudah diisi.
2. Di editor jalankan `setupDatabase()`, lalu `seedInitialData()`, lalu `validateDatabase()`.
3. Hasil `seedInitialData()` / `setup.seed` memuat field `passwords` untuk `admin`, `kepala`, `piket`, `mapel`, dan `wali`. **Simpan sekarang**; nilai ini tidak ditampilkan lagi oleh seed berikutnya.
4. Login di aplikasi sebagai `admin` memakai password seed tersebut.
5. Segera ganti password lewat `users.setPassword` ke password produksi yang disimpan aman (misalnya password manager sekolah).
6. Hapus/rotasi `SETUP_ADMIN_TOKEN` dan Script Property `SEED_*` setelah tidak lagi dipakai. Token bootstrap ini berlaku sebagai superadmin untuk seluruh aksi, jangan dibiarkan permanen atau ditaruh di browser.
7. Verifikasi lewat `users.list` bahwa akun `admin` ber-role `SUPERADMIN`. Untuk admin tambahan, gunakan `users.create` dari UI/API.

> `setup.seed` hanya berjalan sekali (`APP_CONFIG.seedDone`). Untuk mengulang, gunakan backup/restore atau reset database yang disengaja, bukan menghapus sheet manual.

---

## 3. Mengelola user dan role

Aksi yang tersedia: `users.list`, `users.create`, `users.update`, `users.setPassword`, `users.deactivate`.

### 3.1 Membuat user

Payload `users.create` (contoh):

```json
{
  "username": "guru.piket.1",
  "password": "<SANDI_USER>",
  "role": "GURU_PIKET",
  "fullName": "Nama Guru Piket",
  "email": "gurupiket@contoh.sch.id",
  "phone": "08xx-xxxx-xxxx",
  "teacherId": "<ID_GURU_DARI_SHEET_TEACHERS>",
  "classId": ""
}
```

- `username` unik (case-insensitive).
- `teacherId` wajib diisi untuk peran yang terkait guru agar `DUTY_SCHEDULES` dan jadwal mengajar cocok.
- `classId` wajib diisi untuk `WALI_KELAS`.
- Password di-hash di backend (`salt` + SHA-256). Jangan mengirim `passwordHash`/`salt` dari frontend; `users.update` menolak patch yang memuat keduanya.

### 3.2 Matriks hak akses

| Role | Yang boleh dilakukan |
|---|---|
| `SUPERADMIN` | Semua aksi, termasuk setup, seed, migrasi, backup/restore, transaksi hari libur. |
| `KEPALA_SEKOLAH` | `dashboard.get`, `reports.get`, `audit.list`, `notifications.*`, `*.correct` dengan alasan. Tidak create/update/delete transaksi biasa. |
| `GURU_PIKET` | `ATTENDANCE_*`, `MOVEMENT_*`, `LATE_*`, `CONSEQUENCE_*`, `MONITORING_*`, `SUBSTITUTE_*`, `permit.list`, `permits.approve` — **hanya saat bertugas**. |
| `GURU_MAPEL` | Melapor sakit/izin/terlambat (`permits.create`, pelaporan keterlambatan) dan melihat notifikasi/tugas yang terkait. |
| `WALI_KELAS` | Data siswa kelasnya, konfirmasi izin, barcode siswa, rekap kelas. |

### 3.3 Reset password & deaktivasi

- `users.setPassword` → ganti password tanpa mengubah identitas user.
- `users.deactivate` → menetapkan `active = false` + `reason`; akun tetap ada untuk audit, tidak bisa login.
- Hindari menghapus baris `USERS` langsung dari Spreadsheet; riwayat transaksi merujuk ke `id` user.

### 3.4 Kunci akun karena login gagal

5 kali gagal → akun dikunci 15 menit (`RATE_LIMITED`). Field `failedAttempts` dan `lockedUntil` ada di `USERS`. Operator dapat menunggu atau memperbaiki akun jika ada kesalahan konfigurasi; hindari percobaan login berulang saat menguji.

---

## 4. Setting sekolah, tahun ajaran, dan jam

Semua setting ada di sheet `SCHOOL_SETTINGS` dan diubah lewat `settings.save` dengan payload:

```json
{
  "values": {
    "schoolName": "SMK Negeri 1 Contoh",
    "npsn": "<NPSN>",
    "academicYear": "2026/2027",
    "semester": "Ganjil",
    "bellMorningMinutes": 420,
    "bellAfternoonMinutes": 780,
    "lateLimitMinutes": 15,
    "attendanceMorningCloseMinutes": 510,
    "attendanceAfternoonCloseMinutes": 870,
    "dutyOpenMinutes": 360,
    "schoolDays": "[\"MON\",\"TUE\",\"WED\",\"THU\",\"FRI\"]",
    "pollIntervalMs": 20000
  }
}
```

Nilai default penting (dari `DATABASE_SCHEMA.md`):

| Key | Default | Arti |
|---|---|---|
| `timezone` | `Asia/Jakarta` | Semua tanggal/jam dihitung server |
| `schoolStartMinutes` / `schoolEndMinutes` | `420` / `930` | 07:00 – 15:30 |
| `bellMorningMinutes` | `420` | Apel pagi 07:00 |
| `bellAfternoonMinutes` | `780` | Apel siang 13:00 |
| `lateLimitMinutes` | `15` | Batas terlambat 15 menit |
| `attendanceMorningCloseMinutes` | `510` | Scan pagi ditutup 08:30 |
| `attendanceAfternoonCloseMinutes` | `870` | Scan siang ditutup 14:30 |
| `dutyOpenMinutes` | `360` | Jam buka menu operasional guru piket (06:00), waktu server `Asia/Jakarta` |
| `schoolDays` | `["MON","TUE","WED","THU","FRI"]` | Hari sekolah |
| `sessionTtlMs` | `28800000` | Token 8 jam |
| `pollIntervalMs` | `20000` | Polling 20 detik |

Catatan operasional:

- `startMinutes`/`endMinutes` pada jadwal juga memakai **menit sejak 00:00** (contoh `420` = 07:00).
- `schoolDays`, `permitTypes`, dan `consequenceCategories` disimpan sebagai **string JSON** di kolom `settingValue`.
- `academicYear` dan `semester` dipakai saat menyaring `SCHEDULES`. Saat mengganti tahun ajaran, perbarui juga jadwal/kelas yang relevan.
- `dutyOpenMinutes` adalah **jam buka menu operasional guru piket** (menit sejak 00:00; default `360` = 06:00). Nilai dibandingkan dengan waktu server `Asia/Jakarta`, bukan jam perangkat. Superadmin dapat mengubahnya, misalnya:

  ```json
  { "values": { "dutyOpenMinutes": 345 } }
  ```

  Artinya 345 menit = 05:45. sesudah jam itu guru piket yang bertugas boleh memakai menu scan/izin/monitoring. Sebelum jam itu, backend menolak dengan `FORBIDDEN` dan pesan **"Menu piket belum dibuka pada waktu ini."** Pesan ini berbeda dengan **"Anda tidak memiliki jadwal piket pada hari ini."** yang berarti tidak ada jadwal bertugas. Rincian ada di `docs/SETTINGS.md`.
- Perubahan jam apel dan batas keterlambatan berpengaruh pada status yang dihitung server. Sebelum mengubah, lakukan pengujian di `TESTING_CHECKLIST.md` nomor 9–11.

---

## 5. Jenis izin dan kategori konsekuensi

### 5.1 Jenis izin

Key `permitTypes` default:

```json
["SICK", "LEAVE", "ABSENT", "EARLY_LEAVE"]
```

Arti: `SICK` (sakit), `LEAVE` (izin), `ABSENT` (tidak hadir dengan keterangan), `EARLY_LEAVE` (pulang awal). Nilai ini dipakai `permits.create` dan `attendance.scan` saat menentukan status `IZIN`/`SAKIT`.

### 5.2 Kategori konsekuensi

Key `consequenceCategories` berupa array objek `{code,label}`. Contoh:

```json
[
  { "code": "PEMBINAAN", "label": "Pembinaan dan pengarahan" },
  { "code": "PEMANGGILAN_ORANG_TUA", "label": "Pemanggilan orang tua" },
  { "code": "POIN", "label": "Poin keterlambatan" }
]
```

Guru piket memilih `category` dari daftar ini saat `consequence.create`. Bila kategori diubah, transaksi lama tetap menyimpan kode lama di `CONSEQUENCES.category`.

---

## 6. Hari libur dan hari khusus

Aksi: `holidays.list`, `holidays.create`, `holidays.delete`.

Contoh `holidays.create`:

```json
{
  "date": "2026-12-25",
  "holidayType": "NASIONAL",
  "label": "Hari Natal",
  "active": true
}
```

Efek:

- Tanggal yang terdaftar aktif menolak transaksi absensi dengan `CONFLICT` — kecuali superadmin.
- Jangan mengisi hari libur dengan format selain `YYYY-MM-DD`.
- Hari libur tidak otomatis mengubah `schoolDays`; keduanya adalah lapisan berbeda.

---

## 7. Jadwal piket & cadangan

Aksi: `duty.list`, `duty.save` (lihat juga `duty` di `reports.get`).

Contoh:

```json
{
  "date": "2026-11-24",
  "teacherId": "<ID_GURU>",
  "role": "MAIN",
  "active": true,
  "notes": "Piket apel pagi"
}
```

- `role`: `MAIN` atau `BACKUP`.
- `teacherId` mengacu ke `TEACHERS.id` (atau `USERS.teacherId`).
- `BACKUP` baru dianggap berlaku bila status aktif/aktivasi cadangan sesuai implementasi (`mode BACKUP_ACTIVATED` dalam kontrak).
- Jika guru piket membuka dashboard operasional tanpa jadwal, server mengembalikan `FORBIDDEN` dengan pesan persis: **"Anda tidak memiliki jadwal piket pada hari ini."** UI tetap bisa menampilkan dashboard personal lewat `dashboard.get` dengan `scope: 'personal'`.
- Tanggal dihitung dengan timezone server `Asia/Jakarta`, bukan jam perangkat guru.
- Selain jadwal, berlaku jam buka `dutyOpenMinutes` (default 06:00). Guru piket yang sudah punya jadwal tetap ditolak sebelum jam itu dengan pesan **"Menu piket belum dibuka pada waktu ini."** Atur lewat `settings.save` bila sekolah ingin membuka menu lebih awal/lambat.

**Alur penugasan cadangan yang disarankan:**

1. Buat jadwal `MAIN` untuk hari tersebut.
2. Tambah baris `BACKUP` untuk guru cadangan dengan `active: true`.
3. Saat guru utama berhalangan, aktifkan mode cadangan (atau nonaktifkan `MAIN` sesuai alur yang dipakai implementasi).
4. Verifikasi dengan login sebagai guru cadangan → aksi piket harus diizinkan.

---

## 8. Impor CSV guru, siswa, kelas, dan jadwal

### 8.1 Persiapan

1. **Backup dulu** (lihat bagian 9).
2. Siapkan file `.csv` ber-encoding **UTF-8**, baris pertama = header.
3. Maksimal **200 baris per panggilan** API; frontend memotong menjadi beberapa chunk.
4. Gunakan ID placeholder di contoh di bawah; ambil ID nyata dari sheet `TEACHERS`, `CLASSES`, `SUBJECTS`.
5. Validasi hasil impor lewat `students.list`, `teachers.list`, `classes.list`, `schedules.list`.

> Header contoh mengikuti `DATABASE_SCHEMA.md`. Jika UI impor menambahkan/melewati kolom tertentu, sesuaikan dengan validator yang dipakai; jangan mengira `barcodeToken` diisi dari NISN.

### 8.2 Contoh CSV guru (`TEACHERS`)

```csv
nip,name,email,phone,subject,active
198001012008011001,Budi Santoso,budi@contoh.sch.id,08xx-xxxx-xxxx,Matematika,true
198502032010012002,Siti Rahmawati,siti@contoh.sch.id,08xx-xxxx-xxxx,Bahasa Indonesia,true
```

### 8.3 Contoh CSV kelas (`CLASSES`)

```csv
name,grade,homeroomTeacherId,room,academicYear,active
X-1,10,<ID_GURU_001>,Ruang 101,2026/2027,true
XI-2,11,<ID_GURU_002>,Ruang 202,2026/2027,true
```

### 8.4 Contoh CSV siswa (`STUDENTS`)

```csv
nis,nisn,name,classId,gender,birthDate,parentName,parentPhone
2026001,<NISN_001>,Andi Pratama,<ID_KELAS_X1>,L,2010-05-12,<NAMA_ORANG_TUA>,08xx-xxxx-xxxx
2026002,<NISN_002>,Bina Sari,<ID_KELAS_X1>,P,2010-08-03,<NAMA_ORANG_TUA>,08xx-xxxx-xxxx
```

Catatan:

- `classId` wajib cocok dengan `CLASSES.id`, bukan sekadar nama kelas, kecuali UI impor menyediakan pemetaan nama → ID.
- `barcodeToken` **tidak** diimpor dari CSV; dibuat/regenerate lewat `students.regenerateBarcode`.

### 8.5 Contoh CSV jadwal (`SCHEDULES`)

```csv
day,classId,subjectId,teacherId,startMinutes,endMinutes,room,academicYear,semester,active
MON,<ID_KELAS_X1>,<ID_MAPEL_MTK>,<ID_GURU_001>,420,510,Ruang 101,2026/2027,Ganjil,true
MON,<ID_KELAS_X1>,<ID_MAPEL_BIN>,<ID_GURU_002>,510,600,Ruang 101,2026/2027,Ganjil,true
FRI,<ID_KELAS_X1>,<ID_MAPEL_MTK>,<ID_GURU_001>,600,690,Ruang 101,2026/2027,Ganjil,true
```

`day` memakai `MON`, `TUE`, `WED`, `THU`, `FRI` (atau sesuai `schoolDays`).

### 8.6 Alur impor yang aman

1. Backup database.
2. Uji 2–3 baris lebih dulu di lingkungan uji.
3. Jalankan impor per chunk; catat jumlah baris berhasil.
4. Cek duplikat `nis`/`nisn` dan `classId` yang salah.
5. Minta wali kelas mengonfirmasi daftar siswa di aplikasi.
6. Baru impor sisa data.

---

## 9. Backup & restore

Aksi: `backup.create`, `backup.list`, `backup.restore`.

### 9.1 Backup

Payload `backup.create`:

```json
{ "reason": "Sebelum impor siswa 2026/2027" }
```

Respons memuat `fileId`, `fileName`, `url` dari file hasil salinan spreadsheet di folder Drive **`SIPIKET_BACKUPS`** (milik owner script).

Simpan `fileId` dan `url` di catatan operasional. Pastikan akun owner Web App memiliki izin Drive untuk membuat/menulis file.

### 9.2 Restore

Payload `backup.restore`:

```json
{ "fileId": "<FILE_ID_BACKUP>", "confirmPhrase": "RESTORE" }
```

- `confirmPhrase` harus tepat `RESTORE`.
- UI wajib menampilkan **konfirmasi 2 langkah** sebelum memanggil aksi ini.
- Pahami dampak restore terhadap data terbaru sebelum menjalankannya. Untuk pertama kalinya, lakukan di lingkungan uji dengan backup lain sebagai pengaman.
- Catat siapa yang melakukan restore dan alasannya di `AUDIT_LOG`.

### 9.3 Otomatisasi (opsional)

Dimungkinkan menambahkan time-driven trigger di Apps Script yang memanggil `backup.create` berkala. Ini **perlu diuji** terhadap batas eksekusi 6 menit dan kuota harian Apps Script; lihat `IMPLEMENTATION_NOTES.md`.

---

## 10. Audit log

Aksi: `audit.list` dengan filter `from`, `to`, `actorId`, `entity`.

Field penting di `AUDIT_LOG`: `action`, `entity`, `entityId`, `actorId`, `actorName`, `beforeJson`, `afterJson`, `reason`, `requestId`, `ip`.

Kegunaan:

- Menelusuri koreksi absensi (`attendance.correct`) — alasan wajib diisi.
- Menelusuri keputusan izin (`permits.approve`) dan perubahan status.
- Menelusuri restore backup dan perubahan user.
- Membuktikan siapa melakukan apa, kapan, dan dari request mana (`requestId`).

Audit log tidak boleh dihapus atau disunting lewat UI. Bila ada baris yang tampak hilang, periksa apakah filter tanggal/actor terlalu sempit.

---

## 11. Rutin operasional yang disarankan

| Frekuensi | Tindakan |
|---|---|
| Harian | Cek jadwal piket hari itu (MAIN/BACKUP), hari libur, daftar izin menunggu konfirmasi, notifikasi belum dibaca. |
| Harian | Cek `dashboard.get` Kepala Sekolah untuk agregat hadir/terlambat/izin dan kelas kosong. |
| Mingguan | Cek keterlambatan & konsekuensi yang belum selesai; cek movement yang belum kembali. |
| Mingguan | Jalankan `setup.validate` bila ada perubahan struktur/setting besar. |
| Bulanan | Backup database; simpan `fileId`/URL di catatan sekolah. |
| Awal tahun ajaran | Perbarui `academicYear`, `semester`, kelas, guru, siswa, jadwal, hari libur; uji login tiap peran. |

---

## 12. Masalah umum admin

| Masalah | Penanganan |
|---|---|
| User baru tidak bisa login | Cek `active`, username (case-insensitive), apakah `users.create` sukses, dan apakah akun sedang `lockedUntil`. |
| Wali kelas tidak melihat siswa | Pastikan `users.classId` terisi dan sama dengan `students.classId`. |
| Guru piket ditolak saat transaksi | Cek `DUTY_SCHEDULES` untuk tanggal server `Asia/Jakarta`, peran `MAIN`/`BACKUP`, dan `active`. |
| Guru piket ditolak dengan pesan "Menu piket belum dibuka pada waktu ini." | Cek `dutyOpenMinutes` di `SCHOOL_SETTINGS` dan jam server `Asia/Jakarta`. Ubah lewat `settings.save` bila kebijakan sekolah berbeda. |
| Status terlambat tidak sesuai harapan | Cek `bell*Minutes`, `lateLimitMinutes`, dan jam server; frontend tidak menentukan status final. |
| Scan ditolak `CONFLICT` | Cek jam tutup sesi, hari libur, atau status siswa yang sudah pulang awal/sudah pulang. |
| Laporan kosong | Periksa filter `from`/`to`, `classId`, dan apakah data memakai tanggal `Asia/Jakarta`. |

Untuk daftar pengujian formal, isi `docs/TESTING_CHECKLIST.md`.
