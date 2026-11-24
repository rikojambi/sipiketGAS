/** Antrean mutasi offline. Status tidak pernah ditampilkan sebagai sukses sebelum konfirmasi backend. */

import { api, ApiError, apiMessage } from './api.js';
import { STORES, idbGetAll, idbPut, idbDelete } from './idb.js';

export const OUTBOX_EVENT = 'sipiket:outbox-change';
const TERMINAL_ERROR_CODES = new Set(['CONFLICT', 'BAD_REQUEST', 'NOT_FOUND', 'FORBIDDEN']);

let items = [];
let ready = false;
let flushing = null;
const listeners = new Set();

export function uuidv4() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (char) => {
    const random = Math.floor(Math.random() * 16);
    const value = char === 'x' ? random : ((random & 0x3) | 0x8);
    return value.toString(16);
  });
}

function emit() {
  const snapshot = getCounts();
  if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function' && typeof CustomEvent !== 'undefined') {
    window.dispatchEvent(new CustomEvent(OUTBOX_EVENT, { detail: snapshot }));
  }
  listeners.forEach((listener) => {
    try { listener(snapshot, items.slice()); } catch { /* abaikan listener rusak */ }
  });
}

export async function initOutbox() {
  if (ready) return items;
  items = await idbGetAll(STORES.OUTBOX);
  items.sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
  ready = true;
  emit();
  return items;
}

export function getItems() {
  return items.slice();
}

export function getCounts() {
  return {
    pending: items.filter((item) => item.status === 'PENDING').length,
    failed: items.filter((item) => item.status === 'FAILED').length,
    synced: items.filter((item) => item.status === 'SYNCED').length,
    total: items.length
  };
}

export function subscribe(listener) {
  listeners.add(listener);
  listener(getCounts(), items.slice());
  return () => listeners.delete(listener);
}

export async function enqueue(action, payload = {}, meta = {}) {
  await initOutbox();
  const record = {
    id: uuidv4(),
    action,
    payload: { ...payload, idempotencyKey: payload.idempotencyKey || uuidv4() },
    status: 'PENDING',
    attempts: 0,
    lastError: '',
    createdAt: new Date().toISOString(),
    label: meta.label || action,
    scope: meta.scope || ''
  };
  items.push(record);
  await idbPut(STORES.OUTBOX, record);
  emit();
  return record;
}

export async function retry(id) {
  const record = items.find((item) => item.id === id);
  if (!record) return null;
  const updated = { ...record, status: 'PENDING', attempts: 0, lastError: '', updatedAt: new Date().toISOString() };
  items = items.map((item) => (item.id === id ? updated : item));
  await idbPut(STORES.OUTBOX, updated);
  emit();
  return updated;
}

export async function remove(id) {
  items = items.filter((item) => item.id !== id);
  await idbDelete(STORES.OUTBOX, id);
  emit();
}

export async function clearFailed() {
  const failed = items.filter((item) => item.status === 'FAILED');
  await Promise.all(failed.map((item) => remove(item.id)));
  return failed.length;
}

async function deliver(item) {
  const updated = { ...item, attempts: Number(item.attempts || 0) + 1, updatedAt: new Date().toISOString() };
  try {
    await api.callSync(item.action, item.payload);
    await idbDelete(STORES.OUTBOX, item.id);
    items = items.filter((entry) => entry.id !== item.id);
    emit();
    return { ok: true, item: updated };
  } catch (error) {
    const code = error instanceof ApiError ? error.code : 'SERVER_ERROR';
    updated.lastError = error?.message || apiMessage(code);
    if (code === 'OFFLINE' || code === 'TIMEOUT') {
      updated.status = 'PENDING';
    } else if (TERMINAL_ERROR_CODES.has(code) || Number(updated.attempts) >= 5) {
      updated.status = 'FAILED';
    } else {
      updated.status = 'PENDING';
    }
    items = items.map((entry) => (entry.id === item.id ? updated : entry));
    await idbPut(STORES.OUTBOX, updated);
    emit();
    return { ok: false, item: updated, code };
  }
}

/** Kirim berurutan. Dipanggil saat online, interval, dan tombol manual. */
export async function flush() {
  if (flushing) return flushing;
  await initOutbox();
  flushing = (async () => {
    const results = [];
    for (const item of items.filter((entry) => entry.status === 'PENDING' || entry.status === 'FAILED')) {
      if (typeof navigator !== 'undefined' && navigator.onLine === false) break;
      // FAILED hanya dicoba ulang lewat retry()/tombol ulang; flush mengurus PENDING.
      if (item.status === 'FAILED') continue;
      results.push(await deliver(item));
    }
    return results;
  })().finally(() => { flushing = null; });
  return flushing;
}

export function isFlushing() {
  return Boolean(flushing);
}

export const outbox = { initOutbox, enqueue, flush, retry, remove, clearFailed, getItems, getCounts, subscribe, isFlushing };
export default outbox;
