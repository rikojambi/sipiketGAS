/** Pengaturan sekolah (superadmin): SCHOOL_SETTINGS, jam buka menu piket, hari libur, setup. */

import { api } from '../services/api.js';
import { banner, button, card, checkboxField, confirm, dateField, field, numberField, selectField, statusPill, table, textareaField } from '../components/ui.js';
import { escapeHtml, qs, setHtml, showFieldErrors } from '../utils/dom.js';
import { minutesToHHMM } from '../utils/format.js';

const WEEKDAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];

function valuesMap(data = {}) {
  if (data && typeof data === 'object' && data.values && typeof data.values === 'object') return data.values;
  if (Array.isArray(data?.items)) {
    return data.items.reduce((acc, item) => {
      const key = item.settingKey || item.key;
      if (key) acc[key] = item.settingValue ?? item.value;
      return acc;
    }, {});
  }
  return data && typeof data === 'object' ? data : {};
}

function asArray(value, fallback = []) {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : fallback;
    } catch { return fallback; }
  }
  return fallback;
}

function settingForm(values = {}) {
  return `<form id="settings-form" novalidate>
    <div class="form-row">
      ${field({ name: 'schoolName', label: 'Nama sekolah', value: values.schoolName || '', required: true })}
      ${field({ name: 'npsn', label: 'NPSN', value: values.npsn || '' })}
    </div>
    ${field({ name: 'logoUrl', label: 'URL Logo', value: values.logoUrl || '', placeholder: 'https://…' })}
    <div class="form-row">
      ${field({ name: 'academicYear', label: 'Tahun ajaran', value: values.academicYear || '2026/2027' })}
      ${selectField({ name: 'semester', label: 'Semester', value: values.semester || 'Ganjil', options: ['Ganjil', 'Genap'].map((value) => ({ value, label: value })) })}
    </div>
    <h3>Waktu & Jam</h3>
    <div class="form-row">
      ${numberField({ name: 'bellMorningMinutes', label: 'Bel apel pagi (menit)', value: values.bellMorningMinutes ?? 420, help: `420 = ${minutesToHHMM(420)} WIB` })}
      ${numberField({ name: 'bellAfternoonMinutes', label: 'Bel apel siang (menit)', value: values.bellAfternoonMinutes ?? 780, help: `780 = ${minutesToHHMM(780)} WIB` })}
    </div>
    <div class="form-row">
      ${numberField({ name: 'lateLimitMinutes', label: 'Batas terlambat (menit)', value: values.lateLimitMinutes ?? 15 })}
      ${numberField({ name: 'attendanceMorningCloseMinutes', label: 'Tutup absen pagi (menit)', value: values.attendanceMorningCloseMinutes ?? 510 })}
      ${numberField({ name: 'attendanceAfternoonCloseMinutes', label: 'Tutup absen siang (menit)', value: values.attendanceAfternoonCloseMinutes ?? 870 })}
    </div>
    ${numberField({
      name: 'dutyOpenMinutes',
      label: 'Jam buka menu piket',
      value: values.dutyOpenMinutes ?? 360,
      help: `Menit sejak tengah malam WIB. Default 360 = 06.00. Nilai saat ini: ${minutesToHHMM(values.dutyOpenMinutes ?? 360)} WIB. Menu piket akan menolak aksi sebelum jam ini.`
    })}
    <div class="form-field">
      <label>Hari sekolah</label>
      <div class="checkbox-grid">${WEEKDAYS.map((day) => `<label class="check-chip"><input type="checkbox" name="schoolDays" value="${day}" ${asArray(values.schoolDays, ['MON', 'TUE', 'WED', 'THU', 'FRI']).includes(day) ? 'checked' : ''}> ${day}</label>`).join('')}</div>
    </div>
    <h3>Konsekuensi</h3>
    ${textareaField({ name: 'consequenceCategories', label: 'Kategori konsekuensi (JSON)', rows: 4, value: typeof values.consequenceCategories === 'string' ? values.consequenceCategories : JSON.stringify(values.consequenceCategories ?? [{ code: 'PEMBINAAN', label: 'Pembinaan dan pengarahan' }], null, 2) })}
    <div id="settings-error"></div>
    <button class="btn btn-primary" type="submit">Simpan Pengaturan</button>
  </form>`;
}

function holidaysTable(items = []) {
  return table([
    { key: 'date', label: 'Tanggal', render: (row) => escapeHtml(row.date) },
    { key: 'holidayType', label: 'Jenis', render: (row) => escapeHtml(row.holidayType || 'HOLIDAY') },
    { key: 'label', label: 'Keterangan', render: (row) => escapeHtml(row.label || '—') },
    { key: 'active', label: 'Status', render: (row) => statusPill(row.active === false ? 'INACTIVE' : 'ACTIVE') },
    { key: 'actions', label: 'Aksi', render: (row) => `<button class="btn btn-xs btn-red" data-action="holiday-delete" data-id="${escapeHtml(row.id)}">Hapus</button>` }
  ], items, { empty: 'Belum ada hari libur terdaftar.' });
}

export async function render(ctx) {
  let values = {};
  let holidays = [];
  let setup = null;
  try { values = valuesMap(await api.call('settings.list', {})); } catch { values = {}; }
  try {
    const data = await api.call('holidays.list', {});
    holidays = Array.isArray(data) ? data : (data?.items || []);
  } catch { holidays = []; }
  try { setup = await api.call('setup.status', {}); } catch { setup = null; }
  ctx._settingsState = { values, holidays };
  return `${card('Profil Sekolah & Waktu', settingForm(values))}
    <div class="grid-2">
      ${card('Hari Libur', `<form id="holiday-form" class="form-row" novalidate>
        ${dateField({ name: 'date', label: 'Tanggal', required: true })}
        ${field({ name: 'label', label: 'Keterangan', placeholder: 'mis. Libur Idul Fitri' })}
        ${selectField({ name: 'holidayType', label: 'Jenis', value: 'HOLIDAY', options: ['HOLIDAY', 'SPECIAL', 'EVENT'].map((value) => ({ value, label: value })) })}
        <button class="btn btn-secondary" type="submit">Tambah</button>
      </form><div id="holiday-list">${holidaysTable(holidays)}</div>`)}
      ${card('Status Setup Backend', `<dl class="detail-list">
        <dt>Inisialisasi</dt><dd>${setup?.initialized ? statusPill('ACTIVE') : statusPill('PENDING')}</dd>
        <dt>Versi kontrak</dt><dd>${escapeHtml(setup?.version || '—')}</dd>
        <dt>Sheet</dt><dd>${escapeHtml(Array.isArray(setup?.sheets) ? setup.sheets.length : (setup?.sheets ?? '—'))}</dd>
      </dl>
      <div class="row-actions">
        ${button('Setup Database', { action: 'setup-database', variant: 'secondary', size: 'sm' })}
        ${button('Seed Data Contoh', { action: 'setup-seed', variant: 'ghost', size: 'sm' })}
        ${button('Validasi', { action: 'setup-validate', variant: 'ghost', size: 'sm' })}
        ${button('Migrasi', { action: 'setup-migrate', variant: 'ghost', size: 'sm' })}
      </div>
      <div id="setup-result"></div>
      <p class="muted">Data contoh hanya berasal dari aksi <code>setup.seed</code> backend dan akan ditandai sebagai data contoh di laporan.</p>`)}
    </div>`;
}

export async function mount(ctx) {
  const reloadHolidays = async () => {
    try {
      const data = await api.call('holidays.list', {});
      const items = Array.isArray(data) ? data : (data?.items || []);
      setHtml(qs('#holiday-list'), holidaysTable(items));
    } catch (error) { ctx.toast(error?.message || 'Gagal memuat hari libur.', 'error'); }
  };

  qs('#settings-form')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    showFieldErrors(form, {});
    const formData = new FormData(form);
    const values = {
      schoolName: String(formData.get('schoolName') || '').trim(),
      npsn: String(formData.get('npsn') || '').trim(),
      logoUrl: String(formData.get('logoUrl') || '').trim(),
      academicYear: String(formData.get('academicYear') || '').trim(),
      semester: String(formData.get('semester') || 'Ganjil'),
      bellMorningMinutes: Number(formData.get('bellMorningMinutes')),
      bellAfternoonMinutes: Number(formData.get('bellAfternoonMinutes')),
      lateLimitMinutes: Number(formData.get('lateLimitMinutes')),
      attendanceMorningCloseMinutes: Number(formData.get('attendanceMorningCloseMinutes')),
      attendanceAfternoonCloseMinutes: Number(formData.get('attendanceAfternoonCloseMinutes')),
      // Field baru: jam buka menu piket (menit sejak tengah malam WIB).
      dutyOpenMinutes: Number(formData.get('dutyOpenMinutes')),
      schoolDays: formData.getAll('schoolDays'),
      pollIntervalMs: Number(ctx.settings?.pollIntervalMs || 20000)
    };
    const categoriesText = String(formData.get('consequenceCategories') || '');
    try { JSON.parse(categoriesText); } catch {
      showFieldErrors(form, { consequenceCategories: 'JSON konsekuensi tidak valid.' });
      return;
    }
    values.consequenceCategories = categoriesText;
    const numericKeys = ['bellMorningMinutes', 'bellAfternoonMinutes', 'lateLimitMinutes', 'attendanceMorningCloseMinutes', 'attendanceAfternoonCloseMinutes', 'dutyOpenMinutes'];
    const errors = {};
    numericKeys.forEach((key) => { if (!Number.isFinite(values[key]) || values[key] < 0) errors[key] = 'Isi dengan angka menit yang valid.'; });
    if (values.dutyOpenMinutes > 1439) errors.dutyOpenMinutes = 'Jam buka menu piket maksimal 1439 (23.59).';
    if (!values.schoolName) errors.schoolName = 'Nama sekolah wajib diisi.';
    if (Object.keys(errors).length) { showFieldErrors(form, errors); return; }
    const submit = qs('button[type="submit"]', form);
    if (submit) submit.disabled = true;
    try {
      await api.call('settings.save', { values });
      ctx.toast('Pengaturan berhasil disimpan.', 'success');
      ctx.updateSettings({ ...ctx.settings, ...values, schoolName: values.schoolName });
    } catch (error) {
      setHtml(qs('#settings-error'), banner(error?.message || 'Gagal menyimpan pengaturan.', 'error'));
    } finally { if (submit) submit.disabled = false; }
  });

  qs('#holiday-form')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const payload = Object.fromEntries(new FormData(form).entries());
    try {
      await api.call('holidays.create', payload);
      ctx.toast('Hari libur ditambahkan.', 'success');
      form.reset();
      await reloadHolidays();
    } catch (error) { ctx.toast(error?.message || 'Gagal menambah hari libur.', 'error'); }
  });

  qs('#holiday-list')?.addEventListener('click', async (event) => {
    const buttonEl = event.target.closest('[data-action="holiday-delete"]');
    if (!buttonEl) return;
    const ok = await ctx.confirm({ title: 'Hapus hari libur', message: 'Hari libur ini akan dihapus. Lanjutkan?', confirmLabel: 'Ya, hapus', danger: true });
    if (!ok) return;
    try {
      await api.call('holidays.delete', { id: buttonEl.dataset.id });
      ctx.toast('Hari libur dihapus.', 'success');
      await reloadHolidays();
    } catch (error) { ctx.toast(error?.message || 'Gagal menghapus.', 'error'); }
  });

  const setupActions = {
    'setup-database': ['setup.database', {}],
    'setup-seed': ['setup.seed', {}],
    'setup-validate': ['setup.validate', {}],
    'setup-migrate': ['setup.migrate', {}]
  };
  qs('[data-action="setup-database"], [data-action="setup-seed"], [data-action="setup-validate"], [data-action="setup-migrate"]')?.parentElement?.addEventListener('click', async (event) => {
    const buttonEl = event.target.closest('[data-action^="setup-"]');
    if (!buttonEl) return;
    const action = setupActions[buttonEl.dataset.action]?.[0];
    if (!action) return;
    if (action === 'setup.seed') {
      const ok = await ctx.confirm({ title: 'Data contoh', message: 'Data contoh hanya dibuat sekali oleh backend. Lanjutkan?', confirmLabel: 'Ya, buat data contoh' });
      if (!ok) return;
    }
    try {
      const result = await api.call(action, {});
      setHtml(qs('#setup-result'), banner(`${action} berhasil: ${JSON.stringify(result).slice(0, 240)}`, 'success'));
    } catch (error) {
      setHtml(qs('#setup-result'), banner(error?.message || 'Aksi setup gagal.', 'error'));
    }
  });
}

export default { render, mount };
