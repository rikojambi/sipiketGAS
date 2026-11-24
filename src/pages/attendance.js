/** Absensi MORNING/AFTERNOON: scan, manual fallback, antrean offline, kartu hasil. */

import { api, ApiError } from '../services/api.js';
import { enqueue, uuidv4 } from '../services/outbox.js';
import { cacheGet, cacheSet } from '../services/idb.js';
import { searchStudents } from '../services/scanner.js';
import { banner, button, card, emptyState, field, statusPill, table } from '../components/ui.js';
import { escapeHtml, fieldValue, qs, setHtml } from '../utils/dom.js';
import { statusLabel } from '../utils/format.js';

const STUDENTS_KEY = 'students:list';
const recentKey = (session) => `attendance:recent:${String(session).toUpperCase()}`;

export const SESSION_LABELS = Object.freeze({ MORNING: 'Apel Pagi', AFTERNOON: 'Apel Siang' });

export function sessionLabel(session) {
  return SESSION_LABELS[String(session).toUpperCase()] || String(session || 'Absensi');
}

async function cachedStudents() {
  const cached = await cacheGet(STUDENTS_KEY);
  return cached?.value || [];
}

export async function loadStudents() {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return cachedStudents();
  try {
    const data = await api.call('students.list', { activeOnly: true });
    const list = Array.isArray(data) ? data : (data?.items || []);
    await cacheSet(STUDENTS_KEY, list);
    return list;
  } catch {
    return cachedStudents();
  }
}

async function remember(session, entry) {
  try {
    const list = (await cacheGet(recentKey(session)))?.value || [];
    list.unshift({ ...entry, at: new Date().toISOString() });
    await cacheSet(recentKey(session), list.slice(0, 30));
  } catch { /* abaikan */ }
}

export async function lookupStudent(tokenId) {
  if (!tokenId) return null;
  try {
    const data = await api.call('barcode.lookup', { tokenId });
    return data?.student || null;
  } catch {
    const students = await cachedStudents();
    return students.find((student) => String(student.barcodeToken).toLowerCase() === String(tokenId).toLowerCase()) || null;
  }
}

function renderResult(result = {}, meta = {}) {
  const attendance = result.attendance || {};
  const student = result.student || {};
  const warnings = Array.isArray(result.warnings) ? result.warnings : [];
  const pending = Boolean(meta.pending);
  const tone = pending ? 'amber' : (attendance.status === 'TERLAMBAT' || attendance.status === 'TANPA_KETERANGAN' ? 'red' : 'green');
  return `<div class="scan-result ${pending ? 'is-pending' : ''}">
    ${pending ? banner('MENUNGGU SINKRONISASI', 'warning') : ''}
    <div class="scan-result-head"><div class="scan-avatar">${escapeHtml((student.name || '?').slice(0, 1).toUpperCase())}</div>
      <div><h2>${escapeHtml(student.name || 'Siswa tidak dikenal')}</h2><p>${escapeHtml(student.className || student.class || 'Kelas tidak diketahui')} · ${escapeHtml(student.nis || '')}</p></div>
      ${statusPill(pending ? 'MENUNGGU_SINKRONISASI' : (attendance.status || 'HADIR'))}
    </div>
    <div class="scan-result-grid">
      <div><span>Sesi</span><strong>${escapeHtml(sessionLabel(attendance.session || meta.session))}</strong></div>
      <div><span>Waktu</span><strong>${escapeHtml(attendance.scannedAt ? new Date(attendance.scannedAt).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) : '—')}</strong></div>
      <div><span>Status Backend</span><strong>${escapeHtml(pending ? 'menunggu konfirmasi' : statusLabel(attendance.status))}</strong></div>
      <div><span>Keterangan</span><strong>${result.alreadyRecorded ? 'Scan duplikat (sudah tercatat)' : 'Tercatat'}</strong></div>
    </div>
    ${warnings.length ? `<ul class="warning-list">${warnings.map((warning) => `<li>${escapeHtml(warning)}</li>`).join('')}</ul>` : ''}
  </div>`;
}

function conflictMessage(error) {
  const message = String(error?.message || '');
  if (/pulang|early|sudah keluar/i.test(message)) return 'Siswa sudah izin pulang atau tercatat keluar, sehingga absensi tidak dapat dicatat.';
  return message || 'Transaksi ditolak backend. Periksa kembali data lalu coba lagi.';
}

async function submit(ctx, session, payload, target, options = {}) {
  const studentHint = options.student || null;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    const record = await enqueue(payload.action, payload.body, { label: payload.label, scope: session });
    setHtml(target, renderResult({ attendance: { session }, student: studentHint }, { pending: true, session }));
    await remember(session, { student: studentHint, token: payload.body.tokenId, status: 'PENDING', outboxId: record.id });
    ctx.toast('Tersimpan di antrean. Status akan dikonfirmasi setelah sinkronisasi.', 'warning');
    return { queued: true, record };
  }
  try {
    const data = await api.call(payload.action, payload.body);
    setHtml(target, renderResult(data, { session }));
    await remember(session, { student: data.student || studentHint, token: payload.body.tokenId, status: data.attendance?.status, alreadyRecorded: data.alreadyRecorded });
    ctx.toast(data.alreadyRecorded ? 'Scan duplikat: data lama ditampilkan.' : `Absensi ${sessionLabel(session)} berhasil dicatat.`, 'success');
    if (data.attendance?.status === 'TERLAMBAT' && data.student?.id) {
      try {
        await api.call('late.record', {
          studentId: data.student.id,
          date: data.attendance.date,
          note: 'Tercatat terlambat saat pemindaian absensi',
          idempotencyKey: uuidv4()
        });
      } catch { /* late.record hanya pelengkap; kegagalan tidak membatalkan absensi */ }
    }
    return { data };
  } catch (error) {
    if (error instanceof ApiError && error.code === 'OFFLINE') {
      return submit({ ...ctx, toast: ctx.toast }, session, { ...payload, body: { ...payload.body, idempotencyKey: payload.body.idempotencyKey || uuidv4() } }, target, { student: studentHint });
    }
    setHtml(target, banner(conflictMessage(error), error?.code === 'CONFLICT' ? 'warning' : 'error'));
    return { error };
  }
}

export async function handleScan(ctx, session, tokenId, target) {
  const student = await lookupStudent(tokenId);
  return submit(ctx, session, {
    action: 'attendance.scan',
    label: `Absensi ${sessionLabel(session)}`,
    body: { session, tokenId, studentId: null, note: '', source: 'SCANNER', idempotencyKey: uuidv4() }
  }, target, { student });
}

export async function submitManual(ctx, session, studentId, target, extra = {}) {
  const students = await loadStudents();
  const student = students.find((item) => String(item.id) === String(studentId)) || null;
  return submit(ctx, session, {
    action: 'attendance.manual',
    label: `Absensi manual ${sessionLabel(session)}`,
    body: { session, tokenId: '', studentId, note: extra.note || '', source: 'MANUAL', idempotencyKey: uuidv4() }
  }, target, { student });
}

function recentTable(items = []) {
  return table([
    { key: 'name', label: 'Siswa', render: (row) => escapeHtml(row.student?.name || '—') },
    { key: 'className', label: 'Kelas', render: (row) => escapeHtml(row.student?.className || '—') },
    { key: 'status', label: 'Status', render: (row) => statusPill(row.status || 'PENDING') },
    { key: 'at', label: 'Waktu', render: (row) => escapeHtml(row.at ? new Date(row.at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) : '—') }
  ], items, { empty: 'Belum ada pemindaian pada perangkat ini.' });
}

export async function render(ctx) {
  const session = String(ctx.params.session || 'MORNING').toUpperCase();
  if (!SESSION_LABELS[session]) return banner('Sesi absensi tidak dikenal. Gunakan MORNING atau AFTERNOON.', 'error');
  const recent = (await cacheGet(recentKey(session)))?.value || [];
  return `<div class="grid-2">
    ${card('Pilih Siswa (Fallback Manual)', `<p class="muted">Cari berdasarkan nama, NIS, atau kelas. Data diambil dari <code>students.list</code> dan di-cache untuk kondisi offline.</p>
      <form id="attendance-manual-form" novalidate>
        ${field({ name: 'search', label: 'Cari siswa', placeholder: 'Nama / NIS / kelas', help: 'Pilih siswa dari hasil pencarian sebelum mengirim.' })}
        <input type="hidden" name="studentId" value="">
        <div id="student-options" class="student-options">${emptyState('Memuat daftar siswa…')}</div>
        ${field({ name: 'note', label: 'Catatan (opsional)', type: 'textarea', rows: 2 })}
        <button type="submit" class="btn btn-primary btn-block" disabled id="manual-submit">Catat Kehadiran</button>
      </form>
      <p class="muted">Atau gunakan <a href="#/scan/${session}">pemindai barcode</a> untuk scan token.</p>`, { actions: `<a class="btn btn-sm btn-primary" href="#/scan/${session}">Buka Scanner</a>` })}
    ${card('Hasil Pemindaian', `<div id="attendance-result">${emptyState('Belum ada hasil. Pindai barcode atau pilih siswa manual.')}</div>`)}
  </div>
  ${card('Riwayat Lokal Sesi Ini', recentTable(recent))}`;
}

export async function mount(ctx) {
  const session = String(ctx.params.session || 'MORNING').toUpperCase();
  const form = qs('#attendance-manual-form');
  if (!form) return;
  const options = qs('#student-options');
  const submitButton = qs('#manual-submit');
  const students = await loadStudents();
  const renderOptions = (query) => {
    const list = searchStudents(students, query, 30);
    setHtml(options, list.length
      ? `<div class="option-list">${list.map((student) => `<button type="button" class="option-item" data-student-id="${escapeHtml(student.id)}"><strong>${escapeHtml(student.name)}</strong><small>${escapeHtml(student.className || '')} · ${escapeHtml(student.nis || '')}</small></button>`).join('')}</div>`
      : emptyState('Siswa tidak ditemukan.', 'Coba kata kunci lain.'));
  };
  renderOptions('');
  const search = qs('[name="search"]', form);
  search?.addEventListener('input', () => renderOptions(search.value));
  options?.addEventListener('click', (event) => {
    const buttonEl = event.target.closest('[data-student-id]');
    if (!buttonEl) return;
    form.elements.namedItem('studentId').value = buttonEl.dataset.studentId;
    qsa('.option-item', options).forEach((node) => node.classList.toggle('selected', node === buttonEl));
    if (submitButton) submitButton.disabled = false;
  });
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const studentId = fieldValue(form, 'studentId');
    if (!studentId) { ctx.toast('Pilih siswa terlebih dahulu.', 'warning'); return; }
    if (submitButton) submitButton.disabled = true;
    await submitManual(ctx, session, studentId, qs('#attendance-result'), { note: fieldValue(form, 'note') });
    if (submitButton) submitButton.disabled = false;
  });
}

export default { render, mount, handleScan, submitManual, loadStudents, lookupStudent, sessionLabel };
