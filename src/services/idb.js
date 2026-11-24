/** Promise wrapper untuk IndexedDB `sipiket` v1 dengan fallback memori bila IDB tidak tersedia. */

const DB_NAME = 'sipiket';
const DB_VERSION = 1;
const STORES = Object.freeze({ OUTBOX: 'outbox', CACHE: 'cache', META: 'meta' });
const memory = { outbox: new Map(), cache: new Map(), meta: new Map() };
let dbPromise = null;

export function openDb() {
  if (typeof indexedDB === 'undefined' || !indexedDB) return Promise.resolve(null);
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve) => {
    let request;
    try {
      request = indexedDB.open(DB_NAME, DB_VERSION);
    } catch {
      resolve(null);
      return;
    }
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORES.OUTBOX)) db.createObjectStore(STORES.OUTBOX, { keyPath: 'id' });
      if (!db.objectStoreNames.contains(STORES.CACHE)) db.createObjectStore(STORES.CACHE, { keyPath: 'key' });
      if (!db.objectStoreNames.contains(STORES.META)) db.createObjectStore(STORES.META, { keyPath: 'key' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
    request.onblocked = () => resolve(null);
  });
  return dbPromise;
}

function run(storeName, mode, operation) {
  return openDb().then((db) => new Promise((resolve, reject) => {
    if (!db) {
      try { operation(memory[storeName] ? { put: (value) => memory[storeName].set(value.id ?? value.key, value), get: (key) => memory[storeName].get(key), getAll: () => Array.from(memory[storeName].values()), delete: (key) => memory[storeName].delete(key), clear: () => memory[storeName].clear() } : null, resolve, reject); }
      catch (error) { reject(error); }
      return;
    }
    let transaction;
    try {
      transaction = db.transaction(storeName, mode);
      operation(transaction.objectStore(storeName), resolve, reject);
    } catch (error) {
      reject(error);
    }
  }));
}

function wrapRequest(request, resolve, reject, fallback) {
  request.onsuccess = () => resolve(request.result === undefined ? fallback : request.result);
  request.onerror = () => reject(request.error || new Error('IndexedDB error'));
}

export function idbGetAll(storeName) {
  return run(storeName, 'readonly', (store, resolve, reject) => {
    wrapRequest(store.getAll(), resolve, reject, []);
  }).catch(() => []);
}

export function idbGet(storeName, key) {
  return run(storeName, 'readonly', (store, resolve, reject) => {
    wrapRequest(store.get(key), resolve, reject, null);
  }).catch(() => null);
}

export function idbPut(storeName, value) {
  return run(storeName, 'readwrite', (store, resolve, reject) => {
    wrapRequest(store.put(value), resolve, reject, value);
  }).catch(() => value);
}

export function idbDelete(storeName, key) {
  return run(storeName, 'readwrite', (store, resolve, reject) => {
    wrapRequest(store.delete(key), resolve, reject, true);
  }).catch(() => true);
}

export function idbClear(storeName) {
  return run(storeName, 'readwrite', (store, resolve, reject) => {
    wrapRequest(store.clear(), resolve, reject, true);
  }).catch(() => true);
}

export const cacheGet = (key) => idbGet(STORES.CACHE, key);
export const cacheSet = (key, value) => idbPut(STORES.CACHE, { key, value, savedAt: new Date().toISOString() });
export const cacheDelete = (key) => idbDelete(STORES.CACHE, key);
export const metaGet = (key) => idbGet(STORES.META, key);
export const metaSet = (key, value) => idbPut(STORES.META, { key, value, updatedAt: new Date().toISOString() });

export { STORES };
