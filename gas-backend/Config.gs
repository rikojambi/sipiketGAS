/**
 * Config.gs - konfigurasi statis SIPIKET.
 * Semua konfigurasi sekolah dibaca dari sheet SCHOOL_SETTINGS lewat spkSetting();
 * file ini hanya berisi default dan kontrak struktur (tanpa akses GAS saat load).
 */

var SIPIKET_Config = {
  APP_VERSION: '1.0.0',

  SPREADSHEET_ID_KEY: 'SPREADSHEET_ID',
  BACKUP_FOLDER_NAME: 'SIPIKET_BACKUPS',
  SESSION_TTL_PROPERTY: 'SESSION_TTL_MS',
  LOCK_WAIT_MS: 25000,
  CACHE_TTL_SECONDS: 45,
  LOGIN_MAX_FAILURES: 5,
  LOGIN_LOCK_MS: 15 * 60 * 1000,

  SHEET_NAMES: [
    'USERS', 'TEACHERS', 'STUDENTS', 'CLASSES', 'SUBJECTS', 'SCHEDULES',
    'DUTY_SCHEDULES', 'ATTENDANCE', 'STUDENT_PERMITS', 'STUDENT_MOVEMENTS',
    'LATE_RECORDS', 'CONSEQUENCES', 'CLASS_MONITORING',
    'SUBSTITUTE_ASSIGNMENTS', 'NOTIFICATIONS', 'SCHOOL_SETTINGS', 'HOLIDAYS',
    'AUDIT_LOG', 'APP_CONFIG'
  ],

  // Header final mengikuti DATABASE_SCHEMA.md (kolom domain attendanceStatus, dll).
  SHEET_SCHEMAS: {
    USERS: ['id', 'createdAt', 'updatedAt', 'createdBy', 'status', 'username', 'passwordHash', 'salt', 'role', 'fullName', 'email', 'teacherId', 'classId', 'phone', 'active', 'failedAttempts', 'lockedUntil', 'lastLoginAt'],
    TEACHERS: ['id', 'createdAt', 'updatedAt', 'createdBy', 'status', 'nip', 'name', 'email', 'phone', 'subject', 'active', 'photoUrl'],
    STUDENTS: ['id', 'createdAt', 'updatedAt', 'createdBy', 'status', 'nis', 'nisn', 'name', 'classId', 'gender', 'birthDate', 'photoUrl', 'barcodeToken', 'barcodeActive', 'active', 'parentName', 'parentPhone'],
    CLASSES: ['id', 'createdAt', 'updatedAt', 'createdBy', 'status', 'name', 'grade', 'homeroomTeacherId', 'room', 'academicYear', 'active'],
    SUBJECTS: ['id', 'createdAt', 'updatedAt', 'createdBy', 'status', 'code', 'name', 'active'],
    SCHEDULES: ['id', 'createdAt', 'updatedAt', 'createdBy', 'status', 'day', 'classId', 'subjectId', 'teacherId', 'startMinutes', 'endMinutes', 'room', 'academicYear', 'semester', 'active'],
    DUTY_SCHEDULES: ['id', 'createdAt', 'updatedAt', 'createdBy', 'status', 'date', 'teacherId', 'role', 'active', 'notes'],
    ATTENDANCE: ['id', 'createdAt', 'updatedAt', 'createdBy', 'status', 'date', 'session', 'studentId', 'classId', 'attendanceStatus', 'scannedAt', 'scanSource', 'recordedBy', 'note', 'corrected', 'correctionReason', 'correctedBy', 'permitId'],
    STUDENT_PERMITS: ['id', 'createdAt', 'updatedAt', 'createdBy', 'status', 'date', 'studentId', 'classId', 'type', 'reason', 'detail', 'reporterId', 'approvedBy', 'approvalStatus', 'evidenceUrl', 'startedAt', 'endedAt'],
    STUDENT_MOVEMENTS: ['id', 'createdAt', 'updatedAt', 'createdBy', 'status', 'date', 'studentId', 'classId', 'type', 'outAt', 'returnAt', 'estimateReturnAt', 'purpose', 'grantedBy', 'recordedBy', 'movementStatus', 'note', 'durationMinutes', 'barcodeScanned', 'reminderSent'],
    LATE_RECORDS: ['id', 'createdAt', 'updatedAt', 'createdBy', 'status', 'date', 'studentId', 'classId', 'arrivalAt', 'lateMinutes', 'session', 'recordedBy', 'note', 'consequenceStatus'],
    CONSEQUENCES: ['id', 'createdAt', 'updatedAt', 'createdBy', 'status', 'lateRecordId', 'studentId', 'date', 'category', 'description', 'note', 'assignedBy', 'consequenceStatus', 'completedAt', 'verifiedBy'],
    CLASS_MONITORING: ['id', 'createdAt', 'updatedAt', 'createdBy', 'status', 'date', 'scheduleId', 'classId', 'subjectId', 'expectedTeacherId', 'monitoringStatus', 'checkedAt', 'checkedBy', 'note', 'verificationStatus'],
    SUBSTITUTE_ASSIGNMENTS: ['id', 'createdAt', 'updatedAt', 'createdBy', 'status', 'date', 'classId', 'scheduleId', 'subjectId', 'expectedTeacherId', 'substituteTeacherId', 'taskType', 'taskDescription', 'note', 'assignedBy', 'assignedAt', 'assignmentStatus', 'completedAt', 'verifiedBy'],
    NOTIFICATIONS: ['id', 'createdAt', 'updatedAt', 'createdBy', 'status', 'date', 'recipientRole', 'recipientUserId', 'type', 'title', 'body', 'severity', 'relatedId', 'read', 'readAt'],
    SCHOOL_SETTINGS: ['id', 'createdAt', 'updatedAt', 'createdBy', 'status', 'settingKey', 'settingValue', 'scope'],
    HOLIDAYS: ['id', 'createdAt', 'updatedAt', 'createdBy', 'status', 'date', 'holidayType', 'label', 'active'],
    AUDIT_LOG: ['id', 'createdAt', 'updatedAt', 'createdBy', 'status', 'action', 'entity', 'entityId', 'actorId', 'actorName', 'beforeJson', 'afterJson', 'reason', 'requestId', 'ip'],
    APP_CONFIG: ['id', 'createdAt', 'updatedAt', 'createdBy', 'status', 'configKey', 'configValue'],
    // Sheet tambahan (tidak termasuk 19 sheet utama), disembunyikan oleh Setup.gs.
    SESSIONS: ['tokenHash', 'userId', 'expiresAt', 'createdAt', 'revoked']
  },

  DEFAULT_SETTINGS: {
    schoolName: 'SMK Negeri 1 Contoh',
    npsn: '',
    logoUrl: '',
    academicYear: '2026/2027',
    semester: 'Ganjil',
    timezone: 'Asia/Jakarta',
    schoolStartMinutes: 420,
    schoolEndMinutes: 930,
    bellMorningMinutes: 420,
    bellAfternoonMinutes: 780,
    lateLimitMinutes: 15,
    dutyOpenMinutes: 360,
    attendanceMorningCloseMinutes: 510,
    attendanceAfternoonCloseMinutes: 870,
    schoolDays: ['MON', 'TUE', 'WED', 'THU', 'FRI'],
    pollIntervalMs: 20000,
    sessionTtlMs: 28800000,
    consequenceCategories: [
      { code: 'PEMBINAAN', label: 'Pembinaan dan pengarahan' },
      { code: 'TUGAS_TAMBAHAN', label: 'Tugas tambahan edukatif' },
      { code: 'REFLEKSI', label: 'Refleksi belajar' },
      { code: 'PENGGUMAAN_WAKTU', label: 'Penggunaan waktu positif' }
    ],
    permitTypes: ['SICK', 'LEAVE', 'ABSENT', 'EARLY_LEAVE'],
    seedDone: false,
    dbVersion: 1
  },

  // Matriks hak akses. Role selalu berasal dari session server, bukan payload.
  ROLE_PERMISSIONS: {
    SUPERADMIN: { all: true, description: 'Akses penuh' },
    KEPALA_SEKOLAH: {
      all: false, read: true, report: true, audit: true, correct: true,
      write: false, description: 'Read, laporan, audit, dan koreksi tercatat'
    },
    GURU_PIKET: {
      all: false, dutyRequired: true,
      actions: [
        'attendance.scan', 'attendance.manual', 'attendance.correct',
        'late.record', 'consequence.create', 'consequence.list', 'consequence.update',
        'permits.create', 'permits.list', 'permits.approve',
        'movement.out', 'movement.return', 'movement.earlyLeave', 'movement.list',
        'monitoring.list', 'monitoring.save', 'monitoring.summary',
        'substitute.assign', 'substitute.list', 'substitute.update',
        'barcode.lookup', 'students.list', 'students.get', 'duty.list',
        'dashboard.get', 'settings.public', 'notifications.list', 'notifications.read'
      ],
      description: 'Operasional berdasarkan jadwal piket hari ini'
    },
    GURU_MAPEL: {
      all: false,
      actions: [
        'permits.create', 'permits.list', 'students.list', 'students.get',
        'substitute.list', 'monitoring.list', 'monitoring.summary',
        'dashboard.get', 'settings.public', 'notifications.list', 'notifications.read'
      ],
      description: 'Membuat izin siswa dan melihat penggantian yang terkait'
    },
    WALI_KELAS: {
      all: false, ownClassOnly: true,
      actions: [
        'students.list', 'students.get', 'students.create', 'students.update',
        'students.regenerateBarcode', 'barcode.lookup',
        'permits.create', 'permits.list', 'permits.approve',
        'attendance.scan', 'attendance.manual', 'attendance.correct',
        'consequence.list', 'movement.list', 'monitoring.list',
        'dashboard.get', 'settings.public', 'notifications.list', 'notifications.read'
      ],
      description: 'Hanya mengelola siswa kelas sendiri'
    }
  },

  CONSEQUENCE_CATEGORIES: [
    { code: 'PEMBINAAN', label: 'Pembinaan dan pengarahan' },
    { code: 'TUGAS_TAMBAHAN', label: 'Tugas tambahan edukatif' },
    { code: 'REFLEKSI', label: 'Refleksi belajar' },
    { code: 'PENGGUMAAN_WAKTU', label: 'Penggunaan waktu positif' }
  ],

  // Daftar aksi yang dibaca (tidak membuat/mengubah transaksi).
  READ_ACTIONS: [
    'me', 'settings.public', 'settings.list', 'notifications.list', 'notifications.read',
    'users.list', 'teachers.list', 'students.list', 'students.get', 'classes.list',
    'subjects.list', 'schedules.list', 'duty.list', 'holidays.list',
    'permits.list', 'consequence.list', 'movement.list', 'monitoring.list', 'monitoring.summary',
    'substitute.list', 'barcode.lookup', 'dashboard.get', 'reports.get', 'reports.export',
    'audit.list', 'backup.list', 'setup.status', 'setup.validate'
  ],

  OPERATIONAL_ACTIONS: [
    'attendance.scan', 'attendance.manual', 'attendance.correct', 'late.record',
    'consequence.create', 'consequence.update', 'permits.create', 'permits.approve',
    'movement.out', 'movement.return', 'movement.earlyLeave',
    'monitoring.save', 'substitute.assign', 'substitute.update'
  ]
};
