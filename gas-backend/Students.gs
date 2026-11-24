/**
 * Students.gs - CRUD siswa, import, barcode, dan validasi siswa aktif.
 * Siswa nonaktif/lulus atau barcode tidak berlaku ditolak untuk transaksi.
 */

function spkTrueFlag(value) {
  return value === true || value === 1 || value === '1' || value === 'TRUE' ||
    value === 'true' || value === 'True';
}

function spkRequireActiveStudent(student) {
  spkAssert(!!student, 'NOT_FOUND', 'Siswa tidak ditemukan.');
  spkAssert(spkTrueFlag(student.active) && spkTrueFlag(student.barcodeActive),
    'CONFLICT', 'Siswa tidak aktif atau barcode tidak berlaku.');
  return student;
}

function spkResolveStudent(data) {
  data = data && typeof data === 'object' ? data : {};
  var student = null;
  if (data.studentId) {
    var id = spkSanitize(data.studentId, 120);
    student = SIPIKET_Store.findRow('STUDENTS', function (s) { return s.id === id; });
  } else if (data.tokenId) {
    var token = spkSanitize(data.tokenId, 160);
    student = SIPIKET_Store.findRow('STUDENTS', function (s) {
      return s.barcodeToken === token && spkTrueFlag(s.barcodeActive);
    });
  } else if (data.nis) {
    var nis = spkSanitize(data.nis, 60);
    student = SIPIKET_Store.findRow('STUDENTS', function (s) { return s.nis === nis; });
  }
  return student;
}

function spkClassById(id) {
  var classId = spkSanitize(id, 120);
  if (!classId) { return null; }
  return SIPIKET_Store.findRow('CLASSES', function (c) { return c.id === classId; });
}

function spkClassName(id) {
  var c = spkClassById(id);
  return c ? c.name : '';
}

function spkStudentsList(payload, user) {
  var data = payload && typeof payload === 'object' ? payload : {};
  var rows = SIPIKET_Store.getRows('STUDENTS');
  var classId = spkSanitize(data.classId, 120);
  if (user.role === 'WALI_KELAS') { classId = user.classId; }
  if (classId) {
    rows = rows.filter(function (s) { return s.classId === classId; });
  }
  if (data.activeOnly === true || data.activeOnly === 'true') {
    rows = rows.filter(function (s) { return spkTrueFlag(s.active); });
  }
  var search = spkSanitize(data.search, 120).toLowerCase();
  if (search) {
    rows = rows.filter(function (s) {
      return String(s.name || '').toLowerCase().indexOf(search) !== -1 ||
        String(s.nis || '').indexOf(search) !== -1 ||
        String(s.nisn || '').indexOf(search) !== -1;
    });
  }
  for (var i = 0; i < rows.length; i++) {
    rows[i].className = spkClassName(rows[i].classId);
  }
  return { items: rows };
}

function spkStudentsGet(payload, user) {
  var id = spkRequireString(payload, 'id', 'Id siswa', 120);
  var student = SIPIKET_Store.findRow('STUDENTS', function (s) { return s.id === id; });
  spkStudentForRole(user, student, 'students.get');
  student.className = spkClassName(student.classId);
  return { student: student };
}

function spkStudentPatch(data, user, creating) {
  data = data && typeof data === 'object' ? data : {};
  var allowed = ['nis', 'nisn', 'name', 'classId', 'gender', 'birthDate', 'photoUrl',
    'barcodeToken', 'barcodeActive', 'active', 'parentName', 'parentPhone', 'status'];
  var patch = spkPickPatch(data, allowed);
  if (creating) {
    patch.nis = spkRequireString(data, 'nis', 'NIS', 60);
    patch.name = spkRequireString(data, 'name', 'Nama siswa', 150);
    patch.classId = spkRequireString(data, 'classId', 'Kelas', 120);
    patch.barcodeToken = data.barcodeToken ? spkSanitize(data.barcodeToken, 160) : ('BC-' + spkUuid());
    patch.barcodeActive = true;
    patch.active = true;
  }
  if (user.role === 'WALI_KELAS') {
    patch.classId = user.classId;
  }
  if (patch.classId) {
    spkAssert(!!spkClassById(patch.classId), 'BAD_REQUEST', 'Kelas tidak ditemukan.');
    spkAssertOwnClass(user, patch.classId);
  }
  return patch;
}

function spkStudentsCreate(payload, user) {
  spkAssert(spkIsSuperadmin(user) || user.role === 'WALI_KELAS',
    'FORBIDDEN', 'Anda tidak memiliki akses untuk aksi ini.');
  var requestId = spkParseIdempotency(payload);
  var cached = spkIdempotentResult('students.create', requestId);
  if (cached) { return cached; }
  var patch = spkStudentPatch(payload, user, true);
  var duplicate = SIPIKET_Store.findRow('STUDENTS', function (s) { return s.nis === patch.nis; });
  spkAssert(!duplicate, 'CONFLICT', 'NIS sudah terdaftar.');
  var row = SIPIKET_Store.appendRow('STUDENTS', patch);
  var result = { student: row };
  spkLogAudit('students.create', 'STUDENTS', row.id, {}, result, 'Siswa dibuat', requestId, user);
  return result;
}

function spkStudentsUpdate(payload, user) {
  spkAssert(spkIsSuperadmin(user) || user.role === 'WALI_KELAS',
    'FORBIDDEN', 'Anda tidak memiliki akses untuk aksi ini.');
  var id = spkRequireString(payload, 'id', 'Id siswa', 120);
  var before = SIPIKET_Store.findRow('STUDENTS', function (s) { return s.id === id; });
  spkAssert(!!before, 'NOT_FOUND', 'Siswa tidak ditemukan.');
  spkAssertOwnClass(user, before.classId);
  var input = payload && typeof payload.patch === 'object' ? payload.patch : payload;
  var patch = spkStudentPatch(input, user, false);
  var updated = SIPIKET_Store.updateRow('STUDENTS', id, patch);
  var result = { student: updated };
  spkLogAudit('students.update', 'STUDENTS', id, before, result, 'Siswa diperbarui',
    spkParseIdempotency(payload), user);
  return result;
}

function spkStudentsImport(payload, user) {
  spkAssert(spkIsSuperadmin(user) || user.role === 'WALI_KELAS',
    'FORBIDDEN', 'Anda tidak memiliki akses untuk aksi ini.');
  var rows = payload && Array.isArray(payload.rows) ? payload.rows : [];
  spkAssert(rows.length <= 200, 'BAD_REQUEST', 'Maksimal 200 baris per panggilan.');
  var prepared = [];
  for (var i = 0; i < rows.length; i++) {
    var patch = spkStudentPatch(rows[i], user, true);
    var duplicate = SIPIKET_Store.findRow('STUDENTS', function (s) { return s.nis === patch.nis; });
    if (duplicate) {
      if (payload.replace === true || payload.replace === 'true') {
        SIPIKET_Store.updateRow('STUDENTS', duplicate.id, { active: false, barcodeActive: false });
      } else {
        continue;
      }
    }
    prepared.push(patch);
  }
  var created = SIPIKET_Store.batchAppend('STUDENTS', prepared);
  spkLogAudit('students.import', 'STUDENTS', '', {}, { count: created.length }, 'Import siswa',
    spkParseIdempotency(payload), user);
  return { imported: created.length, items: created };
}

function spkStudentsRegenerateBarcode(payload, user) {
  var id = spkRequireString(payload, 'id', 'Id siswa', 120);
  var student = SIPIKET_Store.findRow('STUDENTS', function (s) { return s.id === id; });
  spkAssert(!!student, 'NOT_FOUND', 'Siswa tidak ditemukan.');
  spkAssertOwnClass(user, student.classId);
  var token = 'BC-' + spkUuid();
  var updated = SIPIKET_Store.updateRow('STUDENTS', id, { barcodeToken: token, barcodeActive: true });
  spkLogAudit('students.regenerateBarcode', 'STUDENTS', id,
    { barcodeToken: student.barcodeToken }, { barcodeToken: token }, 'Barcode diperbarui',
    spkParseIdempotency(payload), user);
  return { student: updated };
}

function spkBarcodeLookup(payload, user) {
  var tokenId = spkRequireString(payload, 'tokenId', 'Token barcode', 160);
  var student = SIPIKET_Store.findRow('STUDENTS', function (s) { return s.barcodeToken === tokenId; });
  spkAssert(!!student, 'NOT_FOUND', 'Barcode tidak ditemukan.');
  spkStudentForRole(user, student, 'barcode.lookup');
  spkRequireActiveStudent(student);
  return {
    student: {
      id: student.id,
      name: student.name,
      nis: student.nis,
      classId: student.classId,
      className: spkClassName(student.classId),
      photoUrl: student.photoUrl || ''
    }
  };
}
