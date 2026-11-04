// Tiny DOM helpers shared by every screen.

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export function fmtClock(sec) {
  sec = Math.max(0, Math.round(sec));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
}

export function fmtMinutes(sec) {
  const m = Math.round(sec / 60);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  return `${h} h ${m % 60 ? `${m % 60} min` : ''}`.trim();
}

let toastTimer = null;
export function toast(msg, ms = 2600) {
  let t = $('#toast');
  if (!t) {
    t = document.createElement('div');
    t.id = 'toast';
    t.setAttribute('role', 'status');
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), ms);
}

/** Keep the screen awake while the metronome / timer / tuner runs (where supported). */
let wakeLock = null;
let wakeUsers = new Set();
export async function keepAwake(who, on) {
  if (on) wakeUsers.add(who); else wakeUsers.delete(who);
  try {
    if (wakeUsers.size && !wakeLock && 'wakeLock' in navigator) {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', () => { wakeLock = null; });
    } else if (!wakeUsers.size && wakeLock) {
      await wakeLock.release();
      wakeLock = null;
    }
  } catch { /* not allowed (e.g. low battery) — harmless */ }
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && wakeUsers.size) keepAwake([...wakeUsers][0], true);
});

/** Canvas sized for the device pixel ratio. Returns the 2D context in CSS pixels. */
export function fitCanvas(canvas) {
  const dpr = Math.min(window.devicePixelRatio || 1, 3);
  const r = canvas.getBoundingClientRect();
  const w = Math.max(1, Math.round(r.width * dpr));
  const h = Math.max(1, Math.round(r.height * dpr));
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
  const g = canvas.getContext('2d');
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { g, w: r.width, h: r.height };
}

export function cssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

/** Status of things producing sound, for the "now playing" pill. */
const playing = new Map();
export function setPlaying(id, label, stopFn) {
  if (label) playing.set(id, { label, stopFn }); else playing.delete(id);
  window.dispatchEvent(new CustomEvent('pr:playing', { detail: [...playing.entries()] }));
}
export function getPlaying() { return [...playing.entries()]; }

export function icon(name) {
  return `<svg class="ic" aria-hidden="true"><use href="#i-${name}"/></svg>`;
}
