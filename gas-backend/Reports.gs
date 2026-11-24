/**
 * Reports.gs - laporan, dashboard, dan audit.
 * Setiap sheet dibaca maksimal sekali per request melalui cache lokal `cache`.
 */

var SPK_REPORT_TYPES = ['attendance', 'late', 'permits', 'movements', 'kbm', 'duty', 'audit', 'teacher_activity'];

function spkReportTable(cache, name) {
  if (!Object.prototype.hasOwnProperty.call(cache, name)) {
    cache[name] = SIPIKET_Store.getRows(name);
  }
  return cache[name];
}

function spkReportColumns(type) {
  var map = {
    attendance: ['id', 'date', 'session', 'studentId', 'classId', 'attendanceStatus', 'scannedAt', 'scanSource', 'recordedBy', 'note', 'corrected'],
    late: ['id', 'date', 'studentId', 'classId', 'arrivalAt', 'lateMinutes', 'session', 'recordedBy', 'consequenceStatus'],
    permits: ['id', 'date', 'studentId', 'classId', 'type', 'reason', 'approvalStatus', 'approvedBy', 'reporterId'],
    movements: ['id', 'date', 'studentId', 'classId', 'type', 'outAt', 'returnAt', 'movementStatus', 'purpose', 'durationMinutes'],
    kbm: ['id', 'date', 'scheduleId', 'classId', 'subjectId', 'expectedTeacherId', 'monitoringStatus', 'verificationStatus', 'checkedAt', 'checkedBy'],
    duty: ['id', 'date', 'teacherId', 'role', 'active', 'notes'],
    audit: ['id', 'createdAt', 'action', 'entity', 'entityId', 'actorId', 'actorName', 'reason', 'requestId'],
    teacher_activity: ['actorId', 'actorName', 'date', 'activityType', 'entityId', 'details', 'createdAt']
  };
  return map[type] || [];
}

function spkReportSource(cache, type) {
  var map = {
    attendance: 'ATTENDANCE',
    late: 'LATE_RECORDS',
    permits: 'STUDENT_PERMITS',
    movements: 'STUDENT_MOVEMENTS',
    kbm: 'CLASS_MONITORING',
    duty: 'DUTY_SCHEDULES',
    audit: 'AUDIT_LOG'
  };
  if (type === 'teacher_activity') { return null; }
  return map[type];
}

function spkReportMatches(row, filters, type) {
  if (filters.from && row.date && String(row.date) < filters.from) { return false; }
  if (filters.to && row.date && String(row.date) > filters.to) { return false; }
  if (filters.classId && row.classId && row.classId !== filters.classId) { return false; }
  if (filters.studentId && row.studentId && row.studentId !== filters.studentId) { return false; }
  if (filters.teacherId) {
    var teacherFields = ['teacherId', 'expectedTeacherId', 'recordedBy', 'checkedBy', 'assignedBy', 'actorId', 'approvedBy'];
    var found = false;
    for (var i = 0; i < teacherFields.length; i++) {
      if (row[teacherFields[i]] === filters.teacherId) { found = true; break; }
    }
    if (!found) { return false; }
  }
  if (filters.transactionType) {
    var t = String(filters.transactionType).toUpperCase();
    var values = [row.type, row.action, row.attendanceStatus, row.monitoringStatus, row.assignmentStatus];
    if (values.indexOf(t) === -1 && String(row.type || '').toUpperCase().indexOf(t) === -1) { return false; }
  }
  if (type === 'audit' && filters.entity && row.entity !== filters.entity) { return false; }
  return true;
}

function spkTeacherActivityRows(cache, filters) {
  var result = [];
  var attendance = spkReportTable(cache, 'ATTENDANCE');
  var monitoring = spkReportTable(cache, 'CLASS_MONITORING');
  var substitutes = spkReportTable(cache, 'SUBSTITUTE_ASSIGNMENTS');
  var duty = spkReportTable(cache, 'DUTY_SCHEDULES');
  var i;
  for (i = 0; i < attendance.length; i++) {
    result.push({
      actorId: attendance[i].recordedBy, actorName: spkTeacherName(attendance[i].recordedBy),
      date: attendance[i].date, activityType: 'ATTENDANCE', entityId: attendance[i].id,
      details: attendance[i].attendanceStatus, createdAt: attendance[i].createdAt,
      classId: attendance[i].classId
    });
  }
  for (i = 0; i < monitoring.length; i++) {
    result.push({
      actorId: monitoring[i].checkedBy, actorName: spkTeacherName(monitoring[i].checkedBy),
      date: monitoring[i].date, activityType: 'MONITORING', entityId: monitoring[i].id,
      details: monitoring[i].monitoringStatus, createdAt: monitoring[i].createdAt,
      classId: monitoring[i].classId
    });
  }
  for (i = 0; i < substitutes.length; i++) {
    result.push({
      actorId: substitutes[i].assignedBy, actorName: spkTeacherName(substitutes[i].assignedBy),
      date: substitutes[i].date, activityType: 'SUBSTITUTE', entityId: substitutes[i].id,
      details: substitutes[i].taskType, createdAt: substitutes[i].createdAt,
      classId: substitutes[i].classId
    });
  }
  for (i = 0; i < duty.length; i++) {
    result.push({
      actorId: duty[i].teacherId, actorName: spkTeacherName(duty[i].teacherId),
      date: duty[i].date, activityType: 'DUTY', entityId: duty[i].id,
      details: duty[i].role, createdAt: duty[i].createdAt, classId: ''
    });
  }
  return result;
}

function spkReportsGet(payload, user) {
  var data = payload && typeof payload === 'object' ? payload : {};
  var type = spkRequireOneOf(data.type, SPK_REPORT_TYPES, 'Jenis laporan');
  var filters = {
    from: spkParseDate(data.from) || '',
    to: spkParseDate(data.to) || '',
    classId: spkSanitize(data.classId, 120),
    studentId: spkSanitize(data.studentId, 120),
    teacherId: spkSanitize(data.teacherId, 120),
    transactionType: spkSanitize(data.transactionType, 60),
    entity: spkSanitize(data.entity, 60)
  };
  if (user.role === 'WALI_KELAS') { filters.classId = user.classId; }

  var cache = {};
  var source = type === 'teacher_activity'
    ? spkTeacherActivityRows(cache, filters)
    : spkReportTable(cache, spkReportSource(cache, type));
  var columns = spkReportColumns(type);
  var rows = [];
  for (var i = 0; i < source.length; i++) {
    if (!spkReportMatches(source[i], filters, type)) { continue; }
    var out = {};
    for (var c = 0; c < columns.length; c++) {
      out[columns[c]] = source[i][columns[c]] || '';
    }
    rows.push(out);
  }
  return {
    columns: columns,
    rows: rows,
    meta: { filters: filters, generatedAt: spkNowIsoJakarta(), type: type, count: rows.length }
  };
}

function spkCsvCell(value) {
  var s = spkSanitize(value, 20000);
  if (/[",\n\r]/.test(s)) { return '"' + s.replace(/"/g, '""') + '"'; }
  return s;
}

function spkReportsExport(payload, user) {
  var report = spkReportsGet(payload, user);
  var lines = [report.columns.map(spkCsvCell).join(',')];
  for (var i = 0; i < report.rows.length; i++) {
    var values = [];
    for (var c = 0; c < report.columns.length; c++) {
      values.push(spkCsvCell(report.rows[i][report.columns[c]]));
    }
    lines.push(values.join(','));
  }
  return {
    csv: lines.join('\r\n'),
    filename: 'SIPIKET_' + report.meta.type + '_' + spkTodayJakarta() + '.csv',
    meta: report.meta
  };
}

function spkAuditList(payload, user) {
  var data = payload && typeof payload === 'object' ? payload : {};
  var rows = SIPIKET_Store.getRows('AUDIT_LOG');
  if (data.from) { rows = rows.filter(function (a) { return a.createdAt >= data.from; }); }
  if (data.to) { rows = rows.filter(function (a) { return a.createdAt <= data.to; }); }
  if (data.actorId) { rows = rows.filter(function (a) { return a.actorId === data.actorId; }); }
  if (data.entity) { rows = rows.filter(function (a) { return a.entity === data.entity; }); }
  return { items: rows };
}

function spkDashboardGet(payload, user) {
  var data = payload && typeof payload === 'object' ? payload : {};
  var date = spkParseDate(data.date) || spkTodayJakarta();
  if (user.role === 'GURU_PIKET' && data.scope !== 'personal') {
    spkRequireDuty(user, spkTodayJakarta());
  }
  var cache = {};
  var attendance = spkReportTable(cache, 'ATTENDANCE').filter(function (a) { return a.date === date; });
  var movements = spkReportTable(cache, 'STUDENT_MOVEMENTS').filter(function (m) { return m.date === date; });
  var monitoring = spkReportTable(cache, 'CLASS_MONITORING').filter(function (m) { return m.date === date; });
  var assignments = spkReportTable(cache, 'SUBSTITUTE_ASSIGNMENTS').filter(function (a) { return a.date === date; });
  var students = spkReportTable(cache, 'STUDENTS');
  var audits = spkReportTable(cache, 'AUDIT_LOG');
  if (user.role === 'WALI_KELAS') {
    attendance = attendance.filter(function (a) { return a.classId === user.classId; });
    movements = movements.filter(function (m) { return m.classId === user.classId; });
    monitoring = monitoring.filter(function (m) { return m.classId === user.classId; });
    assignments = assignments.filter(function (a) { return a.classId === user.classId; });
    students = students.filter(function (s) { return s.classId === user.classId; });
  }
  var countStatus = function (rows, field, status) {
    return rows.filter(function (r) { return String(r[field] || '').toUpperCase() === status; }).length;
  };
  var stats = {
    present: countStatus(attendance, 'attendanceStatus', 'HADIR') +
      countStatus(attendance, 'attendanceStatus', 'SAKIT_PULANG') +
      countStatus(attendance, 'attendanceStatus', 'IZIN_KELUAR'),
    late: countStatus(attendance, 'attendanceStatus', 'TERLAMBAT'),
    permit: countStatus(attendance, 'attendanceStatus', 'IZIN'),
    sick: countStatus(attendance, 'attendanceStatus', 'SAKIT'),
    absent: countStatus(attendance, 'attendanceStatus', 'TANPA_KETERANGAN') +
      countStatus(attendance, 'attendanceStatus', 'TIDAK_HADIR_KETERANGAN'),
    outside: movements.filter(function (m) {
      return m.movementStatus === 'OPEN' || m.type === 'OUT';
    }).length,
    notReturned: movements.filter(function (m) { return m.movementStatus === 'OPEN'; }).length,
    earlyLeft: movements.filter(function (m) { return m.type === 'EARLY_LEAVE'; }).length,
    monitoredClasses: monitoring.length,
    checkedClasses: monitoring.filter(function (m) { return !!m.checkedAt; }).length,
    emptyClasses: countStatus(monitoring, 'monitoringStatus', 'KELAS_KOSONG'),
    substitutedClasses: assignments.length,
    kbmMonitored: countStatus(monitoring, 'monitoringStatus', 'KBM_BERJALAN'),
    totalStudents: students.filter(function (s) {
      return s.active === 'TRUE' || s.active === 'true' || s.active === true;
    }).length
  };
  var quickActions = ['attendance.scan', 'movement.out', 'movement.return', 'monitoring.list'];
  if (user.role === 'WALI_KELAS') { quickActions = ['barcode.lookup', 'permits.approve', 'students.list']; }
  if (user.role === 'SUPERADMIN') { quickActions = ['setup.status', 'backup.create', 'reports.get', 'users.list']; }
  if (user.role === 'KEPALA_SEKOLAH') { quickActions = ['dashboard.get', 'reports.get', 'audit.list']; }
  if (user.role === 'GURU_MAPEL') { quickActions = ['permits.create', 'substitute.list', 'students.list']; }

  var byClass = {};
  for (var i = 0; i < attendance.length; i++) {
    var key = spkClassName(attendance[i].classId) || attendance[i].classId || '-';
    if (!byClass[key]) { byClass[key] = { className: key, total: 0, present: 0, late: 0 }; }
    byClass[key].total++;
    if (attendance[i].attendanceStatus === 'HADIR') { byClass[key].present++; }
    if (attendance[i].attendanceStatus === 'TERLAMBAT') { byClass[key].late++; }
  }
  var attendanceByClass = [];
  for (var className in byClass) {
    if (Object.prototype.hasOwnProperty.call(byClass, className)) {
      attendanceByClass.push(byClass[className]);
    }
  }
  var lateByDay = [];
  for (var d = 6; d >= 0; d--) {
    var day = spkFormatJakarta(new Date(Date.now() - d * 86400000), 'yyyy-MM-dd');
    var lateCount = spkReportTable(cache, 'LATE_RECORDS').filter(function (r) {
      return r.date === day;
    }).length;
    lateByDay.push({ date: day, count: lateCount });
  }
  var kbmMap = {};
  for (var m = 0; m < monitoring.length; m++) {
    var status = monitoring[m].monitoringStatus || 'BELUM_DIMONITOR';
    kbmMap[status] = (kbmMap[status] || 0) + 1;
  }
  var kbmStatus = [];
  for (var s in kbmMap) {
    if (Object.prototype.hasOwnProperty.call(kbmMap, s)) {
      kbmStatus.push({ status: s, count: kbmMap[s] });
    }
  }
  var recentActivity = [];
  for (var a = audits.length - 1; a >= 0 && recentActivity.length < 10; a--) {
    if (!user.bootstrap && audits[a].actorId !== user.id && user.role !== 'SUPERADMIN' &&
      user.role !== 'KEPALA_SEKOLAH') { continue; }
    recentActivity.push({
      id: audits[a].id, action: audits[a].action, actorName: audits[a].actorName,
      createdAt: audits[a].createdAt, entity: audits[a].entity
    });
  }
  return {
    role: user.role,
    date: date,
    scope: data.scope || 'operational',
    stats: stats,
    quickActions: quickActions,
    recentActivity: recentActivity,
    charts: { attendanceByClass: attendanceByClass, lateByDay: lateByDay, kbmStatus: kbmStatus }
  };
}
