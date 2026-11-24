/** Monitoring KBM + penugasan pengganti. Status guru TIDAK disimpulkan tanpa verificationStatus. */

import { api } from '../services/api.js';
import { enqueue, uuidv4 } from '../services/outbox.js';
import { banner, button, card, dateField, field, selectField, statCard, statusPill, table, textareaField } from '../components/ui.js';
import { escapeHtml, qs, setHtml, showFieldErrors } from '../utils/dom.js';
import { statusLabel, todayJakarta } from '../utils/format.js';

const MONITORING_STATUSES = [
  'KBM_BERJALAN', 'GURU_BELUM_HADIR', 'KELAS_KOSONG', 'GURU_IZIN', 'GURU_SAKIT',
  'GURU_TERLAMBAT', 'DIGANTIKAN', 'TUGAS_MANDIRI'
];
const TASK_TYPES = ['GURU_PENGGANTI', 'GURU_PIKET_LAIN', 'TUGAS_MANDIRI', 'TUGAS_GURU_MAPEL', 'TUGAS_LITERASI_NUMERASI', 'TUGAS_PROYEK'];
const ASSIGNMENT_STATUSES = ['PENDING', 'ONGOING', 'DONE', 'NEED_FOLLOWUP'];

function statusOptions() {
  return MONITORING_STATUSES.map((value) => ({ value, label: statusLabel(value) }));
}

async function loadTeachers() {
  try {
    const data = await api.call('teachers.list', {});
    return Array.isArray(data) ? data : (data?.items || []);
  } catch { return []; }
}

function summaryCards(summary = {}) {
  return `<div class="stat-grid">
    ${statCard({ label: 'Periode Terpantau', value: summary.monitoredPeriods ?? 0, tone: 'navy' })}
    ${statCard({ label: 'Kelas Terpantau', value: summary.checkedClasses ?? summary.monitoredClasses ?? 0, tone: 'green' })}
    ${statCard({ label: 'Kelas Kosong', value: summary.emptyClasses ?? 0, tone: 'red' })}
    ${statCard({ label: 'Guru Terlambat', value: summary.lateTeachers ?? 0, tone: 'amber' })}
    ${statCard({ label: 'Kelas Digantikan', value: summary.substituteClasses ?? 0, tone: 'blue' })}
    ${statCard({ label: 'Tugas Mandiri', value: summary.selfStudyClasses ?? 0, tone: 'blue' })}
    ${statCard({ label: 'Persentase KBM', value: `${summary.kbmPercentage ?? 0}%`, tone: 'green' })}
  </div>`;
}

function monitoringTable(items = []) {
  return table([
    { key: 'class', label: 'Kelas', render: (row) => escapeHtml(row.className || row.class?.name || '—') },
    { key: 'subject', label: 'Mapel', render: (row) => escapeHtml(row.subjectName || row.subject?.name || '—') },
    { key: 'time', label: 'Jam', render: (row) => escapeHtml(row.timeRange || `${row.startMinutes ?? '?'}–${row.endMinutes ?? '?'}`) },
    { key: 'teacher', label: 'Guru', render: (row) => escapeHtml(row.teacherName || row.expectedTeacherName || '—') },
    { key: 'status', label: 'Status KBM', render: (row) => statusPill(row.monitoringStatus || row.status) },
    { key: 'verification', label: 'Verifikasi', render: (row) => statusPill(row.verificationStatus || 'UNVERIFIED') },
    { key: 'note', label: 'Catatan', render: (row) => escapeHtml(row.note || '—') },
    { key: 'actions', label: 'Aksi', render: (row) => `<button class="btn btn-xs btn-secondary" data-action="monitor-edit" data-id="${escapeHtml(row.id || row.scheduleId || '')}">Edit</button>` }
  ], items, { empty: 'Belum ada jadwal KBM untuk tanggal ini.' });
}

function assignmentTable(items = []) {
  return table([
    { key: 'class', label: 'Kelas', render: (row) => escapeHtml(row.className || '—') },
    { key: 'taskType', label: 'Jenis Tugas', render: (row) => escapeHtml(statusLabel(row.taskType)) },
    { key: 'description', label: 'Deskripsi', render: (row) => escapeHtml(row.taskDescription || '—') },
    { key: 'status', label: 'Status', render: (row) => statusPill(row.assignmentStatus || row.status) },
    { key: 'actions', label: 'Aksi', render: (row) => `<select class="inline-select" data-action="assignment-status" data-id="${escapeHtml(row.id)}">${ASSIGNMENT_STATUSES.map((value) => `<option value="${value}" ${String(row.assignmentStatus || row.status) === value ? 'selected' : ''}>${statusLabel(value)}</option>`).join('')}</select>` }
  ], items, { empty: 'Belum ada penugasan pengganti.' });
}

export async function render(ctx) {
  const isSubstitutes = ctx.route === 'substitutes';
  const teachers = await loadTeachers();
  return `<div class="filter-bar card">${dateField({ name: 'date', label: 'Tanggal', value: (ctx.params.date || todayJakarta()), id: 'monitoring-date' })}<button class="btn btn-secondary" data-action="monitoring-reload">Muat Data</button></div>
    <div id="monitoring-summary">${statCard({ label: 'Ringkasan', value: '…', tone: 'navy' })}</div>
    <div class="grid-2">
      ${card('Jadwal & Status KBM', `<div id="monitoring-list">${'<p class="muted">Memuat jadwal…</p>'}</div>`, { actions: button('Muat Ulang', { action: 'refresh', variant: 'ghost', size: 'sm' }) })}
      ${card('Form Verifikasi', `<form id="monitor-form" novalidate>
        ${field({ name: 'scheduleId', label: 'ID Jadwal / Monitoring', required: true, placeholder: 'Klik Edit pada baris jadwal' })}
        ${selectField({ name: 'status', label: 'Status KBM', value: 'KBM_BERJALAN', options: statusOptions() })}
        ${selectField({ name: 'verificationStatus', label: 'Verifikasi', value: 'UNVERIFIED', options: [{ value: 'UNVERIFIED', label: 'Belum Diverifikasi' }, { value: 'VERIFIED', label: 'Terverifikasi' }] })}
        ${textareaField({ name: 'note', label: 'Catatan', rows: 2 })}
        <div id="monitor-form-error"></div>
        <button class="btn btn-primary btn-block" type="submit">Simpan Monitoring</button>
      </form>
      <p class="muted">Status "Guru Belum Hadir" hanya boleh disimpan setelah verifikasi lapangan.</p>`)}
    </div>
    ${card('Penugasan Pengganti', `<form id="substitute-form" novalidate>
      <div class="form-row">
        ${field({ name: 'scheduleId', label: 'ID Jadwal', required: true })}
        ${selectField({ name: 'substituteTeacherId', label: 'Guru Pengganti', value: '', placeholder: '-- Pilih guru --', options: teachers.map((teacher) => ({ value: teacher.id, label: teacher.name })) })}
      </div>
      <div class="form-row">
        ${selectField({ name: 'taskType', label: 'Jenis Penugasan', value: 'GURU_PENGGANTI', options: TASK_TYPES.map((value) => ({ value, label: statusLabel(value) })) })}
        ${field({ name: 'note', label: 'Catatan (opsional)' })}
      </div>
      ${textareaField({ name: 'taskDescription', label: 'Deskripsi Tugas', required: true, rows: 2 })}
      <div id="substitute-form-error"></div>
      <button class="btn btn-primary" type="submit">Simpan Penugasan</button>
    </form>
    <hr><div id="assignment-list">${'<p class="muted">Memuat penugasan…</p>'}</div>`, { class: isSubstitutes ? 'is-substitutes' : '' })}`;
}

export async function mount(ctx) {
  const dateInput = qs('#monitoring-date');
  const reload = async () => {
    const date = dateInput?.value || todayJakarta();
    try {
      const [listData, summaryData, assignmentData] = await Promise.all([
        api.call('monitoring.list', { date }),
        api.call('monitoring.summary', { date }),
        api.call('substitute.list', { date })
      ]);
      const items = Array.isArray(listData) ? listData : (listData?.items || []);
      const assignments = Array.isArray(assignmentData) ? assignmentData : (assignmentData?.items || []);
      setHtml(qs('#monitoring-list'), monitoringTable(items));
      setHtml(qs('#monitoring-summary'), summaryCards(summaryData || {}));
      setHtml(qs('#assignment-list'), assignmentTable(assignments));
    } catch (error) {
      setHtml(qs('#monitoring-list'), banner(error?.message || 'Gagal memuat monitoring.', 'error'));
    }
  };
  await reload();

  qs('[data-action="monitoring-reload"]')?.addEventListener('click', reload);

  qs('#monitoring-list')?.addEventListener('click', (event) => {
    const edit = event.target.closest('[data-action="monitor-edit"]');
    if (!edit) return;
    const form = qs('#monitor-form');
    if (form?.elements?.namedItem('scheduleId')) form.elements.namedItem('scheduleId').value = edit.dataset.id || '';
    form?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  });

  qs('#monitor-form')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const values = Object.fromEntries(new FormData(form).entries());
    showFieldErrors(form, {});
    if (!values.scheduleId) { showFieldErrors(form, { scheduleId: 'Pilih jadwal terlebih dahulu.' }); return; }
    const payload = {
      scheduleId: values.scheduleId,
      status: values.status,
      verificationStatus: values.verificationStatus,
      note: values.note || '',
      idempotencyKey: uuidv4()
    };
    const submit = qs('button[type="submit"]', form);
    if (submit) submit.disabled = true;
    try {
      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        await enqueue('monitoring.save', payload, { label: 'Monitoring KBM', scope: 'KBM' });
        setHtml(qs('#monitor-form-error'), banner('MENUNGGU SINKRONISASI — data disimpan di antrean.', 'warning'));
      } else {
        await api.call('monitoring.save', payload);
        ctx.toast('Monitoring berhasil disimpan.', 'success');
        setHtml(qs('#monitor-form-error'), '');
        await reload();
      }
    } catch (error) {
      setHtml(qs('#monitor-form-error'), banner(error?.message || 'Gagal menyimpan monitoring.', 'error'));
    } finally { if (submit) submit.disabled = false; }
  });

  qs('#substitute-form')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const values = Object.fromEntries(new FormData(form).entries());
    showFieldErrors(form, {});
    const errors = {};
    if (!values.scheduleId) errors.scheduleId = 'ID jadwal wajib diisi.';
    if (!String(values.taskDescription || '').trim()) errors.taskDescription = 'Deskripsi tugas wajib diisi.';
    if (Object.keys(errors).length) { showFieldErrors(form, errors); return; }
    const payload = { ...values, idempotencyKey: uuidv4() };
    try {
      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        await enqueue('substitute.assign', payload, { label: 'Penugasan pengganti', scope: 'KBM' });
        setHtml(qs('#substitute-form-error'), banner('MENUNGGU SINKRONISASI — data disimpan di antrean.', 'warning'));
      } else {
        await api.call('substitute.assign', payload);
        ctx.toast('Penugasan pengganti tersimpan.', 'success');
        setHtml(qs('#substitute-form-error'), '');
        await reload();
      }
    } catch (error) {
      setHtml(qs('#substitute-form-error'), banner(error?.message || 'Gagal menyimpan penugasan.', 'error'));
    }
  });

  qs('#assignment-list')?.addEventListener('change', async (event) => {
    const select = event.target.closest('[data-action="assignment-status"]');
    if (!select) return;
    try {
      await api.call('substitute.update', { id: select.dataset.id, patch: { status: select.value } });
      ctx.toast('Status penugasan diperbarui.', 'success');
    } catch (error) {
      ctx.toast(error?.message || 'Gagal memperbarui status.', 'error');
      await reload();
    }
  });
}

export default { render, mount };
