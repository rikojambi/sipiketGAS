/**
 * Monitoring.gs - pemantauan KBM, status guru, dan penugasan pengganti.
 * Status "guru tidak hadir" selalu disimpan beserta verificationStatus.
 */

var SPK_MONITORING_STATUSES = [
  'KBM_BERJALAN', 'GURU_BELUM_HADIR', 'KELAS_KOSONG', 'GURU_IZIN', 'GURU_SAKIT',
  'GURU_TERLAMBAT', 'DIGANTIKAN', 'TUGAS_MANDIRI'
];

var SPK_SUBSTITUTE_TASK_TYPES = [
  'GURU_PENGGANTI', 'GURU_PIKET_LAIN', 'TUGAS_MANDIRI', 'TUGAS_GURU_MAPEL',
  'TUGAS_LITERASI_NUMERASI', 'TUGAS_PROYEK'
];

function spkScheduleById(id) {
  var scheduleId = spkSanitize(id, 120);
  return SIPIKET_Store.findRow('SCHEDULES', function (s) { return s.id === scheduleId; });
}

function spkTeacherName(id) {
  var teacherId = spkSanitize(id, 120);
  if (!teacherId) { return ''; }
  var teacher = SIPIKET_Store.findRow('TEACHERS', function (t) { return t.id === teacherId; });
  return teacher ? teacher.name : '';
}

function spkMonitoringList(payload, user) {
  var data = payload && typeof payload === 'object' ? payload : {};
  var date = spkParseDate(data.date) || spkTodayJakarta();
  var day = spkDayCode(new Date(date + 'T12:00:00+07:00'));
  var schedules = SIPIKET_Store.getRows('SCHEDULES').filter(function (s) {
    if (s.day !== day) { return false; }
    if (s.active === 'FALSE' || s.active === 'false' || s.active === false) { return false; }
    if (data.classId && s.classId !== data.classId) { return false; }
    if (user.role === 'WALI_KELAS' && s.classId !== user.classId) { return false; }
    if (user.role === 'GURU_MAPEL' && user.teacherId &&
      s.teacherId !== user.teacherId && s.classId !== user.classId) { return false; }
    return true;
  });
  var monitoringRows = SIPIKET_Store.getRows('CLASS_MONITORING').filter(function (m) {
    return m.date === date;
  });
  var assignments = SIPIKET_Store.getRows('SUBSTITUTE_ASSIGNMENTS').filter(function (a) {
    return a.date === date;
  });
  var items = [];
  for (var i = 0; i < schedules.length; i++) {
    var s = schedules[i];
    var monitoring = null;
    var assignment = null;
    for (var j = 0; j < monitoringRows.length; j++) {
      if (monitoringRows[j].scheduleId === s.id) { monitoring = monitoringRows[j]; break; }
    }
    for (var k = 0; k < assignments.length; k++) {
      if (assignments[k].scheduleId === s.id) { assignment = assignments[k]; break; }
    }
    items.push({
      scheduleId: s.id,
      date: date,
      day: s.day,
      classId: s.classId,
      className: spkClassName(s.classId),
      subjectId: s.subjectId,
      expectedTeacherId: s.teacherId,
      expectedTeacherName: spkTeacherName(s.teacherId),
      startMinutes: s.startMinutes,
      endMinutes: s.endMinutes,
      monitoring: monitoring || {
        id: '', monitoringStatus: 'BELUM_DIMONITOR', verificationStatus: 'UNVERIFIED',
        note: '', checkedAt: '', checkedBy: ''
      },
      assignment: assignment || null
    });
  }
  return { items: items, date: date };
}

function spkMonitoringSave(payload, user) {
  var data = payload && typeof payload === 'object' ? payload : {};
  var requestId = spkParseIdempotency(data);
  var cached = spkIdempotentResult('monitoring.save', requestId);
  if (cached) { return cached; }
  var scheduleId = spkRequireString(data, 'scheduleId', 'Id jadwal', 120);
  var schedule = spkScheduleById(scheduleId);
  spkAssert(!!schedule, 'NOT_FOUND', 'Jadwal tidak ditemukan.');
  if (user.role === 'WALI_KELAS') { spkAssertOwnClass(user, schedule.classId); }
  var status = spkRequireOneOf(data.status, SPK_MONITORING_STATUSES, 'Status monitoring');
  var verification = spkRequireOneOf(data.verificationStatus || 'UNVERIFIED',
    ['UNVERIFIED', 'VERIFIED'], 'Status verifikasi');
  var date = spkTodayJakarta();
  var note = spkSanitize(data.note, 500);
  if (verification !== 'VERIFIED') { note = (note ? note + ' | ' : '') + 'Belum diverifikasi'; }
  var existing = SIPIKET_Store.findRow('CLASS_MONITORING', function (m) {
    return m.date === date && m.scheduleId === scheduleId && m.status === 'ACTIVE';
  });
  var row;
  if (existing) {
    row = SIPIKET_Store.updateRow('CLASS_MONITORING', existing.id, {
      monitoringStatus: status,
      verificationStatus: verification,
      note: note,
      checkedAt: spkNowIsoJakarta(),
      checkedBy: user.id,
      classId: schedule.classId,
      subjectId: schedule.subjectId,
      expectedTeacherId: schedule.teacherId
    });
  } else {
    row = SIPIKET_Store.appendRow('CLASS_MONITORING', {
      date: date,
      scheduleId: scheduleId,
      classId: schedule.classId,
      subjectId: schedule.subjectId,
      expectedTeacherId: schedule.teacherId,
      monitoringStatus: status,
      checkedAt: spkNowIsoJakarta(),
      checkedBy: user.id,
      note: note,
      verificationStatus: verification
    });
  }
  spkCreateNotification('KEPALA_SEKOLAH', '', 'MONITORING', 'Monitoring KBM',
    spkClassName(schedule.classId) + ': ' + status + ' (' + verification + ').',
    verification === 'VERIFIED' ? 'INFO' : 'WARNING', row.id, user);
  var result = { monitoring: row };
  spkLogAudit('monitoring.save', 'CLASS_MONITORING', row.id, existing, { __result: result },
    'Monitoring KBM disimpan', requestId, user);
  return result;
}

function spkSubstituteAssign(payload, user) {
  var data = payload && typeof payload === 'object' ? payload : {};
  var requestId = spkParseIdempotency(data);
  var cached = spkIdempotentResult('substitute.assign', requestId);
  if (cached) { return cached; }
  var scheduleId = spkRequireString(data, 'scheduleId', 'Id jadwal', 120);
  var schedule = spkScheduleById(scheduleId);
  spkAssert(!!schedule, 'NOT_FOUND', 'Jadwal tidak ditemukan.');
  var taskType = spkRequireOneOf(data.taskType, SPK_SUBSTITUTE_TASK_TYPES, 'Jenis penugasan');
  var substituteTeacherId = spkSanitize(data.substituteTeacherId, 120);
  var row = SIPIKET_Store.appendRow('SUBSTITUTE_ASSIGNMENTS', {
    date: spkTodayJakarta(),
    classId: schedule.classId,
    scheduleId: scheduleId,
    subjectId: schedule.subjectId,
    expectedTeacherId: schedule.teacherId,
    substituteTeacherId: substituteTeacherId,
    taskType: taskType,
    taskDescription: spkRequireString(data, 'taskDescription', 'Deskripsi tugas', 800),
    note: spkSanitize(data.note, 500),
    assignedBy: user.id,
    assignedAt: spkNowIsoJakarta(),
    assignmentStatus: 'PENDING',
    completedAt: '',
    verifiedBy: ''
  });
  if (substituteTeacherId) {
    var substituteUser = SIPIKET_Store.findRow('USERS', function (u) {
      return u.teacherId === substituteTeacherId;
    });
    if (substituteUser) {
      spkCreateNotification(substituteUser.role, substituteUser.id, 'SUBSTITUTE',
        'Penugasan pengganti', row.taskDescription, 'INFO', row.id, user);
    }
  }
  var result = { assignment: row };
  spkLogAudit('substitute.assign', 'SUBSTITUTE_ASSIGNMENTS', row.id, {}, { __result: result },
    'Penugasan pengganti dibuat', requestId, user);
  return result;
}

function spkSubstituteList(payload, user) {
  var data = payload && typeof payload === 'object' ? payload : {};
  var rows = SIPIKET_Store.getRows('SUBSTITUTE_ASSIGNMENTS');
  var date = spkParseDate(data.date) || spkTodayJakarta();
  rows = rows.filter(function (a) { return a.date === date; });
  if (user.role === 'GURU_MAPEL' && user.teacherId) {
    rows = rows.filter(function (a) {
      return a.expectedTeacherId === user.teacherId || a.substituteTeacherId === user.teacherId;
    });
  }
  if (user.role === 'WALI_KELAS') {
    rows = rows.filter(function (a) { return a.classId === user.classId; });
  }
  return { items: rows };
}

function spkSubstituteUpdate(payload, user) {
  var id = spkRequireString(payload, 'id', 'Id penugasan', 120);
  var patch = spkPickPatch(payload && payload.patch,
    ['assignmentStatus', 'note', 'completedAt', 'verifiedBy', 'substituteTeacherId']);
  if (patch.assignmentStatus) {
    patch.assignmentStatus = spkRequireOneOf(patch.assignmentStatus,
      ['PENDING', 'ONGOING', 'DONE', 'NEED_FOLLOWUP'], 'Status penugasan');
    if (patch.assignmentStatus === 'DONE') { patch.completedAt = spkNowIsoJakarta(); }
  }
  var before = SIPIKET_Store.findRow('SUBSTITUTE_ASSIGNMENTS', function (a) { return a.id === id; });
  spkAssert(!!before, 'NOT_FOUND', 'Penugasan tidak ditemukan.');
  if (user.role === 'GURU_MAPEL' && user.teacherId &&
    before.expectedTeacherId !== user.teacherId && before.substituteTeacherId !== user.teacherId) {
    throw spkError('FORBIDDEN', 'Penugasan ini tidak terkait dengan Anda.');
  }
  var updated = SIPIKET_Store.updateRow('SUBSTITUTE_ASSIGNMENTS', id, patch);
  spkLogAudit('substitute.update', 'SUBSTITUTE_ASSIGNMENTS', id, before, updated,
    'Penugasan pengganti diperbarui', spkParseIdempotency(payload), user);
  return { assignment: updated };
}

function spkMonitoringSummary(payload, user) {
  var data = payload && typeof payload === 'object' ? payload : {};
  var from = spkParseDate(data.from) || spkTodayJakarta();
  var to = spkParseDate(data.to) || from;
  spkAssert(from <= to, 'BAD_REQUEST', 'Rentang tanggal tidak valid.');
  var monitoring = SIPIKET_Store.getRows('CLASS_MONITORING').filter(function (m) {
    return m.date >= from && m.date <= to;
  });
  var assignments = SIPIKET_Store.getRows('SUBSTITUTE_ASSIGNMENTS').filter(function (a) {
    return a.date >= from && a.date <= to;
  });
  var schedules = SIPIKET_Store.getRows('SCHEDULES');
  var periods = 0;
  for (var i = 0; i < schedules.length; i++) { periods++; }
  var count = function (status) {
    return monitoring.filter(function (m) { return m.monitoringStatus === status; }).length;
  };
  var emptyClasses = count('KELAS_KOSONG');
  var lateTeachers = count('GURU_TERLAMBAT') + count('GURU_BELUM_HADIR');
  var selfStudy = count('TUGAS_MANDIRI');
  var kbm = count('KBM_BERJALAN') + count('DIGANTIKAN');
  var total = monitoring.length || 1;
  return {
    from: from,
    to: to,
    monitoredPeriods: monitoring.length,
    totalPeriods: periods,
    emptyClasses: emptyClasses,
    lateTeachers: lateTeachers,
    substituteClasses: assignments.length,
    selfStudyClasses: selfStudy,
    kbmMonitored: kbm,
    kbmPercentage: Math.round((kbm / total) * 100)
  };
}
