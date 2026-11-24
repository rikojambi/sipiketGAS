/**
 * Store.gs - akses Google Sheets dengan header, cache baca, lock tulis, dan UUID.
 * Satu `table(name)` dibaca sekali per request; mutasi selalu melalui withLock().
 */

var SPK_LOCAL_TABLE_CACHE = {};
var SPK_LOCK_DEPTH = 0;
var SPK_SPREADSHEET_REF = null;

function spkGetProperty(key) {
  try {
    if (typeof PropertiesService === 'undefined') { return ''; }
    return PropertiesService.getScriptProperties().getProperty(key) || '';
  } catch (err) {
    return '';
  }
}

function spkSetProperty(key, value) {
  try {
    if (typeof PropertiesService === 'undefined') { return false; }
    PropertiesService.getScriptProperties().setProperty(key, String(value));
    return true;
  } catch (err) {
    return false;
  }
}

function spkSpreadsheet() {
  if (SPK_SPREADSHEET_REF) { return SPK_SPREADSHEET_REF; }
  var id = spkGetProperty(SIPIKET_Config.SPREADSHEET_ID_KEY);
  spkAssert(!!id, 'NOT_FOUND', 'Database belum diinisialisasi. Jalankan setup.database.');
  SPK_SPREADSHEET_REF = SpreadsheetApp.openById(id);
  return SPK_SPREADSHEET_REF;
}

function spkSetSpreadsheet(spreadsheet) {
  SPK_SPREADSHEET_REF = spreadsheet || null;
  SPK_LOCAL_TABLE_CACHE = {};
}

function spkGetSheet(name) {
  var sheet = spkSpreadsheet().getSheetByName(name);
  if (!sheet) { throw spkError('NOT_FOUND', 'Sheet ' + name + ' belum ada.'); }
  return sheet;
}

function spkSchema(name) {
  var schema = SIPIKET_Config.SHEET_SCHEMAS[name];
  if (!schema) { throw spkError('BAD_REQUEST', 'Sheet ' + name + ' tidak dikenal.'); }
  return schema;
}

function spkCellToString(value) {
  if (value === null || typeof value === 'undefined') { return ''; }
  if (value instanceof Date) { return spkFormatJakarta(value, 'yyyy-MM-dd HH:mm:ss'); }
  if (typeof value === 'object') { return spkStringify(value); }
  return String(value);
}

function spkToCell(value) {
  if (value === null || typeof value === 'undefined') { return ''; }
  if (typeof value === 'boolean') { return value ? 'TRUE' : 'FALSE'; }
  if (typeof value === 'object') { return spkStringify(value); }
  return String(value);
}

function spkCopyRow(row) {
  var out = {};
  for (var k in row) {
    if (Object.prototype.hasOwnProperty.call(row, k)) { out[k] = row[k]; }
  }
  return out;
}

function spkRowsFromValues(headers, values) {
  var rows = [];
  for (var i = 0; i < values.length; i++) {
    var valuesRow = values[i];
    var blank = true;
    for (var j = 0; j < headers.length; j++) {
      if (spkCellToString(valuesRow[j]) !== '') { blank = false; break; }
    }
    if (blank) { continue; }
    var obj = {};
    for (var h = 0; h < headers.length; h++) {
      obj[headers[h]] = spkCellToString(valuesRow[h]);
    }
    rows.push(obj);
  }
  return rows;
}

function spkReadRaw(name) {
  var sheet = spkGetSheet(name);
  var schema = spkSchema(name);
  var lastRow = sheet.getLastRow();
  if (lastRow < 1) {
    return { sheet: sheet, headers: schema.slice(), values: [], rows: [] };
  }
  var headersRow = sheet.getRange(1, 1, 1, schema.length).getValues()[0];
  var headers = [];
  for (var i = 0; i < schema.length; i++) {
    headers[i] = spkCellToString(headersRow[i]) || schema[i];
  }
  var values = [];
  if (lastRow >= 2) {
    values = sheet.getRange(2, 1, lastRow - 1, schema.length).getValues();
  }
  return { sheet: sheet, headers: headers, values: values, rows: spkRowsFromValues(headers, values) };
}

function spkCacheKey(name) {
  return 'spk_rows_' + name;
}

function spkCacheService() {
  try {
    if (typeof CacheService !== 'undefined' && CacheService.getScriptCache) {
      return CacheService.getScriptCache();
    }
  } catch (err) {
    return null;
  }
  return null;
}

function spkGetRows(name) {
  spkSchema(name);
  if (Object.prototype.hasOwnProperty.call(SPK_LOCAL_TABLE_CACHE, name)) {
    return SPK_LOCAL_TABLE_CACHE[name];
  }
  var cache = spkCacheService();
  if (cache) {
    try {
      var cached = cache.get(spkCacheKey(name));
      var parsed = spkSafeJson(cached, null);
      if (Array.isArray(parsed)) {
        SPK_LOCAL_TABLE_CACHE[name] = parsed;
        return parsed;
      }
    } catch (err) {
      // Cache yang rusak diabaikan, dibaca ulang dari sheet.
    }
  }
  var rows = spkReadRaw(name).rows;
  SPK_LOCAL_TABLE_CACHE[name] = rows;
  if (cache) {
    try {
      var json = spkStringify(rows);
      if (json.length < 90000) {
        cache.put(spkCacheKey(name), json, SIPIKET_Config.CACHE_TTL_SECONDS);
      }
    } catch (err) {
      // Melebihi batas CacheService: tetap pakai cache lokal per request.
    }
  }
  return rows;
}

function spkTable(name) {
  return spkGetRows(name);
}

function spkInvalidate(name) {
  if (!name) {
    SPK_LOCAL_TABLE_CACHE = {};
    spkInvalidateSettings();
    var cacheAll = spkCacheService();
    if (cacheAll) {
      var keys = [];
      for (var i = 0; i < SIPIKET_Config.SHEET_NAMES.length; i++) {
        keys.push(spkCacheKey(SIPIKET_Config.SHEET_NAMES[i]));
      }
      keys.push(spkCacheKey('SESSIONS'));
      try { cacheAll.removeAll(keys); } catch (err) { /* diabaikan */ }
    }
    return;
  }
  delete SPK_LOCAL_TABLE_CACHE[name];
  if (name === 'SCHOOL_SETTINGS') { spkInvalidateSettings(); }
  var cache = spkCacheService();
  if (cache) {
    try { cache.remove(spkCacheKey(name)); } catch (err) { /* diabaikan */ }
  }
}

function spkWithLock(fn) {
  spkAssert(typeof fn === 'function', 'BAD_REQUEST', 'withLock membutuhkan fungsi.');
  if (SPK_LOCK_DEPTH > 0) { return fn(); }
  var lock = null;
  if (typeof LockService !== 'undefined' && LockService.getScriptLock) {
    lock = LockService.getScriptLock();
    try { lock.waitLock(SIPIKET_Config.LOCK_WAIT_MS); }
    catch (err) { throw spkError('CONFLICT', 'Sistem sedang sibuk, silakan coba lagi.'); }
  }
  SPK_LOCK_DEPTH++;
  try {
    return fn();
  } finally {
    SPK_LOCK_DEPTH--;
    if (lock) {
      try { lock.releaseLock(); } catch (err) { /* diabaikan */ }
    }
  }
}

function spkBaseRow(name, row) {
  var now = spkNowIsoJakarta();
  var base = {};
  if (name === 'SESSIONS') {
    base.createdAt = row.createdAt || now;
  } else {
    base.id = row.id || spkUuid();
    base.createdAt = row.createdAt || now;
    base.updatedAt = now;
    base.createdBy = row.createdBy || 'SYSTEM';
    base.status = row.status || 'ACTIVE';
  }
  var merged = {};
  for (var k in base) {
    if (Object.prototype.hasOwnProperty.call(base, k)) { merged[k] = base[k]; }
  }
  for (var key in row) {
    if (Object.prototype.hasOwnProperty.call(row, key)) { merged[key] = row[key]; }
  }
  if (name !== 'SESSIONS') { merged.updatedAt = now; }
  return merged;
}

function spkRowToValues(name, schema, row) {
  var values = [];
  for (var i = 0; i < schema.length; i++) {
    values.push(spkToCell(row[schema[i]]));
  }
  return values;
}

function spkAppendRow(name, row) {
  spkAssert(row && typeof row === 'object', 'BAD_REQUEST', 'Data baris tidak valid.');
  return spkWithLock(function () {
    var schema = spkSchema(name);
    var finalRow = spkBaseRow(name, row);
    var sheet = spkGetSheet(name);
    sheet.appendRow(spkRowToValues(name, schema, finalRow));
    spkInvalidate(name);
    return finalRow;
  });
}

function spkFindIndexInRaw(raw, id) {
  for (var i = 0; i < raw.rows.length; i++) {
    if (raw.rows[i].id === id || raw.rows[i].tokenHash === id) { return i; }
  }
  return -1;
}

function spkUpdateRow(name, id, patch) {
  spkAssert(patch && typeof patch === 'object', 'BAD_REQUEST', 'Patch tidak valid.');
  spkAssert(!!id, 'BAD_REQUEST', 'Id baris wajib diisi.');
  return spkWithLock(function () {
    var raw = spkReadRaw(name);
    var index = spkFindIndexInRaw(raw, String(id));
    if (index < 0) { throw spkError('NOT_FOUND', 'Data tidak ditemukan.'); }
    var current = raw.rows[index];
    var updated = {};
    for (var k in current) {
      if (Object.prototype.hasOwnProperty.call(current, k)) { updated[k] = current[k]; }
    }
    for (var key in patch) {
      if (!Object.prototype.hasOwnProperty.call(patch, key)) { continue; }
      if (key === 'id' || key === 'createdAt' || key === 'createdBy') { continue; }
      updated[key] = patch[key];
    }
    if (name !== 'SESSIONS') { updated.updatedAt = spkNowIsoJakarta(); }
    raw.sheet.getRange(index + 2, 1, 1, raw.headers.length)
      .setValues([spkRowToValues(name, raw.headers, updated)]);
    spkInvalidate(name);
    return updated;
  });
}

function spkUpdateWhere(name, predicate, patch) {
  return spkWithLock(function () {
    var raw = spkReadRaw(name);
    var updatedRows = [];
    var count = 0;
    for (var i = 0; i < raw.rows.length; i++) {
      if (!predicate(raw.rows[i])) { continue; }
      var updated = spkCopyRow(raw.rows[i]);
      for (var key in patch) {
        if (!Object.prototype.hasOwnProperty.call(patch, key)) { continue; }
        if (key === 'id' || key === 'createdAt' || key === 'createdBy') { continue; }
        updated[key] = patch[key];
      }
      if (name !== 'SESSIONS') { updated.updatedAt = spkNowIsoJakarta(); }
      raw.values[i] = spkRowToValues(name, raw.headers, updated);
      updatedRows.push(updated);
      count++;
    }
    if (count > 0 && raw.values.length > 0) {
      raw.sheet.getRange(2, 1, raw.values.length, raw.headers.length).setValues(raw.values);
    }
    spkInvalidate(name);
    return { count: count, rows: updatedRows };
  });
}

function spkFindRow(name, predicate) {
  spkAssert(typeof predicate === 'function', 'BAD_REQUEST', 'findRow membutuhkan fungsi.');
  var rows = spkGetRows(name);
  for (var i = 0; i < rows.length; i++) {
    if (predicate(rows[i])) { return rows[i]; }
  }
  return null;
}

function spkBatchAppend(name, rows) {
  spkAssert(Array.isArray(rows), 'BAD_REQUEST', 'batchAppend membutuhkan array.');
  return spkWithLock(function () {
    if (rows.length === 0) { return []; }
    var schema = spkSchema(name);
    var sheet = spkGetSheet(name);
    var finalRows = [];
    var matrix = [];
    for (var i = 0; i < rows.length; i++) {
      var finalRow = spkBaseRow(name, rows[i]);
      finalRows.push(finalRow);
      matrix.push(spkRowToValues(name, schema, finalRow));
    }
    var start = Math.max(2, sheet.getLastRow() + 1);
    sheet.getRange(start, 1, matrix.length, schema.length).setValues(matrix);
    spkInvalidate(name);
    return finalRows;
  });
}

function spkGetConfigValue(key, fallback) {
  var row = spkFindRow('APP_CONFIG', function (r) { return r.configKey === key; });
  if (!row) { return typeof fallback === 'undefined' ? '' : fallback; }
  var value = spkSafeJson(row.configValue, row.configValue);
  return typeof value === 'undefined' ? fallback : value;
}

function spkSetConfigValue(key, value) {
  spkAssert(!!spkSanitize(key, 100), 'BAD_REQUEST', 'configKey wajib diisi.');
  var stored = typeof value === 'string' ? value : spkStringify(value);
  return spkWithLock(function () {
    var raw = spkReadRaw('APP_CONFIG');
    for (var i = 0; i < raw.rows.length; i++) {
      if (raw.rows[i].configKey === key) {
        var patched = spkCopyRow(raw.rows[i]);
        patched.configValue = stored;
        patched.updatedAt = spkNowIsoJakarta();
        raw.values[i] = spkRowToValues('APP_CONFIG', raw.headers, patched);
        raw.sheet.getRange(2, 1, raw.values.length, raw.headers.length).setValues(raw.values);
        spkInvalidate('APP_CONFIG');
        return patched;
      }
    }
    return spkAppendRow('APP_CONFIG', { configKey: key, configValue: stored, status: 'ACTIVE' });
  });
}

function spkEnsureSheet(name, headers, hidden) {
  spkAssert(!!name, 'BAD_REQUEST', 'Nama sheet wajib diisi.');
  var ss = spkSpreadsheet();
  var sheet = ss.getSheetByName(name);
  if (!sheet) { sheet = ss.insertSheet(name); }
  var range = sheet.getRange(1, 1, 1, headers.length);
  var existing = range.getValues()[0];
  var needsWrite = false;
  for (var i = 0; i < headers.length; i++) {
    if (spkCellToString(existing[i]) !== headers[i]) { needsWrite = true; break; }
  }
  if (needsWrite) { range.setValues([headers.slice()]); }
  sheet.setFrozenRows(1);
  try {
    range.setFontWeight('bold');
    sheet.autoResizeColumns(1, headers.length);
  } catch (err) { /* format ringan opsional pada mock */ }
  if (hidden) {
    try { sheet.hideSheet(); } catch (err) { /* diabaikan */ }
  }
  spkInvalidate(name);
  return sheet;
}

var SIPIKET_Store = {
  table: spkTable,
  getRows: spkGetRows,
  appendRow: spkAppendRow,
  updateRow: spkUpdateRow,
  findRow: spkFindRow,
  withLock: spkWithLock,
  invalidate: spkInvalidate,
  batchAppend: spkBatchAppend,
  updateWhere: spkUpdateWhere,
  readRaw: spkReadRaw,
  ensureSheet: spkEnsureSheet,
  getSheet: spkGetSheet,
  getConfig: spkGetConfigValue,
  setConfig: spkSetConfigValue,
  getProperty: spkGetProperty,
  setProperty: spkSetProperty,
  spreadsheet: spkSpreadsheet,
  setSpreadsheet: spkSetSpreadsheet
};
