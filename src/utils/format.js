/**
 * Util format murni: aman di-import dari Node (tanpa akses window/document saat import).
 */

const MONTHS_ID = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
const DAYS_ID = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];

export function toDate(value) {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value === 'number' && Number.isFinite(value)) {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  if (typeof value !== 'string') return null;
  const text = value.trim();
  if (!text) return null;
  // YYYY-MM-DD diperlakukan sebagai tanggal lokal, bukan UTC, agar tidak bergeser hari.
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (match) return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 0, 0, 0, 0);
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function pad(value) {
  return String(value).padStart(2, '0');
}

export function formatDate(value) {
  const date = toDate(value);
  if (!date) return '—';
  return `${pad(date.getDate())} ${MONTHS_ID[date.getMonth()]} ${date.getFullYear()}`;
}

export function formatTime(value) {
  if (value === undefined || value === null || value === '') return '—';
  if (typeof value === 'number' || /^\d+$/.test(String(value))) {
    return minutesToHHMM(Number(value));
  }
  const timeOnly = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(String(value).trim());
  if (timeOnly) return `${pad(Number(timeOnly[1]))}:${timeOnly[2]}`;
  const date = toDate(value);
  if (!date) return '—';
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function minutesToHHMM(minutes) {
  const total = Number(minutes);
  if (!Number.isFinite(total)) return '—';
  const sign = total < 0 ? '-' : '';
  const abs = Math.abs(Math.trunc(total));
  return `${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
}

export function formatDateTimeJakarta(value) {
  const date = toDate(value);
  if (!date) return '—';
  try {
    return new Intl.DateTimeFormat('id-ID', {
      timeZone: 'Asia/Jakarta',
      day: '2-digit',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    }).format(date);
  } catch {
    return `${formatDate(date)} ${formatTime(date)} WIB`;
  }
}

export function todayJakarta() {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit'
    }).formatToParts(new Date());
    const pick = (type) => parts.find((part) => part.type === type)?.value ?? '00';
    return `${pick('year')}-${pick('month')}-${pick('day')}`;
  } catch {
    const now = new Date();
    return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  }
}

export function dayNameJakarta(date = new Date()) {
  const d = toDate(date) || new Date();
  try {
    const name = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Jakarta', weekday: 'long' }).format(d);
    return DAYS_ID.find((day) => name.toLowerCase().startsWith(day.slice(0, 3).toLowerCase())) || name;
  } catch {
    return DAYS_ID[d.getDay()];
  }
}

export function escapeCsv(value) {
  if (value === undefined || value === null) return '';
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCSV(rows) {
  if (!Array.isArray(rows)) return '';
  return rows
    .map((row) => (Array.isArray(row) ? row : [row]).map(escapeCsv).join(','))
    .join('\n');
}

export function formatNumber(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '0';
  try {
    return new Intl.NumberFormat('id-ID').format(number);
  } catch {
    return String(number);
  }
}

export const STATUS_LABELS = Object.freeze({
  HADIR: 'Hadir', TERLAMBAT: 'Terlambat', IZIN: 'Izin', SAKIT: 'Sakit',
  TANPA_KETERANGAN: 'Tanpa Keterangan', BELUM_HADIR: 'Belum Hadir',
  APPROVED: 'Disetujui', REJECTED: 'Ditolak', NEED_CLARIFICATION: 'Butuh Klarifikasi',
  PENDING: 'Menunggu', ONGOING: 'Berlangsung', DONE: 'Selesai', NEED_FOLLOWUP: 'Perlu Tindak Lanjut',
  OPEN: 'Masih di Luar', CLOSED: 'Sudah Kembali', VERIFIED: 'Terverifikasi', UNVERIFIED: 'Belum Diverifikasi',
  KBM_BERJALAN: 'KBM Berjalan', GURU_BELUM_HADIR: 'Guru Belum Hadir', KELAS_KOSONG: 'Kelas Kosong',
  GURU_IZIN: 'Guru Izin', GURU_SAKIT: 'Guru Sakit', GURU_TERLAMBAT: 'Guru Terlambat',
  DIGANTIKAN: 'Digantikan', TUGAS_MANDIRI: 'Tugas Mandiri'
});

export function statusLabel(value) {
  if (value === undefined || value === null || value === '') return '—';
  const key = String(value).toUpperCase();
  return STATUS_LABELS[key] || String(value).replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

export function durationLabel(minutes) {
  const value = Number(minutes);
  if (!Number.isFinite(value) || value < 0) return '—';
  return `${Math.floor(value / 60)}j ${pad(value % 60)}m`;
}
