/**
 * Attendance.gs - absensi pagi/siang, keterlambatan, dan konsekuensi edukatif.
 * Primary key logika: (date, session, studentId). Status final dihitung server.
 */

function spkAttendanceView(row) {
  if (!row) { return null; }
  return {
    id: row.id,
    date: row.date,
    session: row.session,
    status: row.attendanceStatus,
    attendanceStatus: row.attendanceStatus,
    studentId: row.studentId,
    classId: row.classId,
    scannedAt: row.scannedAt,
    scanSource: row.scanSource,
    recordedBy: row.recordedBy,
    note: row.note,
    lateMinutes: row.lateMinutes || 0,
    corrected: row.corrected === true || row.corrected === 'TRUE' || row.corrected === 'true',
    correctionReason: row.correctionReason || '',
    permitId: row.permitId || ''
  };
}

function spkStudentBrief(student) {
  if (!student) { return null; }
  return {
    id: student.id,
    name: student.name,
    className: spkClassName(student.classId),
    photoUrl: student.photoUrl || ''
  };
}

function spkFindAttendance(date, session, studentId) {
  return SIPIKET_Store.findRow('ATTENDANCE', function (a) {
    return a.date === date && a.session === session && a.studentId === studentId;
  });
}

function spkApprovedPermit(studentId, date) {
  return SIPIKET_Store.findRow('STUDENT_PERMITS', function (p) {
    return p.studentId === studentId && p.date === date &&
      p.approvalStatus === 'APPROVED' && p.status === 'ACTIVE' &&
      ['SICK', 'LEAVE', 'ABSENT'].indexOf(p.type) !== -1;
  });
}

function spkStudentMovementToday(studentId, date) {
  return SIPIKET_Store.findRow('STUDENT_MOVEMENTS', function (m) {
    return m.studentId === studentId && m.date === date && m.status === 'ACTIVE' &&
      ['EARLY_LEAVE', 'SUDAH_PULANG', 'OUT', 'RETURN'].indexOf(spkSanitize(m.type, 40)) !== -1;
  });
}

function spkConsequenceCategories() {
  var raw = spkSetting('consequenceCategories', SIPIKET_Config.CONSEQUENCE_CATEGORIES);
  if (typeof raw === 'string') { raw = spkSafeJson(raw, SIPIKET_Config.CONSEQUENCE_CATEGORIES); }
  if (!Array.isArray(raw) || raw.length === 0) { return SIPIKET_Config.CONSEQUENCE_CATEGORIES.slice(); }
  return raw.map(function (item) {
    if (typeof item === 'string') { return { code: item, label: item }; }
    return {
      code: spkSanitize(item && item.code, 60) || 'PEMBINAAN',
      label: spkSanitize(item && item.label, 150) || 'Pembinaan dan pengarahan'
    };
  });
}

function spkCreateConsequenceForLate(late, actor, requestId) {
  if (!late) { return null; }
  var duplicate = SIPIKET_Store.findRow('CONSEQUENCES', function (c) {
    return c.lateRecordId === late.id && c.status === 'ACTIVE';
  });
  if (duplicate) { return duplicate; }
  var categories = spkConsequenceCategories();
  if (!categories.length) { return null; }
  var category = categories[0];
  var row = SIPIKET_Store.appendRow('CONSEQUENCES', {
    lateRecordId: late.id,
    studentId: late.studentId,
    date: late.date,
    category: category.code,
    description: category.label,
    note: 'Konsekuensi edukatif otomatis untuk keterlambatan ' + spkSanitize(late.lateMinutes, 10) + ' menit.',
    assignedBy: actor && actor.id ? actor.id : 'SYSTEM',
    consequenceStatus: 'ASSIGNED',
    completedAt: '',
    verifiedBy: ''
  });
  SIPIKET_Store.updateRow('LATE_RECORDS', late.id, { consequenceStatus: 'ASSIGNED' });
  spkLogAudit('consequence.auto', 'CONSEQUENCES', row.id,
    {}, row, 'Konsekuensi otomatis keterlambatan', requestId || '', actor);
  return row;
}

function spkCreateLateRecord(student, date, session, arrivalAt, lateMinutes, actor, requestId, note) {
  var existing = SIPIKET_Store.findRow('LATE_RECORDS', function (r) {
    return r.date === date && r.session === session && r.studentId === student.id && r.status === 'ACTIVE';
  });
  if (existing) { return existing; }
  var row = SIPIKET_Store.appendRow('LATE_RECORDS', {
    date: date,
    studentId: student.id,
    classId: student.classId,
    arrivalAt: arrivalAt || spkNowIsoJakarta(),
    lateMinutes: Math.max(0, parseInt(lateMinutes, 10) || 0),
    session: session,
    recordedBy: actor && actor.id ? actor.id : 'SYSTEM',
    note: spkSanitize(note, 300),
    consequenceStatus: 'NONE'
  });
  spkCreateConsequenceForLate(row, actor, requestId);
  spkCreateNotification('WALI_KELAS', '', 'LATE_RECORD', 'Keterlambatan siswa',
    student.name + ' tercatat terlambat ' + row.lateMinutes + ' menit.', 'WARNING', row.id, actor);
  spkLogAudit('late.record', 'LATE_RECORDS', row.id, {}, row,
    'Catatan keterlambatan dibuat', requestId || '', actor);
  return row;
}

function spkAttendanceAllowedDay(user) {
  var date = spkTodayJakarta();
  var holiday = spkIsHoliday(date);
  var schoolDay = spkIsSchoolDay(date);
  if ((!schoolDay || holiday) && !spkIsSuperadmin(user)) {
    throw spkError('CONFLICT', 'Hari ini bukan hari sekolah atau merupakan hari libur.');
  }
  return date;
}

function spkAttendanceCore(payload, user, action) {
  var data = payload && typeof payload === 'object' ? payload : {};
  var requestId = spkParseIdempotency(data);
  var cached = spkIdempotentResult(action, requestId);
  if (cached) { return cached; }

  return spkWithLock(function () {
    cached = spkIdempotentResult(action, requestId);
    if (cached) { return cached; }

    var session = spkRequireOneOf(data.session, ['MORNING', 'AFTERNOON'], 'Sesi');
    var student = action === 'attendance.manual'
      ? SIPIKET_Store.findRow('STUDENTS', function (s) {
          return s.id === spkSanitize(data.studentId, 120);
        })
      : spkResolveStudent(data);
    spkStudentForRole(user, student, action);
    spkRequireActiveStudent(student);

    var date = spkAttendanceAllowedDay(user);
    var nowMinutes = spkNowMinutes();
    var closeKey = session === 'MORNING'
      ? 'attendanceMorningCloseMinutes' : 'attendanceAfternoonCloseMinutes';
    var closeMinutes = Number(spkSetting(closeKey));
    if (!isFinite(closeMinutes)) {
      closeMinutes = SIPIKET_Config.DEFAULT_SETTINGS[closeKey];
    }
    if (nowMinutes > closeMinutes) {
      throw spkError('CONFLICT', 'Sesi absensi sudah ditutup.');
    }

    var duplicate = spkFindAttendance(date, session, student.id);
    if (duplicate) {
      return {
        attendance: spkAttendanceView(duplicate),
        student: spkStudentBrief(student),
        warnings: [],
        alreadyRecorded: true
      };
    }

    var permit = spkApprovedPermit(student.id, date);
    var movement = spkStudentMovementToday(student.id, date);
    var movementType = movement ? spkSanitize(movement.type, 40) : '';
    if (movementType === 'EARLY_LEAVE' || movementType === 'SUDAH_PULANG') {
      throw spkError('CONFLICT', 'Siswa sudah pulang lebih awal.');
    }

    var bellKey = session === 'MORNING' ? 'bellMorningMinutes' : 'bellAfternoonMinutes';
    var bellMinutes = Number(spkSetting(bellKey));
    if (!isFinite(bellMinutes)) { bellMinutes = SIPIKET_Config.DEFAULT_SETTINGS[bellKey]; }
    var lateLimit = Number(spkSetting('lateLimitMinutes'));
    if (!isFinite(lateLimit)) { lateLimit = SIPIKET_Config.DEFAULT_SETTINGS.lateLimitMinutes; }

    var status = '';
    var warnings = [];
    var lateMinutes = 0;
    var permitType = permit ? spkSanitize(permit.type, 30) : '';
    if (session === 'MORNING') {
      if (permitType === 'SICK') { status = 'SAKIT'; warnings.push('Siswa memiliki izin sakit aktif'); }
      else if (permitType === 'LEAVE') { status = 'IZIN'; warnings.push('Siswa memiliki izin aktif'); }
      else if (permitType === 'ABSENT') {
        status = 'TANPA_KETERANGAN';
        warnings.push('Siswa memiliki keterangan tidak hadir');
      } else if (nowMinutes <= bellMinutes + lateLimit) { status = 'HADIR'; }
      else {
        status = 'TERLAMBAT';
        lateMinutes = Math.max(0, nowMinutes - (bellMinutes + lateLimit));
      }
    } else {
      if (permitType === 'SICK') { status = 'SAKIT_PULANG'; warnings.push('Siswa memiliki izin sakit aktif'); }
      else if (permitType === 'LEAVE') { status = 'IZIN_KELUAR'; warnings.push('Siswa memiliki izin aktif'); }
      else if (permitType === 'ABSENT') {
        status = 'TIDAK_HADIR_KETERANGAN';
        warnings.push('Siswa memiliki keterangan tidak hadir');
      } else if (spkSanitize(data.note, 200).toUpperCase().indexOf('TIDAK_DITEMUKAN') !== -1) {
        status = 'TIDAK_DITEMUKAN';
      } else if (movementType === 'OUT' || movementType === 'RETURN') {
        status = 'SUDAH_PULANG_IZIN';
      } else { status = 'HADIR'; }
    }

    var row = SIPIKET_Store.appendRow('ATTENDANCE', {
      date: date,
      session: session,
      studentId: student.id,
      classId: student.classId,
      attendanceStatus: status,
      scannedAt: spkNowIsoJakarta(),
      scanSource: spkRequireOneOf(data.source || 'SCANNER', ['SCANNER', 'MANUAL'], 'Sumber'),
      recordedBy: user.id,
      note: spkSanitize(data.note, 300),
      corrected: false,
      correctionReason: '',
      correctedBy: '',
      permitId: permit ? permit.id : ''
    });

    if (status === 'TERLAMBAT') {
      spkCreateLateRecord(student, date, session, row.scannedAt, lateMinutes, user, requestId, data.note);
      warnings.push('Konsekuensi edukatif otomatis telah dibuat');
    }

    spkCreateNotification('WALI_KELAS', '', 'ATTENDANCE', 'Absensi siswa',
      student.name + ' tercatat ' + status + ' pada sesi ' + session + '.',
      status === 'TERLAMBAT' ? 'WARNING' : 'INFO', row.id, user);

    var result = {
      attendance: spkAttendanceView(row),
      attendanceRecord: row,
      student: spkStudentBrief(student),
      warnings: warnings,
      alreadyRecorded: false,
      lateMinutes: lateMinutes
    };
    spkLogAudit(action, 'ATTENDANCE', row.id, {}, { __result: result },
      'Absensi ' + session + ' dicatat: ' + status, requestId, user);
    return result;
  });
}

function spkAttendanceScan(payload, user) {
  return spkAttendanceCore(payload, user, 'attendance.scan');
}

function spkAttendanceManual(payload, user) {
  spkAssert(!!payload && !!payload.studentId, 'BAD_REQUEST', 'studentId wajib diisi untuk absensi manual.');
  return spkAttendanceCore(payload, user, 'attendance.manual');
}

function spkAttendanceCorrect(payload, user) {
  var id = spkRequireString(payload, 'id', 'Id absensi', 120);
  var reason = spkRequireString(payload, 'reason', 'Alasan koreksi', 500);
  var before = SIPIKET_Store.findRow('ATTENDANCE', function (a) { return a.id === id; });
  spkAssert(!!before, 'NOT_FOUND', 'Data absensi tidak ditemukan.');
  if (user.role === 'WALI_KELAS') { spkAssertOwnClass(user, before.classId); }
  var input = payload && payload.patch && typeof payload.patch === 'object' ? payload.patch : {};
  var allowed = ['attendanceStatus', 'note', 'scannedAt', 'permitId'];
  var patch = spkPickPatch(input, allowed);
  if (patch.attendanceStatus) {
    patch.attendanceStatus = spkRequireOneOf(patch.attendanceStatus,
      ['HADIR', 'TERLAMBAT', 'IZIN', 'SAKIT', 'TANPA_KETERANGAN', 'BELUM_HADIR',
        'IZIN_KELUAR', 'SUDAH_PULANG_IZIN', 'SAKIT_PULANG', 'TIDAK_DITEMUKAN',
        'TIDAK_HADIR_KETERANGAN'], 'Status absensi');
  }
  patch.corrected = true;
  patch.correctionReason = reason;
  patch.correctedBy = user.id;
  var updated = SIPIKET_Store.withLock(function () {
    return SIPIKET_Store.updateRow('ATTENDANCE', id, patch);
  });
  var result = { attendance: spkAttendanceView(updated) };
  spkLogAudit('attendance.correct', 'ATTENDANCE', id, spkAttendanceView(before), result,
    reason, spkParseIdempotency(payload), user);
  return result;
}

function spkLateRecord(payload, user) {
  var data = payload && typeof payload === 'object' ? payload : {};
  var requestId = spkParseIdempotency(data);
  var cached = spkIdempotentResult('late.record', requestId);
  if (cached) { return cached; }
  var studentId = spkRequireString(data, 'studentId', 'Id siswa', 120);
  var student = SIPIKET_Store.findRow('STUDENTS', function (s) { return s.id === studentId; });
  spkStudentForRole(user, student, 'late.record');
  spkRequireActiveStudent(student);

  var today = spkTodayJakarta();
  var date = today;
  if (data.date) {
    var parsed = spkParseDate(data.date);
    spkAssert(!!parsed, 'BAD_REQUEST', 'Format tanggal tidak valid.');
    spkAssert(parsed <= today, 'BAD_REQUEST', 'Tanggal backfill tidak boleh di masa depan.');
    spkAssert(spkIsSuperadmin(user) || (Date.parse(today) - Date.parse(parsed)) <= 7 * 86400000,
      'FORBIDDEN', 'Backfill hanya untuk superadmin atau maksimal 7 hari.');
    date = parsed;
  }
  return spkWithLock(function () {
    var bell = Number(spkSetting('bellMorningMinutes'));
    if (!isFinite(bell)) { bell = SIPIKET_Config.DEFAULT_SETTINGS.bellMorningMinutes; }
    var arrivalMinutes = data.arrivalAt ? spkMinutesOfDay(data.arrivalAt) : spkNowMinutes();
    var lateMinutes = Math.max(0, arrivalMinutes - bell);
    var row = spkCreateLateRecord(student, date, 'MORNING',
      data.arrivalAt ? spkSanitize(data.arrivalAt, 60) : spkNowIsoJakarta(),
      lateMinutes, user, requestId, data.note);
    var result = { lateRecord: row };
    spkLogAudit('late.record', 'LATE_RECORDS', row.id, {}, { __result: result },
      'Keterlambatan dicatat manual', requestId, user);
    return result;
  });
}

function spkConsequenceCreate(payload, user) {
  var data = payload && typeof payload === 'object' ? payload : {};
  var requestId = spkParseIdempotency(data);
  var cached = spkIdempotentResult('consequence.create', requestId);
  if (cached) { return cached; }
  var lateId = spkRequireString(data, 'lateRecordId', 'Id catatan keterlambatan', 120);
  var late = SIPIKET_Store.findRow('LATE_RECORDS', function (r) { return r.id === lateId; });
  spkAssert(!!late, 'NOT_FOUND', 'Catatan keterlambatan tidak ditemukan.');
  var student = SIPIKET_Store.findRow('STUDENTS', function (s) { return s.id === late.studentId; });
  spkStudentForRole(user, student, 'consequence.create');
  spkRequireActiveStudent(student);
  var categories = spkConsequenceCategories().map(function (c) { return c.code; });
  var category = spkRequireOneOf(data.category, categories, 'Kategori konsekuensi');
  var row = SIPIKET_Store.appendRow('CONSEQUENCES', {
    lateRecordId: lateId,
    studentId: student.id,
    date: late.date || spkTodayJakarta(),
    category: category,
    description: spkSanitize(data.description, 300),
    note: spkSanitize(data.note, 500),
    assignedBy: user.id,
    consequenceStatus: spkSanitize(data.status, 40) || 'ASSIGNED',
    completedAt: '',
    verifiedBy: ''
  });
  SIPIKET_Store.updateRow('LATE_RECORDS', lateId, { consequenceStatus: 'ASSIGNED' });
  spkCreateNotification('WALI_KELAS', '', 'CONSEQUENCE', 'Konsekuensi keterlambatan',
    student.name + ' mendapat konsekuensi ' + category + '.', 'INFO', row.id, user);
  var result = { consequence: row };
  spkLogAudit('consequence.create', 'CONSEQUENCES', row.id, {}, { __result: result },
    'Konsekuensi dibuat', requestId, user);
  return result;
}

function spkConsequenceList(payload, user) {
  var data = payload && typeof payload === 'object' ? payload : {};
  var rows = SIPIKET_Store.getRows('CONSEQUENCES');
  if (data.studentId) {
    rows = rows.filter(function (c) { return c.studentId === data.studentId; });
  }
  if (data.classId) {
    rows = rows.filter(function (c) { return c.classId === data.classId; });
  }
  if (data.from) { rows = rows.filter(function (c) { return c.date >= data.from; }); }
  if (data.to) { rows = rows.filter(function (c) { return c.date <= data.to; }); }
  if (user.role === 'WALI_KELAS') {
    rows = rows.filter(function (c) {
      var student = SIPIKET_Store.findRow('STUDENTS', function (s) { return s.id === c.studentId; });
      return student && student.classId === user.classId;
    });
  }
  return { items: rows };
}

function spkConsequenceUpdate(payload, user) {
  var id = spkRequireString(payload, 'id', 'Id konsekuensi', 120);
  var patch = spkPickPatch(payload && payload.patch,
    ['consequenceStatus', 'description', 'note', 'completedAt', 'verifiedBy']);
  if (patch.consequenceStatus) {
    patch.consequenceStatus = spkRequireOneOf(patch.consequenceStatus,
      ['ASSIGNED', 'ONGOING', 'DONE', 'NEED_FOLLOWUP'], 'Status konsekuensi');
  }
  var before = SIPIKET_Store.findRow('CONSEQUENCES', function (c) { return c.id === id; });
  spkAssert(!!before, 'NOT_FOUND', 'Konsekuensi tidak ditemukan.');
  var updated = SIPIKET_Store.updateRow('CONSEQUENCES', id, patch);
  spkLogAudit('consequence.update', 'CONSEQUENCES', id, before, updated,
    'Konsekuensi diperbarui', spkParseIdempotency(payload), user);
  return { consequence: updated };
}

/* ------------------------------------------------------------------ *
 * Perizinan siswa
 * ------------------------------------------------------------------ */

function spkPermitTypes() {
  var raw = spkSetting('permitTypes', SIPIKET_Config.DEFAULT_SETTINGS.permitTypes);
  if (typeof raw === 'string') { raw = spkSafeJson(raw, SIPIKET_Config.DEFAULT_SETTINGS.permitTypes); }
  if (!Array.isArray(raw) || !raw.length) { return SIPIKET_Config.DEFAULT_SETTINGS.permitTypes.slice(); }
  return raw.map(function (t) { return spkSanitize(t, 30); });
}

function spkCanAutoApprove(user) {
  return spkIsSuperadmin(user) || user.role === 'WALI_KELAS' || user.role === 'GURU_PIKET';
}

function spkPermitsCreate(payload, user) {
  var data = payload && typeof payload === 'object' ? payload : {};
  var requestId = spkParseIdempotency(data);
  var cached = spkIdempotentResult('permits.create', requestId);
  if (cached) { return cached; }
  var studentId = spkRequireString(data, 'studentId', 'Id siswa', 120);
  var student = SIPIKET_Store.findRow('STUDENTS', function (s) { return s.id === studentId; });
  spkStudentForRole(user, student, 'permits.create');
  spkRequireActiveStudent(student);
  var type = spkRequireOneOf(data.type, spkPermitTypes(), 'Jenis izin');
  if (user.role === 'GURU_MAPEL') {
    spkAssert(['SICK', 'LEAVE', 'ABSENT'].indexOf(type) !== -1,
      'FORBIDDEN', 'Guru mapel hanya dapat membuat izin sakit, izin, atau tidak hadir.');
  }
  var date = spkTodayJakarta();
  if (data.date) {
    var parsed = spkParseDate(data.date);
    spkAssert(!!parsed, 'BAD_REQUEST', 'Format tanggal tidak valid.');
    spkAssert(parsed <= spkFormatJakarta(new Date(Date.now() + 30 * 86400000), 'yyyy-MM-dd'),
      'BAD_REQUEST', 'Tanggal izin terlalu jauh.');
    date = parsed;
  }
  var wantsApprove = data.approve === true || data.approve === 'true' || data.approve === 'TRUE';
  spkAssert(!wantsApprove || spkCanAutoApprove(user), 'FORBIDDEN',
    'Anda tidak dapat menyetujui izin secara langsung.');
  var approvalStatus = wantsApprove ? 'APPROVED' : 'PENDING';
  var row = SIPIKET_Store.appendRow('STUDENT_PERMITS', {
    date: date,
    studentId: student.id,
    classId: student.classId,
    type: type,
    reason: spkRequireString(data, 'reason', 'Alasan izin', 500),
    detail: spkSanitize(data.detail, 800),
    reporterId: user.id,
    approvedBy: wantsApprove ? user.id : '',
    approvalStatus: approvalStatus,
    evidenceUrl: spkSanitize(data.evidenceUrl, 500),
    startedAt: spkSanitize(data.startedAt, 60),
    endedAt: spkSanitize(data.endedAt, 60)
  });
  var notification = spkCreateNotification('WALI_KELAS', '', 'PERMIT', 'Izin siswa dibuat',
    student.name + ' mengajukan ' + type + ' (' + approvalStatus + ').',
    approvalStatus === 'APPROVED' ? 'INFO' : 'WARNING', row.id, user);
  var result = { permit: row, notification: notification };
  spkLogAudit('permits.create', 'STUDENT_PERMITS', row.id, {}, { __result: result },
    'Izin siswa dibuat', requestId, user);
  return result;
}

function spkPermitsList(payload, user) {
  var data = payload && typeof payload === 'object' ? payload : {};
  var rows = SIPIKET_Store.getRows('STUDENT_PERMITS');
  if (data.date) { rows = rows.filter(function (p) { return p.date === data.date; }); }
  if (data.from) { rows = rows.filter(function (p) { return p.date >= data.from; }); }
  if (data.to) { rows = rows.filter(function (p) { return p.date <= data.to; }); }
  if (data.classId) { rows = rows.filter(function (p) { return p.classId === data.classId; }); }
  if (data.studentId) { rows = rows.filter(function (p) { return p.studentId === data.studentId; }); }
  if (data.status) {
    rows = rows.filter(function (p) { return p.approvalStatus === data.status; });
  }
  if (user.role === 'WALI_KELAS') {
    rows = rows.filter(function (p) { return p.classId === user.classId; });
  }
  return { items: rows };
}

function spkPermitsApprove(payload, user) {
  var id = spkRequireString(payload, 'id', 'Id izin', 120);
  var decision = spkRequireOneOf(payload && payload.decision,
    ['APPROVED', 'REJECTED', 'NEED_CLARIFICATION'], 'Keputusan');
  var before = SIPIKET_Store.findRow('STUDENT_PERMITS', function (p) { return p.id === id; });
  spkAssert(!!before, 'NOT_FOUND', 'Izin tidak ditemukan.');
  if (user.role === 'WALI_KELAS') { spkAssertOwnClass(user, before.classId); }
  var updated = SIPIKET_Store.updateRow('STUDENT_PERMITS', id, {
    approvalStatus: decision,
    approvedBy: user.id,
    detail: decision === 'NEED_CLARIFICATION' && payload.note
      ? spkSanitize(before.detail + ' | ' + payload.note, 800)
      : before.detail
  });
  spkCreateNotification('GURU_MAPEL', before.reporterId, 'PERMIT_DECISION',
    'Keputusan izin siswa', 'Izin ' + decision + ' untuk ' + spkSanitize(before.studentId, 120) + '.',
    decision === 'REJECTED' ? 'WARNING' : 'INFO', id, user);
  var audit = spkLogAudit('permits.approve', 'STUDENT_PERMITS', id, before, updated,
    spkSanitize(payload && payload.note, 400), spkParseIdempotency(payload), user);
  return { permit: updated, audit: audit };
}

/* ------------------------------------------------------------------ *
 * Pergerakan siswa
 * ------------------------------------------------------------------ */

function spkMovementOpen(studentId, date) {
  return SIPIKET_Store.findRow('STUDENT_MOVEMENTS', function (m) {
    return m.studentId === studentId && m.date === date &&
      m.movementStatus === 'OPEN' && m.status === 'ACTIVE';
  });
}

function spkMovementOut(payload, user) {
  var data = payload && typeof payload === 'object' ? payload : {};
  var requestId = spkParseIdempotency(data);
  var cached = spkIdempotentResult('movement.out', requestId);
  if (cached) { return cached; }
  return spkWithLock(function () {
    cached = spkIdempotentResult('movement.out', requestId);
    if (cached) { return cached; }
    var student = spkResolveStudent(data);
    spkStudentForRole(user, student, 'movement.out');
    spkRequireActiveStudent(student);
    var open = spkMovementOpen(student.id, spkTodayJakarta());
    if (open) { throw spkError('CONFLICT', 'Siswa masih memiliki izin keluar yang aktif.'); }
    var row = SIPIKET_Store.appendRow('STUDENT_MOVEMENTS', {
      date: spkTodayJakarta(),
      studentId: student.id,
      classId: student.classId,
      type: 'OUT',
      outAt: spkNowIsoJakarta(),
      returnAt: '',
      estimateReturnAt: spkSanitize(data.estimateReturnAt, 60),
      purpose: spkRequireString(data, 'purpose', 'Tujuan', 300),
      grantedBy: spkRequireString(data, 'grantedBy', 'Pemberi izin', 150),
      recordedBy: user.id,
      movementStatus: 'OPEN',
      note: spkSanitize(data.note, 400),
      durationMinutes: 0,
      barcodeScanned: !!data.tokenId,
      reminderSent: false
    });
    spkCreateNotification('WALI_KELAS', '', 'MOVEMENT_OUT', 'Siswa keluar kelas',
      student.name + ' keluar: ' + row.purpose + '.', 'WARNING', row.id, user);
    var result = { movement: row, warnings: [] };
    spkLogAudit('movement.out', 'STUDENT_MOVEMENTS', row.id, {}, { __result: result },
      'Izin keluar dicatat', requestId, user);
    return result;
  });
}

function spkMovementReturn(payload, user) {
  var data = payload && typeof payload === 'object' ? payload : {};
  var requestId = spkParseIdempotency(data);
  var cached = spkIdempotentResult('movement.return', requestId);
  if (cached) { return cached; }
  return spkWithLock(function () {
    cached = spkIdempotentResult('movement.return', requestId);
    if (cached) { return cached; }
    var student = spkResolveStudent(data);
    spkAssert(!!student, 'NOT_FOUND', 'Siswa tidak ditemukan.');
    spkStudentForRole(user, student, 'movement.return');
    spkRequireActiveStudent(student);
    var open = spkMovementOpen(student.id, spkTodayJakarta());
    if (!open) { throw spkError('CONFLICT', 'Tidak ada pergerakan OPEN yang perlu ditutup.'); }
    var outMinutes = spkMinutesOfDay(open.outAt);
    var duration = Math.max(0, spkNowMinutes() - outMinutes);
    var updated = SIPIKET_Store.updateRow('STUDENT_MOVEMENTS', open.id, {
      returnAt: spkNowIsoJakarta(),
      movementStatus: 'CLOSED',
      durationMinutes: duration
    });
    var result = { movement: updated, durationMinutes: duration };
    spkLogAudit('movement.return', 'STUDENT_MOVEMENTS', open.id, open, { __result: result },
      'Pergerakan ditutup', requestId, user);
    return result;
  });
}

function spkMovementEarlyLeave(payload, user) {
  var data = payload && typeof payload === 'object' ? payload : {};
  var requestId = spkParseIdempotency(data);
  var cached = spkIdempotentResult('movement.earlyLeave', requestId);
  if (cached) { return cached; }
  return spkWithLock(function () {
    cached = spkIdempotentResult('movement.earlyLeave', requestId);
    if (cached) { return cached; }
    var student = spkResolveStudent(data);
    spkStudentForRole(user, student, 'movement.earlyLeave');
    spkRequireActiveStudent(student);
    var permit = SIPIKET_Store.appendRow('STUDENT_PERMITS', {
      date: spkTodayJakarta(),
      studentId: student.id,
      classId: student.classId,
      type: 'EARLY_LEAVE',
      reason: spkRequireString(data, 'reason', 'Alasan pulang awal', 500),
      detail: spkSanitize(data.note, 800),
      reporterId: user.id,
      approvedBy: user.id,
      approvalStatus: 'APPROVED',
      evidenceUrl: '',
      startedAt: spkNowIsoJakarta(),
      endedAt: ''
    });
    var row = SIPIKET_Store.appendRow('STUDENT_MOVEMENTS', {
      date: spkTodayJakarta(),
      studentId: student.id,
      classId: student.classId,
      type: 'EARLY_LEAVE',
      outAt: spkNowIsoJakarta(),
      returnAt: '',
      estimateReturnAt: '',
      purpose: spkSanitize(data.reason, 300),
      grantedBy: spkRequireString(data, 'grantedBy', 'Pemberi izin', 150),
      recordedBy: user.id,
      movementStatus: 'DONE',
      note: 'Pulang awal. Tidak boleh scan kembali. Permit: ' + permit.id,
      durationMinutes: 0,
      barcodeScanned: !!data.tokenId,
      reminderSent: false
    });
    spkCreateNotification('WALI_KELAS', '', 'EARLY_LEAVE', 'Siswa pulang awal',
      student.name + ' pulang lebih awal.', 'WARNING', row.id, user);
    var result = { movement: row, permit: permit };
    spkLogAudit('movement.earlyLeave', 'STUDENT_MOVEMENTS', row.id, {}, { __result: result },
      'Pulang awal dicatat', requestId, user);
    return result;
  });
}

function spkMovementList(payload, user) {
  var data = payload && typeof payload === 'object' ? payload : {};
  var rows = SIPIKET_Store.getRows('STUDENT_MOVEMENTS');
  if (data.date) { rows = rows.filter(function (m) { return m.date === data.date; }); }
  if (data.classId) { rows = rows.filter(function (m) { return m.classId === data.classId; }); }
  if (data.status) { rows = rows.filter(function (m) { return m.movementStatus === data.status; }); }
  if (user.role === 'WALI_KELAS') {
    rows = rows.filter(function (m) { return m.classId === user.classId; });
  }
  return { items: rows };
}
