/** Dashboard role-specific dari `dashboard.get`. */

import { api, ApiError } from '../services/api.js';
import { todayJakarta, statusLabel } from '../utils/format.js';
import { badge, banner, card, emptyState, loading, renderCharts, statCard, statusPill, table, button } from '../components/ui.js';
import { ROLES, ROLE_LABELS } from '../services/session.js';
import { getCounts } from '../services/outbox.js';
import { escapeHtml } from '../utils/dom.js';

export const DUTY_NO_SCHEDULE_MESSAGE = 'Anda tidak memiliki jadwal piket pada hari ini.';

const QUICK = [
  { href: '#/scan/MORNING', label: 'Scan Apel Pagi', icon: '▣', tone: 'navy' },
  { href: '#/scan/AFTERNOON', label: 'Scan Apel Siang', icon: '▣', tone: 'navy' },
  { href: '#/movement/out', label: 'Siswa Keluar', icon: '↗', tone: 'green' },
  { href: '#/movement/return', label: 'Siswa Kembali', icon: '↙', tone: 'green' },
  { href: '#/monitoring', label: 'Monitoring KBM', icon: '◫', tone: 'blue' },
  { href: '#/substitutes', label: 'Penugasan Pengganti', icon: '⇄', tone: 'blue' }
];

function statsGrid(stats = {}) {
  const entries = [
    ['Hadir', stats.present, 'green'], ['Terlambat', stats.late, 'amber'], ['Izin', stats.permit, 'blue'],
    ['Sakit', stats.sick, 'blue'], ['Tanpa Keterangan', stats.absent, 'red'], ['Belum Hadir', stats.notYet ?? stats.notPresent, 'red'],
    ['Di Luar', stats.outside, 'amber'], ['Belum Kembali', stats.notReturned, 'red'], ['Pulang Awal', stats.earlyLeft, 'amber'],
    ['Kelas Terpantau', stats.monitoredClasses ?? stats.kbmMonitored, 'navy'], ['Kelas Kosong', stats.emptyClasses, 'red'],
    ['Total Siswa', stats.totalStudents, 'navy']
  ].filter(([, value]) => value !== undefined && value !== null);
  return `<div class="stat-grid">${entries.map(([label, value, tone]) => statCard({ label, value, tone })).join('')}</div>`;
}

function activityTable(items = []) {
  return table([
    { key: 'time', label: 'Waktu', render: (row) => escapeHtml(row.time || row.createdAt || '—') },
    { key: 'actor', label: 'Petugas', render: (row) => escapeHtml(row.actorName || row.actor || '—') },
    { key: 'action', label: 'Aktivitas', render: (row) => escapeHtml(row.title || row.description || row.action || '—') },
    { key: 'entity', label: 'Subjek', render: (row) => escapeHtml(row.entity || row.studentName || '—') }
  ], items, { empty: 'Belum ada aktivitas terbaru.' });
}

function dutyQuickActions() {
  return `<div class="quick-grid">${QUICK.map((item) => `<a class="quick-card tone-${item.tone}" href="${item.href}"><span class="quick-icon">${item.icon}</span><span>${item.label}</span><span class="quick-arrow">→</span></a>`).join('')}</div>`;
}

function superadminSetup(user) {
  const counts = getCounts();
  return `<div class="stat-grid">
    ${statCard({ label: 'Antrean Pending', value: counts.pending, tone: counts.pending ? 'amber' : 'green', href: '#/settings' })}
    ${statCard({ label: 'Gagal Sinkronisasi', value: counts.failed, tone: counts.failed ? 'red' : 'green', href: '#/settings' })}
    ${statCard({ label: 'Status Backend', value: 'Cek', tone: 'navy', href: '#/backups' })}
    ${statCard({ label: 'Konfigurasi', value: 'Atur', tone: 'blue', href: '#/settings' })}
  </div>
  <div class="grid-2">
    ${card('Status Sinkronisasi', `<p>Pending: <strong>${counts.pending}</strong> · Gagal: <strong>${counts.failed}</strong>.</p><p class="muted">Gunakan tombol antrean di header untuk menyinkronkan data offline.</p>`)}
    ${card('Aktivitas Terbaru', activityTable(user?.recentActivity || []))}
  </div>`;
}

export async function render(ctx) {
  const { user } = ctx;
  let dashboard;
  let dutyNotice = '';
  try {
    dashboard = await api.call('dashboard.get', { date: todayJakarta() });
  } catch (error) {
    if (error instanceof ApiError && error.code === 'FORBIDDEN' && error.message === DUTY_NO_SCHEDULE_MESSAGE) {
      dutyNotice = banner(DUTY_NO_SCHEDULE_MESSAGE, 'warning');
      try {
        dashboard = await api.call('dashboard.get', { date: todayJakarta(), scope: 'personal' });
      } catch {
        dashboard = { stats: {}, charts: {}, recentActivity: [] };
      }
    } else if (error?.code === 'OFFLINE') {
      return `${banner(error.message, 'warning')}${card('Dashboard', loading('Menunggu koneksi…'))}`;
    } else {
      return `${banner(error?.message || 'Dashboard belum dapat dimuat.', 'error')}${button('Coba Lagi', { action: 'refresh' })}`;
    }
  }

  const stats = dashboard?.stats || {};
  const charts = dashboard?.charts || {};
  const activity = dashboard?.recentActivity || [];
  const chartList = [
    { title: 'Kehadiran per Kelas', items: charts.attendanceByClass || [] },
    { title: 'Keterlambatan per Hari', items: charts.lateByDay || [] },
    { title: 'Status KBM', items: charts.kbmStatus || [] }
  ];

  let roleBody = '';
  if (user?.role === ROLES.GURU_PIKET) {
    roleBody = `${dutyQuickActions()}${card('Ringkasan Operasional Hari Ini', statsGrid(stats))}${card('Aktivitas Terbaru', activityTable(activity))}`;
  } else if (user?.role === ROLES.KEPALA_SEKOLAH) {
    roleBody = `${statsGrid(stats)}${card('Grafik Kehadiran & KBM', renderCharts(chartList))}
      <div class="grid-2">${card('Rekap Kehadiran', `<p>Ringkasan otomatis dari backend untuk tanggal ${escapeHtml(todayJakarta())}.</p>${button('Buka Laporan', { href: '#/reports', variant: 'primary' })}`)}
      ${card('Aktivitas Terbaru', activityTable(activity))}</div>`;
  } else if (user?.role === ROLES.WALI_KELAS) {
    const followUps = dashboard?.followUps || dashboard?.needFollowUp || [];
    roleBody = `${statsGrid(stats)}${card('Perlu Tindak Lanjut', table([
      { key: 'name', label: 'Siswa', render: (row) => escapeHtml(row.name || row.studentName || '—') },
      { key: 'type', label: 'Keterangan', render: (row) => statusPill(row.type || row.status || row.attendanceStatus) },
      { key: 'note', label: 'Catatan', render: (row) => escapeHtml(row.note || '—') }
    ], followUps, { empty: 'Tidak ada siswa yang perlu tindak lanjut.' }))}${card('Aktivitas Kelas', activityTable(activity))}`;
  } else if (user?.role === ROLES.SUPERADMIN) {
    roleBody = `${dutyNotice}${superadminSetup(user)}`;
  } else {
    roleBody = `${statsGrid(stats)}${card('Aktivitas', activityTable(activity))}`;
  }

  return `${card(`Selamat datang, ${user?.fullName || 'Pengguna'}`, `<p class="muted">${escapeHtml(ROLE_LABELS[user?.role] || user?.role || '')} · ${escapeHtml(todayJakarta())}</p>`, { class: 'welcome-card' })}
    ${user?.role === ROLES.GURU_PIKET ? dutyNotice : ''}
    ${roleBody}
    ${user?.role !== ROLES.GURU_PIKET && user?.role !== ROLES.SUPERADMIN ? card('Aksi Cepat', `<div class="quick-grid"><a class="quick-card tone-navy" href="#/scan/MORNING"><span class="quick-icon">▣</span><span>Scan Apel Pagi</span><span class="quick-arrow">→</span></a><a class="quick-card tone-navy" href="#/scan/AFTERNOON"><span class="quick-icon">▣</span><span>Scan Apel Siang</span><span class="quick-arrow">→</span></a></div>`) : ''}`;
}

export function mount(ctx) {
  // Tombol refresh memakai delegasi global di app.js (data-action="refresh").
  void ctx;
}

export default { render, mount, DUTY_NO_SCHEDULE_MESSAGE };
