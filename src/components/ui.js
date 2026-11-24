/** Komponen UI ringan berbasis string HTML + pembantu interaktif. */

import { escapeHtml, qs, qsa } from '../utils/dom.js';
import { statusLabel, toCSV } from '../utils/format.js';

export function card(title, body = '', options = {}) {
  const subtitle = options.subtitle ? `<p class="card-subtitle">${escapeHtml(options.subtitle)}</p>` : '';
  const heading = title ? `<div class="card-head"><div><h2>${escapeHtml(title)}</h2>${subtitle}</div>${options.actions || ''}</div>` : '';
  return `<section class="card ${options.class || ''}" ${options.id ? `id="${escapeHtml(options.id)}"` : ''}>${heading}<div class="card-body">${body}</div></section>`;
}

export function sectionHeader(title, subtitle = '', actions = '') {
  return `<div class="section-header"><div><h1>${escapeHtml(title)}</h1>${subtitle ? `<p>${escapeHtml(subtitle)}</p>` : ''}</div><div class="section-actions">${actions}</div></div>`;
}

export function statCard({ label, value, tone = 'navy', hint = '', href = '', icon = '' }) {
  const inner = `
    <div class="stat-top"><span class="stat-label">${escapeHtml(label)}</span>${icon ? `<span class="stat-icon">${escapeHtml(icon)}</span>` : ''}</div>
    <div class="stat-value">${escapeHtml(value ?? 0)}</div>
    ${hint ? `<div class="stat-hint">${escapeHtml(hint)}</div>` : ''}`;
  return href
    ? `<a class="stat-card tone-${escapeHtml(tone)}" href="${escapeHtml(href)}">${inner}</a>`
    : `<div class="stat-card tone-${escapeHtml(tone)}">${inner}</div>`;
}

export function button(label, options = {}) {
  const variant = options.variant || 'primary';
  const size = options.size || '';
  const attrs = [
    `type="${options.type || 'button'}"`,
    `class="btn btn-${escapeHtml(variant)} ${size ? `btn-${escapeHtml(size)}` : ''} ${options.class || ''}"`,
    options.action ? `data-action="${escapeHtml(options.action)}"` : '',
    options.value !== undefined ? `data-value="${escapeHtml(options.value)}"` : '',
    options.href ? `data-href="${escapeHtml(options.href)}"` : '',
    options.disabled ? 'disabled' : '',
    options.name ? `name="${escapeHtml(options.name)}"` : '',
    options.id ? `id="${escapeHtml(options.id)}"` : '',
    options.title ? `title="${escapeHtml(options.title)}"` : ''
  ].filter(Boolean).join(' ');
  return `<button ${attrs}>${options.href ? '' : ''}${escapeHtml(label)}</button>`;
}

export function linkButton(label, href, variant = 'ghost') {
  return `<a class="btn btn-${escapeHtml(variant)}" href="${escapeHtml(href)}">${escapeHtml(label)}</a>`;
}

export function badge(text, tone = 'neutral') {
  return `<span class="badge badge-${escapeHtml(tone)}">${escapeHtml(text)}</span>`;
}

const TONE_BY_STATUS = {
  HADIR: 'green', APPROVED: 'green', DONE: 'green', VERIFIED: 'green', CLOSED: 'green', KBM_BERJALAN: 'green',
  TERLAMBAT: 'amber', PENDING: 'amber', ONGOING: 'amber', UNVERIFIED: 'amber', NEED_CLARIFICATION: 'amber',
  NEED_FOLLOWUP: 'amber', GURU_TERLAMBAT: 'amber', TUGAS_MANDIRI: 'amber',
  IZIN: 'blue', SAKIT: 'blue', DIGANTIKAN: 'blue', GURU_IZIN: 'blue', GURU_SAKIT: 'blue',
  TANPA_KETERANGAN: 'red', BELUM_HADIR: 'red', REJECTED: 'red', FAILED: 'red', CONFLICT: 'red',
  KELAS_KOSONG: 'red', GURU_BELUM_HADIR: 'red', OPEN: 'red', EXPIRED: 'red', OFFLINE: 'red',
  MENUNGGU_SINKRONISASI: 'amber'
};

export function statusPill(value) {
  const key = String(value ?? '').toUpperCase();
  return badge(statusLabel(value), TONE_BY_STATUS[key] || 'neutral');
}

export function banner(message, tone = 'info', extraClass = '') {
  if (!message) return '';
  return `<div class="banner banner-${escapeHtml(tone)} ${extraClass}" role="status">${escapeHtml(message)}</div>`;
}

export function emptyState(message = 'Belum ada data.', hint = '') {
  return `<div class="empty-state"><div class="empty-icon" aria-hidden="true">◎</div><p>${escapeHtml(message)}</p>${hint ? `<small>${escapeHtml(hint)}</small>` : ''}</div>`;
}

export function loading(label = 'Memuat data…') {
  return `<div class="loading-state" role="status"><span class="spinner" aria-hidden="true"></span><span>${escapeHtml(label)}</span></div>`;
}

export function table(columns = [], rows = [], options = {}) {
  if (!rows.length) return emptyState(options.empty || 'Belum ada data.', options.emptyHint || '');
  const head = columns.map((column) => `<th scope="col">${escapeHtml(column.label || column)}</th>`).join('');
  const body = rows.map((row) => {
    const cells = columns.map((column) => {
      const key = typeof column === 'string' ? column : column.key;
      const raw = Array.isArray(row) ? row[columns.indexOf(column)] : row?.[key];
      const content = typeof column.render === 'function' ? column.render(row, raw) : escapeHtml(raw ?? '—');
      return `<td>${content}</td>`;
    }).join('');
    return `<tr>${cells}</tr>`;
  }).join('');
  return `<div class="table-wrap"><table class="data-table"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`;
}

export function field(options = {}) {
  const { name, label, value = '', type = 'text', required = false, placeholder = '', help = '', options: choices, attrs = '' } = options;
  const id = options.id || `f-${name}`;
  const error = `<small class="field-error" data-error-for="${escapeHtml(name)}"></small>`;
  const labelHtml = label ? `<label for="${escapeHtml(id)}">${escapeHtml(label)}${required ? ' <span class="req">*</span>' : ''}</label>` : '';
  let control;
  if (type === 'select') {
    const list = Array.isArray(choices) ? choices : [];
    control = `<select id="${escapeHtml(id)}" name="${escapeHtml(name)}" ${required ? 'required' : ''} ${attrs}>
      ${options.placeholder ? `<option value="">${escapeHtml(options.placeholder)}</option>` : ''}
      ${list.map((choice) => {
        const item = typeof choice === 'object' ? choice : { value: choice, label: choice };
        return `<option value="${escapeHtml(item.value)}" ${String(value) === String(item.value) ? 'selected' : ''}>${escapeHtml(item.label)}</option>`;
      }).join('')}
    </select>`;
  } else if (type === 'textarea') {
    control = `<textarea id="${escapeHtml(id)}" name="${escapeHtml(name)}" rows="${options.rows || 3}" placeholder="${escapeHtml(placeholder)}" ${required ? 'required' : ''} ${attrs}>${escapeHtml(value)}</textarea>`;
  } else if (type === 'checkbox') {
    control = `<input id="${escapeHtml(id)}" type="checkbox" name="${escapeHtml(name)}" value="1" ${value ? 'checked' : ''} ${attrs}>`;
  } else {
    control = `<input id="${escapeHtml(id)}" type="${escapeHtml(type)}" name="${escapeHtml(name)}" value="${escapeHtml(value)}" placeholder="${escapeHtml(placeholder)}" ${required ? 'required' : ''} ${attrs}>`;
  }
  return `<div class="form-field ${type === 'checkbox' ? 'is-checkbox' : ''}">${labelHtml}${control}${help ? `<small class="field-help">${escapeHtml(help)}</small>` : ''}${error}</div>`;
}

export const textField = (options) => field({ ...options, type: 'text' });
export const numberField = (options) => field({ ...options, type: 'number' });
export const dateField = (options) => field({ ...options, type: 'date' });
export const selectField = (options) => field({ ...options, type: 'select' });
export const textareaField = (options) => field({ ...options, type: 'textarea' });
export const checkboxField = (options) => field({ ...options, type: 'checkbox' });

export function formRow(...fieldsHtml) {
  return `<div class="form-row">${fieldsHtml.join('')}</div>`;
}

function toastRoot() {
  if (typeof document === 'undefined') return null;
  let root = qs('#toast-root');
  if (!root) {
    root = document.createElement('div');
    root.id = 'toast-root';
    root.className = 'toast-root';
    root.setAttribute('aria-live', 'polite');
    document.body.appendChild(root);
  }
  return root;
}

export function toast(message, type = 'info', duration = 4500) {
  const root = toastRoot();
  if (!root) return;
  const node = document.createElement('div');
  node.className = `toast toast-${escapeHtml(type)}`;
  node.textContent = String(message);
  root.appendChild(node);
  const dismiss = () => { if (node.parentNode) node.parentNode.removeChild(node); };
  node.addEventListener('click', dismiss);
  if (typeof window !== 'undefined') window.setTimeout(dismiss, duration);
}

export function loadingOverlay(show) {
  if (typeof document === 'undefined') return;
  let overlay = qs('#global-loading');
  if (show && !overlay) {
    overlay = document.createElement('div');
    overlay.id = 'global-loading';
    overlay.className = 'global-loading';
    overlay.innerHTML = loading('Memproses…');
    document.body.appendChild(overlay);
  } else if (!show && overlay && overlay.parentNode) {
    overlay.parentNode.removeChild(overlay);
  }
}

export function openModal({ title = '', body = '', footer = '', onMount = null, size = '' } = {}) {
  if (typeof document === 'undefined') return null;
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  backdrop.innerHTML = `<div class="modal ${size}" role="dialog" aria-modal="true" aria-label="${escapeHtml(title)}">
    <div class="modal-head"><h2>${escapeHtml(title)}</h2><button type="button" class="icon-btn" data-modal-close aria-label="Tutup">✕</button></div>
    <div class="modal-body">${body}</div>${footer ? `<div class="modal-footer">${footer}</div>` : ''}
  </div>`;
  document.body.appendChild(backdrop);
  const close = () => { if (backdrop.parentNode) backdrop.parentNode.removeChild(backdrop); };
  backdrop.addEventListener('click', (event) => {
    if (event.target === backdrop || event.target.closest('[data-modal-close]')) close();
  });
  if (typeof onMount === 'function') onMount(backdrop, close);
  return { element: backdrop, close };
}

export function confirm({ title = 'Konfirmasi', message = '', confirmLabel = 'Ya', cancelLabel = 'Batal', danger = false, requirePhrase = '' } = {}) {
  return new Promise((resolve) => {
    const footer = `${button(cancelLabel, { variant: 'ghost', action: 'modal-cancel' })}${button(confirmLabel, { variant: danger ? 'danger' : 'primary', action: 'modal-confirm', id: 'confirm-ok', disabled: Boolean(requirePhrase) })}`;
    const phraseField = requirePhrase
      ? field({ name: 'confirmPhrase', label: `Ketik <strong>${escapeHtml(requirePhrase)}</strong> untuk melanjutkan`, attrs: 'autocomplete="off"' })
      : '';
    let settled = false;
    const modal = openModal({
      title,
      body: `<p>${escapeHtml(message)}</p>${phraseField}`,
      footer,
      onMount(root, close) {
        const finish = (answer) => {
          if (settled) return;
          settled = true;
          close();
          resolve(answer);
        };
        qsa('[data-action="modal-cancel"]', root).forEach((node) => node.addEventListener('click', () => finish(false)));
        const ok = qs('#confirm-ok', root);
        if (requirePhrase) {
          const input = qs('[name="confirmPhrase"]', root);
          input?.addEventListener('input', () => { if (ok) ok.disabled = input.value.trim() !== requirePhrase; });
        }
        ok?.addEventListener('click', () => {
          if (requirePhrase && qs('[name="confirmPhrase"]', root)?.value.trim() !== requirePhrase) return;
          finish(true);
        });
      }
    });
    if (!modal) resolve(false);
  });
}

/** Unduh CSV dengan BOM agar Excel membaca UTF-8 dengan benar. */
export function downloadCSV(filename, rows) {
  if (typeof document === 'undefined') return;
  const blob = new Blob(['\uFEFF', toCSV(rows)], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = String(filename || 'laporan').replace(/[^\w.-]+/g, '_') + '.csv';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/** Grafik batang CSS tanpa library. charts: { title, items:[{label,value}] }[] */
export function renderCharts(charts = []) {
  const groups = Array.isArray(charts) ? charts.filter((chart) => chart && Array.isArray(chart.items) && chart.items.length) : [];
  if (!groups.length) return emptyState('Grafik belum tersedia.');
  return `<div class="chart-grid">${groups.map((chart) => {
    const items = chart.items.slice(0, 12);
    const max = Math.max(1, ...items.map((item) => Number(item.value) || 0));
    return `<div class="chart-card"><h3>${escapeHtml(chart.title || 'Grafik')}</h3><div class="bar-chart">${items.map((item) => {
      const height = Math.max(2, Math.round(((Number(item.value) || 0) / max) * 100));
      return `<div class="bar-item"><div class="bar-track"><div class="bar" style="height:${height}%"></div><span class="bar-value">${escapeHtml(item.value ?? 0)}</span></div><span class="bar-label">${escapeHtml(item.label ?? '')}</span></div>`;
    }).join('')}</div></div>`;
  }).join('')}</div>`;
}

export function paginationInfo(meta = {}) {
  if (!meta || !meta.total) return '';
  return `<p class="muted">${escapeHtml(meta.total)} data ditemukan${meta.generatedAt ? ` · ${escapeHtml(meta.generatedAt)}` : ''}</p>`;
}

export const ui = {
  card, statCard, button, linkButton, badge, table, field, textField, numberField, dateField,
  selectField, textareaField, checkboxField, formRow, toast, modal: openModal, openModal, confirm,
  emptyState, loading, statusPill, banner, downloadCSV, renderCharts, sectionHeader, loadingOverlay,
  paginationInfo
};
