/** Pergerakan siswa: keluar, kembali, pulang awal + daftar & durasi. */

import { api } from '../services/api.js';
import { enqueue, uuidv4 } from '../services/outbox.js';
import { banner, button, card, dateField, emptyState, field, selectField, statusPill, table, textareaField } from '../components/ui.js';
import { escapeHtml, fieldValue, qs, setHtml, showFieldErrors } from '../utils/dom.js';
import { statusLabel, durationLabel, todayJakarta } from '../utils/format.js';
import { loadStudents } from './attendance.js';

const TABS = [
  { mode: 'out', label: 'Siswa Keluar', href: '#/movement/out' },
  { mode: 'return', label: 'Siswa Kembali', href: '#/movement/return' },
  { mode: 'early', label: 'Pulang Awal', href: '#/movement/early' }
];

function modeOf(raw) {
  const mode = String(raw || 'out').toLowerCase();
  return ['out', 'return', 'early'].includes(mode) ? mode : 'out';
}

async function loadClasses() {
  try {
    const data = await api.call('classes.list', {});
    return Array.isArray(data) ? data : (data?.items || []);
  } catch { return []; }
}

function formFor(mode, students) {
  const studentSelect = selectField({ name: 'studentId', label: 'Siswa', required: true, placeholder: '-- Pilih siswa --', options: students.map((student) => ({ value: student.id, label: `${student.name} · ${student.className || ''}` })) });
  if (mode === 'return') {
    return `<p class="muted">Pindai barcode pada <a href="#/scan/RETURN">halaman scanner</a> atau isi manual di bawah. Sistem menutup movement OPEN terakhir.</p>
      <div class="form-row">
        ${field({ name: 'tokenId', label: 'Token Barcode (opsional)', placeholder: 'BC-…' })}
        ${studentSelect}
      </div>`;
  }
  if (mode === 'early') {
    return `<div class="form-row">${studentSelect}${field({ name: 'reason', label: 'Alasan pulang awal', required: true, placeholder: 'Contoh: sakit, acara keluarga' })}</div>
      ${field({ name: 'grantedBy', label: 'Petugas pemberi izin', required: true })}
      ${textareaField({ name: 'note', label: 'Catatan (opsional)', rows: 2 })}`;
  }
  return `<div class="form-row">${studentSelect}${field({ name: 'purpose', label: 'Tujuan / keperluan', required: true, placeholder: 'Contoh: ke perpustakaan' })}</div>
    <div class="form-row">
      ${field({ name: 'grantedBy', label: 'Petugas pemberi izin', required: true })}
      ${field({ name: 'estimateReturnAt', label: 'Estimasi kembali', type: 'datetime-local' })}
    </div>
    ${textareaField({ name: 'note', label: 'Catatan (opsional)', rows: 2 })}`;
}

function listHtml(items = []) {
  return table([
    { key: 'date', label: 'Tanggal', render: (row) => escapeHtml(row.date || '—') },
    { key: 'student', label: 'Siswa', render: (row) => escapeHtml(row.studentName || row.student?.name || '—') },
    { key: 'type', label: 'Jenis', render: (row) => escapeHtml(statusLabel(row.type)) },
    { key: 'outAt', label: 'Keluar', render: (row) => escapeHtml(row.outAt ? new Date(row.outAt).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) : '—') },
    { key: 'returnAt', label: 'Kembali', render: (row) => escapeHtml(row.returnAt ? new Date(row.returnAt).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) : '—') },
    { key: 'duration', label: 'Durasi', render: (row) => escapeHtml(row.durationMinutes ? durationLabel(row.durationMinutes) : '—') },
    { key: 'status', label: 'Status', render: (row) => statusPill(row.movementStatus || row.status) }
  ], items, { empty: 'Belum ada pergerakan siswa.' });
}

export async function render(ctx) {
  const mode = modeOf(ctx.params.mode);
  const students = await loadStudents();
  const classes = await loadClasses();
  const stale = (ctx.me?.data?.notificationsUnread || 0) > 0 ? '' : '';
  void stale;
  return `<div class="tabs">${TABS.map((tab) => `<a class="${tab.mode === mode ? 'active' : ''}" href="${tab.href}">${tab.label}</a>`).join('')}</div>
    <div class="grid-2">
      ${card(TABS.find((tab) => tab.mode === mode).label, `<form id="movement-form" novalidate>
        ${formFor(mode, students)}
        <input type="hidden" name="mode" value="${mode}">
        <div id="movement-form-error"></div>
        <button class="btn btn-primary btn-block" type="submit">Catat Pergerakan</button>
      </form>`)}
      ${card('Daftar Pergerakan', `<form id="movement-filter" class="filter-bar" novalidate>
        <div class="form-row">
          ${dateField({ name: 'date', label: 'Tanggal', value: todayJakarta() })}
          ${selectField({ name: 'classId', label: 'Kelas', value: '', options: [{ value: '', label: 'Semua kelas' }, ...classes.map((item) => ({ value: item.id, label: item.name }))] })}
          ${selectField({ name: 'status', label: 'Status', value: '', options: [{ value: '', label: 'Semua' }, { value: 'OPEN', label: 'Belum kembali' }, { value: 'CLOSED', label: 'Sudah kembali' }] })}
          <button type="submit" class="btn btn-secondary">Filter</button>
        </div>
      </form>
      <div id="movement-list">${emptyState('Memuat pergerakan…')}</div>`, { actions: button('Muat Ulang', { action: 'refresh', variant: 'ghost', size: 'sm' }) })}
    </div>`;
}

function buildPayload(mode, values, fullName) {
  if (mode === 'out') {
    return {
      studentId: values.studentId, purpose: values.purpose, grantedBy: values.grantedBy || fullName || '',
      estimateReturnAt: values.estimateReturnAt || undefined, note: values.note || '', idempotencyKey: uuidv4()
    };
  }
  if (mode === 'early') {
    return { studentId: values.studentId, reason: values.reason, grantedBy: values.grantedBy || fullName || '', note: values.note || '', idempotencyKey: uuidv4() };
  }
  return {
    ...(values.tokenId ? { tokenId: values.tokenId } : { studentId: values.studentId }),
    idempotencyKey: uuidv4()
  };
}

export async function mount(ctx) {
  const mode = modeOf(ctx.params.mode);
  const actionName = mode === 'out' ? 'movement.out' : (mode === 'early' ? 'movement.earlyLeave' : 'movement.return');
  const listBox = qs('#movement-list');
  const reload = async (filters = {}) => {
    try {
      const payload = {};
      ['date', 'classId', 'status'].forEach((key) => { if (String(filters[key] || '').trim()) payload[key] = filters[key]; });
      const data = await api.call('movement.list', payload);
      const items = Array.isArray(data) ? data : (data?.items || []);
      const warning = items.filter((item) => ['OPEN', 'PENDING'].includes(String(item.movementStatus || item.status))).length;
      setHtml(listBox, `${warning ? banner(`${warning} siswa belum kembali. Segera tindak lanjuti.`, 'warning') : ''}${listHtml(items)}`);
    } catch (error) { setHtml(listBox, banner(error?.message || 'Gagal memuat data.', 'error')); }
  };
  await reload({ date: todayJakarta() });

  qs('#movement-filter')?.addEventListener('submit', (event) => {
    event.preventDefault();
    reload(Object.fromEntries(new FormData(event.currentTarget).entries()));
  });

  qs('#movement-form')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const values = Object.fromEntries(new FormData(form).entries());
    showFieldErrors(form, {});
    const errors = {};
    if (mode !== 'return' && !values.studentId) errors.studentId = 'Pilih siswa.';
    if (mode === 'out' && !String(values.purpose || '').trim()) errors.purpose = 'Tujuan wajib diisi.';
    if (mode === 'early' && !String(values.reason || '').trim()) errors.reason = 'Alasan wajib diisi.';
    if (mode === 'return' && !values.studentId && !values.tokenId) errors.studentId = 'Isi token barcode atau pilih siswa.';
    if (Object.keys(errors).length) { showFieldErrors(form, errors); return; }
    const payload = buildPayload(mode, values, ctx.user?.fullName);
    const buttonEl = qs('button[type="submit"]', form);
    if (buttonEl) buttonEl.disabled = true;
    try {
      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        await enqueue(actionName, payload, { label: TABS.find((tab) => tab.mode === mode).label, scope: mode });
        setHtml(qs('#movement-form-error'), banner('MENUNGGU SINKRONISASI — pergerakan disimpan di antrean.', 'warning'));
      } else {
        await api.call(actionName, payload);
        ctx.toast('Pergerakan siswa berhasil dicatat.', 'success');
        form.reset();
        setHtml(qs('#movement-form-error'), '');
        await reload({ date: todayJakarta() });
      }
    } catch (error) {
      setHtml(qs('#movement-form-error'), banner(error?.message || 'Gagal mencatat pergerakan.', 'error'));
    } finally {
      if (buttonEl) buttonEl.disabled = false;
    }
  });
}

export default { render, mount };
