/** Session disimpan HANYA di sessionStorage (per tab), tidak pernah di localStorage. */

const SESSION_KEY = 'sipiket.session.v1';

export const ROLES = Object.freeze({
  SUPERADMIN: 'SUPERADMIN',
  KEPALA_SEKOLAH: 'KEPALA_SEKOLAH',
  GURU_PIKET: 'GURU_PIKET',
  GURU_MAPEL: 'GURU_MAPEL',
  WALI_KELAS: 'WALI_KELAS'
});

export const ROLE_LABELS = Object.freeze({
  SUPERADMIN: 'Superadmin',
  KEPALA_SEKOLAH: 'Kepala Sekolah',
  GURU_PIKET: 'Guru Piket',
  GURU_MAPEL: 'Guru Mapel',
  WALI_KELAS: 'Wali Kelas'
});

function storage() {
  try {
    return typeof sessionStorage !== 'undefined' ? sessionStorage : null;
  } catch {
    return null;
  }
}

export function getSession() {
  const store = storage();
  if (!store) return null;
  try {
    const raw = store.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

export function setSession(data) {
  const store = storage();
  if (!store) return null;
  try {
    store.setItem(SESSION_KEY, JSON.stringify(data));
    return data;
  } catch {
    return null;
  }
}

export function updateSession(patch = {}) {
  const current = getSession() || {};
  return setSession({ ...current, ...patch });
}

export function clearSession() {
  const store = storage();
  if (!store) return;
  try { store.removeItem(SESSION_KEY); } catch { /* abaikan */ }
}

export function getToken() {
  return String(getSession()?.token ?? '');
}

export function getUser() {
  return getSession()?.user ?? null;
}

export function getSettings() {
  return getSession()?.settings ?? {};
}

export function isAuthenticated() {
  return Boolean(getToken() && getUser());
}

export function hasRole(user, ...roles) {
  if (!user || !user.role) return false;
  return roles.map((role) => String(role).toUpperCase()).includes(String(user.role).toUpperCase());
}

export function canManagePeople(user) {
  return hasRole(user, ROLES.SUPERADMIN);
}

export function canOperate(user) {
  return hasRole(user, ROLES.GURU_PIKET, ROLES.SUPERADMIN);
}

export function canApprovePermit(user) {
  return hasRole(user, ROLES.WALI_KELAS, ROLES.GURU_PIKET, ROLES.SUPERADMIN);
}

export function canReadReports(user) {
  return hasRole(user, ROLES.SUPERADMIN, ROLES.KEPALA_SEKOLAH, ROLES.WALI_KELAS, ROLES.GURU_PIKET);
}
