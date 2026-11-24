/** Notifikasi: daftar, tandai dibaca, tandai semua dibaca. */

import { api } from '../services/api.js';
import { banner, button, card, emptyState, selectField, statusPill, table } from '../components/ui.js';
import { escapeHtml, qs, setHtml } from '../utils/dom.js';
import { formatDateTimeJakarta } from '../utils/format.js';

function listHtml(items = []) {
  return table([
    { key: 'severity', label: 'Prioritas', render: (row) => statusPill(row.severity || 'INFO') },
    { key: 'title', label: 'Judul', render: (row) => escapeHtml(row.title || '—') },
    { key: 'body', label: 'Isi', render: (row) => escapeHtml(row.body || '—') },
    { key: 'date', label: 'Waktu', render: (row) => escapeHtml(formatDateTimeJakarta(row.createdAt || row.date)) },
    { key: 'read', label: 'Status', render: (row) => statusPill(row.read ? 'DONE' : 'PENDING') },
    { key: 'actions', label: 'Aksi', render: (row) => row.read ? '—' : `<button class="btn btn-xs btn-secondary" data-action="notification-read" data-id="${escapeHtml(row.id)}">Tandai dibaca</button>` }
  ], items, { empty: 'Tidak ada notifikasi.' });
}

export async function render() {
  return `${card('Daftar Notifikasi', `<form id="notification-filter" class="filter-bar">
      ${selectField({ name: 'limit', label: 'Jumlah', value: '50', options: [25, 50, 100, 200].map((value) => ({ value, label: `${value} terbaru` })) })}
      <button class="btn btn-secondary" type="submit">Muat</button>
      <button class="btn btn-primary" type="button" data-action="notification-read-all">Tandai Semua Dibaca</button>
    </form>
    <div id="notification-list">${emptyState('Memuat notifikasi…')}</div>`, { actions: button('Muat Ulang', { action: 'refresh', variant: 'ghost', size: 'sm' }) })}`;
}

export async function mount(ctx) {
  const reload = async (limit = 50) => {
    try {
      const data = await api.call('notifications.list', { limit: Number(limit) || 50 });
      const items = Array.isArray(data) ? data : (data?.items || []);
      setHtml(qs('#notification-list'), listHtml(items));
      return items;
    } catch (error) {
      setHtml(qs('#notification-list'), banner(error?.message || 'Gagal memuat notifikasi.', 'error'));
      return [];
    }
  };
  await reload();
  qs('#notification-filter')?.addEventListener('submit', (event) => {
    event.preventDefault();
    reload(qs('[name="limit"]', event.currentTarget)?.value);
  });
  qs('#notification-list')?.addEventListener('click', async (event) => {
    const buttonEl = event.target.closest('[data-action="notification-read"]');
    if (!buttonEl) return;
    try {
      await api.call('notifications.read', { id: buttonEl.dataset.id });
      ctx.toast('Notifikasi ditandai dibaca.', 'success');
      await reload();
      ctx.updateHeader?.();
    } catch (error) { ctx.toast(error?.message || 'Gagal memperbarui notifikasi.', 'error'); }
  });
  qs('[data-action="notification-read-all"]')?.addEventListener('click', async () => {
    const items = await reload();
    const unread = items.filter((item) => !item.read);
    if (!unread.length) { ctx.toast('Semua notifikasi sudah dibaca.', 'info'); return; }
    let failed = 0;
    for (const item of unread) {
      try { await api.call('notifications.read', { id: item.id }); } catch { failed += 1; }
    }
    ctx.toast(failed ? `${failed} notifikasi gagal ditandai.` : 'Semua notifikasi ditandai dibaca.', failed ? 'warning' : 'success');
    await reload();
    ctx.updateHeader?.();
  });
}

export default { render, mount };
