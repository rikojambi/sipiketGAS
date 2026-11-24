/** Scanner barcode: BarcodeDetector native, fallback @zxing/browser, kamera belakang. */

const DUPLICATE_WINDOW_MS = 4000;
let active = false;
let stream = null;
let detector = null;
let detectTimer = null;
let zxingControls = null;
let lastDetection = { text: '', at: 0 };

function browserWindow() {
  return typeof window !== 'undefined' ? window : null;
}

export function isSecureContextForCamera() {
  const win = browserWindow();
  if (!win) return false;
  if (win.isSecureContext) return true;
  const host = win.location?.hostname || '';
  return host === 'localhost' || host === '127.0.0.1';
}

function cameraError(error) {
  const name = String(error?.name || '');
  if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
    return new Error('Izin kamera ditolak. Izinkan akses kamera di pengaturan browser, lalu coba lagi.');
  }
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
    return new Error('Kamera tidak ditemukan pada perangkat ini.');
  }
  if (name === 'NotReadableError' || name === 'TrackStartError') {
    return new Error('Kamera sedang digunakan aplikasi lain. Tutup aplikasi tersebut lalu coba lagi.');
  }
  return new Error(`Kamera gagal dibuka: ${error?.message || 'kesalahan tidak diketahui'}`);
}

function acceptText(text, onDetect) {
  const value = String(text || '').trim();
  if (!value) return;
  const now = Date.now();
  if (value === lastDetection.text && now - lastDetection.at < DUPLICATE_WINDOW_MS) return;
  lastDetection = { text: value, at: now };
  onDetect(value);
}

async function startNative(videoEl, onDetect, onError) {
  const win = browserWindow();
  let nativeDetector;
  try {
    // Daftar format dibiarkan sesimpel mungkin agar kompatibel dengan berbagai browser.
    nativeDetector = new win.BarcodeDetector();
  } catch {
    try { nativeDetector = new win.BarcodeDetector({ formats: ['qr_code', 'code_128', 'code_39', 'ean_13'] }); }
    catch { return false; }
  }
  detector = nativeDetector;
  detectTimer = win.setInterval(async () => {
    if (!active || !detector || videoEl.readyState < 2) return;
    try {
      const codes = await detector.detect(videoEl);
      if (codes && codes.length) acceptText(codes[0].rawValue, onDetect);
    } catch (error) {
      onError(new Error(`Pembacaan barcode gagal: ${error?.message || 'tidak diketahui'}`));
    }
  }, 250);
  return true;
}

async function startZxing(videoEl, onDetect) {
  // Dynamic import menjaga bundle awal tetap ringan.
  const [{ BrowserMultiFormatReader, BarcodeFormat }, library] = await Promise.all([
    import('@zxing/browser'),
    import('@zxing/library').catch(() => ({}))
  ]);
  const DecodeHintType = library.DecodeHintType;
  let hints;
  if (DecodeHintType) {
    hints = new Map();
    try {
      hints.set(DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.QR_CODE, BarcodeFormat.CODE_128, BarcodeFormat.CODE_39, BarcodeFormat.EAN_13]);
    } catch { hints = undefined; }
  }
  const reader = new BrowserMultiFormatReader(hints);
  zxingControls = await reader.decodeFromStream(stream, videoEl, (result) => {
    if (result && active) acceptText(result.getText(), onDetect);
  });
  return true;
}

/**
 * @param {HTMLVideoElement} videoEl
 * @param {(text:string)=>void} onDetect
 * @param {(error:Error)=>void} onError
 */
export async function start(videoEl, onDetect, onError) {
  const fail = (error) => { try { onError(error); } catch { /* abaikan */ } };
  stop();
  if (!videoEl) { fail(new Error('Elemen kamera tidak ditemukan.')); return false; }
  if (!isSecureContextForCamera()) {
    fail(new Error('Kamera hanya bisa dipakai melalui HTTPS (atau localhost). Buka aplikasi dengan alamat https:// lalu coba lagi.'));
    return false;
  }
  if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
    fail(new Error('Browser ini tidak mendukung akses kamera. Gunakan browser modern melalui HTTPS.'));
    return false;
  }

  active = true;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: false
    });
    if (!active) { stop(); return false; }
    videoEl.srcObject = stream;
    videoEl.setAttribute('playsinline', 'true');
    videoEl.muted = true;
    const play = videoEl.play();
    if (play && typeof play.catch === 'function') play.catch(() => {});

    const win = browserWindow();
    if (win && typeof win.BarcodeDetector === 'function') {
      const started = await startNative(videoEl, onDetect, fail);
      if (started) return true;
    }
    await startZxing(videoEl, onDetect);
    return true;
  } catch (error) {
    fail(cameraError(error));
    stop();
    return false;
  }
}

export function stop() {
  active = false;
  const win = browserWindow();
  if (detectTimer && win) win.clearInterval(detectTimer);
  detectTimer = null;
  detector = null;
  try { zxingControls?.stop?.(); } catch { /* abaikan */ }
  zxingControls = null;
  if (stream) {
    stream.getTracks().forEach((track) => {
      try { track.stop(); } catch { /* abaikan */ }
    });
    stream = null;
  }
  lastDetection = { text: '', at: 0 };
}

export function isRunning() {
  return active;
}

/** Pencarian lokal untuk fallback manual berdasarkan nama/NIS/kelas. */
export function searchStudents(students = [], query = '', limit = 25) {
  const needle = String(query || '').trim().toLowerCase();
  const list = Array.isArray(students) ? students : [];
  const pool = needle
    ? list.filter((student) => [student.name, student.nis, student.nisn, student.className, student.barcodeToken]
        .some((value) => String(value || '').toLowerCase().includes(needle)))
    : list;
  return pool.slice(0, limit);
}

export const scanner = { start, stop, isRunning, searchStudents, isSecureContextForCamera };
export default scanner;
