/**
 * Permissions.gs - daftar aksi resmi dan enforce peran di satu tempat.
 * Role selalu berasal dari spkRequireAuth(), bukan dari payload frontend.
 */

var SPK_PUBLIC_ACTIONS = ['ping', 'login'];

// Aksi yang boleh dipakai setiap pengguna yang sudah login, terlepas dari peran.
var SPK_COMMON_ACTIONS = [
  'logout', 'me', 'notifications.list', 'notifications.read', 'settings.public'
];

var SPK_ALL_ACTIONS = [
  'ping', 'login', 'logout', 'me', 'notifications.list', 'notifications.read', 'settings.public',
  'setup.status', 'setup.database', 'setup.seed', 'setup.validate', 'setup.migrate',
  'backup.create', 'backup.list', 'backup.restore',
  'users.list', 'users.create', 'users.update', 'users.setPassword', 'users.deactivate',
  'teachers.list', 'teachers.create', 'teachers.update',
  'students.list', 'students.get', 'students.create', 'students.update', 'students.import',
  'students.regenerateBarcode', 'barcode.lookup',
  'classes.list', 'classes.create', 'classes.update',
  'subjects.list', 'subjects.create', 'subjects.update',
  'schedules.list', 'schedules.save', 'duty.list', 'duty.save',
  'settings.list', 'settings.save', 'holidays.list', 'holidays.create', 'holidays.delete',
  'attendance.scan', 'attendance.manual', 'attendance.correct', 'late.record',
  'consequence.create', 'consequence.list', 'consequence.update',
  'permits.create', 'permits.list', 'permits.approve',
  'movement.out', 'movement.return', 'movement.earlyLeave', 'movement.list',
  'monitoring.list', 'monitoring.save', 'monitoring.summary',
  'substitute.assign', 'substitute.list', 'substitute.update',
  'dashboard.get', 'reports.get', 'reports.export', 'audit.list'
];

var SPK_DUTY_GATED_ACTIONS = [
  'attendance.scan', 'attendance.manual', 'attendance.correct', 'late.record',
  'consequence.create', 'consequence.update', 'permits.create', 'permits.list', 'permits.approve',
  'movement.out', 'movement.return', 'movement.earlyLeave', 'movement.list',
  'monitoring.list', 'monitoring.save', 'monitoring.summary',
  'substitute.assign', 'substitute.list', 'substitute.update',
  'students.list', 'students.get', 'students.regenerateBarcode',
  'barcode.lookup', 'dashboard.get'
];

function spkIsKnownAction(action) {
  return SPK_ALL_ACTIONS.indexOf(String(action || '')) !== -1;
}

function spkRoleAllows(user, action) {
  if (!user) { return false; }
  if (SPK_COMMON_ACTIONS.indexOf(action) !== -1) { return true; }
  if (user.role === 'SUPERADMIN') { return true; }
  var permissions = SIPIKET_Config.ROLE_PERMISSIONS[user.role];
  if (!permissions) { return false; }
  if (permissions.all) { return true; }
  if (user.role === 'KEPALA_SEKOLAH') {
    return SIPIKET_Config.READ_ACTIONS.indexOf(action) !== -1 ||
      action === 'attendance.correct' || action === 'audit.list';
  }
  if (Array.isArray(permissions.actions)) {
    return permissions.actions.indexOf(action) !== -1;
  }
  return false;
}

function spkAuthorize(action, payload) {
  var data = payload && typeof payload === 'object' ? payload : {};
  if (SPK_PUBLIC_ACTIONS.indexOf(action) !== -1) { return null; }

  var user = spkRequireAuth(data);
  if (user.bootstrap) { return user; }
  spkAssert(spkRoleAllows(user, action), 'FORBIDDEN', 'Anda tidak memiliki akses untuk aksi ' + action + '.');

  if (user.role === 'GURU_PIKET') {
    var personalDashboard = action === 'dashboard.get' && data.scope === 'personal';
    if (!personalDashboard && SPK_DUTY_GATED_ACTIONS.indexOf(action) !== -1) {
      spkRequireDuty(user, spkTodayJakarta());
    }
  }
  return user;
}

function spkAssertSuperadmin(user) {
  spkAssert(spkIsSuperadmin(user), 'FORBIDDEN', 'Aksi ini hanya untuk superadmin.');
  return user;
}

function spkAssertOwnClass(user, classId) {
  if (spkIsSuperadmin(user)) { return true; }
  var target = spkSanitize(classId, 120);
  spkAssert(!!user.classId && user.classId === target, 'FORBIDDEN', 'Anda hanya dapat mengelola kelas sendiri.');
  return true;
}

function spkStudentForRole(user, student, action) {
  spkAssert(!!student, 'NOT_FOUND', 'Siswa tidak ditemukan.');
  if (spkIsSuperadmin(user)) { return student; }
  if (user.role === 'WALI_KELAS') {
    spkAssertOwnClass(user, student.classId);
    return student;
  }
  if (user.role === 'GURU_PIKET' && SPK_DUTY_GATED_ACTIONS.indexOf(action) !== -1) {
    return student;
  }
  if (user.role === 'GURU_MAPEL') {
    if (action === 'permits.create') { return student; }
    return student;
  }
  return student;
}
