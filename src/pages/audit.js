/** Log audit: filter tanggal, aktor, entitas. */

import { api } from '../services/api.js';
import { banner, card, dateField, field, table } from '../components/ui.js';
import { escapeHtml, fieldValue, qs, setHtml } from '../utils/dom.js';
import { formatDateTimeJakarta } from '../utils/format.js';

export async function render() {
  return card('Log Audit', `<form id="audit-filter" class="filter-bar" novalidate>
      <div class="form-row">
        ${dateField({ name: 'from', label: 'Dari' })}
        ${dateField({ name: 'to', label: 'Sampai' })}
        ${field({ name: 'actorId', label: 'ID Aktor' })}
        ${field({ name: 'entity', label: 'Entitas' })}
        <button class="btn btn-primary" type="submit">Filter</button>
      </div>
    </form>
    <div id="audit-list"><p class="muted">Memuat log…</p></div>`);
}

export async function mount() {
  const reload = async (filters = {}) => {
    try {
      const payload = {};
      ['from', 'to', 'actorId', 'entity'].forEach((key) => { if (String(filters[key] || '').trim()) payload[key] = filters[key]; });
      const data = await api.call('audit.list', payload);
      const items = Array.isArray(data) ? data : (data?.items || []);
      setHtml(qs('#audit-list'), table([
        { key: 'createdAt', label: 'Waktu', render: (row) => escapeHtml(formatDateTimeJakarta(row.createdAt)) },
        { key: 'actorName', label: 'Aktor', render: (row) => escapeHtml(row.actorName || row.actorId || '—') },
        { key: 'action', label: 'Aksi', render: (row) => escapeHtml(row.action || '—') },
        { key: 'entity', label: 'Entitas', render: (row) => escapeHtml(row.entity || '—') },
        { key: 'entityId', label: 'ID Entitas', render: (row) => `<code>${escapeHtml(row.entityId || '—')}</code>` },
        { key: 'reason', label: 'Alasan', render: (row) => escapeHtml(row.reason || '—') },
        { key: 'requestId', label: 'Request ID', render: (row) => `<small>${escapeHtml(row.requestId || '—')}</small>` }
      ], items, { empty: 'Tidak ada log audit pada filter ini.' }));
    } catch (error) {
      setHtml(qs('#audit-list'), banner(error?.message || 'Gagal memuat log audit.', 'error'));
    }
  };
  await reload();
  qs('#audit-filter')?.addEventListener('submit', (event) => {
    event.preventDefault();
    reload(Object.fromEntries(new FormData(event.currentTarget).entries()));
  });
}

export default { render, mount };
