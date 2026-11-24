/**
 * Validasi murni: tidak mengakses window/document saat import.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const USERNAME_RE = /^[a-zA-Z0-9._-]{3,64}$/;

export function isUuid(value) {
  return typeof value === 'string' && UUID_RE.test(value.trim());
}

export function isValidDate(value) {
  if (value instanceof Date) return !Number.isNaN(value.getTime());
  if (typeof value !== 'string' || !DATE_RE.test(value.trim())) return false;
  const text = value.trim();
  const year = Number(text.slice(0, 4));
  const month = Number(text.slice(5, 7));
  const day = Number(text.slice(8, 10));
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
}

export function isSameDay(a, b) {
  const left = normalizeDay(a);
  const right = normalizeDay(b);
  return Boolean(left && right && left === right);
}

function normalizeDay(value) {
  if (isValidDate(value)) return String(value).trim().slice(0, 10);
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function validateLogin(values = {}) {
  const errors = {};
  const username = String(values.username ?? '').trim();
  const password = String(values.password ?? '');
  if (!username) errors.username = 'Username wajib diisi.';
  else if (!USERNAME_RE.test(username)) errors.username = 'Username minimal 3 karakter dan hanya boleh huruf, angka, titik, garis bawah, atau tanda hubung.';
  if (!password) errors.password = 'Kata sandi wajib diisi.';
  else if (password.length < 4) errors.password = 'Kata sandi minimal 4 karakter.';
  return { valid: Object.keys(errors).length === 0, errors };
}

export function validateStudent(values = {}) {
  const errors = {};
  const nis = String(values.nis ?? '').trim();
  const name = String(values.name ?? '').trim();
  const classId = String(values.classId ?? '').trim();
  if (!nis) errors.nis = 'NIS wajib diisi.';
  else if (!/^[A-Za-z0-9._-]{2,40}$/.test(nis)) errors.nis = 'NIS hanya boleh huruf, angka, titik, garis bawah, atau tanda hubung (2–40 karakter).';
  if (!name) errors.name = 'Nama siswa wajib diisi.';
  else if (name.length < 2) errors.name = 'Nama siswa minimal 2 karakter.';
  if (!classId) errors.classId = 'Kelas wajib dipilih.';
  if (values.birthDate && !isValidDate(values.birthDate)) errors.birthDate = 'Tanggal lahir tidak valid (YYYY-MM-DD).';
  return { valid: Object.keys(errors).length === 0, errors };
}

export function required(value, label) {
  return String(value ?? '').trim() ? null : `${label} wajib diisi.`;
}

export function collectErrors(...checks) {
  const errors = {};
  checks.forEach((check) => {
    if (check && check.field && check.message) errors[check.field] = check.message;
  });
  return { valid: Object.keys(errors).length === 0, errors };
}

export function parseJsonSetting(text, fallback) {
  try {
    return JSON.parse(text);
  } catch {
    return fallback;
  }
}
