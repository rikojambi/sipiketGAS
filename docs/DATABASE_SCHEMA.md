# SIPIKET Database Schema (Google Sheets)

Database dibuat otomatis oleh `Setup.gs`. Semua sheet memiliki 5 kolom sistem pertama:

| kolom | tipe | keterangan |
|---|---|---|
| `id` | string | UUID; tidak bergantung pada nomor baris |
| `createdAt` | ISO string |Asia/Jakarta |
| `updatedAt` | ISO string | Asia/Jakarta |
| `createdBy` | string | user id atau `SYSTEM` |
| `status` | string | `ACTIVE`, `INACTIVE`, `DELETED`, dll |

## Daftar sheet (19)

1. `USERS`
2. `TEACHERS`
3. `STUDENTS`
4. `CLASSES`
5. `SUBJECTS`
6. `SCHEDULES`
7. `DUTY_SCHEDULES`
8. `ATTENDANCE`
9. `STUDENT_PERMITS`
10. `STUDENT_MOVEMENTS`
11. `LATE_RECORDS`
12. `CONSEQUENCES`
13. `CLASS_MONITORING`
14. `SUBSTITUTE_ASSIGNMENTS`
15. `NOTIFICATIONS`
16. `SCHOOL_SETTINGS`
17. `HOLIDAYS`
18. `AUDIT_LOG`
19. `APP_CONFIG`

## Header detail

```text
USERS: id,createdAt,updatedAt,createdBy,status,username,passwordHash,salt,role,fullName,email,teacherId,classId,phone,active,failedAttempts,lockedUntil,lastLoginAt
TEACHERS: id,createdAt,updatedAt,createdBy,status,nip,name,email,phone,subject,active,photoUrl
STUDENTS: id,createdAt,updatedAt,createdBy,status,nis,nisn,name,classId,gender,birthDate,photoUrl,barcodeToken,barcodeActive,active,parentName,parentPhone
CLASSES: id,createdAt,updatedAt,createdBy,status,name,grade,homeroomTeacherId,room,academicYear,active
SUBJECTS: id,createdAt,updatedAt,createdBy,status,code,name,active
SCHEDULES: id,createdAt,updatedAt,createdBy,status,day,classId,subjectId,teacherId,startMinutes,endMinutes,room,academicYear,semester,active
DUTY_SCHEDULES: id,createdAt,updatedAt,createdBy,status,date,teacherId,role,active,notes
ATTENDANCE: id,createdAt,updatedAt,createdBy,status,date,session,studentId,classId,attendanceStatus,scannedAt,scanSource,recordedBy,note,corrected,correctionReason,correctedBy,permitId
STUDENT_PERMITS: id,createdAt,updatedAt,createdBy,status,date,studentId,classId,type,reason,detail,reporterId,approvedBy,approvalStatus,evidenceUrl,startedAt,endedAt
STUDENT_MOVEMENTS: id,createdAt,updatedAt,createdBy,status,date,studentId,classId,type,outAt,returnAt,estimateReturnAt,purpose,grantedBy,recordedBy,movementStatus,note,durationMinutes,barcodeScanned,reminderSent
LATE_RECORDS: id,createdAt,updatedAt,createdBy,status,date,studentId,classId,arrivalAt,lateMinutes,session,recordedBy,note,consequenceStatus
CONSEQUENCES: id,createdAt,updatedAt,createdBy,status,lateRecordId,studentId,date,category,description,note,assignedBy,consequenceStatus,completedAt,verifiedBy
CLASS_MONITORING: id,createdAt,updatedAt,createdBy,status,date,scheduleId,classId,subjectId,expectedTeacherId,monitoringStatus,checkedAt,checkedBy,note,verificationStatus
SUBSTITUTE_ASSIGNMENTS: id,createdAt,updatedAt,createdBy,status,date,classId,scheduleId,subjectId,expectedTeacherId,substituteTeacherId,taskType,taskDescription,note,assignedBy,assignedAt,assignmentStatus,completedAt,verifiedBy
NOTIFICATIONS: id,createdAt,updatedAt,createdBy,status,date,recipientRole,recipientUserId,type,title,body,severity,relatedId,read,readAt
SCHOOL_SETTINGS: id,createdAt,updatedAt,createdBy,status,settingKey,settingValue,scope
HOLIDAYS: id,createdAt,updatedAt,createdBy,status,date,holidayType,label,active
AUDIT_LOG: id,createdAt,updatedAt,createdBy,status,action,entity,entityId,actorId,actorName,beforeJson,afterJson,reason,requestId,ip
APP_CONFIG: id,createdAt,updatedAt,createdBy,status,configKey,configValue
```

Kolom `status` selalu berarti status baris (`ACTIVE`, `INACTIVE`, `DELETED`). Status domain memakai kolom khusus: `ATTENDANCE.attendanceStatus`, `STUDENT_PERMITS.approvalStatus`, `STUDENT_MOVEMENTS.movementStatus`, `CONSEQUENCES.consequenceStatus`, `CLASS_MONITORING.monitoringStatus`, `SUBSTITUTE_ASSIGNMENTS.assignmentStatus`.

## Relasi

```text
USERS.teacherId → TEACHERS.id
USERS.classId   → CLASSES.id (wali kelas)
STUDENTS.classId → CLASSES.id
CLASSES.homeroomTeacherId → TEACHERS.id
SCHEDULES.classId/subjectId/teacherId → CLASSES/SUBJECTS/TEACHERS
DUTY_SCHEDULES.teacherId → TEACHERS.id (atau USERS.teacherId)
ATTENDANCE.studentId → STUDENTS.id
ATTENDANCE.permitId → STUDENT_PERMITS.id
LATE_RECORDS.studentId → STUDENTS.id
CONSEQUENCES.lateRecordId → LATE_RECORDS.id
CLASS_MONITORING.scheduleId → SCHEDULES.id
SUBSTITUTE_ASSIGNMENTS.scheduleId → SCHEDULES.id
NOTIFICATIONS.relatedId → ID transaksi terkait
AUDIT_LOG.entityId → ID entitas apa pun
```

## Indeks logika (dibuat via CacheService, bukan kolom sheet)

- `ATTENDANCE`: `(date, session, studentId)` unik.
- `STUDENT_MOVEMENTS`: movement OPEN terakhir per `(date, studentId)`.
- `STUDENTS.barcodeToken`: unik; regenerate oleh superadmin/wali kelas sesuai hak.
- `USERS.username`: unik, case-insensitive.

## Setting default (`SCHOOL_SETTINGS`)

| key | default |
|---|---|
| `schoolName` | `SMK Negeri 1 Contoh` |
| `npsn` | `""` |
| `logoUrl` | `""` |
| `academicYear` | `2026/2027` |
| `semester` | `Ganjil` |
| `timezone` | `Asia/Jakarta` |
| `schoolStartMinutes` | `420` (07:00) |
| `schoolEndMinutes` | `930` (15:30) |
| `bellMorningMinutes` | `420` |
| `bellAfternoonMinutes` | `780` (13:00) |
| `lateLimitMinutes` | `15` |
| `attendanceMorningCloseMinutes` | `510` (08:30) |
| `attendanceAfternoonCloseMinutes` | `870` (14:30) |
| `dutyOpenMinutes` | `360` (06:00) — guru piket baru boleh membuka menu operasional lewat backend setelah jam ini |
| `schoolDays` | `["MON","TUE","WED","THU","FRI"]` |
| `pollIntervalMs` | `20000` |
| `sessionTtlMs` | `28800000` |
| `consequenceCategories` | `[{"code":"PEMBINAAN","label":"Pembinaan dan pengarahan"},...]` |
| `permitTypes` | `["SICK","LEAVE","ABSENT","EARLY_LEAVE"]` |
| `seedDone` | `false` |
| `dbVersion` | `1` |

## Penyimpanan aman

- `passwordHash` = Base64(SHA256(salt + password)), `salt` = Base64(32 byte acak).
- Session token hanya disimpan sebagai `SHA256(token)` di sheet `USERS` kolom tambahan `tokenHash`? Tidak: gunakan sheet tersembunyi `SESSIONS` yang dibuat otomatis selain 19 sheet utama. Kolom: `tokenHash,userId,expiresAt,createdAt,revoked`.
- Spreadsheet tidak di-share ke publik; hanya owner script yang bisa mengakses via `SpreadsheetApp.openById`.
- Backup disimpan di folder Drive `SIPIKET_BACKUPS` milik owner script.
