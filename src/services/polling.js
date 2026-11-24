/** Polling ringan `me` + `dashboard.get` hanya saat online & tab terlihat. */

import { config } from '../config.js';
import { api } from './api.js';
import { getSettings } from './session.js';
import { todayJakarta } from '../utils/format.js';

export const ME_EVENT = 'sipiket:me';
export const DASHBOARD_EVENT = 'sipiket:dashboard';

let timer = null;
let inFlight = false;

function isOnline() {
  try { return typeof navigator === 'undefined' || navigator.onLine !== false; } catch { return true; }
}

function isVisible() {
  try { return typeof document === 'undefined' || !document.hidden; } catch { return true; }
}

function emit(name, detail) {
  if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function' && typeof CustomEvent !== 'undefined') {
    window.dispatchEvent(new CustomEvent(name, { detail }));
  }
}

export async function pollOnce() {
  if (inFlight || !isOnline() || !isVisible()) return;
  inFlight = true;
  try {
    const me = await api.call('me', {});
    emit(ME_EVENT, me);
    try {
      const dashboard = await api.call('dashboard.get', { date: todayJakarta() });
      emit(DASHBOARD_EVENT, dashboard);
    } catch {
      // Dashboard operasional bisa ditolak untuk role tanpa jadwal; bukan error fatal.
    }
  } catch {
    // Polling gagal (offline/expired) -> event online/login yang menangani.
  } finally {
    inFlight = false;
  }
}

export function intervalMs() {
  const configured = Number(getSettings()?.pollIntervalMs);
  return Number.isFinite(configured) && configured >= 5000 ? configured : config.pollIntervalMs;
}

export function startPolling() {
  stopPolling();
  if (typeof window === 'undefined') return;
  timer = window.setInterval(pollOnce, intervalMs());
}

export function stopPolling() {
  if (timer && typeof window !== 'undefined') window.clearInterval(timer);
  timer = null;
}

export function isPolling() {
  return Boolean(timer);
}

export const polling = { startPolling, stopPolling, pollOnce, isPolling, intervalMs, ME_EVENT, DASHBOARD_EVENT };
