/** Keterlambatan: catat (scan/manual), consequence, riwayat, rekap. */

import { api } from '../services/api.js';
import { enqueue, uuidv4 } from '../services/outbox.js';
import { banner, button, card, dateField, field, selectField, statCard, statusPill, table, textareaField } from '../components/ui.js';
import { escapeHtml, fieldValue, qs, setHtml, showFieldErrors } from '../utils/dom.js';
import { formatDate, statusLabel, todayJakarta } from '../utils/format.js';
import { loadStudents } from './attendance.js';
import { parseJsonSetting } from '../utils/validate.js';

function categories(settings = {}) {
  const parsed = parseJsonSetting(settings.consequenceCategories, null);
  if (Array.isArray(parsed) && parsed.length) {
    return parsed.map((item) => (typeof item === 'string'
      ? { value: item, label: item.replace(/_/g, ' ') }
      : { value: item.code || item.label, label: item.label || item.code }));
  }
  return [
    { value: 'PEMBINAAN', label: 'Pembinaan dan pengarahan' },
    { value: 'TUGAS', label: 'Tugas tambahan' },
    { value: 'PEMANGGILAN_ORANG_TUA', label: 'Pemanggilan orang tua' }
  ];
}

function historyTable(items = []) {
  return table([
    { key: 'date', label: 'Tanggal', render: (row) => escapeHtml(row.date || '—') },
    { key: 'student', label: 'Siswa', render: (row) => escapeHtml(row.studentName || row.student?.name || '—') },
    { key: 'minutes', label: 'Menit', render: (row) => escapeHtml(row.lateMinutes ?? 0) },
    { key: 'session', label: 'Sesi', render: (row) => escapeHtml(row.session || '—') },
    { key: 'consequence', label: 'Sanksi', render: (row) => statusPill(row.consequenceStatus || 'PENDING') }
  ], items, { empty: 'Belum ada catatan keterlambatan.' });
}

function consequenceTable(items = []) {
  return table([
    { key: 'date', label: 'Tanggal', render: (row) => escapeHtml(row.date || '—') },
    { key: 'student', label: 'Siswa', render: (row) => escapeHtml(row.studentName || '—') },
    { key: 'category', label: 'Kategori', render: (row) => escapeHtml(statusLabel(row.category)) },
    { key: 'description', label: 'Deskripsi', render: (row) => escapeHtml(row.description || '—') },
    { key: 'status', label: 'Status', render: (row) => statusPill(row.consequenceStatus || row.status) }
  ], items, { empty: 'Belum ada sanksi/konsekuensi.' });
}

export async function render(ctx) {
  const students = await loadStudents();
  return `<div class="stat-grid">
      ${statCard({ label: 'Hari Ini', value: formatDate(todayJakarta()), tone: 'navy' })}
      ${statCard({ label: 'Siswa Terdaftar', value: students.length, tone: 'blue' })}
      ${statCard({ label: 'Sumber Status', value: 'Backend', tone: 'green', hint: 'Status akhir ditentukan server (Asia/Jakarta)' })}
    </div>
    <div class="grid-2">
      ${card('Catat Keterlambatan', `<p class="muted">Gunakan <a href="#/scan/LATE">scanner barcode</a> atau isi manual. Waktu dan status final dihitung backend.</p>
        <form id="late-form" novalidate>
          ${dateField({ name: 'date', label: 'Tanggal', value: todayJakarta(), required: true })}
          ${selectField({ name: 'studentId', label: 'Siswa', required: true, placeholder: '-- Pilih siswa --', options: students.map((student) => ({ value: student.id, label: `${student.name} · ${student.className || ''}` })) })}
          <div class="form-row">
            ${field({ name: 'arrivalAt', label: 'Waktu tiba (ISO opsional)', placeholder: '2026-11-24T07:20:00+07:00' })}
            ${field({ name: 'note', label: 'Catatan', placeholder: 'Contoh: terlambat apel pagi' })}
          </div>
          <div id="late-form-error"></div>
          <button class="btn btn-primary btn-block" type="submit">Simpan Keterlambatan</button>
        </form>`)}
      ${card('Buat Konsekuensi', `<form id="consequence-form" novalidate>
        ${field({ name: 'lateRecordId', label: 'ID Catatan Keterlambatan', required: true, placeholder: 'ID dari riwayat / hasil scan' })}
        ${selectField({ name: 'studentId', label: 'Siswa', required: true, placeholder: '-- Pilih siswa --', options: students.map((student) => ({ value: student.id, label: student.name })) })}
        ${selectField({ name: 'category', label: 'Kategori', value: categories(ctx.settings)[0].value, options: categories(ctx.settings) })}
        ${textareaField({ name: 'description', label: 'Deskripsi', required: true, rows: 2 })}
        ${textareaField({ name: 'note', label: 'Catatan (opsional)', rows: 2 })}
        ${selectField({ name: 'status', label: 'Status', value: 'PENDING', options: ['PENDING', 'ONGOING', 'DONE', 'NEED_FOLLOWUP'].map((value) => ({ value, label: statusLabel(value) })) })}
        <div id="consequence-form-error"></div>
        <button class="btn btn-primary btn-block" type="submit">Simpan Konsekuensi</button>
      </form>`)}
    </div>
    ${card('Riwayat Keterlambatan', `<div id="late-list">${emptyStateSafe()}</div>`, { actions: button('Muat Ulang', { action: 'refresh', variant: 'ghost', size: 'sm' }) })}
    ${card('Daftar Konsekuensi', `<div id="consequence-list">${emptyStateSafe()}</div>`)}`;
}

function emptyStateSafe() {
  return '<p class="muted">Memuat data…</p>';
}

function normalizeRows(data = {}) {
  const columns = Array.isArray(data.columns) ? data.columns : [];
  const raw = Array.isArray(data.rows) ? data.rows : [];
  return raw.map((row) => {
    if (!Array.isArray(row)) return row;
    return columns.reduce((acc, column, index) => {
      const key = typeof column === 'string' ? column : (column.key || column.label || `col${index}`);
      acc[key] = row[index];
      return acc;
    }, {});
  });
}

export async function mount(ctx) {
  const reload = async () => {
    try {
      const [lateData, consequenceData] = await Promise.all([
        api.call('reports.get', { type: 'late', from: todayJakarta(), to: todayJakarta() }).catch(() => ({ rows: [] })),
        api.call('consequence.list', {}).catch(() => ({ items: [] }))
      ]);
      setHtml(qs('#late-list'), historyTable(normalizeRows(lateData)));
      setHtml(qs('#consequence-list'), consequenceTable(Array.isArray(consequenceData) ? consequenceData : (consequenceData?.items || [])));
    } catch (error) { ctx.toast(error?.message || 'Gagal memuat riwayat.', 'error'); }
  };
  await reload();

  qs('#late-form')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const values = Object.fromEntries(new FormData(form).entries());
    showFieldErrors(form, {});
    if (!values.studentId) { showFieldErrors(form, { studentId: 'Pilih siswa.' }); return; }
    const payload = { studentId: values.studentId, date: values.date || todayJakarta(), note: values.note || '', idempotencyKey: uuidv4() };
    if (values.arrivalAt) payload.arrivalAt = values.arrivalAt;
    const submit = qs('button[type="submit"]', form);
    if (submit) submit.disabled = true;
    try {
      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        await enqueue('late.record', payload, { label: 'Catat keterlambatan', scope: 'LATE' });
        setHtml(qs('#late-form-error'), banner('MENUNGGU SINKRONISASI — data disimpan di antrean.', 'warning'));
      } else {
        await api.call('late.record', payload);
        ctx.toast('Keterlambatan tercatat.', 'success');
        setHtml(qs('#late-form-error'), '');
        await reload();
      }
    } catch (error) {
      setHtml(qs('#late-form-error'), banner(error?.message || 'Gagal mencatat.', 'error'));
    } finally { if (submit) submit.disabled = false; }
  });

  qs('#consequence-form')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const values = Object.fromEntries(new FormData(form).entries());
    showFieldErrors(form, {});
    const errors = {};
    if (!values.lateRecordId) errors.lateRecordId = 'ID catatan wajib diisi.';
    if (!values.studentId) errors.studentId = 'Pilih siswa.';
    if (!String(values.description || '').trim()) errors.description = 'Deskripsi wajib diisi.';
    if (Object.keys(errors).length) { showFieldErrors(form, errors); return; }
    const submit = qs('button[type="submit"]', form);
    if (submit) submit.disabled = true;
    try {
      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        await enqueue('consequence.create', { ...values, idempotencyKey: uuidv4() }, { label: 'Konsekuensi keterlambatan', scope: 'LATE' });
        setHtml(qs('#consequence-form-error'), banner('MENUNGGU SINKRONISASI — data disimpan di antrean.', 'warning'));
      } else {
        await api.call('consequence.create', { ...values, idempotencyKey: uuidv4() });
        ctx.toast('Konsekuensi berhasil disimpan.', 'success');
        setHtml(qs('#consequence-form-error'), '');
        await reload();
      }
    } catch (error) {
      setHtml(qs('#consequence-form-error'), banner(error?.message || 'Gagal menyimpan konsekuensi.', 'error'));
    } finally { if (submit) submit.disabled = false; }
  });
}

export default { render, mount };
