/**
 * Utils.gs - helper waktu, validasi, envelope, audit, dan notifikasi.
 * Semua perhitungan waktu memakai timezone Asia/Jakarta (server), bukan input frontend.
 */

var SPK_SETTINGS_CACHE = {};
var SPK_TIMEZONE = 'Asia/Jakarta';

function spkUuid() {
  if (typeof Utilities !== 'undefined' && Utilities.getUuid) {
    return Utilities.getUuid();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    var r = Math.floor(Math.random() * 16);
    var v = c === 'x' ? r : ((r & 0x3) | 0x8);
    return v.toString(16);
  });
}

function spkNowIsoJakarta() {
  if (typeof Utilities !== 'undefined' && Utilities.formatDate) {
    return Utilities.formatDate(new Date(), SPK_TIMEZONE, "yyyy-MM-dd'T'HH:mm:ssXXX");
  }
  return new Date().toISOString();
}

function spkTodayJakarta() {
  if (typeof Utilities !== 'undefined' && Utilities.formatDate) {
    return Utilities.formatDate(new Date(), SPK_TIMEZONE, 'yyyy-MM-dd');
  }
  return new Date().toISOString().slice(0, 10);
}

function spkFormatJakarta(date, pattern) {
  if (typeof Utilities !== 'undefined' && Utilities.formatDate) {
    return Utilities.formatDate(date || new Date(), SPK_TIMEZONE, pattern);
  }
  return String(date || new Date().toISOString());
}

function spkDayCode(date) {
  // `EEE` bergantung locale Google Sheets (bisa "Tue", "Sel", dll).
  // Hitung dari tanggal Jakarta yang deterministik agar cocok dengan SCHOOL_SETTINGS.schoolDays.
  var ymd = spkFormatJakarta(date || new Date(), 'yyyy-MM-dd');
  var utc = new Date(ymd + 'T00:00:00Z');
  var codes = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
  return codes[utc.getUTCDay()] || 'MON';
}

function spkMinutesOfDay(value) {
  if (value instanceof Date) {
    var parts = spkFormatJakarta(value, 'HH:mm').split(':');
    return (parseInt(parts[0], 10) || 0) * 60 + (parseInt(parts[1], 10) || 0);
  }
  if (typeof value === 'string' && /^\d{1,2}:\d{2}$/.test(value)) {
    var p = value.split(':');
    return (parseInt(p[0], 10) || 0) * 60 + (parseInt(p[1], 10) || 0);
  }
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(value)) {
    var d = new Date(value);
    if (!isNaN(d.getTime())) { return spkMinutesOfDay(d); }
  }
  if (typeof value === 'number' && isFinite(value)) {
    return Math.floor(value);
  }
  var now = spkFormatJakarta(new Date(), 'HH:mm').split(':');
  return (parseInt(now[0], 10) || 0) * 60 + (parseInt(now[1], 10) || 0);
}

function spkMinutesToHHMM(minutes) {
  var n = parseInt(minutes, 10);
  if (!isFinite(n)) { return ''; }
  n = Math.max(0, Math.floor(n));
  var h = Math.floor(n / 60);
  var m = n % 60;
  return (h < 10 ? '0' : '') + h + ':' + (m < 10 ? '0' : '') + m;
}

function spkParseDate(value) {
  if (value instanceof Date) {
    return spkFormatJakarta(value, 'yyyy-MM-dd');
  }
  if (typeof value !== 'string') { return ''; }
  var s = value.trim();
  if (/^\d{4}-\d{2}-\d{2}T/.test(s)) { s = s.slice(0, 10); }
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    var d = new Date(s + 'T00:00:00+07:00');
    if (!isNaN(d.getTime())) { return s; }
  }
  return '';
}

function spkParseMinutes(value) {
  if (typeof value === 'number' && isFinite(value)) { return Math.floor(value); }
  if (typeof value === 'string') {
    var s = value.trim();
    if (/^\d+$/.test(s)) { return parseInt(s, 10); }
    if (/^\d{1,2}:\d{2}$/.test(s)) { return spkMinutesOfDay(s); }
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(s)) {
      var d = new Date(s);
      if (!isNaN(d.getTime())) { return spkMinutesOfDay(d); }
    }
  }
  return null;
}

function spkHashText(text) {
  var input = String(text === null || typeof text === 'undefined' ? '' : text);
  var bytes;
  if (typeof Utilities !== 'undefined' && Utilities.computeDigest && Utilities.DigestAlgorithm) {
    if (Utilities.Charset && Utilities.Charset.UTF_8) {
      bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, input, Utilities.Charset.UTF_8);
    } else {
      bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, input);
    }
  } else {
    // Fallback hanya untuk mock/test yang tidak menyediakan Utilities.computeDigest.
    bytes = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
  }
  if (typeof Utilities !== 'undefined' && Utilities.base64Encode) {
    return Utilities.base64Encode(bytes);
  }
  // Base64 manual fallback.
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

function spkRandomBytes(length) {
  var target = parseInt(length, 10) || 32;
  var seed = '';
  while (seed.length < target * 2) { seed += spkUuid(); }
  var digest = spkHashText(seed);
  var raw = [];
  for (var i = 0; i < digest.length; i++) {
    raw.push(digest.charCodeAt(i) & 255);
  }
  var result = [];
  for (var j = 0; j < target; j++) { result.push(raw[j % raw.length]); }
  return result;
}

function spkSafeJson(text, fallback) {
  var empty = typeof fallback === 'undefined' ? null : fallback;
  if (text === null || typeof text === 'undefined' || text === '') { return empty; }
  if (typeof text === 'object') { return text; }
  try {
    var parsed = JSON.parse(String(text));
    return typeof parsed === 'undefined' ? empty : parsed;
  } catch (err) {
    return empty;
  }
}

function spkStringify(value) {
  try {
    return JSON.stringify(value === undefined ? null : value);
  } catch (err) {
    return 'null';
  }
}

function spkSanitize(value, maxLength) {
  if (value === null || typeof value === 'undefined') { return ''; }
  var s = String(value).replace(/[\u0000-\u001f\u007f]/g, ' ').trim();
  var limit = parseInt(maxLength, 10) || 1000;
  return s.length > limit ? s.slice(0, limit) : s;
}

function spkEscapeHtml(value) {
  return spkSanitize(value, 10000)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function spkStripSecrets(text) {
  var s = String(text === null || typeof text === 'undefined' ? '' : text);
  return s
    .replace(/"(token|password|passwordHash|salt|secret|authorization)"\s*:\s*"[^"]*"/gi, '"$1":"[REDACTED]"')
    .replace(/\b(token|password|secret)=[^\s,;]+/gi, '$1=[REDACTED]');
}

function spkParseIdempotency(payload) {
  if (!payload || typeof payload !== 'object') { return ''; }
  var key = payload.idempotencyKey || payload.requestId || '';
  return spkSanitize(key, 120);
}

function spkOk(data) {
  return {
    ok: true,
    data: typeof data === 'undefined' ? {} : data,
    error: null,
    requestId: spkUuid(),
    serverTime: spkNowIsoJakarta(),
    version: SIPIKET_Config.APP_VERSION
  };
}

function spkFail(code, message, details) {
  return {
    ok: false,
    data: null,
    error: {
      code: spkSanitize(code || 'SERVER_ERROR', 60) || 'SERVER_ERROR',
      message: spkSanitize(message || 'Terjadi kesalahan pada server.', 500),
      details: details && typeof details === 'object' ? details : {}
    },
    requestId: spkUuid(),
    serverTime: spkNowIsoJakarta(),
    version: SIPIKET_Config.APP_VERSION
  };
}

function spkError(code, message, details) {
  var err = new Error(message);
  err.code = code;
  err.details = details || {};
  return err;
}

function spkAssert(condition, code, message, details) {
  if (!condition) { throw spkError(code, message, details); }
}

function spkRequireString(payload, field, label, maxLength) {
  var value = payload && payload[field];
  var s = spkSanitize(value, maxLength || 200);
  spkAssert(!!s, 'BAD_REQUEST', (label || field) + ' wajib diisi.');
  return s;
}

function spkRequireOneOf(value, allowed, label) {
  var s = spkSanitize(value, 60);
  spkAssert(allowed.indexOf(s) !== -1, 'BAD_REQUEST', (label || 'Nilai') + ' tidak valid.');
  return s;
}

function spkSetting(key, fallback) {
  var cacheKey = String(key);
  if (Object.prototype.hasOwnProperty.call(SPK_SETTINGS_CACHE, cacheKey)) {
    return SPK_SETTINGS_CACHE[cacheKey];
  }
  var stored = null;
  try {
    if (typeof SIPIKET_Store !== 'undefined' && SIPIKET_Store.getRows) {
      var rows = SIPIKET_Store.getRows('SCHOOL_SETTINGS');
      for (var i = 0; i < rows.length; i++) {
        if (rows[i].settingKey === cacheKey) { stored = rows[i].settingValue; break; }
      }
    }
  } catch (err) {
    stored = null;
  }
  var def = typeof fallback === 'undefined' ? SIPIKET_Config.DEFAULT_SETTINGS[cacheKey] : fallback;
  var value = stored;
  if (value === null || typeof value === 'undefined' || value === '') { value = def; }
  if (typeof value === 'string') {
    var t = value.trim();
    if (/^[\[{]/.test(t)) {
      var parsed = spkSafeJson(t, def);
      value = parsed;
    } else if (typeof def === 'number') {
      var num = Number(t);
      value = isFinite(num) ? num : def;
    } else if (typeof def === 'boolean') {
      value = t === 'true' || t === '1';
    }
  }
  SPK_SETTINGS_CACHE[cacheKey] = value;
  return value;
}

function spkAllSettings() {
  var result = {};
  var keys = Object.keys(SIPIKET_Config.DEFAULT_SETTINGS);
  for (var i = 0; i < keys.length; i++) {
    result[keys[i]] = spkSetting(keys[i]);
  }
  return result;
}

function spkInvalidateSettings() {
  SPK_SETTINGS_CACHE = {};
}

function spkIsHoliday(date) {
  var d = spkParseDate(date) || spkTodayJakarta();
  try {
    if (typeof SIPIKET_Store === 'undefined') { return false; }
    var rows = SIPIKET_Store.getRows('HOLIDAYS');
    for (var i = 0; i < rows.length; i++) {
      if (rows[i].date === d && rows[i].active !== false && rows[i].status === 'ACTIVE') {
        return true;
      }
    }
  } catch (err) {
    return false;
  }
  return false;
}

function spkIsSchoolDay(date) {
  var d = spkParseDate(date);
  if (!d) { d = spkTodayJakarta(); }
  var days = spkSetting('schoolDays', SIPIKET_Config.DEFAULT_SETTINGS.schoolDays);
  if (!Array.isArray(days)) {
    days = SIPIKET_Config.DEFAULT_SETTINGS.schoolDays;
  }
  var day = spkDayCode(new Date(d + 'T12:00:00+07:00'));
  return days.indexOf(day) !== -1;
}

function spkNowMinutes() {
  return spkMinutesOfDay(new Date());
}

function spkLogAudit(action, entity, entityId, before, after, reason, requestId, actor) {
  try {
    if (typeof SIPIKET_Store === 'undefined' || !SIPIKET_Store.appendRow) { return null; }
    var who = actor || (typeof spkCurrentActor === 'function' ? spkCurrentActor() : null);
    return SIPIKET_Store.appendRow('AUDIT_LOG', {
      status: 'ACTIVE',
      action: spkSanitize(action, 120),
      entity: spkSanitize(entity, 80),
      entityId: spkSanitize(entityId, 120),
      actorId: who ? who.id : 'SYSTEM',
      actorName: who ? (who.fullName || who.username || who.id) : 'SYSTEM',
      beforeJson: spkStripSecrets(spkStringify(before || {})),
      afterJson: spkStripSecrets(spkStringify(after || {})),
      reason: spkStripSecrets(spkSanitize(reason, 500)),
      requestId: spkSanitize(requestId, 120),
      ip: ''
    });
  } catch (err) {
    return null;
  }
}

function spkFindAuditByRequest(action, requestId) {
  if (!requestId) { return null; }
  try {
    var rows = SIPIKET_Store.getRows('AUDIT_LOG');
    for (var i = rows.length - 1; i >= 0; i--) {
      if (rows[i].requestId === requestId && (!action || rows[i].action === action)) {
        return rows[i];
      }
    }
  } catch (err) {
    return null;
  }
  return null;
}

function spkIdempotentResult(action, requestId) {
  var audit = spkFindAuditByRequest(action, requestId);
  if (!audit) { return null; }
  var after = spkSafeJson(audit.afterJson, {});
  if (after && after.__result) { return after.__result; }
  if (audit.entityId) { return { id: audit.entityId }; }
  return null;
}

function spkCreateNotification(recipientRole, recipientUserId, type, title, body, severity, relatedId, actor) {
  try {
    if (typeof SIPIKET_Store === 'undefined' || !SIPIKET_Store.appendRow) { return null; }
    return SIPIKET_Store.appendRow('NOTIFICATIONS', {
      status: 'ACTIVE',
      date: spkTodayJakarta(),
      recipientRole: spkSanitize(recipientRole || 'SUPERADMIN', 60),
      recipientUserId: spkSanitize(recipientUserId, 120),
      type: spkSanitize(type, 80),
      title: spkSanitize(title, 200),
      body: spkSanitize(body, 1000),
      severity: spkSanitize(severity || 'INFO', 30),
      relatedId: spkSanitize(relatedId, 120),
      read: false,
      readAt: '',
      createdBy: actor && actor.id ? actor.id : 'SYSTEM'
    });
  } catch (err) {
    return null;
  }
}

function spkNotifyRole(role, type, title, body, severity, relatedId, actor) {
  return spkCreateNotification(role, '', type, title, body, severity, relatedId, actor);
}

var SIPIKET_Utils = {
  ok: spkOk,
  fail: spkFail,
  uuid: spkUuid,
  nowIsoJakarta: spkNowIsoJakarta,
  todayJakarta: spkTodayJakarta,
  minutesOfDay: spkMinutesOfDay,
  isSchoolDay: spkIsSchoolDay,
  isHoliday: spkIsHoliday,
  minutesToHHMM: spkMinutesToHHMM,
  hashText: spkHashText,
  safeJson: spkSafeJson,
  failError: spkError,
  assert: spkAssert,
  sanitize: spkSanitize,
  escapeHtml: spkEscapeHtml,
  parseDate: spkParseDate,
  parseMinutes: spkParseMinutes,
  parseIdempotency: spkParseIdempotency,
  randomBytes: spkRandomBytes,
  formatJakarta: spkFormatJakarta,
  dayCode: spkDayCode,
  nowMinutes: spkNowMinutes,
  stringify: spkStringify,
  setting: spkSetting,
  allSettings: spkAllSettings,
  invalidateSettings: spkInvalidateSettings,
  logAudit: spkLogAudit,
  createNotification: spkCreateNotification,
  notifyRole: spkNotifyRole,
  requireString: spkRequireString,
  requireOneOf: spkRequireOneOf,
  findAuditByRequest: spkFindAuditByRequest,
  idempotentResult: spkIdempotentResult
};
