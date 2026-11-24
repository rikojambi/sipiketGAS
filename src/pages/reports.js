/** Laporan: filter reports.get, tabel, ekspor CSV (BOM), cetak PDF via window.print(). */

import { api } from '../services/api.js';
import { banner, button, card, dateField, downloadCSV, emptyState, selectField, table } from '../components/ui.js';
import { escapeHtml, fieldValue, qs, setHtml } from '../utils/dom.js';
import { todayJakarta } from '../utils/format.js';

const TYPES = [
  ['attendance', 'Absensi'], ['late', 'Keterlambatan'], ['permits', 'Izin'], ['movements', 'Pergerakan'],
  ['kbm', 'Monitoring KBM'], ['duty', 'Jadwal Piket'], ['audit', 'Audit'], ['teacher_activity', 'Aktivitas Guru']
];

function columnsOf(data = {}) {
  const raw = Array.isArray(data.columns) ? data.columns : [];
  return raw.map((column) => (typeof column === 'string'
    ? { key: column, label: column.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (char) => char.toUpperCase()) }
    : { key: column.key || column.label || 'value', label: column.label || column.key || 'Nilai' }));
}

function rowsOf(data = {}) {
  const columns = columnsOf(data);
  const raw = Array.isArray(data.rows) ? data.rows : [];
  return raw.map((row) => {
    if (!Array.isArray(row)) return row;
    return columns.reduce((acc, column, index) => {
      acc[column.key] = row[index];
      return acc;
    }, {});
  });
}

function renderTable(columns, rows) {
  if (!columns.length) return emptyState('Backend belum mengembalikan kolom laporan.');
  return table(columns.map((column) => ({
    key: column.key,
    label: column.label,
    render: (row) => escapeHtml(row[column.key] ?? '—')
  })), rows, { empty: 'Tidak ada data pada filter ini.' });
}

export async function render(ctx) {
  let classes = [];
  try {
    const data = await api.call('classes.list', {});
    classes = Array.isArray(data) ? data : (data?.items || []);
  } catch { classes = []; }
  ctx._reportClasses = classes;
  return `${card('Filter Laporan', `<form id="report-form" novalidate>
      <div class="form-row">
        ${selectField({ name: 'type', label: 'Jenis laporan', value: 'attendance', options: TYPES.map(([value, label]) => ({ value, label })) })}
        ${dateField({ name: 'from', label: 'Dari', value: todayJakarta() })}
        ${dateField({ name: 'to', label: 'Sampai', value: todayJakarta() })}
      </div>
      <div class="form-row">
        ${selectField({ name: 'classId', label: 'Kelas', value: '', options: [{ value: '', label: 'Semua kelas' }, ...classes.map((item) => ({ value: item.id, label: item.name }))] })}
        ${fieldStudent()}
        ${field({ name: 'teacherId', label: 'ID Guru (opsional)', placeholder: 'ID guru' })}
      </div>
      <div class="form-row">
        ${field({ name: 'transactionType', label: 'Jenis transaksi (opsional)', placeholder: 'mis. HADIR / OUT' })}
        <button class="btn btn-primary" type="submit">Tampilkan Laporan</button>
        <button class="btn btn-secondary" type="button" data-action="report-export">Ekspor CSV</button>
        <button class="btn btn-ghost" type="button" data-action="report-print">Cetak / PDF</button>
      </div>
    </form>`)}
    ${card('Hasil Laporan', `<div id="report-result">${emptyState('Pilih filter lalu klik Tampilkan Laporan.')}</div>`)}`;
}

function fieldStudent() {
  return `<div class="form-field"><label for="report-student">ID Siswa (opsional)</label><input id="report-student" type="text" name="studentId" placeholder="ID siswa"><small class="field-help">Isi untuk memfilter satu siswa.</small></div>`;
}

function field(name, extra = {}) {
  return `<div class="form-field"><label for="f-${name}">${escapeHtml(extra.label || name)}</label><input id="f-${name}" name="${name}" type="${extra.type || 'text'}" value="${escapeHtml(extra.value || '')}" placeholder="${escapeHtml(extra.placeholder || '')}"></div>`;
}

function currentFilters(ctx) {
  const form = qs('#report-form');
  const payload = {};
  if (!form) return payload;
  ['type', 'from', 'to', 'classId', 'studentId', 'teacherId', 'transactionType'].forEach((key) => {
    const value = fieldValue(form, key);
    if (String(value || '').trim()) payload[key] = value;
  });
  if (ctx?.user?.role === 'WALI_KELAS' && ctx.user.classId) payload.classId = ctx.user.classId;
  return payload;
}

export async function mount(ctx) {
  let lastData = { columns: [], rows: [], meta: {} };
  const draw = (data) => {
    lastData = data || { columns: [], rows: [], meta: {} };
    const columns = columnsOf(lastData);
    const rows = rowsOf(lastData);
    const meta = lastData.meta || {};
    setHtml(qs('#report-result'), `${meta.generatedAt ? `<p class="muted">Dihasilkan: ${escapeHtml(meta.generatedAt)} · ${rows.length} baris</p>` : ''}${renderTable(columns, rows)}`);
  };

  const load = async () => {
    try {
      const data = await api.call('reports.get', currentFilters(ctx));
      draw(data || {});
    } catch (error) {
      setHtml(qs('#report-result'), banner(error?.message || 'Gagal memuat laporan.', 'error'));
    }
  };

  qs('#report-form')?.addEventListener('submit', (event) => {
    event.preventDefault();
    load();
  });

  qs('[data-action="report-export"]')?.addEventListener('click', () => {
    const columns = columnsOf(lastData);
    const rows = rowsOf(lastData);
    if (!rows.length) { ctx.toast('Tidak ada data untuk diekspor.', 'warning'); return; }
    const csvRows = [columns.map((column) => column.label), ...rows.map((row) => columns.map((column) => row[column.key] ?? ''))];
    downloadCSV(`sipiket-${currentFilters(ctx).type || 'laporan'}-${todayJakarta()}`, csvRows);
  });

  qs('[data-action="report-print"]')?.addEventListener('click', () => {
    if (!rowsOf(lastData).length) { ctx.toast('Tidak ada data untuk dicetak.', 'warning'); return; }
    window.print();
  });
}

export default { render, mount };
