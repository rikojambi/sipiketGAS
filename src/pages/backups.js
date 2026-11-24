/** Cadangan: buat, daftar, pulihkan (konfirmasi 2 langkat + phrase RESTORE). */

import { api } from '../services/api.js';
import { banner, button, card, field, table } from '../components/ui.js';
import { escapeHtml, qs, setHtml } from '../utils/dom.js';
import { formatDateTimeJakarta } from '../utils/format.js';

export async function render() {
  return `${card('Buat Cadangan', `<form id="backup-create-form" novalidate>
      ${field({ name: 'reason', label: 'Alasan (opsional)', placeholder: 'mis. sebelum migrasi' })}
      <button class="btn btn-primary" type="submit">Buat Cadangan Sekarang</button>
    </form><div id="backup-create-result"></div>`)}
    ${card('Daftar Cadangan', `<div id="backup-list"><p class="muted">Memuat daftar cadangan…</p></div>`, { actions: button('Muat Ulang', { action: 'refresh', variant: 'ghost', size: 'sm' }) })}`;
}

export async function mount(ctx) {
  const reload = async () => {
    try {
      const data = await api.call('backup.list', {});
      const items = Array.isArray(data) ? data : (data?.items || []);
      setHtml(qs('#backup-list'), table([
        { key: 'fileName', label: 'Nama file', render: (row) => escapeHtml(row.fileName || row.fileId || '—') },
        { key: 'createdAt', label: 'Dibuat', render: (row) => escapeHtml(formatDateTimeJakarta(row.createdAt)) },
        { key: 'reason', label: 'Alasan', render: (row) => escapeHtml(row.reason || '—') },
        { key: 'actions', label: 'Aksi', render: (row) => `<div class="row-actions">
          ${row.url ? `<a class="btn btn-xs btn-ghost" href="${escapeHtml(row.url)}" target="_blank" rel="noopener">Unduh</a>` : ''}
          <button class="btn btn-xs btn-red" data-action="backup-restore" data-file-id="${escapeHtml(row.fileId)}">Pulihkan</button>
        </div>` }
      ], items, { empty: 'Belum ada cadangan.' }));
    } catch (error) {
      setHtml(qs('#backup-list'), banner(error?.message || 'Gagal memuat daftar cadangan.', 'error'));
    }
  };
  await reload();

  qs('#backup-create-form')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const reason = qs('[name="reason"]', event.currentTarget)?.value || '';
    const submit = qs('button[type="submit"]', event.currentTarget);
    if (submit) submit.disabled = true;
    try {
      const result = await api.call('backup.create', { reason });
      setHtml(qs('#backup-create-result'), banner(`Cadangan dibuat: ${result.fileName || result.fileId || 'berhasil'}`, 'success'));
      ctx.toast('Cadangan berhasil dibuat.', 'success');
      await reload();
    } catch (error) {
      setHtml(qs('#backup-create-result'), banner(error?.message || 'Gagal membuat cadangan.', 'error'));
    } finally { if (submit) submit.disabled = false; }
  });

  qs('#backup-list')?.addEventListener('click', async (event) => {
    const buttonEl = event.target.closest('[data-action="backup-restore"]');
    if (!buttonEl) return;
    const first = await ctx.confirm({
      title: 'Pulihkan cadangan (1/2)',
      message: 'Pemulihan akan menimpa data saat ini. Pastikan cadangan lain tersedia. Lanjutkan?',
      confirmLabel: 'Lanjut', danger: true
    });
    if (!first) return;
    const second = await ctx.confirm({
      title: 'Konfirmasi akhir (2/2)',
      message: 'Ketik RESTORE untuk mengonfirmasi pemulihan.',
      confirmLabel: 'Pulihkan', requirePhrase: 'RESTORE', danger: true
    });
    if (!second) return;
    try {
      await api.call('backup.restore', { fileId: buttonEl.dataset.fileId, confirmPhrase: 'RESTORE' });
      ctx.toast('Pemulihan berhasil dimulai.', 'success');
    } catch (error) { ctx.toast(error?.message || 'Pemulihan gagal.', 'error'); }
  });
}

export default { render, mount };
