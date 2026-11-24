# SIPIKET — Catatan Implementasi & Keterbatasan

Dokumen ini berisi alasan teknis di balik keputusan implementasi dan hal-hal yang **masih perlu diuji di lingkungan nyata**. Bukan dokumen klaim keberhasilan.

Sumber kebenaran: `docs/API_DOCUMENTATION.md` v1.0.0, `docs/DATABASE_SCHEMA.md`, `docs/SETTINGS.md`.

---

## 1. Ringkasan keputusan

| Topik | Keputusan | Alasan | Konsekuensi / yang perlu diverifikasi |
|---|---|---|---|
| Transport | JSONP_GET lewat `<script>` + `callback` | CORS GAS tidak andal untuk header custom | Callback harus unik; payload di URL; uji di browser & proxy kantor |
| Ukuran request | Maksimal sekitar 8 KB per request; import di-chunk 200 baris | Batas panjang URL praktis | Uji import besar; jangan kirim base64 foto |
| Token | `sessionStorage` | Tidak ingin token menetap di localStorage | Hilang saat tab ditutup; tidak bersama antar-tab |
| Password | SHA-256 + salt unik, bukan bcrypt | Tidak ada bcrypt native di Apps Script | Perlu rate limiting; migrasi disarankan untuk data sensitif |
| Durasi | Aksi dipecah; target di bawah 6 menit | Batas eksekusi Web Apps Script consumer | Uji import/backup dengan data besar |
| Concurrency | `LockService.getScriptLock()` pada semua write | Spreadsheet bukan database transaksional | Uji dua scanner bersamaan |
| Indeks | CacheService untuk indeks logik | Tidak ada constraint unik di Sheets | Indeks bisa dingin/ usang bila sheet disunting manual |
| Idempotency | `idempotencyKey` UUID v4 dari frontend | Retry offline/timeout tidak boleh duplikat | Uji double-submit & retry setelah timeout |
| Realtime | Polling 15–30 detik (`pollIntervalMs` 20000) | Tidak ada WebSocket | Perubahan tidak instan; uji beban banyak klien |
| Penyimpanan | 19 sheet + `SESSIONS` tersembunyi | Tanpa server database berbayar | Validasi manual; relasi tidak dijamin constraint |
| Waktu | Semua keputusan di server `Asia/Jakarta` | Jam perangkat tidak bisa dipercaya | Uji di sekitar jam buka piket & tengah malam |
| Hak piket | Dua gerbang: `DUTY_SCHEDULES` **dan** `dutyOpenMinutes` | Jadwal saja tidak cukup; jam buka diatur sekolah | Uji dua pesan `FORBIDDEN` yang berbeda |
| Keamanan endpoint | Web App "Anyone" + autentikasi token | Browser/HP tidak bisa login Google tiap request | Semua aksi kecuali `ping`/`login` wajib menolak tanpa token |

---

## 2. Penjelasan teknis

### 2.1 JSONP_GET, bukan REST/CORS

`doGet(e)` membaca `e.parameter.callback`, `action`, dan `payload`, lalu mengembalikan JavaScript:

```js
window[callback]({ ok: true, data: {}, error: null, requestId: "...", serverTime: "...", version: "1.0.0" });
```

Dengan MIME `application/javascript`, browser menjalankan respons sebagai script. Konsekuensinya:

- `Access-Control-Allow-Origin: *` sengaja tidak dipakai; `fetch()` dengan header custom ke `/exec` bukan jalur yang didukung kontrak.
- Nama callback harus unik per request dan didefinisikan **sebelum** elemen `<script>` disisipkan, lalu dibersihkan setelah dipanggil.
- Nama callback sebaiknya dibatasi pada pola aman (misalnya `__sipiket` + angka/huruf) agar tidak menjadi vektor injeksi.
- Token ikut terkirim di URL sebagai bagian dari `payload`; risiko ini ditekan dengan umur token pendek dan HTTPS. Jangan menaruh secret lain di URL.
- Fallback `doPost` dengan `text/plain` dan envelope yang sama **tidak diaktifkan default**. Jika jaringan sekolah memblokir mutasi via GET, fallback perlu diimplementasikan dan diuji terpisah.

### 2.2 sessionStorage, bukan localStorage

Token disimpan di `sessionStorage` agar tidak bertahan di perangkat bersama. Dampaknya:

- Menutup tab = logout; membuka tab baru = login ulang.
- Dua tab memiliki session terpisah.
- Antrean offline berada di IndexedDB (terpisah dari token), sehingga setelah tab ditutup dan login ulang, antrean masih ada tetapi perlu sinkronisasi ulang.

Ini adalah trade-off antara keamanan dan kenyamanan; perlu diuji pada skenario perangkat piket yang dipakai bergantian.

### 2.3 Hash password: SHA-256 + salt versus bcrypt

Apps Script tidak menyediakan bcrypt/Argon2 native. Format yang dipakai:

```text
salt   = Base64(32 byte acak)
hash   = Base64(SHA256(salt + password))
```

Dilengkapi:

- salt unik per user,
- rate limiting: 5 kali gagal → kunci 15 menit (`RATE_LIMITED`),
- token session berumur pendek (`SESSION_TTL_MS`, default 8 jam).

Ini **lebih lemah** daripada bcrypt/Argon2 terhadap serangan brute force offline bila data spreadsheet bocor. Untuk lingkungan dengan data sensitif, disarankan migrasi ke penyedia autentikasi/service eksternal. Yang perlu diuji:

- konsistensi digest antara `Utilities.computeDigest` di GAS dan implementasi pengujian,
- perilaku kunci akun pada request konkuren,
- tidak adanya password plaintext yang tertulis di sheet/log.

### 2.4 Batas eksekusi 6 menit dan kuota

Web App Apps Script (consumer) membatasi waktu eksekusi. Mitigasi:

- semua aksi dipecah menjadi operasi kecil,
- import dibatasi 200 baris per panggilan (`students.import`),
- backup memakai salinan spreadsheet, bukan ekspor manual besar,
- hindari loop lintas seluruh sheet tanpa batas pada satu request.

Perlu diuji: import ribuan baris, backup dengan data besar, dan kuota harian saat banyak perangkat melakukan polling.

### 2.5 LockService

Semua mutasi memakai `LockService.getScriptLock()`. Pola yang diharapkan:

```text
lock.waitLock(...)
try   → baca data terbaru → validasi → tulis → audit
finally → lock.releaseLock()
```

Tanpa ini, dua scan bersamaan bisa menimpa status atau membuat dua movement `OPEN`. Perlu diuji dengan dua perangkat/scanner yang mengirim `idempotencyKey` berbeda untuk siswa yang sama.

### 2.6 CacheService sebagai indeks logik

`ATTENDANCE` unik per `(date, session, studentId)`; username unik case-insensitive; `barcodeToken` unik; movement `OPEN` terakhir per `(date, studentId)`. Karena Sheets tidak punya constraint, indeks disimpan via CacheService.

Risiko: cache bisa kosong saat cold start atau usang bila seseorang mengedit sheet langsung. Hindari edit manual sheet produksi; gunakan API. Perlu diverifikasi perilaku cache setelah `setup.migrate`, restore, dan edit manual.

### 2.7 Idempotency dan outbox offline

Frontend membangkitkan UUID v4 sebagai `idempotencyKey`/`requestId`. Backend menyimpannya di `AUDIT_LOG.requestId` dan mengembalikan hasil lama untuk duplikat. Status UI:

```text
MENUNGGU SINKRONISASI → (ok:true) Tersinkronisasi
                     → (konflik/error) GAGAL – butuh tindakan
```

Sinkronisasi memakai online event + interval + tombol manual, **bukan** Background Sync. Perlu diuji: double-click tombol scan, retry setelah timeout, dan konflik karena sesi ditutup saat offline.

### 2.8 Polling

Tidak ada WebSocket, sehingga frontend mengambil perubahan lewat polling dengan `pollIntervalMs` default 20000 (disarankan 15–30 detik). Perlu diuji jumlah klien simultan dan beban ke Apps Script. Jangan menurunkan interval ke beberapa detik pada produksi.

### 2.9 Waktu, jam apel, dan jam buka piket

Semangatnya: frontend tidak pernah menentukan status final. Server memakai `Asia/Jakarta` untuk:

- tanggal transaksi,
- jam apel `bellMorningMinutes` / `bellAfternoonMinutes`,
- batas `lateLimitMinutes`,
- jam tutup `attendanceMorningCloseMinutes` / `attendanceAfternoonCloseMinutes`,
- **jam buka menu piket `dutyOpenMinutes`** (default `360` = 06:00).

Gerbang piket dua lapis menghasilkan dua pesan berbeda:

- tanpa jadwal → **"Anda tidak memiliki jadwal piket pada hari ini."**
- sebelum jam buka → **"Menu piket belum dibuka pada waktu ini."**

Rincian ada di `docs/SETTINGS.md`. Perlu diuji tepat sebelum/sesudah jam buka, di sekitar jam apel, dan saat pergantian tanggal.

### 2.10 Spreadsheet sebagai database

Kelebihannya: tanpa biaya database, mudah diaudit. Kekurangannya:

- tidak ada constraint foreign key/unik nyata,
- penulisan dan pembacaan baris bergantung pada urutan/header yang benar,
- performa menurun saat sheet besar.

Oleh karena itu `setup.validate`, header final (misalnya `attendanceStatus`, bukan duplikat `status`), dan disiplin impor menjadi penting. Relasi ada di `DATABASE_SCHEMA.md`.

### 2.11 Web App bersifat publik

`Who has access: Anyone` berarti siapa pun bisa membuka URL `/exec`. Ini tidak berarti data terbuka: semua aksi selain `ping` dan `login` harus menolak token kosong/invalid dan mengambil role dari server. Perlu diuji aksi tanpa token, token expired, dan token dari user lain.

---

## 3. Urutan modul `.gs`

Urutan pemuatan: `Code`, `Config`, `Utils`, `Store`, `Auth`, `Setup`, `Users`, `Students`, `Attendance`, `Permissions`, `Classes`, `Monitoring`, `Notifications`, `Reports`, `Backups`.

Tujuannya agar konstanta/helper tersedia sebelum modul yang memakainya, dan agar entry point `doGet` berada di file pertama. Detail instalasi ada di `docs/INSTALLATION.md`.

---

## 4. Status verifikasi — jujur

**Pada saat dokumen ini ditulis, belum tersedia bukti pengujian di lingkungan nyata** untuk butir-butir di atas. Kode dan kontrak mungkin sudah dirancang dengan hati-hati, tetapi itu bukan pengujian.

Yang perlu dijalankan dan dicatat hasilnya di `docs/TESTING_CHECKLIST.md`:

1. `ping` dan login untuk kelima peran di browser sungguhan.
2. JSONP lintas browser/perangkat dan jaringan kantor dengan proxy.
3. Batas panjang payload pada import CSV besar.
4. Hash password, rate limiting 5×/15 menit, expiry token.
5. Dua gerbang piket: jadwal + `dutyOpenMinutes`, termasuk dua pesan `FORBIDDEN`.
6. Dua scanner konkuren dengan LockService dan idempotency.
7. Status absensi: jam apel, batas terlambat, jam tutup sesi, duplikat scan, hari libur.
8. Izin, movement `OPEN`, pulang awal, dan konfliknya.
9. Alur offline: outbox, `MENUNGGU SINKRONISASI`, retry, konflik.
10. PWA: manifest, ikon, service worker, shortcut hash route, install.
11. Backup/restore di lingkungan uji dengan data cadangan lain.
12. Eksekusi mendekati 6 menit pada import/backup besar dan kuota harian.
13. Audit log untuk koreksi, persetujuan izin, dan restore.

---

## 5. Arah perbaikan bila skala bertambah

- Migrasi ke database relasional/serverless untuk constraint dan transaksi nyata.
- Migrasi ke penyedia autentikasi dengan bcrypt/Argon2 bila diperlukan.
- Aktifkan `doPost` `text/plain` sebagai fallback bila doGet diblokir jaringan.
- Ganti polling dengan push/WebSocket bila kebutuhan realtime meningkat.
- Pisahkan worker untuk backup/import agar tidak mendekati batas 6 menit.
