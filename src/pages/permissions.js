/** Izin siswa: create SICK/LEAVE/ABSENT/EARLY_LEAVE, filter, approve/reject. */

import { api } from '../services/api.js';
import { canApprovePermit, ROLES } from '../services/session.js';
import { todayJakarta, formatDate, statusLabel } from '../utils/format.js';
import { banner, button, card, dateField, emptyState, field, selectField, statusPill, table, textareaField } from '../components/ui.js';
import { escapeHtml, fieldValue, qs, setHtml, showFieldErrors } from '../utils/dom.js';
import { isValidDate } from '../utils/validate.js';
import { loadStudents } from './attendance.js';

const TYPES = [
  { value: 'SICK', label: 'Sakit' }, { value: 'LEAVE', label: 'Izin' },
  { value: 'ABSENT', label: 'Tanpa Keterangan' }, { value: 'EARLY_LEAVE', label: 'Pulang Awal' }
];
const STATUSES = [
  { value: '', label: 'Semua status' }, { value: 'PENDING', label: 'Menunggu' },
  { value: 'APPROVED', label: 'Disetujui' }, { value: 'REJECTED', label: 'Ditolak' },
  { value: 'NEED_CLARIFICATION', label: 'Butuh Klarifikasi' }
];

async function loadClasses() {
  try {
    const data = await api.call('classes.list', {});
    return Array.isArray(data) ? data : (data?.items || []);
  } catch { return []; }
}

function listHtml(items = [], canApprove = false) {
  return table([
    { key: 'date', label: 'Tanggal', render: (row) => escapeHtml(row.date || '—') },
    { key: 'studentName', label: 'Siswa', render: (row) => escapeHtml(row.studentName || row.student?.name || '—') },
    { key: 'className', label: 'Kelas', render: (row) => escapeHtml(row.className || row.student?.className || '—') },
    { key: 'type', label: 'Jenis', render: (row) => escapeHtml(statusLabel(row.type)) },
    { key: 'reason', label: 'Alasan', render: (row) => escapeHtml(row.reason || '—') },
    { key: 'approvalStatus', label: 'Status', render: (row) => statusPill(row.approvalStatus || row.status) },
    {
      key: 'actions', label: 'Aksi', render: (row) => canApprove && !['APPROVED', 'REJECTED'].includes(String(row.approvalStatus || row.status))
        ? `<div class="row-actions">
            <button class="btn btn-xs btn-green" data-action="permit-decision" data-value="APPROVED" data-id="${escapeHtml(row.id)}">Setujui</button>
            <button class="btn btn-xs btn-red" data-action="permit-decision" data-value="REJECTED" data-id="${escapeHtml(row.id)}">Tolak</button>
            <button class="btn btn-xs btn-ghost" data-action="permit-decision" data-value="NEED_CLARIFICATION" data-id="${escapeHtml(row.id)}">Klarifikasi</button>
          </div>`
        : '—'
    }
  ], items, { empty: 'Tidak ada pengajuan izin pada filter ini.' });
}

export async function render(ctx) {
  const canApprove = canApprovePermit(ctx.user);
  const canCreate = ctx.user?.role !== ROLES.KEPALA_SEKOLAH;
  const [students, classes] = await Promise.all([loadStudents(), loadClasses()]);
  return `${canCreate ? card('Ajukan Izin Baru', `<form id="permit-form" novalidate>
      <div class="form-row">
        ${dateField({ name: 'date', label: 'Tanggal', value: todayJakarta(), required: true })}
        ${selectField({ name: 'studentId', label: 'Siswa', value: '', required: true, placeholder: '-- Pilih siswa --', options: students.map((student) => ({ value: student.id, label: `${student.name} · ${student.className || ''}` })) })}
      </div>
      <div class="form-row">
        ${selectField({ name: 'type', label: 'Jenis Izin', value: 'SICK', required: true, options: TYPES })}
        ${selectField({ name: 'classId', label: 'Kelas (filter tambahan)', value: ctx.user?.classId || '', options: [{ value: '', label: 'Semua kelas' }, ...classes.map((item) => ({ value: item.id, label: item.name }))] })}
      </div>
      ${field({ name: 'reason', label: 'Alasan', required: true, placeholder: 'Contoh: demam, acara keluarga' })}
      ${textareaField({ name: 'detail', label: 'Keterangan rinci (opsional)', rows: 2 })}
      ${field({ name: 'evidenceUrl', label: 'URL Bukti (opsional)', placeholder: 'https://…' })}
      ${canApprove ? field({ name: 'approve', label: 'Langsung setujui', type: 'checkbox', value: false }) : ''}
      <div id="permit-form-error"></div>
      <button type="submit" class="btn btn-primary">Kirim Pengajuan</button>
    </form>`) : ''}
    ${card('Daftar Pengajuan', `<form id="permit-filter" class="filter-bar" novalidate>
      <div class="form-row">
        ${dateField({ name: 'date', label: 'Tanggal', value: '' })}
        ${dateField({ name: 'from', label: 'Dari', value: '' })}
        ${dateField({ name: 'to', label: 'Sampai', value: '' })}
        ${selectField({ name: 'classId', label: 'Kelas', value: '', options: [{ value: '', label: 'Semua kelas' }, ...classes.map((item) => ({ value: item.id, label: item.name }))] })}
        ${selectField({ name: 'status', label: 'Status', value: '', options: STATUSES })}
        <button type="submit" class="btn btn-secondary">Terapkan</button>
      </div>
    </form>
    <div id="permit-list">${emptyState('Memuat pengajuan…')}</div>`, { actions: button('Muat Ulang', { action: 'refresh', variant: 'ghost', size: 'sm' }) })}`;
}

async function fetchList(filters = {}) {
  const payload = {};
  ['date', 'from', 'to', 'classId', 'studentId', 'status'].forEach((key) => {
    const value = String(filters[key] ?? '').trim();
    if (value) payload[key] = value;
  });
  const data = await api.call('permits.list', payload);
  return Array.isArray(data) ? data : (data?.items || []);
}

export async function mount(ctx) {
  const listBox = qs('#permit-list');
  const canApprove = canApprovePermit(ctx.user);
  const reload = async (filters = {}) => {
    try {
      const items = await fetchList(filters);
      setHtml(listBox, listHtml(items, canApprove));
    } catch (error) {
      setHtml(listBox, banner(error?.message || 'Gagal memuat pengajuan.', 'error'));
    }
  };
  await reload();

  qs('#permit-filter')?.addEventListener('submit', (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    reload(Object.fromEntries(new FormData(form).entries()));
  });

  qs('#permit-form')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const errorBox = qs('#permit-form-error');
    setHtml(errorBox, '');
    showFieldErrors(form, {});
    const payload = Object.fromEntries(new FormData(form).entries());
    const errors = {};
    if (!isValidDate(payload.date)) errors.date = 'Tanggal tidak valid.';
    if (!payload.studentId) errors.studentId = 'Pilih siswa terlebih dahulu.';
    if (!String(payload.reason || '').trim()) errors.reason = 'Alasan wajib diisi.';
    if (Object.keys(errors).length) { showFieldErrors(form, errors); return; }
    delete payload.classId;
    payload.approve = Boolean(payload.approve);
    const submit = qs('button[type="submit"]', form);
    if (submit) submit.disabled = true;
    try {
      await api.call('permits.create', payload);
      form.reset();
      ctx.toast('Pengajuan izin berhasil dikirim.', 'success');
      await reload();
    } catch (error) {
      setHtml(errorBox, banner(error?.message || 'Gagal mengirim pengajuan.', 'error'));
    } finally {
      if (submit) submit.disabled = false;
    }
  });

  listBox?.addEventListener('click', async (event) => {
    const action = event.target.closest('[data-action="permit-decision"]');
    if (!action) return;
    const decision = action.dataset.value;
    if (!ctx.confirm) return;
    const ok = await ctx.confirm({ title: 'Konfirmasi keputusan', message: `Ubah status izin menjadi ${statusLabel(decision)}?`, confirmLabel: 'Ya, lanjutkan' });
    if (!ok) return;
    try {
      await api.call('permits.approve', { id: action.dataset.id, decision });
      ctx.toast(`Izin ${statusLabel(decision).toLowerCase()}.`, 'success');
      await reload();
    } catch (error) { ctx.toast(error?.message || 'Gagal memperbarui izin.', 'error'); }
  });
}

export default { render, mount };
