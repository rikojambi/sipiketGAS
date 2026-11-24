/**
 * Mock runtime Google Apps Script untuk node:test.
 * Tidak dipakai di produksi; hanya menguji logika backend tanpa akun Google.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import vm from 'node:vm';
import { createHash } from 'node:crypto';

const REAL_DATE = Date;
const JAKARTA_OFFSET = '+07:00';

function pad(n, len = 2) {
  return String(n).padStart(len, '0');
}

function formatJakarta(date, format) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hourCycle: 'h23', weekday: 'short'
  }).formatToParts(date);
  const p = Object.fromEntries(parts.map((x) => [x.type, x.value]));
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
  const dayNames = { Mon: 'Sen', Tue: 'Sel', Wed: 'Rab', Thu: 'Kam', Fri: 'Jum', Sat: 'Sab', Sun: 'Min' };
  const tokens = {
    yyyy: p.year,
    yy: p.year.slice(-2),
    MM: p.month,
    M: String(Number(p.month)),
    dd: p.day,
    d: String(Number(p.day)),
    HH: p.hour,
    H: String(Number(p.hour)),
    mm: p.minute,
    m: String(Number(p.minute)),
    ss: p.second,
    s: String(Number(p.second)),
    EEE: dayNames[p.weekday] || p.weekday,
    XXX: JAKARTA_OFFSET,
    Z: '+0700'
  };

  let out = '';
  let i = 0;
  while (i < format.length) {
    if (format[i] === "'") {
      i++;
      while (i < format.length && format[i] !== "'") out += format[i++];
      i++;
      continue;
    }
    const token = Object.keys(tokens).find((t) => format.startsWith(t, i));
    if (token) {
      out += tokens[token];
      i += token.length;
    } else {
      out += format[i++];
    }
  }
  return out;
}

function toBytes(value) {
  if (Buffer.isBuffer(value)) return value;
  if (Array.isArray(value)) return Buffer.from(value);
  return Buffer.from(String(value), 'utf8');
}

class MockRange {
  constructor(sheet, row, col, numRows, numCols) {
    this.sheet = sheet;
    this.row = row;
    this.col = col;
    this.numRows = numRows;
    this.numCols = numCols;
  }
  getValues() {
    const out = [];
    for (let r = 0; r < this.numRows; r++) {
      const source = this.sheet._values[this.row - 1 + r] || [];
      const line = [];
      for (let c = 0; c < this.numCols; c++) line.push(source[this.col - 1 + c] ?? '');
      out.push(line);
    }
    return out;
  }
  getValue() { return this.getValues()[0][0]; }
  setValues(values) {
    values.forEach((row, r) => {
      const idx = this.row - 1 + r;
      this.sheet._values[idx] = this.sheet._values[idx] || [];
      row.forEach((value, c) => { this.sheet._values[idx][this.col - 1 + c] = value; });
    });
    return this;
  }
  setValue(value) { return this.setValues([[value]]); }
  setFontWeight() { return this; }
  setBackground() { return this; }
  setNumberFormat() { return this; }
  setHorizontalAlignment() { return this; }
  clearContent() { return this; }
}

class MockSheet {
  constructor(name) {
    this._name = name;
    this._values = [];
    this._frozenRows = 0;
  }
  getName() { return this._name; }
  setName(name) { this._name = name; return this; }
  getLastRow() { return this._values.length; }
  getLastColumn() { return this._values.reduce((m, r) => Math.max(m, r.length), 0); }
  getDataRange() { return this.getRange(1, 1, Math.max(1, this.getLastRow()), Math.max(1, this.getLastColumn())); }
  getRange(row, col, numRows, numCols) {
    if (typeof row === 'string') {
      const match = /^([A-Z]+)(\d+)(?::([A-Z]+)(\d+))?$/.exec(row);
      if (!match) throw new Error('A1 notation tidak didukung: ' + row);
      const colNum = (s) => s.split('').reduce((a, ch) => a * 26 + ch.charCodeAt(0) - 64, 0);
      const r1 = Number(match[2]);
      const c1 = colNum(match[1]);
      return this.getRange(r1, c1, match[4] ? Number(match[4]) - r1 + 1 : 1, match[3] ? colNum(match[3]) - c1 + 1 : 1);
    }
    return new MockRange(this, row, col, numRows ?? 1, numCols ?? 1);
  }
  appendRow(row) { this._values.push(Array.isArray(row) ? [...row] : [row]); return this; }
  clear() { this._values = []; return this; }
  clearContents() { return this.clear(); }
  freezeRows(n) { this._frozenRows = n; return this; }
  setFrozenRows(n) { this._frozenRows = n; return this; }
  getFrozenRows() { return this._frozenRows; }
  autoResizeColumns() { return this; }
  setColumnWidth() { return this; }
}

class MockSpreadsheet {
  constructor(id, name) {
    this._id = id;
    this._name = name;
    this._sheets = [];
    this._url = 'https://docs.google.com/spreadsheets/d/' + id + '/edit';
  }
  getId() { return this._id; }
  getName() { return this._name; }
  getUrl() { return this._url; }
  getSheetByName(name) { return this._sheets.find((s) => s.getName() === name) || null; }
  insertSheet(name) {
    let sheet = this.getSheetByName(name);
    if (!sheet) { sheet = new MockSheet(name); this._sheets.push(sheet); }
    return sheet;
  }
  getSheets() { return [...this._sheets]; }
  copy(name) {
    const clone = new MockSpreadsheet('copy-' + this._id + '-' + Math.random().toString(36).slice(2, 7), name || this._name + ' (copy)');
    this._sheets.forEach((sheet) => {
      const cloned = clone.insertSheet(sheet.getName());
      cloned._values = sheet._values.map((row) => [...row]);
    });
    return new MockFile(clone.getId(), clone.getName(), '', clone, new REAL_DATE());
  }
}

function iterator(items) {
  let index = 0;
  return {
    _items: items,
    hasNext() { return index < items.length; },
    next() { return items[index++]; }
  };
}

class MockFile {
  constructor(id, name, content, spreadsheet = null, createdAt = new REAL_DATE()) {
    this._id = id; this._name = name; this._content = content;
    this._spreadsheet = spreadsheet; this._createdAt = createdAt;
  }
  getId() { return this._id; }
  getName() { return this._name; }
  getUrl() { return 'https://drive.google.com/file/d/' + this._id + '/view'; }
  getContent() { return this._content; }
  getDateCreated() { return this._createdAt; }
  getSpreadsheet() { return this._spreadsheet; }
}

class MockFolder {
  constructor(id, name) {
    this._id = id; this._name = name; this._files = [];
  }
  getName() { return this._name; }
  getId() { return this._id; }
  createFile(name, content) {
    const file = new MockFile('file-' + (folders.length + 1) + '-' + (this._files.length + 1), name, content);
    this._files.push(file);
    return file;
  }
  addFile(file) { if (!this._files.includes(file)) this._files.push(file); return file; }
  removeFile(file) { this._files = this._files.filter((f) => f !== file); return file; }
  getFiles() { return iterator([...this._files]); }
  getFilesByName(name) { return iterator(this._files.filter((f) => f.getName() === name)); }
}

export function createGasRuntime(options = {}) {
  const fixedNow = options.now ? new REAL_DATE(options.now) : new REAL_DATE('2026-11-24T04:00:00.000Z');
  let uuidCounter = 0;
  const properties = new Map(Object.entries(options.properties || {}));
  const cache = new Map();
  const spreadsheet = new MockSpreadsheet(options.spreadsheetId || 'sheet-test', options.spreadsheetName || 'SIPIKET_TEST');
  const folders = [];
  const foldersByName = new Map();

  class FixedDate extends REAL_DATE {
    constructor(...args) { super(...(args.length ? args : [fixedNow.getTime()])); }
    static now() { return fixedNow.getTime(); }
  }
  FixedDate.parse = REAL_DATE.parse;
  FixedDate.UTC = REAL_DATE.UTC;

  const Utilities = {
    DigestAlgorithm: { MD2: 'MD2', MD5: 'MD5', SHA_1: 'SHA_1', SHA_256: 'SHA_256', SHA_384: 'SHA_384', SHA_512: 'SHA_512' },
    getUuid() { uuidCounter += 1; return '00000000-0000-4000-8000-' + pad(uuidCounter, 12); },
    computeDigest(algorithm, value) {
      const algo = String(algorithm).replace(/_/g, '-').toLowerCase();
      return Array.from(createHash(algo === 'sha-1' ? 'sha1' : algo).update(toBytes(value)).digest());
    },
    base64Encode(value) { return toBytes(value).toString('base64'); },
    base64Decode(value) { return Array.from(Buffer.from(String(value), 'base64')); },
    formatDate(date, timezone, format) { return formatJakarta(new REAL_DATE(date), format); },
    sleep() {}
  };

  const SpreadsheetApp = {
    create(name) { return new MockSpreadsheet('created-' + (folders.length + 1), name); },
    openById(id) { if (id && id !== spreadsheet.getId()) spreadsheet._id = id; return spreadsheet; },
    open(file) { return file && file.getSpreadsheet ? file.getSpreadsheet() : spreadsheet; },
    getActiveSpreadsheet() { return spreadsheet; }
  };

  const PropertiesService = {
    getScriptProperties() {
      return {
        getProperty(key) { return properties.has(key) ? properties.get(key) : null; },
        setProperty(key, value) { properties.set(key, String(value)); return this; },
        setProperties(obj) { Object.entries(obj).forEach(([k, v]) => properties.set(k, String(v))); return this; },
        getProperties() { return Object.fromEntries(properties); }
      };
    },
    getUserProperties() { return this.getScriptProperties(); }
  };

  const CacheService = {
    getScriptCache() {
      return {
        get(key) { return cache.has(key) ? cache.get(key) : null; },
        put(key, value) { cache.set(key, String(value)); return this; },
        remove(key) { cache.delete(key); return this; },
        removeAll(keys) { keys.forEach((k) => cache.delete(k)); return this; },
        getRecordedCacheMissCountForKey() { return 0; }
      };
    }
  };

  const LockService = {
    getScriptLock() {
      return { waitLock() {}, tryLock() { return true; }, releaseLock() {}, hasLock() { return true; } };
    }
  };

  const ContentService = {
    MimeType: { JAVASCRIPT: 'application/javascript', JSON: 'application/json', TEXT: 'text/plain', HTML: 'text/html' },
    createTextOutput(content) {
      let mime = 'text/plain';
      return {
        setMimeType(v) { mime = v; return this; },
        getContent() { return String(content); },
        getMimeType() { return mime; }
      };
    }
  };

  const DriveApp = {
    getRootFolder() { return folders[0] || this.createFolder('Root'); },
    createFolder(name) {
      const folder = new MockFolder('folder-' + (folders.length + 1), name);
      folders.push(folder); foldersByName.set(name, folder);
      return folder;
    },
    getFolderByName(name) { return foldersByName.get(name) || null; },
    getFoldersByName(name) { const f = foldersByName.get(name); return iterator(f ? [f] : []); },
    getFilesByName(name) { return iterator(folders.flatMap((f) => f.getFilesByName(name)._items || [])); },
    getFileById(id) {
      for (const f of folders) {
        const found = f.getFilesByName('')._items.find((file) => file.getId() === id);
        if (found) return found;
      }
      return null;
    }
  };

  const context = {
    console, JSON, Math, Date: FixedDate,
    SpreadsheetApp, Utilities, PropertiesService, CacheService, LockService, ContentService, DriveApp,
    Session: { getScriptTimeZone: () => 'Asia/Jakarta', getActiveUser: () => ({ getEmail: () => 'admin@sipiket.test' }) },
    HtmlService: { createHtmlOutput: (s) => ({ getContent: () => String(s) }) },
    UrlFetchApp: { fetch: () => { throw new Error('UrlFetchApp tidak tersedia di mock'); } },
    __mock: { spreadsheet, properties, cache, folders, fixedNow, formatJakarta },
    setTimeout, clearTimeout
  };
  vm.createContext(context);
  context.globalThis = context;
  return context;
}

const FILE_ORDER = [
  'Config.gs', 'Utils.gs', 'Store.gs', 'Auth.gs', 'Setup.gs', 'Users.gs',
  'Students.gs', 'Attendance.gs', 'Permissions.gs', 'Classes.gs',
  'Monitoring.gs', 'Notifications.gs', 'Reports.gs', 'Backups.gs', 'Code.gs'
];

export function loadBackend(context, rootDir, files = FILE_ORDER) {
  for (const file of files) {
    const path = resolve(rootDir, file);
    let source;
    try { source = readFileSync(path, 'utf8'); } catch { continue; }
    vm.runInContext(source, context, { filename: file });
  }
  return context;
}

export function seedSheet(context, name, rows, headers) {
  const sheet = context.__mock.spreadsheet.getSheetByName(name) || context.__mock.spreadsheet.insertSheet(name);
  sheet.clear();
  const head = headers || (context.SIPIKET_Config && context.SIPIKET_Config.SHEET_SCHEMAS && context.SIPIKET_Config.SHEET_SCHEMAS[name]) || Object.keys(rows[0] || {});
  sheet.appendRow(head);
  rows.forEach((row) => sheet.appendRow(head.map((h) => row[h] ?? '')));
  sheet.freezeRows(1);
  return sheet;
}

export function rowsToObjects(sheet) {
  const values = sheet.getRange(1, 1, Math.max(1, sheet.getLastRow()), Math.max(1, sheet.getLastColumn())).getValues();
  const [head, ...rows] = values;
  return rows.filter((r) => r.some((v) => v !== '')).map((r) => Object.fromEntries(head.map((h, i) => [h, r[i]])));
}

export function action(context, name, payload = {}) {
  if (typeof context.spkHandleAction !== 'function') throw new Error('spkHandleAction tidak tersedia');
  return context.spkHandleAction(name, payload);
}

export function doGet(context, params) {
  return context.doGet({ parameter: params });
}
