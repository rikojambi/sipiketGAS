/** Halaman kamera scanner; mendukung mode absensi, keterlambatan, dan kembali. */

import { api, ApiError } from '../services/api.js';
import { scanner as scannerService, searchStudents } from '../services/scanner.js';
import { enqueue, uuidv4 } from '../services/outbox.js';
import { banner, button, card, emptyState } from '../components/ui.js';
import { escapeHtml, qs, qsa, setHtml } from '../utils/dom.js';
import { handleScan, loadStudents, lookupStudent, sessionLabel, submitManual } from './attendance.js';
import { formatDateTimeJakarta } from '../utils/format.js';

function modeOf(raw) {
  const value = String(raw || 'MORNING').toUpperCase();
  return ['MORNING', 'AFTERNOON', 'LATE', 'RETURN'].includes(value) ? value : 'MORNING';
}

function modeTitle(mode) {
  if (mode === 'LATE') return 'Scan Keterlambatan';
  if (mode === 'RETURN') return 'Scan Siswa Kembali';
  return `Scan ${sessionLabel(mode)}`;
}

export function render(ctx) {
  const mode = modeOf(ctx.params.session);
  return `<div class="grid-2 scanner-layout">
    ${card(modeTitle(mode), `<div class="camera-frame">
        <video id="scanner-video" playsinline muted autoplay></video>
        <div class="camera-overlay"><span class="camera-corner tl"></span><span class="camera-corner tr"></span><span class="camera-corner bl"></span><span class="camera-corner br"></span></div>
        <div class="camera-status" id="scanner-status">Kamera belum aktif.</div>
      </div>
      <div class="scanner-controls">
        <button type="button" class="btn btn-primary btn-lg" data-action="scanner-start" id="scanner-start">Nyalakan Kamera</button>
        <button type="button" class="btn btn-ghost btn-lg" data-action="scanner-stop" id="scanner-stop" disabled>Matikan Kamera</button>
      </div>
      <p class="muted">Gunakan kamera belakang dan arahkan ke barcode kartu siswa. Pastikan aplikasi dibuka melalui HTTPS. Duplikasi token dalam 4 detik diabaikan otomatis.</p>
      <div id="scanner-message"></div>`, { class: 'scanner-card' })}
    ${card('Hasil', `<div id="scanner-result">${emptyState('Arahkan kamera ke barcode siswa.')}</div>`, { class: 'scanner-result-card' })}
  </div>
  ${card('Fallback Manual', `<p class="muted">Jika barcode tidak terbaca, cari nama/kelas siswa lalu pilih dari daftar <code>students.list</code>.</p>
    <form id="scanner-manual-form" novalidate>
      <div class="form-row">
        <div class="form-field"><label for="manual-search">Cari siswa</label><input id="manual-search" name="search" type="search" placeholder="Nama atau NIS" autocomplete="off"></div>
        <button class="btn btn-primary" type="submit" id="manual-lookup" disabled>Pilih Siswa</button>
      </div>
      <input type="hidden" name="studentId" value="">
      <div id="scanner-options" class="student-options">${emptyState('Memuat daftar siswa…')}</div>
    </form>`, { actions: `<a class="btn btn-sm btn-ghost" href="#/attendance/${mode === 'LATE' ? 'MORNING' : (mode === 'RETURN' ? 'MORNING' : mode)}">Halaman Absensi</a>` })}`;
}

async function processToken(ctx, mode, token, target, statusEl, studentHint = null) {
  const status = (text, tone = '') => { if (statusEl) statusEl.textContent = text; setHtml(qs('#scanner-message'), tone ? banner(text, tone) : ''); };
  status(`Token terbaca: ${token}. Mengirim ke backend…`);
  if (mode === 'MORNING' || mode === 'AFTERNOON') {
    await handleScan(ctx, mode, token, target);
    status(`Token ${token} diproses.`);
    return;
  }
  const student = studentHint || await lookupStudent(token);
  if (mode === 'RETURN') {
    const body = { tokenId: token, idempotencyKey: uuidv4() };
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      await enqueue('movement.return', body, { label: 'Siswa kembali', scope: 'RETURN' });
      setHtml(target, banner('MENUNGGU SINKRONISASI — kembali siswa disimpan di antrean.', 'warning'));
      return;
    }
    try {
      const data = await api.call('movement.return', body);
      setHtml(target, `<div class="scan-result"><h2>${escapeHtml(student?.name || 'Siswa')}</h2><p>${escapeHtml(student?.className || '')}</p><p>Durasi: <strong>${escapeHtml(data.durationMinutes ?? 0)} menit</strong></p><p>${escapeHtml(data.movement?.movementStatus || 'CLOSED')}</p></div>`);
      status('Siswa berhasil dicatat kembali.', 'success');
    } catch (error) {
      setHtml(target, banner(error?.message || 'Gagal mencatat kepulangan.', 'error'));
      status('Gagal memproses kepulangan.', 'error');
    }
    return;
  }
  // LATE: token barcode -> studentId -> late.record
  if (!student?.id) {
    setHtml(target, banner('Token barcode tidak ditemukan di daftar siswa.', 'warning'));
    return;
  }
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    await enqueue('late.record', { studentId: student.id, idempotencyKey: uuidv4() }, { label: 'Catat keterlambatan', scope: 'LATE' });
    setHtml(target, banner(`MENUNGGU SINKRONISASI — keterlambatan ${escapeHtml(student.name)} disimpan di antrean.`, 'warning'));
    return;
  }
  try {
    const data = await api.call('late.record', { studentId: student.id, idempotencyKey: uuidv4() });
    setHtml(target, `<div class="scan-result"><h2>${escapeHtml(student.name)}</h2><p>${escapeHtml(student.className || '')}</p><p>Terlambat: <strong>${escapeHtml(data.lateRecord?.lateMinutes ?? 0)} menit</strong></p><p>${escapeHtml(formatDateTimeJakarta(data.lateRecord?.arrivalAt || new Date().toISOString()))}</p></div>`);
    status('Keterlambatan tercatat.', 'success');
  } catch (error) {
    setHtml(target, banner(error?.message || 'Gagal mencatat keterlambatan.', 'error'));
    status('Gagal mencatat keterlambatan.', 'error');
  }
}

export async function mount(ctx) {
  const mode = modeOf(ctx.params.session);
  const video = qs('#scanner-video');
  const statusEl = qs('#scanner-status');
  const target = qs('#scanner-result');
  const startButton = qs('#scanner-start');
  const stopButton = qs('#scanner-stop');

  startButton?.addEventListener('click', async () => {
    if (!scannerService.isSecureContextForCamera()) {
      if (statusEl) statusEl.textContent = 'HTTPS diperlukan untuk mengakses kamera.';
      setHtml(qs('#scanner-message'), banner('Buka aplikasi melalui HTTPS agar kamera dapat digunakan.', 'warning'));
      return;
    }
    if (statusEl) statusEl.textContent = 'Meminta izin kamera…';
    const started = await scannerService.start(video, (token) => {
      processToken(ctx, mode, token, target, statusEl);
    }, (error) => {
      if (statusEl) statusEl.textContent = error?.message || 'Kamera gagal dibuka.';
      setHtml(qs('#scanner-message'), banner(error?.message || 'Kamera gagal dibuka.', 'error'));
    });
    if (started) {
      if (statusEl) statusEl.textContent = 'Kamera aktif — arahkan ke barcode siswa.';
      if (startButton) startButton.disabled = true;
      if (stopButton) stopButton.disabled = false;
    } else {
      if (startButton) startButton.disabled = false;
    }
  });

  stopButton?.addEventListener('click', () => {
    scannerService.stop();
    if (statusEl) statusEl.textContent = 'Kamera dimatikan.';
    if (startButton) startButton.disabled = false;
    if (stopButton) stopButton.disabled = true;
  });

  ctx.onCleanup(() => scannerService.stop());

  const form = qs('#scanner-manual-form');
  const options = qs('#scanner-options');
  const students = await loadStudents();
  const renderOptions = (query) => {
    const list = searchStudents(students, query, 30);
    setHtml(options, list.length
      ? `<div class="option-list">${list.map((student) => `<button type="button" class="option-item" data-student-id="${escapeHtml(student.id)}" data-token="${escapeHtml(student.barcodeToken || '')}"><strong>${escapeHtml(student.name)}</strong><small>${escapeHtml(student.className || '')} · ${escapeHtml(student.nis || '')}</small></button>`).join('')}</div>`
      : emptyState('Siswa tidak ditemukan.'));
  };
  renderOptions('');
  const searchInput = qs('[name="search"]', form);
  const pickButton = qs('#manual-lookup');
  searchInput?.addEventListener('input', () => renderOptions(searchInput.value));
  options?.addEventListener('click', (event) => {
    const item = event.target.closest('[data-student-id]');
    if (!item) return;
    form.elements.namedItem('studentId').value = item.dataset.studentId;
    qsa('.option-item', options).forEach((node) => node.classList.toggle('selected', node === item));
    if (pickButton) pickButton.disabled = false;
  });
  form?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const studentId = fieldValue(form, 'studentId');
    const item = qsa('.option-item.selected', options)[0];
    if (!studentId) { ctx.toast('Pilih siswa terlebih dahulu.', 'warning'); return; }
    if (pickButton) pickButton.disabled = true;
    if (mode === 'MORNING' || mode === 'AFTERNOON') {
      await submitManual(ctx, mode, studentId, target);
    } else if (mode === 'RETURN') {
      const body = { studentId, idempotencyKey: uuidv4() };
      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        await enqueue('movement.return', body, { label: 'Siswa kembali', scope: 'RETURN' });
        setHtml(target, banner('MENUNGGU SINKRONISASI — data disimpan di antrean.', 'warning'));
      } else {
        try {
          const data = await api.call('movement.return', body);
          setHtml(target, `<div class="scan-result"><h2>${escapeHtml(item?.querySelector('strong')?.textContent || 'Siswa')}</h2><p>Durasi: ${escapeHtml(data.durationMinutes ?? 0)} menit</p></div>`);
        } catch (error) { setHtml(target, banner(error?.message || 'Gagal mencatat.', 'error')); }
      }
    } else {
      await processToken(ctx, mode, item?.dataset.token || '', target, statusEl, { id: studentId, name: item?.querySelector('strong')?.textContent || 'Siswa' });
    }
    if (pickButton) pickButton.disabled = false;
  });
}

function fieldValue(form, name) {
  const field = form?.elements?.namedItem(name);
  return field ? String(field.value || '') : '';
}

export default { render, mount };
