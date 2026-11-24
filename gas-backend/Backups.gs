/**
 * Backups.gs - backup spreadsheet via DriveApp copy, daftar, dan restore.
 * Restore hanya dijalankan dengan confirmPhrase = "RESTORE".
 */

function spkBackupFolder() {
  var folders = DriveApp.getFoldersByName(SIPIKET_Config.BACKUP_FOLDER_NAME);
  if (folders.hasNext()) { return folders.next(); }
  return DriveApp.createFolder(SIPIKET_Config.BACKUP_FOLDER_NAME);
}

function spkBackupName() {
  var stamp = spkFormatJakarta(new Date(), 'yyyyMMdd_HHmmss');
  return 'SIPIKET_BACKUP_' + stamp;
}

function spkBackupCreate(reason, user) {
  var ss = spkSpreadsheet();
  var fileName = spkBackupName();
  var file = ss.copy(fileName);
  var folder = spkBackupFolder();
  folder.addFile(file);
  try {
    DriveApp.getRootFolder().removeFile(file);
  } catch (err) {
    // File tetap tersimpan di folder backup.
  }
  var meta = {
    fileId: file.getId(),
    fileName: fileName,
    url: file.getUrl(),
    reason: spkSanitize(reason || 'MANUAL', 120),
    createdAt: spkNowIsoJakarta()
  };
  SIPIKET_Store.setConfig('lastBackup', meta);
  spkLogAudit('backup.create', 'APP_CONFIG', meta.fileId, {}, meta,
    'Backup database dibuat', meta.reason, user);
  return meta;
}

function spkBackupList(payload, user) {
  var folder = spkBackupFolder();
  var files = folder.getFiles();
  var items = [];
  while (files.hasNext()) {
    var file = files.next();
    var name = file.getName();
    if (name.indexOf('SIPIKET_BACKUP_') === 0) {
      items.push({
        fileId: file.getId(),
        fileName: name,
        url: file.getUrl(),
        createdAt: spkFormatJakarta(file.getDateCreated(), "yyyy-MM-dd'T'HH:mm:ssXXX")
      });
    }
  }
  items.sort(function (a, b) { return String(b.fileName).localeCompare(String(a.fileName)); });
  return { items: items.slice(0, 50) };
}

function spkBackupRestore(payload, user) {
  var data = payload && typeof payload === 'object' ? payload : {};
  spkAssert(spkSanitize(data.confirmPhrase, 40) === 'RESTORE',
    'BAD_REQUEST', 'Konfirmasi RESTORE wajib diisi persis.');
  var fileId = spkRequireString(data, 'fileId', 'Id file backup', 150);

  return spkWithLock(function () {
    var backupFile = DriveApp.getFileById(fileId);
    var backupSs = SpreadsheetApp.open(backupFile);
    var active = spkSpreadsheet();
    var names = SIPIKET_Config.SHEET_NAMES.slice();
    for (var i = 0; i < names.length; i++) {
      var name = names[i];
      var target = active.getSheetByName(name);
      var source = backupSs.getSheetByName(name);
      if (!target || !source) { continue; }
      var headers = SIPIKET_Config.SHEET_SCHEMAS[name];
      var lastRow = source.getLastRow();
      var matrix = [headers.slice()];
      if (lastRow >= 2) {
        var sourceColumns = source.getLastColumn();
        var sourceHeaders = source.getRange(1, 1, 1, sourceColumns).getValues()[0];
        var sourceRows = source.getRange(2, 1, lastRow - 1, sourceColumns).getValues();
        var indexMap = {};
        for (var h = 0; h < headers.length; h++) {
          indexMap[headers[h]] = -1;
          for (var sh = 0; sh < sourceHeaders.length; sh++) {
            if (spkCellToString(sourceHeaders[sh]) === headers[h]) { indexMap[headers[h]] = sh; break; }
          }
        }
        for (var r = 0; r < sourceRows.length; r++) {
          var values = [];
          for (var c = 0; c < headers.length; c++) {
            var idx = indexMap[headers[c]];
            values.push(idx >= 0 ? spkCellToString(sourceRows[r][idx]) : '');
          }
          matrix.push(values);
        }
      }
      target.clear();
      target.getRange(1, 1, matrix.length, headers.length).setValues(matrix);
      try { target.setFrozenRows(1); } catch (err) { /* diabaikan */ }
    }
    spkInvalidate(null);
    spkInvalidateSettings();
    return { fileId: fileId, fileName: backupFile.getName(), restoredSheets: names.length };
  });
}

function spkScheduledBackup() {
  try {
    return spkBackupCreate('SCHEDULED', { id: 'SYSTEM' });
  } catch (err) {
    return { error: spkSanitize(err && err.message, 300) };
  }
}
