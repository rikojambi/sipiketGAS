/** SIPIKET SPA bootstrap & hash router. */

import './styles/main.css';
import { config } from './config.js';
import { api, ApiError } from './services/api.js';
import { clearSession, getSession, getToken, getUser, updateSession, ROLES } from './services/session.js';
import { outbox, initOutbox, flush, subscribe as subscribeOutbox, getCounts, retry, clearFailed } from './services/outbox.js';
import { polling, startPolling, stopPolling, pollOnce, isPolling, ME_EVENT } from './services/polling.js';
import { renderLayout, render403, renderNotFound } from './components/layout.js';
import { banner, confirm as uiConfirm, toast, openModal, button, card, field } from './components/ui.js';
import { escapeHtml, qs, qsa, setHtml, scrollToTop } from './utils/dom.js';
import { formatDateTimeJakarta, statusLabel } from './utils/format.js';

import * as loginPage from './pages/login.js';
import * as dashboardPage from './pages/dashboard.js';
import * as scannerPage from './pages/scanner.js';
import * as attendancePage from './pages/attendance.js';
import * as permissionsPage from './pages/permissions.js';
import * as movementsPage from './pages/movements.js';
import * as latePage from './pages/late.js';
import * as monitoringPage from './pages/monitoring.js';
import * as peoplePage from './pages/people.js';
import * as reportsPage from './pages/reports.js';
import * as settingsPage from './pages/settings.js';
import * as notificationsPage from './pages/notifications.js';
import * as auditPage from './pages/audit.js';
import * as backupsPage from './pages/backups.js';

const ALL = Object.values(ROLES);
const ROUTE_DEFS = [
  { pattern: /^#\/login$/, page: loginPage, title: 'Masuk', public: true },
  { pattern: /^#\/dashboard$/, page: dashboardPage, title: 'Dashboard', roles: ALL },
  { pattern: /^#\/scan\/([^/]+)$/, page: scannerPage, title: 'Scanner', roles: [ROLES.GURU_PIKET, ROLES.SUPERADMIN], params: ['session'], duty: true },
  { pattern: /^#\/attendance\/([^/]+)$/, page: attendancePage, title: 'Absensi', roles: [ROLES.GURU_PIKET, ROLES.WALI_KELAS, ROLES.SUPERADMIN], params: ['session'], duty: true },
  { pattern: /^#\/attendance$/, page: attendancePage, title: 'Absensi', roles: [ROLES.GURU_PIKET, ROLES.WALI_KELAS, ROLES.SUPERADMIN], params: ['session'], duty: true },
  { pattern: /^#\/late$/, page: latePage, title: 'Keterlambatan', roles: [ROLES.GURU_PIKET, ROLES.WALI_KELAS, ROLES.SUPERADMIN], duty: true },
  { pattern: /^#\/(permits|permissions)$/, page: permissionsPage, title: 'Izin Siswa', roles: [ROLES.GURU_PIKET, ROLES.WALI_KELAS, ROLES.KEPALA_SEKOLAH, ROLES.SUPERADMIN] },
  { pattern: /^#\/movement\/(out|return|early)$/, page: movementsPage, title: 'Pergerakan Siswa', roles: [ROLES.GURU_PIKET, ROLES.SUPERADMIN], params: ['mode'], duty: true },
  { pattern: /^#\/movement$/, page: movementsPage, title: 'Pergerakan Siswa', roles: [ROLES.GURU_PIKET, ROLES.SUPERADMIN], params: ['mode'], duty: true },
  { pattern: /^#\/monitoring$/, page: monitoringPage, title: 'Monitoring KBM', roles: ALL, duty: true },
  { pattern: /^#\/substitutes$/, page: monitoringPage, title: 'Penugasan Pengganti', roles: [ROLES.GURU_PIKET, ROLES.KEPALA_SEKOLAH, ROLES.SUPERADMIN], duty: true },
  { pattern: /^#\/students$/, page: peoplePage, title: 'Data Siswa', roles: [ROLES.WALI_KELAS, ROLES.SUPERADMIN], params: ['section'], defaults: { section: 'students' } },
  { pattern: /^#\/classes$/, page: peoplePage, title: 'Data Kelas', roles: [ROLES.WALI_KELAS, ROLES.SUPERADMIN], params: ['section'], defaults: { section: 'classes' } },
  { pattern: /^#\/subjects$/, page: peoplePage, title: 'Mata Pelajaran', roles: [ROLES.SUPERADMIN], params: ['section'], defaults: { section: 'subjects' } },
  { pattern: /^#\/schedules$/, page: peoplePage, title: 'Jadwal KBM', roles: [ROLES.SUPERADMIN, ROLES.KEPALA_SEKOLAH], params: ['section'], defaults: { section: 'schedules' } },
  { pattern: /^#\/duty$/, page: peoplePage, title: 'Jadwal Piket', roles: [ROLES.SUPERADMIN, ROLES.KEPALA_SEKOLAH, ROLES.GURU_PIKET], params: ['section'], defaults: { section: 'duty' } },
  { pattern: /^#\/teachers$/, page: peoplePage, title: 'Data Guru', roles: [ROLES.SUPERADMIN, ROLES.KEPALA_SEKOLAH], params: ['section'], defaults: { section: 'teachers' } },
  { pattern: /^#\/users$/, page: peoplePage, title: 'Pengguna', roles: [ROLES.SUPERADMIN], params: ['section'], defaults: { section: 'users' } },
  { pattern: /^#\/people\/([^/]+)$/, page: peoplePage, title: 'Data Master', roles: [ROLES.SUPERADMIN, ROLES.WALI_KELAS, ROLES.KEPALA_SEKOLAH, ROLES.GURU_PIKET], params: ['section'] },
  { pattern: /^#\/reports$/, page: reportsPage, title: 'Laporan', roles: ALL },
  { pattern: /^#\/settings$/, page: settingsPage, title: 'Pengaturan', roles: [ROLES.SUPERADMIN] },
  { pattern: /^#\/notifications$/, page: notificationsPage, title: 'Notifikasi', roles: ALL },
  { pattern: /^#\/audit$/, page: auditPage, title: 'Log Audit', roles: [ROLES.SUPERADMIN, ROLES.KEPALA_SEKOLAH] },
  { pattern: /^#\/backups$/, page: backupsPage, title: 'Cadangan', roles: [ROLES.SUPERADMIN] }
];

const root = () => qs('#app');
let cleanups = [];
let currentRouteId = 0;
let currentCtx = null;
let latestMe = null;
let deferredInstallPrompt = null;

function resolveRoute(hash) {
  const clean = (hash || '#/dashboard').split('?')[0];
  for (const definition of ROUTE_DEFS) {
    const match = clean.match(definition.pattern);
    if (!match) continue;
    const params = { ...(definition.defaults || {}) };
    (definition.params || []).forEach((name, index) => { params[name] = match[index + 1] || definition.defaults?.[name] || ''; });
    return { definition, params, hash: clean, key: definition.pattern.source };
  }
  return null;
}

function hasDuty(me) {
  const duty = me?.dutyToday;
  if (typeof duty === 'boolean') return duty;
  if (Array.isArray(duty)) return duty.some((item) => item && item.active !== false && (item.role || item.teacherId));
  if (duty && typeof duty === 'object') {
    return Boolean(duty.active ?? duty.isDuty ?? duty.hasDuty ?? duty.assigned ?? duty.role ?? duty.teacherId);
  }
  return Boolean(me?.onDuty || me?.isDutyToday);
}

function addCleanup(fn) {
  if (typeof fn === 'function') cleanups.push(fn);
}

function runCleanups() {
  cleanups.forEach((fn) => { try { fn(); } catch { /* abaikan */ } });
  cleanups = [];
}

function navigate(hash) {
  if (typeof location === 'undefined') return;
  if (location.hash === hash) route();
  else location.hash = hash;
  scrollToTop();
}

function makeCtx(match) {
  return {
    params: match.params,
    route: match.key,
    hash: match.hash,
    get user() { return getUser() || {}; },
    get settings() { return getSession()?.settings || {}; },
    get me() { return latestMe; },
    api,
    outbox,
    navigate,
    toast,
    confirm: uiConfirm,
    refresh: () => route(),
    onCleanup: addCleanup,
    updateSettings: (patch) => { updateSession({ settings: { ...(getSession()?.settings || {}), ...patch } }); },
    updateHeader: () => updateHeaderIndicators()
  };
}

function renderDutyGate() {
  return `${banner(dashboardPage.DUTY_NO_SCHEDULE_MESSAGE, 'warning')}
    <div class="center-message">${card('Dashboard Personal', `<p>Anda dialihkan ke dashboard personal karena tidak memiliki jadwal piket pada hari ini.</p>
      <a class="btn btn-primary" href="#/dashboard">Buka Dashboard Personal</a>`)}</div>`;
}

async function route() {
  const routeId = ++currentRouteId;
  const hash = typeof location !== 'undefined' ? location.hash || '#/dashboard' : '#/dashboard';
  const match = resolveRoute(hash);
  const user = getUser();

  if (!getToken() || !user) {
    if (hash !== '#/login') navigate('#/login');
    runCleanups();
    setHtml(root(), loginPage.render());
    loginPage.mount(makeCtx({ params: {}, key: 'login', hash: '#/login' }));
    return;
  }
  if (hash === '#/login') { navigate('#/dashboard'); return; }
  if (!isPolling() && !document.hidden) startPolling();
  if (!match) {
    runCleanups();
    setHtml(root(), layoutHtml('Halaman tidak ditemukan', renderNotFound(), hash));
    return;
  }
  const { definition } = match;
  const sectionRoles = {
    students: [ROLES.SUPERADMIN, ROLES.WALI_KELAS],
    classes: [ROLES.SUPERADMIN, ROLES.WALI_KELAS],
    subjects: [ROLES.SUPERADMIN],
    schedules: [ROLES.SUPERADMIN, ROLES.KEPALA_SEKOLAH],
    duty: [ROLES.SUPERADMIN, ROLES.KEPALA_SEKOLAH, ROLES.GURU_PIKET],
    teachers: [ROLES.SUPERADMIN, ROLES.KEPALA_SEKOLAH],
    users: [ROLES.SUPERADMIN]
  };
  const section = match.params?.section;
  const forbiddenBySection = section && sectionRoles[section] && !sectionRoles[section].includes(user.role);
  if (forbiddenBySection || (definition.roles && !definition.roles.includes(user.role))) {
    runCleanups();
    setHtml(root(), layoutHtml('Akses ditolak', render403(), hash));
    return;
  }
  if (definition.duty && user.role === ROLES.GURU_PIKET && latestMe && !hasDuty(latestMe)) {
    runCleanups();
    setHtml(root(), layoutHtml('Jadwal Piket', renderDutyGate(), hash));
    return;
  }

  const ctx = makeCtx(match);
  currentCtx = ctx;
  runCleanups();
  let content;
  try {
    content = await definition.page.render(ctx);
  } catch (error) {
    content = banner(error?.message || 'Halaman gagal dimuat.', 'error');
  }
  if (routeId !== currentRouteId) return;
  setHtml(root(), layoutHtml(definition.title, content, hash));
  try {
    if (typeof definition.page.mount === 'function') await definition.page.mount(ctx);
  } catch (error) {
    toast(error?.message || 'Gagal menyiapkan halaman.', 'error');
  }
}

function layoutHtml(title, content, hash) {
  return renderLayout({
    title,
    subtitle: '',
    user: getUser() || {},
    settings: { ...(getSession()?.settings || {}), appVersion: config.appVersion },
    content,
    activeHash: hash
  });
}

async function refreshMe({ silent = false } = {}) {
  if (!getToken()) return;
  try {
    const me = await api.call('me', {});
    latestMe = me;
    if (me?.user) updateSession({ user: me.user, settings: { ...(getSession()?.settings || {}), ...(me.settings || {}) }, notificationsUnread: me.notificationsUnread ?? 0 });
    updateHeaderIndicators();
  } catch (error) {
    if (error instanceof ApiError && ['UNAUTHORIZED', 'EXPIRED'].includes(error.code)) {
      stopPolling();
      clearSession();
      latestMe = null;
      toast('Sesi berakhir. Silakan masuk kembali.', 'warning');
      navigate('#/login');
    } else if (!silent && error?.code === 'OFFLINE') {
      updateHeaderIndicators();
    }
  }
}

function updateHeaderIndicators() {
  const online = typeof navigator === 'undefined' || navigator.onLine !== false;
  const chip = qs('#connection-chip');
  const label = qs('#connection-label');
  if (label) label.textContent = online ? 'Online' : 'Offline';
  if (chip) chip.classList.toggle('is-offline', !online);
  const counts = getCounts();
  const badge = qs('#outbox-badge');
  if (badge) {
    const total = counts.pending + counts.failed;
    badge.textContent = String(total);
    badge.hidden = total === 0;
    badge.classList.toggle('has-failed', counts.failed > 0);
  }
  const unread = Number(getSession()?.notificationsUnread ?? latestMe?.notificationsUnread ?? 0);
  const notifBadge = qs('#notif-badge');
  if (notifBadge) {
    notifBadge.textContent = String(unread);
    notifBadge.hidden = unread <= 0;
  }
  const summary = qs('#outbox-summary');
  if (summary) summary.textContent = `${counts.pending} menunggu sinkronisasi · ${counts.failed} gagal · ${counts.synced} berhasil`;
  const list = qs('#outbox-list');
  if (list) {
    const items = outbox.getItems();
    setHtml(list, items.length ? items.slice().reverse().map((item) => `<div class="outbox-item">
      <div><strong>${escapeHtml(item.label || item.action)}</strong><small>${escapeHtml(item.createdAt ? formatDateTimeJakarta(item.createdAt) : '')}</small></div>
      <div>${statusPillSafe(item.status)}${item.status === 'FAILED' ? `<button class="btn btn-xs btn-secondary" data-action="outbox-retry" data-id="${escapeHtml(item.id)}">Ulangi</button>` : ''}</div>
      ${item.lastError ? `<small class="error-text">${escapeHtml(item.lastError)}</small>` : ''}
    </div>`).join('') : '<p class="muted">Antrean kosong.</p>');
  }
}

function statusPillSafe(value) {
  return `<span class="badge badge-${value === 'FAILED' ? 'red' : value === 'SYNCED' ? 'green' : 'amber'}">${escapeHtml(statusLabel(value))}</span>`;
}

function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => { /* PWA opsional */ });
  });
  navigator.serviceWorker.addEventListener('message', (event) => {
    if (event?.data?.type === 'SW_UPDATED') {
      toast('Versi baru tersedia. Muat ulang halaman untuk memperbarui.', 'info');
    }
  });
}

async function prefetchStudents() {
  if (!getToken() || !navigator.serviceWorker?.controller) return;
  try {
    const data = await api.call('students.list', { activeOnly: true });
    const students = Array.isArray(data) ? data : (data?.items || []);
    navigator.serviceWorker.controller.postMessage({ type: 'PREFETCH_STUDENTS', students });
  } catch { /* abaikan */ }
}

function registerInstallPrompt() {
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    deferredInstallPrompt = event;
    const buttonEl = qs('#install-btn');
    if (buttonEl) buttonEl.hidden = false;
  });
}

function registerGlobalActions() {
  document.addEventListener('click', async (event) => {
    const target = event.target.closest('[data-action]');
    if (!target) return;
    const action = target.dataset.action;
    switch (action) {
      case 'refresh':
        route();
        break;
      case 'logout': {
        try { await api.call('logout', {}); } catch { /* logout tetap dilakukan lokal */ }
        stopPolling();
        clearSession();
        latestMe = null;
        navigate('#/login');
        break;
      }
      case 'go-notifications':
        navigate('#/notifications');
        break;
      case 'outbox-toggle': {
        const panel = qs('#outbox-panel');
        if (panel) { panel.hidden = !panel.hidden; if (!panel.hidden) updateHeaderIndicators(); }
        break;
      }
      case 'outbox-flush': {
        const results = await flush();
        const failed = results.filter((result) => !result.ok).length;
        toast(failed ? `${failed} transaksi masih tertunda.` : 'Antrean berhasil disinkronkan.', failed ? 'warning' : 'success');
        updateHeaderIndicators();
        break;
      }
      case 'outbox-retry':
        await retry(target.dataset.id);
        toast('Transaksi dimasukkan kembali ke antrean.', 'info');
        updateHeaderIndicators();
        break;
      case 'outbox-clear-failed': {
        const count = await clearFailed();
        toast(count ? `${count} transaksi gagal dihapus.` : 'Tidak ada transaksi gagal.', 'info');
        updateHeaderIndicators();
        break;
      }
      case 'connection-info':
        openModal({
          title: 'Status Koneksi',
          body: `<p>${navigator.onLine === false ? 'Perangkat sedang offline. Transaksi disimpan di antrean dan dikirim otomatis saat online.' : 'Perangkat online. Pastikan URL backend sudah dikonfigurasi dengan benar.'}</p>
            ${config.isConfigured ? '' : banner(config.setupMessage, 'warning')}`,
          footer: button('Tutup', { variant: 'ghost', action: 'modal-close-generic' }),
          onMount(modal, close) { qs('[data-action="modal-close-generic"]', modal)?.addEventListener('click', close); }
        });
        break;
      case 'sidebar-toggle':
        qs('.app-shell')?.classList.toggle('sidebar-open');
        break;
      case 'install-app':
        if (deferredInstallPrompt) {
          deferredInstallPrompt.prompt();
          await deferredInstallPrompt.userChoice;
          deferredInstallPrompt = null;
          if (qs('#install-btn')) qs('#install-btn').hidden = true;
        } else {
          toast('Instal aplikasi lewat menu browser: "Tambahkan ke layar utama".', 'info');
        }
        break;
      default:
        break;
    }
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      const panel = qs('#outbox-panel');
      if (panel) panel.hidden = true;
      qs('.app-shell')?.classList.remove('sidebar-open');
    }
  });
}

async function boot() {
  registerServiceWorker();
  registerInstallPrompt();
  registerGlobalActions();
  await initOutbox();
  subscribeOutbox(() => updateHeaderIndicators());

  window.addEventListener('online', async () => {
    updateHeaderIndicators();
    await flush();
    await refreshMe({ silent: true });
    route();
    prefetchStudents();
  });
  window.addEventListener('offline', () => updateHeaderIndicators());
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stopPolling();
    else if (getToken()) startPolling();
  });
  window.addEventListener(ME_EVENT, (event) => {
    const me = event.detail;
    if (!me) return;
    latestMe = me;
    if (me.notificationUnread !== undefined || me.notificationsUnread !== undefined) {
      updateSession({ notificationsUnread: me.notificationsUnread ?? me.notificationUnread ?? 0 });
    }
    updateHeaderIndicators();
  });
  window.addEventListener('hashchange', route);

  if (!config.isConfigured) {
    toast(config.setupMessage, 'warning', 12000);
  }

  if (getToken()) {
    setHtml(root(), '<div class="boot-screen"><div class="boot-logo">SIPIKET</div><div class="boot-sub">Menyinkronkan sesi…</div></div>');
    await refreshMe({ silent: true });
    startPolling();
    prefetchStudents();
  }
  await route();
  window.setInterval(() => { if (navigator.onLine !== false) flush(); }, 30000);
}

boot().catch((error) => {
  setHtml(root(), `<div class="center-message"><h2>Aplikasi gagal dimuat</h2><p>${escapeHtml(error?.message || 'Kesalahan tidak diketahui')}</p><button class="btn btn-primary" onclick="location.reload()">Muat Ulang</button></div>`);
});

export { route, navigate, refreshMe };
