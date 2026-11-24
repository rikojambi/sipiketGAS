# SIPIKET — Referensi Pengaturan (`SCHOOL_SETTINGS`)

Dokumen ini merangkum pengaturan sekolah yang disimpan di sheet `SCHOOL_SETTINGS` dan diubah oleh **superadmin** lewat aksi `settings.save`. Sumber nilai default: `docs/DATABASE_SCHEMA.md`. Kontrak aksi: `docs/API_DOCUMENTATION.md` v1.0.0.

Jangan tertukar dengan dua hal lain:

| Tempat | Isi | Diatur di |
|---|---|---|
| `SCHOOL_SETTINGS` (dokumen ini) | Nama sekolah, jam apel, batas keterlambatan, **jam buka menu piket**, dll. | Aplikasi / `settings.save` oleh superadmin |
| Script Properties Apps Script | `SPREADSHEET_ID`, `SESSION_TTL_MS`, password seed, kredensial superadmin pertama | Project Settings Apps Script; lihat `INSTALLATION.md` |
| Environment variable Netlify | `VITE_GAS_EXEC_URL` | Netlify; lihat `INSTALLATION.md` |

---

## 1. Cara mengubah pengaturan

Payload `settings.save`:

```json
{
  "values": {
    "schoolName": "SMK Negeri 1 Contoh",
    "dutyOpenMinutes": 360
  }
}
```

- Hanya **kunci yang termasuk whitelist** yang diterima server.
- Nilai dikirim sebagai string di kolom `settingValue`, kecuali implementasi melakukan konversi tipe; ikuti contoh di bawah.
- `settings.list` menampilkan seluruh key `SCHOOL_SETTINGS`.
- `settings.public` menampilkan subset yang boleh diketahui semua user yang login (lihat catatan di bagian 3).

---

## 2. Daftar key dan default

| Key | Default | Arti / catatan |
|---|---|---|
| `schoolName` | `SMK Negeri 1 Contoh` | Nama sekolah di header aplikasi |
| `npsn` | `""` | Nomor Pokok Sekolah Nasional |
| `logoUrl` | `""` | URL logo sekolah |
| `academicYear` | `2026/2027` | Tahun ajaran aktif; dipakai saat menyaring jadwal |
| `semester` | `Ganjil` | Semester aktif |
| `timezone` | `Asia/Jakarta` | Semua perhitungan tanggal/jam di server |
| `schoolStartMinutes` | `420` | Mulai sekolah 07:00 (menit sejak 00:00) |
| `schoolEndMinutes` | `930` | Selesai sekolah 15:30 |
| `bellMorningMinutes` | `420` | Apel pagi 07:00 |
| `bellAfternoonMinutes` | `780` | Apel siang 13:00 |
| `lateLimitMinutes` | `15` | Batas terlambat setelah jam apel |
| `attendanceMorningCloseMinutes` | `510` | Scan pagi ditutup 08:30 |
| `attendanceAfternoonCloseMinutes` | `870` | Scan siang ditutup 14:30 |
| **`dutyOpenMinutes`** | **`360` (06:00)** | **Jam buka menu operasional guru piket; detail di bagian 3** |
| `schoolDays` | `["MON","TUE","WED","THU","FRI"]` | Hari sekolah; disimpan sebagai string JSON |
| `pollIntervalMs` | `20000` | Interval polling frontend (15–30 detik) |
| `sessionTtlMs` | `28800000` | Umur token 8 jam; pada instalasi ini nilai awal terkait Script Property `SESSION_TTL_MS` |
| `consequenceCategories` | `[{"code":"PEMBINAAN","label":"Pembinaan dan pengarahan"},...]` | Daftar kategori konsekuensi; string JSON |
| `permitTypes` | `["SICK","LEAVE","ABSENT","EARLY_LEAVE"]` | Jenis izin; string JSON |
| `seedDone` | `false` | Penanda data contoh sudah di-seed (dikelola oleh `seedInitialData()`) |
| `dbVersion` | `1` | Versi skema untuk migrasi |

Semua nilai jam memakai **menit sejak 00:00**: `360` = 06:00, `420` = 07:00, `780` = 13:00, `870` = 14:30. Perhitungan memakai waktu server `Asia/Jakarta`, bukan jam perangkat pengguna.

---

## 3. Jam buka menu operasional guru piket (`dutyOpenMinutes`)

### 3.1 Fungsi

`dutyOpenMinutes` menentukan pukul berapa seorang `GURU_PIKET` boleh mulai memakai menu operasional (scan apel, izin keluar/kembali, pulang awal, keterlambatan, monitoring, penugasan pengganti). Default `360` berarti **06:00** waktu server `Asia/Jakarta`.

Superadmin dapat mengatur jam ini sesuai kebijakan sekolah. Contoh mengubah ke 05:45:

```json
{ "values": { "dutyOpenMinutes": 345 } }
```

### 3.2 Dua gerbang otorisasi yang berbeda

Backend memeriksa dua hal secara terpisah:

| Pemeriksaan | Syarat | Pesan bila gagal |
|---|---|---|
| Jadwal bertugas | Tanggal server termasuk `DUTY_SCHEDULES` untuk user (MAIN/BACKUP aktif atau mode `BACKUP_ACTIVATED`) | **"Anda tidak memiliki jadwal piket pada hari ini."** |
| Jam buka | Waktu server `Asia/Jakarta` sudah melewati `SCHOOL_SETTINGS.dutyOpenMinutes` | **"Menu piket belum dibuka pada waktu ini."** |

Keduanya menghasilkan `FORBIDDEN`. Artinya:

- Punya jadwal, tapi sebelum jam buka → ditolak dengan pesan **"Menu piket belum dibuka pada waktu ini."**
- Sudah lewat jam buka, tapi tanpa jadwal → tetap ditolak dengan pesan **"Anda tidak memiliki jadwal piket pada hari ini."**

### 3.3 Yang perlu diperhatikan

- `dutyOpenMinutes` **berbeda** dengan `bellMorningMinutes`. Jam buka mengatur akses menu; jam apel mengatur perhitungan status `HADIR`/`TERLAMBAT`.
- `dutyOpenMinutes` **berbeda** dengan `attendanceMorningCloseMinutes`. Yang satu membuka menu, yang lain menutup sesi scan pagi.
- Nilai dibandingkan di server. Mengubah jam di HP guru tidak memengaruhi hasil.
- Bila UI menyembunyikan menu sebelum jam buka, itu hanya kenyamanan; **backend tetap menjadi otoritas**.
- Kontrak `settings.public` mencantumkan `dutyOpenMinutes` bersama `schoolName`, `npsn`, `logoUrl`, `academicYear`, `semester`, `bellMorning`, `bellAfternoon`, `lateLimitMinutes`, `schoolDays`, dan `pollIntervalMs`. Frontend boleh menampilkannya, tetapi backend tetap menjadi otoritas penentu akses.

### 3.4 Contoh alur waktu (default 06:00)

```text
05:45  guru piket login → menu operasional ditolak: "Menu piket belum dibuka pada waktu ini."
06:00  jam buka tercapai → menu operasional dapat dipakai (jadwal tetap wajib ada)
07:00  apel pagi (bellMorningMinutes)
07:15  batas terlambat (lateLimitMinutes = 15)
08:30  scan pagi ditutup (attendanceMorningCloseMinutes)
13:00  apel siang (bellAfternoonMinutes)
14:30  scan siang ditutup (attendanceAfternoonCloseMinutes)
```

---

## 4. Pengujian terkait setting

Setelah mengubah setting, jalankan pengujian yang relevan di `docs/TESTING_CHECKLIST.md`, terutama:

- kondisi validasi nomor 6 (jadwal piket / `FORBIDDEN`),
- pengujian jam buka `dutyOpenMinutes`,
- kondisi validasi nomor 9–11 (jam apel, batas terlambat, penutupan sesi).

Perubahan setting sebaiknya dicatat di `AUDIT_LOG` bila implementasi mencatatnya, dan didahului backup bila menyangkut jam operasional.
