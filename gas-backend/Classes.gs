/**
 * Classes.gs - kelas, mapel, jadwal, piket, pengaturan sekolah, dan hari libur.
 * Konfigurasi sekolah dibaca/tulis melalui SCHOOL_SETTINGS, bukan hardcode.
 */

var SPK_DAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];

function spkClassesList(payload, user) {
  var rows = SIPIKET_Store.getRows('CLASSES');
  if (payload && payload.classId) {
    rows = rows.filter(function (c) { return c.id === payload.classId; });
  }
  if (user.role === 'WALI_KELAS') {
    rows = rows.filter(function (c) { return c.id === user.classId; });
  }
  return { items: rows };
}

function spkClassesCreate(payload, user) {
  spkAssertSuperadmin(user);
  var row = SIPIKET_Store.appendRow('CLASSES', {
    name: spkRequireString(payload, 'name', 'Nama kelas', 120),
    grade: spkSanitize(payload && payload.grade, 30),
    homeroomTeacherId: spkSanitize(payload && payload.homeroomTeacherId, 120),
    room: spkSanitize(payload && payload.room, 60),
    academicYear: spkSanitize(payload && payload.academicYear,
      spkSetting('academicYear', SIPIKET_Config.DEFAULT_SETTINGS.academicYear), 30),
    active: true
  });
  spkLogAudit('classes.create', 'CLASSES', row.id, {}, row, 'Kelas dibuat',
    spkParseIdempotency(payload), user);
  return { class: row };
}

function spkClassesUpdate(payload, user) {
  spkAssertSuperadmin(user);
  var id = spkRequireString(payload, 'id', 'Id kelas', 120);
  var patch = spkPickPatch(payload && payload.patch,
    ['name', 'grade', 'homeroomTeacherId', 'room', 'academicYear', 'active', 'status']);
  var updated = SIPIKET_Store.updateRow('CLASSES', id, patch);
  spkLogAudit('classes.update', 'CLASSES', id, {}, patch, 'Kelas diperbarui',
    spkParseIdempotency(payload), user);
  return { class: updated };
}

function spkSubjectsList(payload, user) {
  return { items: SIPIKET_Store.getRows('SUBJECTS') };
}

function spkSubjectsCreate(payload, user) {
  spkAssertSuperadmin(user);
  var row = SIPIKET_Store.appendRow('SUBJECTS', {
    code: spkRequireString(payload, 'code', 'Kode mapel', 40),
    name: spkRequireString(payload, 'name', 'Nama mapel', 150),
    active: true
  });
  spkLogAudit('subjects.create', 'SUBJECTS', row.id, {}, row, 'Mapel dibuat',
    spkParseIdempotency(payload), user);
  return { subject: row };
}

function spkSubjectsUpdate(payload, user) {
  spkAssertSuperadmin(user);
  var id = spkRequireString(payload, 'id', 'Id mapel', 120);
  var patch = spkPickPatch(payload && payload.patch, ['code', 'name', 'active', 'status']);
  var updated = SIPIKET_Store.updateRow('SUBJECTS', id, patch);
  spkLogAudit('subjects.update', 'SUBJECTS', id, {}, patch, 'Mapel diperbarui',
    spkParseIdempotency(payload), user);
  return { subject: updated };
}

function spkSchedulePatch(input) {
  input = input && typeof input === 'object' ? input : {};
  var patch = spkPickPatch(input,
    ['day', 'classId', 'subjectId', 'teacherId', 'startMinutes', 'endMinutes',
      'room', 'academicYear', 'semester', 'active', 'status']);
  if (patch.day) { patch.day = spkRequireOneOf(patch.day, SPK_DAYS, 'Hari'); }
  var start = spkParseMinutes(input.startMinutes);
  var end = spkParseMinutes(input.endMinutes);
  if (start !== null) { patch.startMinutes = start; }
  if (end !== null) { patch.endMinutes = end; }
  if (patch.classId) { spkAssert(!!spkClassById(patch.classId), 'BAD_REQUEST', 'Kelas tidak ditemukan.'); }
  if (!patch.academicYear) {
    patch.academicYear = spkSanitize(spkSetting('academicYear'), 30);
  }
  if (!patch.semester) {
    patch.semester = spkSanitize(spkSetting('semester'), 30);
  }
  return patch;
}

function spkSchedulesList(payload, user) {
  var data = payload && typeof payload === 'object' ? payload : {};
  var rows = SIPIKET_Store.getRows('SCHEDULES');
  if (data.day) { rows = rows.filter(function (s) { return s.day === data.day; }); }
  if (data.classId) { rows = rows.filter(function (s) { return s.classId === data.classId; }); }
  if (user.role === 'GURU_MAPEL' && user.teacherId) {
    rows = rows.filter(function (s) { return s.teacherId === user.teacherId; });
  }
  if (user.role === 'WALI_KELAS') {
    rows = rows.filter(function (s) { return s.classId === user.classId; });
  }
  return { items: rows };
}

function spkSchedulesSave(payload, user) {
  spkAssertSuperadmin(user);
  var requestId = spkParseIdempotency(payload);
  var cached = spkIdempotentResult('schedules.save', requestId);
  if (cached) { return cached; }
  var inputs = [];
  if (payload && Array.isArray(payload.rows)) { inputs = payload.rows; }
  else if (payload && payload.schedule) { inputs = [payload.schedule]; }
  else { inputs = [payload]; }
  spkAssert(inputs.length > 0 && inputs.length <= 200, 'BAD_REQUEST', 'Jumlah jadwal tidak valid.');
  var created = [];
  var updated = [];
  for (var i = 0; i < inputs.length; i++) {
    var patch = spkSchedulePatch(inputs[i]);
    if (inputs[i].id) {
      updated.push(SIPIKET_Store.updateRow('SCHEDULES', inputs[i].id, patch));
    } else {
      created.push(SIPIKET_Store.appendRow('SCHEDULES', patch));
    }
  }
  var result = { created: created, updated: updated, items: created.concat(updated) };
  spkLogAudit('schedules.save', 'SCHEDULES', '', {}, { __result: result },
    'Jadwal disimpan', requestId, user);
  return result;
}

function spkDutyList(payload, user) {
  var data = payload && typeof payload === 'object' ? payload : {};
  var rows = SIPIKET_Store.getRows('DUTY_SCHEDULES');
  if (data.date) { rows = rows.filter(function (d) { return d.date === data.date; }); }
  if (data.from) { rows = rows.filter(function (d) { return d.date >= data.from; }); }
  if (data.to) { rows = rows.filter(function (d) { return d.date <= data.to; }); }
  if (data.teacherId) { rows = rows.filter(function (d) { return d.teacherId === data.teacherId; }); }
  return { items: rows };
}

function spkDutySave(payload, user) {
  spkAssertSuperadmin(user);
  var requestId = spkParseIdempotency(payload);
  var cached = spkIdempotentResult('duty.save', requestId);
  if (cached) { return cached; }
  var date = spkParseDate(payload && payload.date);
  spkAssert(!!date, 'BAD_REQUEST', 'Tanggal piket tidak valid.');
  var teacherId = spkRequireString(payload, 'teacherId', 'Id guru', 120);
  var role = spkRequireOneOf(payload && payload.role, ['MAIN', 'BACKUP'], 'Role piket');
  var active = !(payload && (payload.active === false || payload.active === 'false' || payload.active === 'FALSE'));
  var notes = spkSanitize(payload && payload.notes, 500);
  var row = null;
  if (payload && payload.id) {
    row = SIPIKET_Store.updateRow('DUTY_SCHEDULES', payload.id, {
      date: date, teacherId: teacherId, role: role, active: active, notes: notes
    });
  } else {
    row = SIPIKET_Store.appendRow('DUTY_SCHEDULES', {
      date: date, teacherId: teacherId, role: role, active: active, notes: notes
    });
  }
  if (role === 'BACKUP' && active) { SIPIKET_Store.setConfig('BACKUP_ACTIVATED', true); }
  var result = { duty: row };
  spkLogAudit('duty.save', 'DUTY_SCHEDULES', row.id, {}, { __result: result },
    'Jadwal piket disimpan', requestId, user);
  return result;
}

function spkSettingsList(payload, user) {
  return { items: spkAllSettings(), values: spkAllSettings() };
}

function spkSettingsPublic(payload, user) {
  var settings = spkAllSettings();
  return {
    schoolName: settings.schoolName,
    npsn: settings.npsn,
    logoUrl: settings.logoUrl,
    academicYear: settings.academicYear,
    semester: settings.semester,
    bellMorning: settings.bellMorningMinutes,
    bellAfternoon: settings.bellAfternoonMinutes,
    lateLimitMinutes: settings.lateLimitMinutes,
    dutyOpenMinutes: settings.dutyOpenMinutes,
    schoolDays: settings.schoolDays,
    pollIntervalMs: settings.pollIntervalMs
  };
}

function spkSettingsSave(payload, user) {
  spkAssertSuperadmin(user);
  var values = payload && payload.values && typeof payload.values === 'object' ? payload.values : {};
  var updated = {};
  spkWithLock(function () {
    var keys = Object.keys(values);
    for (var i = 0; i < keys.length; i++) {
      var key = keys[i];
      spkAssert(Object.prototype.hasOwnProperty.call(SIPIKET_Config.DEFAULT_SETTINGS, key),
        'BAD_REQUEST', 'Kunci pengaturan tidak dikenal: ' + key);
      var value = values[key];
      if (typeof value === 'object') { value = spkStringify(value); }
      else { value = String(value); }
      var existing = SIPIKET_Store.findRow('SCHOOL_SETTINGS', function (s) { return s.settingKey === key; });
      if (existing) {
        SIPIKET_Store.updateRow('SCHOOL_SETTINGS', existing.id, { settingValue: value });
      } else {
        SIPIKET_Store.appendRow('SCHOOL_SETTINGS', {
          settingKey: key, settingValue: value, scope: 'SCHOOL', status: 'ACTIVE'
        });
      }
      updated[key] = value;
    }
    spkInvalidateSettings();
  });
  spkInvalidateSettings();
  SIPIKET_Store.invalidate('SCHOOL_SETTINGS');
  spkLogAudit('settings.save', 'SCHOOL_SETTINGS', '', {}, { __result: { values: values } },
    'Pengaturan sekolah diperbarui', spkParseIdempotency(payload), user);
  return { values: spkAllSettings(), updated: updated };
}

function spkHolidaysList(payload, user) {
  var rows = SIPIKET_Store.getRows('HOLIDAYS');
  if (payload && payload.from) { rows = rows.filter(function (h) { return h.date >= payload.from; }); }
  if (payload && payload.to) { rows = rows.filter(function (h) { return h.date <= payload.to; }); }
  return { items: rows };
}

function spkHolidaysCreate(payload, user) {
  spkAssertSuperadmin(user);
  var date = spkParseDate(payload && payload.date);
  spkAssert(!!date, 'BAD_REQUEST', 'Tanggal libur tidak valid.');
  var row = SIPIKET_Store.appendRow('HOLIDAYS', {
    date: date,
    holidayType: spkRequireOneOf(payload && payload.holidayType,
      ['NATIONAL', 'SCHOOL', 'SPECIAL', 'OTHER'], 'Jenis libur'),
    label: spkRequireString(payload, 'label', 'Label libur', 200),
    active: true
  });
  spkLogAudit('holidays.create', 'HOLIDAYS', row.id, {}, row, 'Hari libur dibuat',
    spkParseIdempotency(payload), user);
  return { holiday: row };
}

function spkHolidaysDelete(payload, user) {
  spkAssertSuperadmin(user);
  var id = spkRequireString(payload, 'id', 'Id libur', 120);
  var row = SIPIKET_Store.updateRow('HOLIDAYS', id, { active: false, status: 'INACTIVE' });
  spkLogAudit('holidays.delete', 'HOLIDAYS', id, {}, row, 'Hari libur dihapus',
    spkParseIdempotency(payload), user);
  return { holiday: row };
}
