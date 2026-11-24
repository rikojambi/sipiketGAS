/**
 * Transport JSONP_GET sesuai docs/API_DOCUMENTATION.md.
 * Tidak ada fetch langsung ke Google Sheets / Apps Script selain <script> JSONP di sini.
 */

import { config } from '../config.js';
import { getToken } from './session.js';

export class ApiError extends Error {
  constructor(code, message, details = null) {
    super(message);
    this.name = 'ApiError';
    this.code = String(code || 'SERVER_ERROR');
    this.details = details;
  }
}

const ERROR_MESSAGES = Object.freeze({
  BAD_REQUEST: 'Data yang dikirim tidak valid. Periksa kembali isian form.',
  UNAUTHORIZED: 'Sesi habis atau tidak valid. Silakan masuk kembali.',
  FORBIDDEN: 'Anda tidak memiliki izin untuk melakukan aksi ini.',
  NOT_FOUND: 'Data yang diminta tidak ditemukan.',
  CONFLICT: 'Data bertentangan dengan kondisi server (misalnya sesi sudah ditutup). Muat ulang halaman.',
  RATE_LIMITED: 'Terlalu banyak percobaan. Silakan tunggu beberapa menit sebelum mencoba lagi.',
  EXPIRED: 'Sesi sudah berakhir. Silakan masuk kembali.',
  SERVER_ERROR: 'Server belum merespons. Periksa koneksi dan konfigurasi backend.',
  OFFLINE: 'Perangkat sedang offline. Transaksi akan disimpan di antrean dan dikirim saat online.',
  SETUP: config.setupMessage,
  TIMEOUT: 'Server terlalu lama merespons (15 detik). Coba lagi.'
});

/** Pesan backend tertentu diterjemahkan ke bahasa yang lebih mudah dipahami pengguna. */
const FRIENDLY_MESSAGES = Object.freeze({
  'Menu piket belum dibuka pada waktu ini.': 'Menu piket belum tersedia. Menu dibuka sesuai jam buka menu piket yang ditetapkan sekolah (misalnya 06.00 WIB). Silakan coba lagi setelah jam tersebut.'
});

export function friendlyMessage(message) {
  return FRIENDLY_MESSAGES[String(message || '').trim()] || message;
}

export function apiMessage(code, fallback) {
  return friendlyMessage(ERROR_MESSAGES[String(code || '').toUpperCase()] || fallback || 'Terjadi kesalahan. Silakan coba lagi.');
}

function isOffline() {
  try {
    return typeof navigator !== 'undefined' && navigator.onLine === false;
  } catch {
    return false;
  }
}

function uniqueCallbackName() {
  const random = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID().replace(/-/g, '')
    : Math.random().toString(36).slice(2);
  return `__sipiketCb_${Date.now()}_${random}`;
}

function buildUrl(action, payload, callback) {
  const url = new URL(config.gasExecUrl);
  url.search = new URLSearchParams({
    callback,
    action,
    payload: JSON.stringify(payload),
    v: config.apiVersion
  }).toString();
  return url.toString();
}

function validateEnvelope(envelope) {
  if (!envelope || typeof envelope !== 'object' || typeof envelope.ok !== 'boolean') {
    throw new ApiError('SERVER_ERROR', 'Balasan server tidak dikenali (envelope tidak valid).');
  }
  if (!envelope.ok) {
    const error = envelope.error || {};
    const code = String(error.code || 'SERVER_ERROR');
    throw new ApiError(code, friendlyMessage(error.message) || apiMessage(code), error.details || null);
  }
  if (envelope.data === undefined || envelope.data === null) {
    // Beberapa aksi mengembalikan data null; itu tetap dianggap sukses bila ok:true.
    return envelope.data ?? {};
  }
  return envelope.data;
}

/** JSONP GET dengan callback unik, timeout 15 detik, dan cleanup script + callback. */
export function jsonpGet(action, payload = {}, opts = {}) {
  if (isOffline()) return Promise.reject(new ApiError('OFFLINE', apiMessage('OFFLINE')));
  if (!config.gasExecUrl) return Promise.reject(new ApiError('SETUP', config.setupMessage));

  const safePayload = { ...payload };
  if (opts.withToken !== false) {
    const token = opts.token || getToken();
    if (token) safePayload.token = token;
  }
  const serialized = JSON.stringify(safePayload);
  if (serialized.length > 7600) {
    return Promise.reject(new ApiError('BAD_REQUEST', 'Payload terlalu besar untuk JSONP (maksimal ±8 KB).'));
  }

  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || typeof document === 'undefined') {
      reject(new ApiError('OFFLINE', 'JSONP hanya tersedia di browser.'));
      return;
    }
    const callback = uniqueCallbackName();
    let script = null;
    let done = false;

    const cleanup = () => {
      if (script && script.parentNode) script.parentNode.removeChild(script);
      try { delete window[callback]; } catch { window[callback] = undefined; }
    };
    const settle = (fn, value) => {
      if (done) return;
      done = true;
      window.clearTimeout(timer);
      cleanup();
      fn(value);
    };

    const timer = window.setTimeout(() => {
      settle(reject, new ApiError('TIMEOUT', apiMessage('TIMEOUT')));
    }, config.requestTimeoutMs);

    window[callback] = (envelope) => {
      try {
        settle(resolve, validateEnvelope(envelope));
      } catch (error) {
        settle(reject, error);
      }
    };

    script = document.createElement('script');
    script.async = true;
    script.src = buildUrl(action, safePayload, callback);
    script.onerror = () => settle(reject, new ApiError('SERVER_ERROR', apiMessage('SERVER_ERROR')));
    document.head.appendChild(script);
  });
}

export const api = {
  call(action, payload = {}, opts = {}) {
    return jsonpGet(action, payload, opts);
  },
  /** Dipakai outbox: sama dengan call, tanpa retry otomatis; idempotencyKey sudah ada di payload. */
  callSync(action, payload = {}, opts = {}) {
    return jsonpGet(action, payload, { ...opts, sync: true });
  },
  ping() {
    return jsonpGet('ping', {}, { withToken: false });
  }
};

export default api;
