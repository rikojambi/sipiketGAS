/**
 * Code.gs - entry point Web App (JSONP GET + fallback POST) dan router envelope.
 * Token/password tidak pernah ditulis ke log.
 */

var SPK_CALLBACK_PATTERN = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

function spkParseRequest(e) {
  var params = e && e.parameter ? e.parameter : {};
  var action = spkSanitize(params.action, 120);
  var payload = spkSafeJson(params.payload, {});
  if (!payload || typeof payload !== 'object') { payload = {}; }
  return { params: params, action: action, payload: payload };
}

function spkParsePostRequest(e) {
  var raw = e && e.postData && e.postData.contents ? e.postData.contents : '';
  var parsed = spkSafeJson(raw, null);
  if (parsed && typeof parsed === 'object') {
    var bodyPayload = parsed.payload && typeof parsed.payload === 'object'
      ? parsed.payload : parsed;
    return {
      params: parsed,
      action: spkSanitize(parsed.action || (e && e.parameter ? e.parameter.action : ''), 120),
      payload: bodyPayload
    };
  }
  return spkParseRequest(e);
}

function spkDispatch(action, payload, user) {
  switch (action) {
    /* Publik */
    case 'ping':
      return {
        pong: true,
        serverTime: spkNowIsoJakarta(),
        version: SIPIKET_Config.APP_VERSION,
        spreadsheetReady: !!spkGetProperty(SIPIKET_Config.SPREADSHEET_ID_KEY)
      };
    case 'login':
      return spkLogin(payload);

    /* Umum */
    case 'logout':
      return spkLogout(payload);
    case 'me':
      return spkMe(payload);
    case 'notifications.list':
      return spkNotificationsList(payload, user);
    case 'notifications.read':
      return spkNotificationsRead(payload, user);
    case 'settings.public':
      return spkSettingsPublic(payload, user);

    /* Setup & backup */
    case 'setup.status':
      return spkSetupStatus(payload, user);
    case 'setup.database':
      return spkSetupDatabase();
    case 'setup.seed':
      return spkSeedInitialData();
    case 'setup.validate':
      return spkValidateDatabase();
    case 'setup.migrate':
      return spkMigrateDatabase();
    case 'backup.create':
      return spkBackupCreate(payload && payload.reason, user);
    case 'backup.list':
      return spkBackupList(payload, user);
    case 'backup.restore':
      return spkBackupRestore(payload, user);

    /* Users, teachers, students, barcode */
    case 'users.list':
      return spkUsersList(payload, user);
    case 'users.create':
      return spkUsersCreate(payload, user);
    case 'users.update':
      return spkUsersUpdate(payload, user);
    case 'users.setPassword':
      return spkUsersSetPassword(payload, user);
    case 'users.deactivate':
      return spkUsersDeactivate(payload, user);
    case 'teachers.list':
      return spkTeachersList(payload, user);
    case 'teachers.create':
      return spkTeachersCreate(payload, user);
    case 'teachers.update':
      return spkTeachersUpdate(payload, user);
    case 'students.list':
      return spkStudentsList(payload, user);
    case 'students.get':
      return spkStudentsGet(payload, user);
    case 'students.create':
      return spkStudentsCreate(payload, user);
    case 'students.update':
      return spkStudentsUpdate(payload, user);
    case 'students.import':
      return spkStudentsImport(payload, user);
    case 'students.regenerateBarcode':
      return spkStudentsRegenerateBarcode(payload, user);
    case 'barcode.lookup':
      return spkBarcodeLookup(payload, user);

    /* Kelas, mapel, jadwal, piket, pengaturan, libur */
    case 'classes.list':
      return spkClassesList(payload, user);
    case 'classes.create':
      return spkClassesCreate(payload, user);
    case 'classes.update':
      return spkClassesUpdate(payload, user);
    case 'subjects.list':
      return spkSubjectsList(payload, user);
    case 'subjects.create':
      return spkSubjectsCreate(payload, user);
    case 'subjects.update':
      return spkSubjectsUpdate(payload, user);
    case 'schedules.list':
      return spkSchedulesList(payload, user);
    case 'schedules.save':
      return spkSchedulesSave(payload, user);
    case 'duty.list':
      return spkDutyList(payload, user);
    case 'duty.save':
      return spkDutySave(payload, user);
    case 'settings.list':
      return spkSettingsList(payload, user);
    case 'settings.save':
      return spkSettingsSave(payload, user);
    case 'holidays.list':
      return spkHolidaysList(payload, user);
    case 'holidays.create':
      return spkHolidaysCreate(payload, user);
    case 'holidays.delete':
      return spkHolidaysDelete(payload, user);

    /* Absensi, izin, pergerakan, konsekuensi */
    case 'attendance.scan':
      return spkAttendanceScan(payload, user);
    case 'attendance.manual':
      return spkAttendanceManual(payload, user);
    case 'attendance.correct':
      return spkAttendanceCorrect(payload, user);
    case 'late.record':
      return spkLateRecord(payload, user);
    case 'consequence.create':
      return spkConsequenceCreate(payload, user);
    case 'consequence.list':
      return spkConsequenceList(payload, user);
    case 'consequence.update':
      return spkConsequenceUpdate(payload, user);
    case 'permits.create':
      return spkPermitsCreate(payload, user);
    case 'permits.list':
      return spkPermitsList(payload, user);
    case 'permits.approve':
      return spkPermitsApprove(payload, user);
    case 'movement.out':
      return spkMovementOut(payload, user);
    case 'movement.return':
      return spkMovementReturn(payload, user);
    case 'movement.earlyLeave':
      return spkMovementEarlyLeave(payload, user);
    case 'movement.list':
      return spkMovementList(payload, user);

    /* Monitoring & penggantian */
    case 'monitoring.list':
      return spkMonitoringList(payload, user);
    case 'monitoring.save':
      return spkMonitoringSave(payload, user);
    case 'monitoring.summary':
      return spkMonitoringSummary(payload, user);
    case 'substitute.assign':
      return spkSubstituteAssign(payload, user);
    case 'substitute.list':
      return spkSubstituteList(payload, user);
    case 'substitute.update':
      return spkSubstituteUpdate(payload, user);

    /* Dashboard, laporan, audit */
    case 'dashboard.get':
      return spkDashboardGet(payload, user);
    case 'reports.get':
      return spkReportsGet(payload, user);
    case 'reports.export':
      return spkReportsExport(payload, user);
    case 'audit.list':
      return spkAuditList(payload, user);

    default:
      throw spkError('BAD_REQUEST', 'Aksi tidak dikenal.');
  }
}

function spkHandleAction(action, payload) {
  var name = spkSanitize(action, 120);
  var data = payload && typeof payload === 'object' ? payload : {};
  var requestId = spkParseIdempotency(data) || spkUuid();
  var response = null;

  try {
    if (!spkIsKnownAction(name)) {
      throw spkError('BAD_REQUEST', 'Aksi tidak dikenal.');
    }
    var user = spkAuthorize(name, data);
    var result = spkDispatch(name, data, user);
    response = result && typeof result.ok !== 'undefined' ? result : spkOk(result);
  } catch (err) {
    var code = spkSanitize(err && err.code, 60) || 'SERVER_ERROR';
    var allowed = ['BAD_REQUEST', 'UNAUTHORIZED', 'FORBIDDEN', 'NOT_FOUND', 'CONFLICT',
      'RATE_LIMITED', 'EXPIRED', 'SERVER_ERROR', 'OFFLINE'];
    if (allowed.indexOf(code) === -1) { code = 'SERVER_ERROR'; }
    var message = spkSanitize(err && err.message, 400) || 'Terjadi kesalahan pada server.';
    if (code === 'SERVER_ERROR') { message = 'Terjadi kesalahan pada server.'; }
    response = spkFail(code, message, err && err.details ? err.details : {});
  }

  response.requestId = requestId;
  response.serverTime = spkNowIsoJakarta();
  response.version = SIPIKET_Config.APP_VERSION;
  return response;
}

function doGet(e) {
  var parsed = spkParseRequest(e);
  var callback = String(parsed.params.callback || '');
  var response = null;

  if (callback) {
    // Cegah reflected XSS: callback harus identifier JavaScript yang valid.
    if (!SPK_CALLBACK_PATTERN.test(callback)) {
      response = spkFail('BAD_REQUEST', 'Nama callback tidak valid.', {});
      response.requestId = spkParseIdempotency(parsed.payload) || spkUuid();
      return ContentService.createTextOutput(JSON.stringify(response))
        .setMimeType(ContentService.MimeType.JSON);
    }
    response = spkHandleAction(parsed.action, parsed.payload);
    return ContentService.createTextOutput(callback + '(' + JSON.stringify(response) + ');')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }

  response = spkHandleAction(parsed.action, parsed.payload);
  return ContentService.createTextOutput(JSON.stringify(response))
    .setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  var parsed = spkParsePostRequest(e);
  var response = spkHandleAction(parsed.action, parsed.payload);
  var mime = ContentService.MimeType.TEXT || ContentService.MimeType.PLAIN_TEXT;
  return ContentService.createTextOutput(JSON.stringify(response)).setMimeType(mime);
}
