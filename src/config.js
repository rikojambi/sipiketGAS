/**
 * Konfigurasi publik aplikasi. TIDAK BOLEH ada secret di sini.
 * Semua nilai berasal dari variabel lingkungan Vite yang dibangun saat build.
 */

const rawEnv = (() => {
  try {
    return (typeof import.meta !== 'undefined' && import.meta.env) ? import.meta.env : {};
  } catch {
    return {};
  }
})();

function asText(value) {
  if (value === undefined || value === null) return '';
  return String(value).trim();
}

function asPositiveInt(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

const gasExecUrl = asText(rawEnv.VITE_GAS_EXEC_URL).replace(/\/+$/, '');
const pollIntervalMs = asPositiveInt(rawEnv.VITE_POLL_INTERVAL_MS, 20000);
const appVersion = asText(rawEnv.VITE_APP_VERSION) || '1.0.0';

export const SETUP_MESSAGE =
  'Aplikasi belum terhubung ke backend. Set VITE_GAS_EXEC_URL dengan URL Web App Google Apps Script (berakhir /exec) pada file .env, lalu jalankan ulang build.';

export const config = Object.freeze({
  gasExecUrl,
  pollIntervalMs,
  appVersion,
  apiVersion: '1',
  requestTimeoutMs: 15000,
  // Endpoint lokal hanya dipakai untuk pengujian dengan scripts/mock-gas-server.js.
  isConfigured: /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?\//i.test(gasExecUrl) ||
    /^https:\/\/(script\.google\.com|script\.googleusercontent\.com)\//i.test(gasExecUrl),
  setupMessage: SETUP_MESSAGE
});

export default config;
