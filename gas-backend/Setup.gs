/**
 * Setup.gs - inisialisasi spreadsheet, seed minimal, validasi, migrasi,
 * dan trigger backup tiap 6 jam.
 */

function spkSettingToCell(value) {
  if (typeof value === 'object') { return spkStringify(value); }
  if (typeof value === 'boolean') { return value ? 'TRUE' : 'FALSE'; }
  return String(value);
}

function spkSetupDatabase() {
  var id = spkGetProperty(SIPIKET_Config.SPREADSHEET_ID_KEY);
  var ss = id ? SpreadsheetApp.openById(id) : SpreadsheetApp.create('SIPIKET Database');
  if (!id) {
    spkSetProperty(SIPIKET_Config.SPREADSHEET_ID_KEY, ss.getId());
  }
  spkSetSpreadsheet(ss);

  var names = SIPIKET_Config.SHEET_NAMES.slice();
  for (var i = 0; i < names.length; i++) {
    spkEnsureSheet(names[i], SIPIKET_Config.SHEET_SCHEMAS[names[i]], false);
  }
  spkEnsureSheet('SESSIONS', SIPIKET_Config.SHEET_SCHEMAS.SESSIONS, true);

  var settingsRows = spkGetRows('SCHOOL_SETTINGS');
  var keys = Object.keys(SIPIKET_Config.DEFAULT_SETTINGS);
  var toAdd = [];
  for (var k = 0; k < keys.length; k++) {
    var key = keys[k];
    var found = false;
    for (var r = 0; r < settingsRows.length; r++) {
      if (settingsRows[r].settingKey === key) { found = true; break; }
    }
    if (!found) {
      toAdd.push({
        settingKey: key,
        settingValue: spkSettingToCell(SIPIKET_Config.DEFAULT_SETTINGS[key]),
        scope: 'SCHOOL',
        status: 'ACTIVE'
      });
    }
  }
  if (toAdd.length) { SIPIKET_Store.batchAppend('SCHOOL_SETTINGS', toAdd); }
  spkInvalidate('SCHOOL_SETTINGS');

  SIPIKET_Store.setConfig('dbVersion', SIPIKET_Config.DEFAULT_SETTINGS.dbVersion);
  SIPIKET_Store.setConfig('initialized', true);
  if (!SIPIKET_Store.getConfig('seedDone', '')) {
    SIPIKET_Store.setConfig('seedDone', false);
  }
  spkBackupFolder();
  spkInvalidateSettings();

  return {
    initialized: true,
    spreadsheetId: ss.getId(),
    spreadsheetUrl: ss.getUrl(),
    sheets: SIPIKET_Config.SHEET_NAMES.concat(['SESSIONS']),
    version: SIPIKET_Config.APP_VERSION
  };
}

function spkSeedPassword(propertyName) {
  var value = spkGetProperty(propertyName);
  return value || spkUuid().slice(0, 12);
}

function spkSeedUser(username, password, role, fullName, teacherId, classId) {
  var salt = spkNewSalt();
  return SIPIKET_Store.appendRow('USERS', {
    username: username,
    passwordHash: spkHashPassword(password, salt),
    salt: salt,
    role: role,
    fullName: fullName,
    email: '',
    teacherId: teacherId || '',
    classId: classId || '',
    phone: '',
    active: true,
    failedAttempts: 0,
    lockedUntil: '',
    lastLoginAt: ''
  });
}

function spkSeedInitialData() {
  var done = SIPIKET_Store.getConfig('seedDone', false);
  if (done === true || done === 'true' || done === 'TRUE') {
    return { seeded: false, reason: 'Seed sudah pernah dijalankan.' };
  }

  var passwords = {
    SUPERADMIN: spkSeedPassword('SEED_ADMIN_PASSWORD'),
    KEPALA_SEKOLAH: spkSeedPassword('SEED_HEAD_PASSWORD'),
    GURU_PIKET: spkSeedPassword('SEED_DUTY_PASSWORD'),
    GURU_MAPEL: spkSeedPassword('SEED_SUBJECT_PASSWORD'),
    WALI_KELAS: spkSeedPassword('SEED_HOMEROOM_PASSWORD')
  };

  return spkWithLock(function () {
    var classRow = SIPIKET_Store.appendRow('CLASSES', {
      name: 'X SIPIKET 1',
      grade: 'X',
      homeroomTeacherId: '',
      room: 'A1',
      academicYear: spkSanitize(spkSetting('academicYear'), 30),
      active: true
    });
    var teacher = SIPIKET_Store.appendRow('TEACHERS', {
      nip: '198001012026011001',
      name: 'Guru Contoh',
      email: '',
      phone: '',
      subject: 'Umum',
      active: true,
      photoUrl: ''
    });
    SIPIKET_Store.updateRow('CLASSES', classRow.id, { homeroomTeacherId: teacher.id });

    var students = [];
    for (var i = 1; i <= 3; i++) {
      students.push(SIPIKET_Store.appendRow('STUDENTS', {
        nis: '100' + i,
        nisn: '',
        name: 'Siswa Contoh ' + i,
        classId: classRow.id,
        gender: '',
        birthDate: '',
        photoUrl: '',
        barcodeToken: 'BC-SEED-' + spkUuid(),
        barcodeActive: true,
        active: true,
        parentName: '',
        parentPhone: ''
      }));
    }

    var subject = SIPIKET_Store.appendRow('SUBJECTS', {
      code: 'UMUM', name: 'Mata Pelajaran Umum', active: true
    });
    var dayCode = spkDayCode(new Date());
    var schedule = SIPIKET_Store.appendRow('SCHEDULES', {
      day: dayCode,
      classId: classRow.id,
      subjectId: subject.id,
      teacherId: teacher.id,
      startMinutes: spkSetting('bellMorningMinutes', 420),
      endMinutes: spkSetting('bellMorningMinutes', 420) + 45,
      room: classRow.room,
      academicYear: spkSanitize(spkSetting('academicYear'), 30),
      semester: spkSanitize(spkSetting('semester'), 30),
      active: true
    });
    SIPIKET_Store.appendRow('DUTY_SCHEDULES', {
      date: spkTodayJakarta(),
      teacherId: teacher.id,
      role: 'MAIN',
      active: true,
      notes: 'Jadwal piket contoh'
    });

    var users = {
      SUPERADMIN: spkSeedUser('admin', passwords.SUPERADMIN, 'SUPERADMIN', 'Administrator', '', ''),
      KEPALA_SEKOLAH: spkSeedUser('kepala', passwords.KEPALA_SEKOLAH, 'KEPALA_SEKOLAH', 'Kepala Sekolah', '', ''),
      GURU_PIKET: spkSeedUser('piket', passwords.GURU_PIKET, 'GURU_PIKET', 'Guru Piket', teacher.id, ''),
      GURU_MAPEL: spkSeedUser('mapel', passwords.GURU_MAPEL, 'GURU_MAPEL', 'Guru Mapel', teacher.id, ''),
      WALI_KELAS: spkSeedUser('wali', passwords.WALI_KELAS, 'WALI_KELAS', 'Wali Kelas', teacher.id, classRow.id)
    };

    var publicUsers = {};
    for (var role in users) {
      if (Object.prototype.hasOwnProperty.call(users, role)) {
        publicUsers[role] = spkPublicUser(users[role]);
      }
    }
    SIPIKET_Store.setConfig('seedDone', true);
    return {
      seeded: true,
      passwords: passwords,
      class: classRow,
      teacher: teacher,
      students: students,
      subject: subject,
      schedule: schedule,
      users: publicUsers,
      note: 'Simpan password ini sekarang; tidak ditampilkan lagi oleh setup.seed.'
    };
  });
}

function spkValidateDatabase() {
  var issues = [];
  var names = SIPIKET_Config.SHEET_NAMES.concat(['SESSIONS']);
  for (var i = 0; i < names.length; i++) {
    var name = names[i];
    var expected = SIPIKET_Config.SHEET_SCHEMAS[name];
    try {
      var raw = spkReadRaw(name);
      for (var h = 0; h < expected.length; h++) {
        if (raw.headers[h] !== expected[h]) {
          issues.push('Sheet ' + name + ': header kolom ' + (h + 1) + ' seharusnya ' + expected[h]);
        }
      }
    } catch (err) {
      issues.push('Sheet ' + name + ' tidak ditemukan.');
    }
  }
  var keys = Object.keys(SIPIKET_Config.DEFAULT_SETTINGS);
  var settings = spkGetRows('SCHOOL_SETTINGS');
  for (var k = 0; k < keys.length; k++) {
    var found = false;
    for (var s = 0; s < settings.length; s++) {
      if (settings[s].settingKey === keys[k]) { found = true; break; }
    }
    if (!found) { issues.push('Pengaturan ' + keys[k] + ' belum ada.'); }
  }
  var usernames = {};
  var users = spkGetRows('USERS');
  for (var u = 0; u < users.length; u++) {
    var un = String(users[u].username || '').toLowerCase();
    if (usernames[un]) { issues.push('Username duplikat: ' + un); }
    usernames[un] = true;
  }
  var barcodes = {};
  var students = spkGetRows('STUDENTS');
  for (var st = 0; st < students.length; st++) {
    var bc = students[st].barcodeToken;
    if (bc && barcodes[bc]) { issues.push('Barcode duplikat: ' + bc); }
    barcodes[bc] = true;
  }
  return { valid: issues.length === 0, issues: issues, checkedSheets: names.length };
}

function spkMigrateDatabase() {
  var added = {};
  var names = SIPIKET_Config.SHEET_NAMES.slice();
  for (var i = 0; i < names.length; i++) {
    var name = names[i];
    var schema = SIPIKET_Config.SHEET_SCHEMAS[name];
    var sheet = spkSpreadsheet().getSheetByName(name);
    if (!sheet) {
      spkEnsureSheet(name, schema, false);
      added[name] = schema.slice();
      continue;
    }
    spkWithLock(function () {
      var raw = spkReadRaw(name);
      var present = {};
      for (var h = 0; h < raw.headers.length; h++) { present[raw.headers[h]] = h; }
      var missing = [];
      for (var c = 0; c < schema.length; c++) {
        if (!Object.prototype.hasOwnProperty.call(present, schema[c])) { missing.push(schema[c]); }
      }
      if (!missing.length) { return; }
      var matrix = [schema.slice()];
      for (var r = 0; r < raw.values.length; r++) {
        var mapped = {};
        for (var oldIndex = 0; oldIndex < raw.headers.length; oldIndex++) {
          mapped[raw.headers[oldIndex]] = spkCellToString(raw.values[r][oldIndex]);
        }
        var next = [];
        for (var n = 0; n < schema.length; n++) { next.push(mapped[schema[n]] || ''); }
        matrix.push(next);
      }
      raw.sheet.getRange(1, 1, matrix.length, schema.length).setValues(matrix);
      spkInvalidate(name);
      added[name] = missing;
    });
  }
  if (!spkSpreadsheet().getSheetByName('SESSIONS')) {
    spkEnsureSheet('SESSIONS', SIPIKET_Config.SHEET_SCHEMAS.SESSIONS, true);
  }
  SIPIKET_Store.setConfig('dbVersion', SIPIKET_Config.DEFAULT_SETTINGS.dbVersion);
  return { migrated: true, added: added, version: SIPIKET_Config.DEFAULT_SETTINGS.dbVersion };
}

function spkInstallBackupTriggers() {
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === 'spkScheduledBackup') {
      ScriptApp.deleteTrigger(triggers[i]);
    }
  }
  var trigger = ScriptApp.newTrigger('spkScheduledBackup').timeBased().everyHours(6).create();
  return { installed: true, triggerId: trigger.getUniqueId() };
}

function spkSetupStatus(payload, user) {
  var id = spkGetProperty(SIPIKET_Config.SPREADSHEET_ID_KEY);
  var initialized = false;
  var url = '';
  var sheets = [];
  if (id) {
    try {
      var ss = spkSpreadsheet();
      initialized = true;
      url = ss.getUrl();
      sheets = SIPIKET_Config.SHEET_NAMES.filter(function (name) { return !!ss.getSheetByName(name); });
    } catch (err) {
      initialized = false;
    }
  }
  return {
    initialized: initialized,
    spreadsheetUrl: url,
    sheets: sheets,
    version: SIPIKET_Config.APP_VERSION
  };
}

function setupDatabase() { return spkSetupDatabase(); }
function seedInitialData() { return spkSeedInitialData(); }
function validateDatabase() { return spkValidateDatabase(); }
function migrateDatabase() { return spkMigrateDatabase(); }
function backupDatabase() { return spkBackupCreate('MANUAL', spkCurrentActor()); }
function installBackupTriggers() { return spkInstallBackupTriggers(); }
