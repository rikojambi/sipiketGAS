/** Data master: siswa (CRUD, import CSV, barcode), kelas, mapel, jadwal, piket, guru, pengguna. */

import { api } from '../services/api.js';
import { canManagePeople, ROLES } from '../services/session.js';
import { banner, button, card, checkboxField, confirm, field, openModal, selectField, statusPill, table, textareaField } from '../components/ui.js';
import { escapeHtml, fieldValue, qs, qsa, setHtml, showFieldErrors } from '../utils/dom.js';
import { validateStudent } from '../utils/validate.js';
import { statusLabel } from '../utils/format.js';
import { loadStudents } from './attendance.js';

const SECTION_LABELS = {
  students: 'Siswa', classes: 'Kelas', subjects: 'Mata Pelajaran', schedules: 'Jadwal KBM',
  duty: 'Jadwal Piket', teachers: 'Guru', users: 'Pengguna'
};

const ENTITY_CONFIG = {
  classes: {
    list: 'classes.list', create: 'classes.create', update: 'classes.update',
    columns: ['name', 'grade', 'room', 'homeroomTeacherId', 'academicYear'],
    fields: [
      { name: 'name', label: 'Nama kelas', required: true },
      { name: 'grade', label: 'Tingkat', placeholder: 'mis. X' },
      { name: 'room', label: 'Ruang' },
      { name: 'homeroomTeacherId', label: 'ID wali kelas' },
      { name: 'academicYear', label: 'Tahun ajaran', placeholder: '2026/2027' },
      { name: 'active', label: 'Aktif', type: 'checkbox', value: true }
    ]
  },
  subjects: {
    list: 'subjects.list', create: 'subjects.create', update: 'subjects.update',
    columns: ['code', 'name', 'active'],
    fields: [
      { name: 'code', label: 'Kode mapel', required: true },
      { name: 'name', label: 'Nama mapel', required: true },
      { name: 'active', label: 'Aktif', type: 'checkbox', value: true }
    ]
  },
  teachers: {
    list: 'teachers.list', create: 'teachers.create', update: 'teachers.update',
    columns: ['nip', 'name', 'subject', 'email', 'phone'],
    fields: [
      { name: 'nip', label: 'NIP' }, { name: 'name', label: 'Nama guru', required: true },
      { name: 'subject', label: 'Bidang/mapel' }, { name: 'email', label: 'Email', type: 'email' },
      { name: 'phone', label: 'Telepon/WA' }, { name: 'active', label: 'Aktif', type: 'checkbox', value: true }
    ]
  },
  users: {
    list: 'users.list', create: 'users.create', update: 'users.update', deactivate: 'users.deactivate',
    columns: ['username', 'fullName', 'role', 'email', 'teacherId', 'classId', 'active'],
    fields: [
      { name: 'username', label: 'Username', required: true },
      { name: 'password', label: 'Kata sandi (kosongkan saat ubah)', type: 'password' },
      { name: 'fullName', label: 'Nama lengkap', required: true },
      { name: 'role', label: 'Role', type: 'select', options: ['SUPERADMIN', 'KEPALA_SEKOLAH', 'GURU_PIKET', 'GURU_MAPEL', 'WALI_KELAS'].map((value) => ({ value, label: statusLabel(value) })), required: true },
      { name: 'email', label: 'Email', type: 'email' },
      { name: 'teacherId', label: 'ID guru' }, { name: 'classId', label: 'ID kelas (wali kelas)' },
      { name: 'phone', label: 'Telepon/WA' }
    ]
  },
  schedules: {
    list: 'schedules.list', create: 'schedules.save', update: 'schedules.save',
    columns: ['day', 'classId', 'subjectId', 'teacherId', 'startMinutes', 'endMinutes', 'room'],
    fields: [
      { name: 'day', label: 'Hari', type: 'select', options: ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'].map((value) => ({ value, label: value })), required: true },
      { name: 'classId', label: 'ID kelas', required: true }, { name: 'subjectId', label: 'ID mapel', required: true },
      { name: 'teacherId', label: 'ID guru', required: true },
      { name: 'startMinutes', label: 'Mulai (menit)', type: 'number', required: true, help: 'mis. 420 = 07.00' },
      { name: 'endMinutes', label: 'Selesai (menit)', type: 'number', required: true },
      { name: 'room', label: 'Ruang' }, { name: 'active', label: 'Aktif', type: 'checkbox', value: true }
    ]
  },
  duty: {
    list: 'duty.list', create: 'duty.save', update: 'duty.save',
    columns: ['date', 'teacherId', 'role', 'active', 'notes'],
    fields: [
      { name: 'date', label: 'Tanggal', type: 'date', required: true },
      { name: 'teacherId', label: 'ID guru', required: true },
      { name: 'role', label: 'Peran', type: 'select', options: [{ value: 'MAIN', label: 'Utama' }, { value: 'BACKUP', label: 'Cadangan' }], required: true },
      { name: 'active', label: 'Aktif', type: 'checkbox', value: true },
      { name: 'notes', label: 'Catatan', type: 'textarea' }
    ]
  }
};

function sectionOf(ctx) {
  const section = String(ctx.params.section || 'students').toLowerCase();
  return ENTITY_CONFIG[section] ? section : 'students';
}

function nav(section, user) {
  const allowed = Object.keys(SECTION_LABELS).filter((key) => {
    if (key === 'users' || key === 'teachers' || key === 'subjects' || key === 'schedules' || key === 'duty') return canManagePeople(user) || ['teachers', 'schedules', 'duty'].includes(key);
    if (key === 'students' || key === 'classes') return canManagePeople(user) || user?.role === ROLES.WALI_KELAS;
    return true;
  });
  return `<div class="tabs">${allowed.map((key) => `<a class="${key === section ? 'active' : ''}" href="#/people/${key}">${SECTION_LABELS[key]}</a>`).join('')}</div>`;
}

async function fetchEntities(config, user) {
  const payload = {};
  if (config === ENTITY_CONFIG.students && user?.role === ROLES.WALI_KELAS && user.classId) payload.classId = user.classId;
  const data = await api.call(config.list, payload);
  return Array.isArray(data) ? data : (data?.items || []);
}

function genericTable(config, items, section, canWrite = false) {
  const columns = config.columns.map((key) => ({
    key, label: statusLabel(key),
    render: (row) => typeof row[key] === 'boolean' ? statusPill(row[key] ? 'ACTIVE' : 'INACTIVE') : escapeHtml(row[key] ?? '—')
  }));
  if (canWrite) {
    columns.push({
      key: 'actions', label: 'Aksi', render: (row) => `<div class="row-actions">
        <button class="btn btn-xs btn-secondary" data-action="entity-edit" data-id="${escapeHtml(row.id)}">Ubah</button>
        <button class="btn btn-xs btn-ghost" data-action="entity-deactivate" data-id="${escapeHtml(row.id)}">Nonaktifkan</button>
      </div>`
    });
  }
  return table(columns, items, { empty: `Belum ada data ${SECTION_LABELS[section].toLowerCase()}.` });
}

function formHtml(fields, values = {}) {
  return fields.map((item) => {
    const value = values[item.name] ?? item.value ?? '';
    if (item.type === 'select') return selectField({ name: item.name, label: item.label, value, options: item.options, required: item.required, help: item.help });
    if (item.type === 'textarea') return textareaField({ name: item.name, label: item.label, value, rows: 3, required: item.required });
    if (item.type === 'checkbox') return checkboxField({ name: item.name, label: item.label, value: Boolean(value) });
    const type = item.type || 'text';
    return field({ name: item.name, label: item.label, value, type, required: item.required, placeholder: item.placeholder, help: item.help });
  }).join('');
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') { cell += '"'; i += 1; }
      else if (char === '"') quoted = false;
      else cell += char;
    } else if (char === '"') quoted = true;
    else if (char === ',') { row.push(cell); cell = ''; }
    else if (char === '\n') { row.push(cell.replace(/\r$/, '')); rows.push(row); row = []; cell = ''; }
    else cell += char;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  const header = (rows.shift() || []).map((value) => value.trim().toLowerCase());
  return rows.filter((cells) => cells.some((value) => String(value).trim())).map((cells) => {
    const entry = {};
    header.forEach((key, index) => { entry[key] = (cells[index] ?? '').trim(); });
    return entry;
  });
}

function barcodeCard(student, svg) {
  return `<div class="barcode-card">
    <strong>${escapeHtml(student.name || 'Siswa')}</strong>
    <span>${escapeHtml(student.className || student.class?.name || '')} · NIS ${escapeHtml(student.nis || '')}</span>
    <div class="barcode-image">${svg || `<span class="barcode-fallback">${escapeHtml(student.barcodeToken || '')}</span>`}</div>
    <code>${escapeHtml(student.barcodeToken || '')}</code>
  </div>`;
}

async function barcodeSvg(token) {
  if (!token) return '';
  try {
    const { MultiFormatWriter, BarcodeFormat } = await import('@zxing/library');
    const matrix = new MultiFormatWriter().encode(String(token), BarcodeFormat.CODE_128, 240, 60);
    const width = matrix.getWidth();
    const height = matrix.getHeight();
    let rects = '';
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        if (matrix.get(x, y)) rects += `<rect x="${x}" y="${y}" width="1" height="1"/>`;
      }
    }
    return `<svg viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Barcode ${escapeHtml(token)}"><g fill="#0b1f3a">${rects}</g></svg>`;
  } catch {
    return '';
  }
}

function studentsTable(items) {
  return table([
    { key: 'name', label: 'Nama', render: (row) => escapeHtml(row.name) },
    { key: 'nis', label: 'NIS', render: (row) => escapeHtml(row.nis || '—') },
    { key: 'className', label: 'Kelas', render: (row) => escapeHtml(row.className || row.class?.name || '—') },
    { key: 'barcodeToken', label: 'Barcode', render: (row) => `<code>${escapeHtml(row.barcodeToken || '—')}</code>` },
    { key: 'active', label: 'Status', render: (row) => statusPill(row.active === false ? 'INACTIVE' : 'ACTIVE') },
    {
      key: 'actions', label: 'Aksi', render: (row) => `<div class="row-actions">
        <button class="btn btn-xs btn-secondary" data-action="student-edit" data-id="${escapeHtml(row.id)}">Ubah</button>
        <button class="btn btn-xs btn-ghost" data-action="student-barcode" data-id="${escapeHtml(row.id)}">Kartu</button>
        <button class="btn btn-xs btn-ghost" data-action="student-regen" data-id="${escapeHtml(row.id)}">Regenerate</button>
      </div>`
    }
  ], items, { empty: 'Belum ada siswa. Tambahkan manual atau impor CSV.' });
}

export async function render(ctx) {
  const section = sectionOf(ctx);
  if (section === 'students') {
    const students = await loadStudents();
    let classes = [];
    try { classes = await api.call('classes.list', {}).then((data) => Array.isArray(data) ? data : (data?.items || [])); } catch { classes = []; }
    const classOptions = ctx.user?.role === ROLES.WALI_KELAS && ctx.user.classId
      ? classes.filter((item) => item.id === ctx.user.classId)
      : classes;
    const studentFields = [
      { name: 'nis', label: 'NIS', required: true },
      { name: 'nisn', label: 'NISN' },
      { name: 'name', label: 'Nama siswa', required: true },
      { name: 'classId', label: 'Kelas', type: 'select', required: true, placeholder: '-- Pilih kelas --', options: classOptions.map((item) => ({ value: item.id, label: item.name })) },
      { name: 'gender', label: 'Jenis kelamin', type: 'select', options: [{ value: 'M', label: 'Laki-laki' }, { value: 'F', label: 'Perempuan' }] },
      { name: 'birthDate', label: 'Tanggal lahir', type: 'date' },
      { name: 'parentName', label: 'Nama orang tua' },
      { name: 'parentPhone', label: 'Telepon orang tua' },
      { name: 'active', label: 'Aktif', type: 'checkbox', value: true }
    ];
    ctx._studentState = { students, classes, studentFields };
    return `${nav('students', ctx.user)}
      <div class="grid-2">
        ${card('Daftar Siswa', `<div id="student-list">${studentsTable(students)}</div>`, { actions: button('Tambah Siswa', { action: 'student-create', variant: 'primary', size: 'sm' }) })}
        ${card('Impor CSV', `<form id="student-import-form" novalidate>
          <p class="muted">Format header: <code>nis,name,classId,nisn,gender,birthDate</code>. Maksimal 200 baris per panggilan (dipotong otomatis).</p>
          ${field({ name: 'csvFile', label: 'File CSV', type: 'file', attrs: 'accept=".csv,text/csv"' })}
          ${field({ name: 'csvText', label: 'Atau tempel isi CSV', type: 'textarea', rows: 4 })}
          ${checkboxField({ name: 'replace', label: 'Timpa data lama (replace)', value: false })}
          <div id="import-progress" class="progress-box"></div>
          <button class="btn btn-primary" type="submit">Impor Siswa</button>
        </form>`)}
      </div>`;
  }

  const config = ENTITY_CONFIG[section];
  const canWrite = canManagePeople(ctx.user);
  ctx._entityState = { section, config, canWrite, items: [] };
  return `${nav(section, ctx.user)}${card(SECTION_LABELS[section], `<div id="entity-list">${'<p class="muted">Memuat data…</p>'}</div>`, { actions: canWrite ? button('Tambah', { action: 'entity-create', variant: 'primary', size: 'sm' }) : '' })}`;
}

export async function mount(ctx) {
  const section = sectionOf(ctx);

  if (section === 'students') {
    const state = ctx._studentState || {};
    const students = state.students || [];
    const reload = async () => {
      try {
        const fresh = await loadStudents();
        setHtml(qs('#student-list'), studentsTable(fresh));
        state.students = fresh;
      } catch (error) { ctx.toast(error?.message || 'Gagal memuat siswa.', 'error'); }
    };
    const openStudentForm = (student = null) => {
      const modal = openModal({
        title: student ? 'Ubah Siswa' : 'Tambah Siswa',
        body: `<form id="student-form" novalidate>${formHtml(state.studentFields || [], student || {})}<div id="student-form-error"></div></form>`,
        footer: `${button('Batal', { variant: 'ghost', action: 'student-cancel' })}${button('Simpan', { variant: 'primary', action: 'student-save' })}`,
        onMount(root, close) {
          qs('[data-action="student-cancel"]', root)?.addEventListener('click', close);
          qs('[data-action="student-save"]', root)?.addEventListener('click', async () => {
            const form = qs('#student-form', root);
            const values = Object.fromEntries(new FormData(form).entries());
            values.active = Boolean(values.active);
            const validation = validateStudent(values);
            showFieldErrors(form, validation.errors);
            if (!validation.valid) return;
            const payload = student ? { id: student.id, ...values } : values;
            try {
              await api.call(student ? 'students.update' : 'students.create', payload);
              ctx.toast(student ? 'Data siswa diperbarui.' : 'Siswa ditambahkan.', 'success');
              close();
              await reload();
            } catch (error) {
              setHtml(qs('#student-form-error', root), banner(error?.message || 'Gagal menyimpan siswa.', 'error'));
            }
          });
        }
      });
      void modal;
    };
    qs('[data-action="student-create"]')?.addEventListener('click', () => openStudentForm());
    qs('#student-list')?.addEventListener('click', async (event) => {
      const edit = event.target.closest('[data-action="student-edit"]');
      const cardBtn = event.target.closest('[data-action="student-barcode"]');
      const regen = event.target.closest('[data-action="student-regen"]');
      if (edit) {
        const student = students.find((item) => item.id === edit.dataset.id) || (await api.call('students.get', { id: edit.dataset.id })).student;
        openStudentForm(student);
      }
      if (cardBtn) {
        const student = students.find((item) => item.id === cardBtn.dataset.id);
        if (!student) return;
        const svg = await barcodeSvg(student.barcodeToken);
        openModal({
          title: 'Kartu Barcode Siswa',
          body: `<div class="print-area barcode-grid">${[0, 1, 2, 3].map(() => barcodeCard(student, svg)).join('')}</div>`,
          footer: `${button('Tutup', { variant: 'ghost', action: 'barcode-close' })}${button('Cetak', { variant: 'primary', action: 'barcode-print' })}`,
          onMount(root, close) {
            qs('[data-action="barcode-close"]', root)?.addEventListener('click', close);
            qs('[data-action="barcode-print"]', root)?.addEventListener('click', () => window.print());
          }
        });
      }
      if (regen) {
        const ok = await ctx.confirm({ title: 'Regenerate barcode', message: 'Token barcode lama akan berhenti berlaku. Lanjutkan?', confirmLabel: 'Ya, regenerate', danger: true });
        if (!ok) return;
        try {
          await api.call('students.regenerateBarcode', { id: regen.dataset.id });
          ctx.toast('Barcode berhasil diperbarui.', 'success');
          await reload();
        } catch (error) { ctx.toast(error?.message || 'Gagal memperbarui barcode.', 'error'); }
      }
    });

    qs('#student-import-form')?.addEventListener('submit', async (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      const file = form.elements.namedItem('csvFile')?.files?.[0];
      const text = file ? await file.text() : fieldValue(form, 'csvText');
      const rows = parseCsv(text);
      const progress = qs('#import-progress');
      if (!rows.length) { setHtml(progress, banner('Tidak ada baris data yang dapat diimpor.', 'warning')); return; }
      const replace = Boolean(form.elements.namedItem('replace')?.checked);
      const submit = qs('button[type="submit"]', form);
      if (submit) submit.disabled = true;
      let success = 0;
      try {
        for (let i = 0; i < rows.length; i += 200) {
          const chunk = rows.slice(i, i + 200);
          setHtml(progress, banner(`Mengimpor ${Math.min(i + 200, rows.length)} dari ${rows.length} baris…`, 'info'));
          await api.call('students.import', { rows: chunk, replace: replace && i === 0 });
          success += chunk.length;
        }
        setHtml(progress, banner(`Berhasil mengimpor ${success} siswa.`, 'success'));
        await reload();
      } catch (error) {
        setHtml(progress, banner(`Impor berhenti pada baris ${success + 1}: ${error?.message || 'kesalahan tidak diketahui'}`, 'error'));
      } finally { if (submit) submit.disabled = false; }
    });
    return;
  }

  // Entitas generik
  const state = ctx._entityState || {};
  const config = state.config;
  const reload = async () => {
    try {
      const items = await fetchEntities(config, ctx.user);
      state.items = items;
      setHtml(qs('#entity-list'), genericTable(config, items, section, state.canWrite !== false));
    } catch (error) {
      setHtml(qs('#entity-list'), banner(error?.message || 'Gagal memuat data.', 'error'));
    }
  };
  await reload();

  const openEntityForm = (row = null) => {
    const modal = openModal({
      title: row ? `Ubah ${SECTION_LABELS[section]}` : `Tambah ${SECTION_LABELS[section]}`,
      body: `<form id="entity-form" novalidate>${formHtml(config.fields, row || {})}<div id="entity-form-error"></div></form>`,
      footer: `${button('Batal', { variant: 'ghost', action: 'entity-cancel' })}${button('Simpan', { variant: 'primary', action: 'entity-save' })}`,
      onMount(root, close) {
        qs('[data-action="entity-cancel"]', root)?.addEventListener('click', close);
        qs('[data-action="entity-save"]', root)?.addEventListener('click', async () => {
          const form = qs('#entity-form', root);
          const values = Object.fromEntries(new FormData(form).entries());
          config.fields.filter((item) => item.type === 'checkbox').forEach((item) => {
            values[item.name] = Boolean(form.elements.namedItem(item.name)?.checked);
          });
          if (section === 'users' && row && !values.password) delete values.password;
          try {
            if (section === 'users') {
              if (row) await api.call('users.update', { id: row.id, patch: values });
              else await api.call('users.create', values);
            } else if (row) {
              await api.call(config.update, { id: row.id, ...values });
            } else {
              await api.call(config.create, values);
            }
            ctx.toast('Data berhasil disimpan.', 'success');
            close();
            await reload();
          } catch (error) {
            setHtml(qs('#entity-form-error', root), banner(error?.message || 'Gagal menyimpan data.', 'error'));
          }
        });
      }
    });
    void modal;
  };

  qs('[data-action="entity-create"]')?.addEventListener('click', () => openEntityForm());
  qs('#entity-list')?.addEventListener('click', async (event) => {
    const edit = event.target.closest('[data-action="entity-edit"]');
    const deactivate = event.target.closest('[data-action="entity-deactivate"]');
    if (edit) openEntityForm(state.items.find((item) => item.id === edit.dataset.id) || null);
    if (deactivate) {
      const ok = await ctx.confirm({ title: 'Nonaktifkan data', message: 'Data akan ditandai tidak aktif dan tidak dihapus permanen. Lanjutkan?', confirmLabel: 'Ya, nonaktifkan', danger: true });
      if (!ok) return;
      try {
        if (section === 'users') await api.call('users.deactivate', { id: deactivate.dataset.id, reason: 'Dinonaktifkan dari halaman pengguna' });
        else if (config.update === 'schedules.save' || config.update === 'duty.save') await api.call(config.update, { id: deactivate.dataset.id, active: false });
        else await api.call(config.update, { id: deactivate.dataset.id, patch: { status: 'INACTIVE', active: false } });
        ctx.toast('Data dinonaktifkan.', 'success');
        await reload();
      } catch (error) { ctx.toast(error?.message || 'Gagal menonaktifkan.', 'error'); }
    }
  });
}

export default { render, mount, SECTION_LABELS };
