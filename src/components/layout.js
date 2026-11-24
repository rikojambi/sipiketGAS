/** Shell aplikasi: sidebar desktop, bottom nav mobile, header status & antrean offline. */

import { escapeHtml } from '../utils/dom.js';
import { dayNameJakarta, formatDate } from '../utils/format.js';
import { ROLE_LABELS, ROLES } from '../services/session.js';

const ALL = Object.values(ROLES);

const NAV = [
  { route: '#/dashboard', label: 'Dashboard', icon: '▦', roles: ALL, group: 'utama' },
  { route: '#/scan/MORNING', label: 'Scan Pagi', icon: '▣', roles: [ROLES.GURU_PIKET, ROLES.SUPERADMIN], group: 'utama', quick: true },
  { route: '#/scan/AFTERNOON', label: 'Scan Siang', icon: '▣', roles: [ROLES.GURU_PIKET, ROLES.SUPERADMIN], group: 'utama', quick: true },
  { route: '#/attendance/MORNING', label: 'Absensi', icon: '✓', roles: [ROLES.GURU_PIKET, ROLES.WALI_KELAS, ROLES.SUPERADMIN], group: 'utama' },
  { route: '#/permits', label: 'Izin Siswa', icon: '✎', roles: [ROLES.GURU_PIKET, ROLES.WALI_KELAS, ROLES.KEPALA_SEKOLAH, ROLES.SUPERADMIN], group: 'utama' },
  { route: '#/late', label: 'Keterlambatan', icon: '◷', roles: [ROLES.GURU_PIKET, ROLES.WALI_KELAS, ROLES.SUPERADMIN], group: 'utama' },
  { route: '#/monitoring', label: 'Monitoring KBM', icon: '◫', roles: ALL, group: 'utama' },
  { route: '#/movement/out', label: 'Pergerakan', icon: '↗', roles: [ROLES.GURU_PIKET, ROLES.SUPERADMIN], group: 'utama' },
  { route: '#/students', label: 'Siswa', icon: '♙', roles: [ROLES.WALI_KELAS, ROLES.SUPERADMIN], group: 'data' },
  { route: '#/classes', label: 'Kelas & Mapel', icon: '▤', roles: [ROLES.WALI_KELAS, ROLES.SUPERADMIN], group: 'data' },
  { route: '#/schedules', label: 'Jadwal KBM', icon: '▦', roles: [ROLES.SUPERADMIN, ROLES.KEPALA_SEKOLAH], group: 'data' },
  { route: '#/duty', label: 'Jadwal Piket', icon: '◷', roles: [ROLES.SUPERADMIN, ROLES.KEPALA_SEKOLAH, ROLES.GURU_PIKET], group: 'data' },
  { route: '#/teachers', label: 'Guru', icon: '♟', roles: [ROLES.SUPERADMIN, ROLES.KEPALA_SEKOLAH], group: 'data' },
  { route: '#/users', label: 'Pengguna', icon: '⚙', roles: [ROLES.SUPERADMIN], group: 'data' },
  { route: '#/reports', label: 'Laporan', icon: '▥', roles: ALL, group: 'manajemen' },
  { route: '#/notifications', label: 'Notifikasi', icon: '♢', roles: ALL, group: 'manajemen' },
  { route: '#/audit', label: 'Log Audit', icon: '≡', roles: [ROLES.SUPERADMIN, ROLES.KEPALA_SEKOLAH], group: 'manajemen' },
  { route: '#/backups', label: 'Cadangan', icon: '⤓', roles: [ROLES.SUPERADMIN], group: 'manajemen' },
  { route: '#/settings', label: 'Pengaturan', icon: '⚙', roles: [ROLES.SUPERADMIN], group: 'manajemen' }
];

const MOBILE_NAV = [
  { route: '#/dashboard', label: 'Beranda', icon: '▦' },
  { route: '#/scan/MORNING', label: 'Scan', icon: '▣', roles: [ROLES.GURU_PIKET, ROLES.SUPERADMIN] },
  { route: '#/monitoring', label: 'KBM', icon: '◫' },
  { route: '#/permits', label: 'Izin', icon: '✎', roles: [ROLES.GURU_PIKET, ROLES.WALI_KELAS, ROLES.KEPALA_SEKOLAH, ROLES.SUPERADMIN] },
  { route: '#/notifications', label: 'Info', icon: '♢' }
];

export function navItems(user) {
  return NAV.filter((item) => !item.roles || item.roles.includes(user?.role));
}

function navLink(item, activeHash) {
  const active = activeHash === item.route || (item.route !== '#/dashboard' && activeHash.startsWith(`${item.route}/`));
  return `<a class="nav-link ${active ? 'active' : ''}" href="${item.route}" ${active ? 'aria-current="page"' : ''}>
    <span class="nav-icon" aria-hidden="true">${escapeHtml(item.icon)}</span><span>${escapeHtml(item.label)}</span>
  </a>`;
}

function sidebar(user, activeHash) {
  const groups = [
    ['utama', 'Menu Utama'],
    ['data', 'Data & Jadwal'],
    ['manajemen', 'Manajemen']
  ];
  const items = navItems(user);
  return `<aside class="sidebar" id="sidebar">
    <a class="brand" href="#/dashboard"><span class="brand-mark">S</span><span><strong>SIPIKET</strong><small>Piket & Kehadiran</small></span></a>
    <nav class="side-nav" aria-label="Navigasi utama">
      ${groups.map(([key, title]) => {
        const links = items.filter((item) => item.group === key);
        return links.length ? `<div class="nav-group"><p class="nav-group-title">${title}</p>${links.map((item) => navLink(item, activeHash)).join('')}</div>` : '';
      }).join('')}
    </nav>
    <div class="sidebar-foot"><span>${escapeHtml(ROLE_LABELS[user?.role] || user?.role || 'Pengguna')}</span><button type="button" class="sidebar-logout" data-action="logout">Keluar</button><small>v${escapeHtml(user?.appVersion || '')}</small></div>
  </aside>`;
}

function bottomNav(user, activeHash) {
  const items = MOBILE_NAV.filter((item) => !item.roles || item.roles.includes(user?.role));
  return `<nav class="bottom-nav" aria-label="Navigasi bawah">${items.map((item) => {
    const active = activeHash === item.route || activeHash.startsWith(`${item.route}/`);
    return `<a class="${active ? 'active' : ''}" href="${item.route}" ${active ? 'aria-current="page"' : ''}><span aria-hidden="true">${escapeHtml(item.icon)}</span><small>${escapeHtml(item.label)}</small></a>`;
  }).join('')}</nav>`;
}

function outboxPanel() {
  return `<div class="outbox-panel" id="outbox-panel" hidden>
    <div class="outbox-head"><strong>Antrean Sinkronisasi</strong><button type="button" class="icon-btn" data-action="outbox-toggle" aria-label="Tutup panel">✕</button></div>
    <p class="muted" id="outbox-summary">Memeriksa antrean…</p>
    <div class="outbox-actions">
      <button type="button" class="btn btn-primary btn-sm" data-action="outbox-flush">Sinkronkan Sekarang</button>
      <button type="button" class="btn btn-ghost btn-sm" data-action="outbox-clear-failed">Hapus Gagal</button>
    </div>
    <div id="outbox-list" class="outbox-list"></div>
  </div>`;
}

/**
 * @param {{title:string, subtitle?:string, user:object, settings:object, content:string, activeHash:string, actions?:string}} options
 */
export function renderLayout({ title = 'SIPIKET', subtitle = '', user = {}, settings = {}, content = '', activeHash = '#/dashboard', actions = '' } = {}) {
  const schoolName = settings.schoolName || 'SIPIKET';
  const today = `${dayNameJakarta()}, ${formatDate(new Date().toISOString().slice(0, 10))}`;
  return `<div class="app-shell">
    ${sidebar({ ...user, appVersion: settings.appVersion }, activeHash)}
    <div class="app-main">
      <header class="app-header">
        <button type="button" class="icon-btn menu-toggle" data-action="sidebar-toggle" aria-label="Buka menu">☰</button>
        <div class="header-title"><strong>${escapeHtml(schoolName)}</strong><span>${escapeHtml(today)}</span></div>
        <div class="header-actions">
          <button type="button" class="status-chip" id="connection-chip" data-action="connection-info"><span class="dot"></span><span id="connection-label">Online</span></button>
          <button type="button" class="icon-btn has-badge" data-action="outbox-toggle" aria-label="Antrean sinkronisasi">⇅<span class="badge-count" id="outbox-badge" hidden>0</span></button>
          <button type="button" class="icon-btn has-badge" data-action="go-notifications" aria-label="Notifikasi">♢<span class="badge-count" id="notif-badge" hidden>0</span></button>
          <button type="button" class="icon-btn install-btn" id="install-btn" data-action="install-app" hidden aria-label="Pasang aplikasi">⤓</button>
          <div class="user-chip"><span class="avatar">${escapeHtml((user.fullName || 'U').slice(0, 1).toUpperCase())}</span><span class="user-meta"><strong>${escapeHtml(user.fullName || 'Pengguna')}</strong><small>${escapeHtml(ROLE_LABELS[user.role] || user.role || '')}</small></span></div>
          <button type="button" class="btn btn-ghost btn-sm logout-btn" data-action="logout">Keluar</button>
        </div>
      </header>
      ${outboxPanel()}
      <main class="page-content" id="page-content">
        ${title ? `<div class="page-heading"><div><h1>${escapeHtml(title)}</h1>${subtitle ? `<p>${escapeHtml(subtitle)}</p>` : ''}</div><div>${actions}</div></div>` : ''}
        ${content}
      </main>
      ${bottomNav(user, activeHash)}
    </div>
  </div>`;
}

export function render403() {
  return `<div class="center-message"><div class="big-code">403</div><h2>Akses ditolak</h2><p>Anda tidak memiliki izin untuk membuka halaman ini.</p><a class="btn btn-primary" href="#/dashboard">Kembali ke Dashboard</a></div>`;
}

export function renderNotFound() {
  return `<div class="center-message"><div class="big-code">404</div><h2>Halaman tidak ditemukan</h2><p>Rute yang Anda buka tidak tersedia.</p><a class="btn btn-primary" href="#/dashboard">Kembali ke Dashboard</a></div>`;
}

export const layout = { renderLayout, render403, renderNotFound, navItems, NAV };
