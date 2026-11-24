/**
 * Auth.gs - SHA256(salt + password), session token (hash saja disimpan),
 * rate limiting login, otorisasi peran, dan pemeriksaan jadwal piket.
 */

var SPK_CURRENT_ACTOR = null;

function spkBase64EncodeBytes(bytes) {
  if (typeof Utilities !== 'undefined' && Utilities.base64Encode) {
    return Utilities.base64Encode(bytes);
  }
  var chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  var out = '';
  for (var i = 0; i < bytes.length; i += 3) {
    var b1 = bytes[i] & 255;
    var b2 = i + 1 < bytes.length ? (bytes[i + 1] & 255) : 0;
    var b3 = i + 2 < bytes.length ? (bytes[i + 2] & 255) : 0;
    out += chars.charAt(b1 >> 2);
    out += chars.charAt(((b1 & 3) << 4) | (b2 >> 4));
    out += i + 1 < bytes.length ? chars.charAt(((b2 & 15) << 2) | (b3 >> 6)) : '=';
    out += i + 2 < bytes.length ? chars.charAt(b3 & 63) : '=';
  }
  return out;
}

function spkBase64Url(bytes) {
  return spkBase64EncodeBytes(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function spkNewSalt() {
  return spkBase64EncodeBytes(spkRandomBytes(32));
}

function spkHashPassword(password, salt) {
  return spkHashText(String(salt || '') + String(password || ''));
}

function spkVerifyPassword(password, salt, hash) {
  if (!hash || !salt) { return false; }
  var candidate = spkHashPassword(password, salt);
  return candidate === String(hash);
}

function spkSessionTtlMs() {
  var override = spkGetProperty(SIPIKET_Config.SESSION_TTL_PROPERTY);
  if (override && /^\d+$/.test(override)) { return parseInt(override, 10); }
  var ttl = Number(spkSetting('sessionTtlMs', SIPIKET_Config.DEFAULT_SETTINGS.sessionTtlMs));
  return isFinite(ttl) && ttl > 0 ? ttl : SIPIKET_Config.DEFAULT_SETTINGS.sessionTtlMs;
}

function spkCreateSession(userId) {
  spkAssert(!!userId, 'BAD_REQUEST', 'userId wajib diisi.');
  var tokenBytes = spkRandomBytes(32);
  var token = spkBase64Url(tokenBytes);
  var tokenHash = spkHashText(token);
  var ttl = spkSessionTtlMs();
  var expiresAt = spkFormatJakarta(new Date(Date.now() + ttl), "yyyy-MM-dd'T'HH:mm:ssXXX");
  SIPIKET_Store.appendRow('SESSIONS', {
    tokenHash: tokenHash,
    userId: String(userId),
    expiresAt: expiresAt,
    createdAt: spkNowIsoJakarta(),
    revoked: false
  });
  return { token: token, expiresAt: expiresAt, tokenHash: tokenHash };
}

function spkRevokeSession(token) {
  if (!token) { return false; }
  var hash = spkHashText(token);
  var result = SIPIKET_Store.updateWhere('SESSIONS', function (row) {
    return row.tokenHash === hash && !(row.revoked === true || row.revoked === 'TRUE' || row.revoked === 'true');
  }, { revoked: true });
  return result && result.count > 0;
}

function spkFindSession(token) {
  if (!token) { return null; }
  var hash = spkHashText(token);
  return SIPIKET_Store.findRow('SESSIONS', function (row) {
    return row.tokenHash === hash;
  });
}

function spkPublicUser(row) {
  if (!row) { return null; }
  return {
    id: row.id || '',
    username: row.username || '',
    role: row.role || '',
    fullName: row.fullName || '',
    email: row.email || '',
    teacherId: row.teacherId || '',
    classId: row.classId || '',
    phone: row.phone || '',
    active: !(row.active === 'FALSE' || row.active === 'false' || row.active === false)
  };
}

function spkBootstrapUser() {
  var setupKey = spkGetProperty('SETUP_ADMIN_TOKEN');
  if (!setupKey) { return null; }
  return {
    id: 'SYSTEM',
    username: 'setup',
    role: 'SUPERADMIN',
    fullName: 'Setup Administrator',
    teacherId: '',
    classId: '',
    active: true,
    bootstrap: true
  };
}

function spkRequireAuth(payload, roles) {
  var data = payload && typeof payload === 'object' ? payload : {};
  var token = spkSanitize(data.token, 500);
  spkAssert(!!token, 'UNAUTHORIZED', 'Token tidak ditemukan. Silakan login kembali.');

  var session = null;
  var bootstrapKey = spkGetProperty('SETUP_ADMIN_TOKEN');
  if (bootstrapKey && token === bootstrapKey) {
    var bootstrap = spkBootstrapUser();
    SPK_CURRENT_ACTOR = bootstrap;
    return bootstrap;
  }
  try {
    session = spkFindSession(token);
  } catch (err) {
    session = null;
  }
  if (!session || session.revoked === true || session.revoked === 'TRUE' || session.revoked === 'true') {
    throw spkError('UNAUTHORIZED', 'Sesi tidak valid. Silakan login kembali.');
  }
  var expires = new Date(session.expiresAt);
  if (!session.expiresAt || isNaN(expires.getTime()) || expires.getTime() <= Date.now()) {
    throw spkError('EXPIRED', 'Sesi berakhir. Silakan login kembali.');
  }

  var row = null;
  try {
    row = SIPIKET_Store.findRow('USERS', function (u) { return u.id === session.userId; });
  } catch (err) {
    row = null;
  }
  if (!row || row.status === 'DELETED' || row.active === 'FALSE' || row.active === 'false' || row.active === false) {
    throw spkError('UNAUTHORIZED', 'Akun tidak aktif.');
  }
  var user = spkPublicUser(row);
  SPK_CURRENT_ACTOR = user;

  var allowed = null;
  if (typeof roles === 'string') { allowed = [roles]; }
  else if (Array.isArray(roles)) { allowed = roles; }
  if (allowed && allowed.length > 0 && allowed.indexOf(user.role) === -1) {
    throw spkError('FORBIDDEN', 'Anda tidak memiliki akses untuk aksi ini.');
  }
  return user;
}

function spkCurrentActor() {
  return SPK_CURRENT_ACTOR;
}

function spkIsSuperadmin(user) {
  return !!user && user.role === 'SUPERADMIN';
}

function spkPermissionsFor(user) {
  var role = user && user.role ? user.role : '';
  var permissions = SIPIKET_Config.ROLE_PERMISSIONS[role];
  if (!permissions) { return { all: false }; }
  var out = {};
  for (var key in permissions) {
    if (Object.prototype.hasOwnProperty.call(permissions, key)) { out[key] = permissions[key]; }
  }
  return out;
}

function spkDutyFor(user, date) {
  if (!user) { return null; }
  var d = spkParseDate(date) || spkTodayJakarta();
  var teacherId = user.teacherId || user.id;
  var backupMode = false;
  try {
    var flag = SIPIKET_Store.getConfig('BACKUP_ACTIVATED', false);
    backupMode = flag === true || flag === 'TRUE' || flag === 'true';
  } catch (err) {
    backupMode = false;
  }
  var rows = SIPIKET_Store.getRows('DUTY_SCHEDULES');
  for (var i = 0; i < rows.length; i++) {
    var r = rows[i];
    var matchesTeacher = (teacherId && r.teacherId === teacherId) || r.teacherId === user.id;
    if (!matchesTeacher || r.date !== d) { continue; }
    if (r.status && r.status !== 'ACTIVE') { continue; }
    var isActive = !(r.active === 'FALSE' || r.active === 'false' || r.active === false);
    if (!isActive && !(backupMode && r.role === 'BACKUP')) { continue; }
    if (r.role === 'MAIN' || r.role === 'BACKUP') { return r; }
  }
  return null;
}

function spkRequireDuty(user, date) {
  var requestedDate = spkParseDate(date) || spkTodayJakarta();
  var duty = spkDutyFor(user, requestedDate);
  if (!duty) {
    throw spkError('FORBIDDEN', 'Anda tidak memiliki jadwal piket pada hari ini.');
  }
  // Menu operasional piket hanya dibuka setelah dutyOpenMinutes (default 06:00).
  if (requestedDate === spkTodayJakarta()) {
    var openMinutes = Number(spkSetting('dutyOpenMinutes', SIPIKET_Config.DEFAULT_SETTINGS.dutyOpenMinutes));
    if (!isFinite(openMinutes)) { openMinutes = SIPIKET_Config.DEFAULT_SETTINGS.dutyOpenMinutes; }
    if (spkNowMinutes() < openMinutes) {
      throw spkError('FORBIDDEN', 'Menu piket belum dibuka pada waktu ini.');
    }
  }
  return duty;
}

function spkLogin(payload) {
  var data = payload && typeof payload === 'object' ? payload : {};
  var username = spkSanitize(data.username, 120).toLowerCase();
  var password = typeof data.password === 'string' ? data.password : '';
  spkAssert(!!username && !!password, 'BAD_REQUEST', 'Username dan password wajib diisi.');

  var userRow = SIPIKET_Store.findRow('USERS', function (u) {
    return String(u.username || '').toLowerCase() === username;
  });
  spkAssert(!!userRow, 'UNAUTHORIZED', 'Username atau password salah.');

  var now = Date.now();
  var lockedUntil = parseInt(userRow.lockedUntil, 10) || 0;
  if (lockedUntil > now) {
    throw spkError('RATE_LIMITED', 'Akun dikunci sementara. Coba lagi dalam 15 menit.');
  }
  if (!spkVerifyPassword(password, userRow.salt, userRow.passwordHash)) {
    var attempts = (parseInt(userRow.failedAttempts, 10) || 0) + 1;
    var patch = { failedAttempts: attempts, lockedUntil: '' };
    if (attempts >= SIPIKET_Config.LOGIN_MAX_FAILURES) {
      patch.lockedUntil = spkFormatJakarta(new Date(now + SIPIKET_Config.LOGIN_LOCK_MS), "yyyy-MM-dd'T'HH:mm:ssXXX");
      patch.failedAttempts = 0;
    }
    SIPIKET_Store.updateRow('USERS', userRow.id, patch);
    if (attempts >= SIPIKET_Config.LOGIN_MAX_FAILURES) {
      throw spkError('RATE_LIMITED', 'Akun dikunci sementara. Coba lagi dalam 15 menit.');
    }
    throw spkError('UNAUTHORIZED', 'Username atau password salah.');
  }

  SIPIKET_Store.updateRow('USERS', userRow.id, {
    failedAttempts: 0,
    lockedUntil: '',
    lastLoginAt: spkNowIsoJakarta()
  });
  var session = spkCreateSession(userRow.id);
  var fresh = SIPIKET_Store.findRow('USERS', function (u) { return u.id === userRow.id; });
  var settings = spkAllSettings();
  SPK_CURRENT_ACTOR = spkPublicUser(fresh || userRow);
  spkLogAudit('LOGIN', 'USERS', userRow.id, {}, { username: userRow.username }, 'Login berhasil', '');
  return {
    token: session.token,
    expiresAt: session.expiresAt,
    user: spkPublicUser(fresh || userRow),
    settings: {
      schoolName: settings.schoolName,
      pollIntervalMs: settings.pollIntervalMs
    }
  };
}

function spkLogout(payload) {
  var user = spkRequireAuth(payload);
  spkRevokeSession(spkSanitize(payload && payload.token, 500));
  SPK_CURRENT_ACTOR = user;
  spkLogAudit('LOGOUT', 'USERS', user.id, {}, {}, 'Logout', '');
  return {};
}

function spkMe(payload) {
  var user = spkRequireAuth(payload);
  var dutyToday = null;
  if (user.role === 'GURU_PIKET') { dutyToday = spkDutyFor(user, spkTodayJakarta()); }
  var unread = 0;
  try {
    unread = SIPIKET_Store.getRows('NOTIFICATIONS').filter(function (n) {
      var isRead = n.read === true || n.read === 'TRUE' || n.read === 'true';
      if (isRead || n.status === 'DELETED') { return false; }
      if (n.recipientUserId && n.recipientUserId === user.id) { return true; }
      return !!n.recipientRole && n.recipientRole === user.role;
    }).length;
  } catch (err) {
    unread = 0;
  }
  return {
    user: user,
    permissions: spkPermissionsFor(user),
    dutyToday: dutyToday,
    settings: spkAllSettings(),
    notificationsUnread: unread
  };
}

var SIPIKET_Auth = {
  hashPassword: spkHashPassword,
  verifyPassword: spkVerifyPassword,
  createSession: spkCreateSession,
  requireAuth: spkRequireAuth,
  requireDuty: spkRequireDuty,
  hashText: spkHashText,
  newSalt: spkNewSalt,
  login: spkLogin,
  logout: spkLogout,
  me: spkMe,
  revokeSession: spkRevokeSession,
  publicUser: spkPublicUser,
  dutyFor: spkDutyFor,
  permissionsFor: spkPermissionsFor,
  currentActor: spkCurrentActor
};
