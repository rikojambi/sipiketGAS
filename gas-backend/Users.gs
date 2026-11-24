/**
 * Users.gs - manajemen user dan guru.
 * Semua password di-hash di server; password tidak pernah disimpan plaintext.
 * Logika siswa/barcode ada di Students.gs.
 */

function spkUsersList(payload, user) {
  spkAssertSuperadmin(user);
  var rows = SIPIKET_Store.getRows('USERS').map(spkPublicUser);
  return { items: rows };
}

function spkUsersCreate(payload, user) {
  spkAssertSuperadmin(user);
  var requestId = spkParseIdempotency(payload);
  var cached = spkIdempotentResult('users.create', requestId);
  if (cached) { return cached; }
  var username = spkRequireString(payload, 'username', 'Username', 120).toLowerCase();
  var password = payload && typeof payload.password === 'string' ? payload.password : '';
  spkAssert(password.length >= 6, 'BAD_REQUEST', 'Password minimal 6 karakter.');
  var role = spkRequireOneOf(payload && payload.role,
    ['SUPERADMIN', 'KEPALA_SEKOLAH', 'GURU_PIKET', 'GURU_MAPEL', 'WALI_KELAS'], 'Role');
  var exists = SIPIKET_Store.findRow('USERS', function (u) {
    return String(u.username || '').toLowerCase() === username;
  });
  spkAssert(!exists, 'CONFLICT', 'Username sudah digunakan.');
  var salt = spkNewSalt();
  var row = SIPIKET_Store.appendRow('USERS', {
    username: username,
    passwordHash: spkHashPassword(password, salt),
    salt: salt,
    role: role,
    fullName: spkSanitize(payload && payload.fullName, 150) || username,
    email: spkSanitize(payload && payload.email, 150),
    teacherId: spkSanitize(payload && payload.teacherId, 120),
    classId: spkSanitize(payload && payload.classId, 120),
    phone: spkSanitize(payload && payload.phone, 40),
    active: true,
    failedAttempts: 0,
    lockedUntil: '',
    lastLoginAt: ''
  });
  var result = { user: spkPublicUser(row) };
  spkLogAudit('users.create', 'USERS', row.id, {}, result, 'User dibuat', requestId, user);
  return result;
}

function spkUsersUpdate(payload, user) {
  spkAssertSuperadmin(user);
  var id = spkRequireString(payload, 'id', 'Id user', 120);
  var patchInput = payload && payload.patch && typeof payload.patch === 'object' ? payload.patch : {};
  spkAssert(!patchInput.passwordHash && !patchInput.salt, 'BAD_REQUEST', 'Patch passwordHash/salt dilarang.');
  var allowed = ['username', 'role', 'fullName', 'email', 'teacherId', 'classId', 'phone', 'active'];
  var patch = {};
  for (var i = 0; i < allowed.length; i++) {
    if (typeof patchInput[allowed[i]] !== 'undefined') { patch[allowed[i]] = patchInput[allowed[i]]; }
  }
  if (patch.role) {
    patch.role = spkRequireOneOf(patch.role,
      ['SUPERADMIN', 'KEPALA_SEKOLAH', 'GURU_PIKET', 'GURU_MAPEL', 'WALI_KELAS'], 'Role');
  }
  if (patch.username) {
    patch.username = spkSanitize(patch.username, 120).toLowerCase();
    var duplicate = SIPIKET_Store.findRow('USERS', function (u) {
      return u.id !== id && String(u.username || '').toLowerCase() === patch.username;
    });
    spkAssert(!duplicate, 'CONFLICT', 'Username sudah digunakan.');
  }
  var before = SIPIKET_Store.findRow('USERS', function (u) { return u.id === id; });
  spkAssert(!!before, 'NOT_FOUND', 'User tidak ditemukan.');
  var updated = SIPIKET_Store.updateRow('USERS', id, patch);
  var result = { user: spkPublicUser(updated) };
  spkLogAudit('users.update', 'USERS', id, spkPublicUser(before), result, 'User diperbarui',
    spkParseIdempotency(payload), user);
  return result;
}

function spkUsersSetPassword(payload, user) {
  spkAssertSuperadmin(user);
  var id = spkRequireString(payload, 'id', 'Id user', 120);
  var password = payload && typeof payload.password === 'string' ? payload.password : '';
  spkAssert(password.length >= 6, 'BAD_REQUEST', 'Password minimal 6 karakter.');
  var salt = spkNewSalt();
  SIPIKET_Store.updateRow('USERS', id, {
    passwordHash: spkHashPassword(password, salt),
    salt: salt,
    failedAttempts: 0,
    lockedUntil: ''
  });
  spkLogAudit('users.setPassword', 'USERS', id, {}, {}, 'Password direset',
    spkParseIdempotency(payload), user);
  return {};
}

function spkUsersDeactivate(payload, user) {
  spkAssertSuperadmin(user);
  var id = spkRequireString(payload, 'id', 'Id user', 120);
  var reason = spkRequireString(payload, 'reason', 'Alasan', 300);
  SIPIKET_Store.updateRow('USERS', id, { active: false, status: 'INACTIVE' });
  spkRevokeAllSessions(id);
  spkLogAudit('users.deactivate', 'USERS', id, {}, { reason: reason }, reason,
    spkParseIdempotency(payload), user);
  return {};
}

function spkRevokeAllSessions(userId) {
  return SIPIKET_Store.updateWhere('SESSIONS', function (s) {
    return s.userId === userId && !(s.revoked === true || s.revoked === 'TRUE' || s.revoked === 'true');
  }, { revoked: true });
}

function spkTeachersList(payload, user) {
  spkAssert(spkIsSuperadmin(user) || user.role === 'KEPALA_SEKOLAH',
    'FORBIDDEN', 'Anda tidak memiliki akses untuk aksi ini.');
  return { items: SIPIKET_Store.getRows('TEACHERS') };
}

function spkTeachersCreate(payload, user) {
  spkAssertSuperadmin(user);
  var row = SIPIKET_Store.appendRow('TEACHERS', {
    nip: spkSanitize(payload && payload.nip, 40),
    name: spkRequireString(payload, 'name', 'Nama guru', 150),
    email: spkSanitize(payload && payload.email, 150),
    phone: spkSanitize(payload && payload.phone, 40),
    subject: spkSanitize(payload && payload.subject, 100),
    active: true,
    photoUrl: spkSanitize(payload && payload.photoUrl, 500)
  });
  spkLogAudit('teachers.create', 'TEACHERS', row.id, {}, row, 'Guru dibuat',
    spkParseIdempotency(payload), user);
  return { teacher: row };
}

function spkTeachersUpdate(payload, user) {
  spkAssertSuperadmin(user);
  var id = spkRequireString(payload, 'id', 'Id guru', 120);
  var allowed = ['nip', 'name', 'email', 'phone', 'subject', 'active', 'photoUrl', 'status'];
  var patch = spkPickPatch(payload && payload.patch, allowed);
  var updated = SIPIKET_Store.updateRow('TEACHERS', id, patch);
  spkLogAudit('teachers.update', 'TEACHERS', id, {}, patch, 'Guru diperbarui',
    spkParseIdempotency(payload), user);
  return { teacher: updated };
}

function spkPickPatch(patchInput, allowed) {
  var patch = {};
  if (!patchInput || typeof patchInput !== 'object') { return patch; }
  for (var i = 0; i < allowed.length; i++) {
    if (typeof patchInput[allowed[i]] !== 'undefined') { patch[allowed[i]] = patchInput[allowed[i]]; }
  }
  return patch;
}
