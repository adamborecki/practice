// Persistence: small settings/logs in localStorage, audio recordings in IndexedDB.
// Everything stays on the student's phone — nothing is uploaded anywhere.

const PREFIX = 'pr.';

export function load(key, fallback) {
  try {
    const v = localStorage.getItem(PREFIX + key);
    return v == null ? fallback : JSON.parse(v);
  } catch {
    return fallback;
  }
}
export function save(key, value) {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch { /* private mode / quota: app still works for this visit */ }
}

export const todayKey = (d = new Date()) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

/** Calendar day `n` days ago (DST-safe: uses calendar math, not 24h multiples). */
export const daysAgoKey = (n, from = new Date()) => todayKey(new Date(from.getFullYear(), from.getMonth(), from.getDate() - n, 12));

// ---------------- Practice log ----------------
// Each entry: { id, date:'YYYY-MM-DD', at: ISO, kind, label, category, seconds, detail }
// kind: 'segment' (timed practice block) | 'metronome' | 'tuner' | 'jam' | 'recording' | 'note'
export function getLog() {
  return load('log', []);
}
export function addLog(entry) {
  const log = getLog();
  const e = { id: Date.now() + Math.random().toString(36).slice(2, 6), date: todayKey(), at: new Date().toISOString(), ...entry };
  log.push(e);
  // keep ~1 year of entries
  if (log.length > 5000) log.splice(0, log.length - 5000);
  save('log', log);
  window.dispatchEvent(new CustomEvent('pr:log'));
  return e;
}
export function removeLog(id) {
  save('log', getLog().filter((e) => e.id !== id));
  window.dispatchEvent(new CustomEvent('pr:log'));
}

// Daily notes / reflections: { 'YYYY-MM-DD': 'text' }
export function getNotes() { return load('notes', {}); }
export function setNote(date, text) {
  const n = getNotes();
  if (text && text.trim()) n[date] = text; else delete n[date];
  save('notes', n);
}

// ---------------- Recordings (IndexedDB) ----------------
const DB_NAME = 'practice-room';
let dbp = null;
function db() {
  if (!dbp) {
    dbp = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        const d = req.result;
        if (!d.objectStoreNames.contains('recordings')) d.createObjectStore('recordings', { keyPath: 'id' });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbp;
}
function tx(mode, fn) {
  return db().then((d) => new Promise((resolve, reject) => {
    const t = d.transaction('recordings', mode);
    const store = t.objectStore('recordings');
    const r = fn(store);
    t.oncomplete = () => resolve(r && 'result' in r ? r.result : undefined);
    t.onerror = () => reject(t.error);
  }));
}
export const recordings = {
  all: () => tx('readonly', (s) => s.getAll()).then((list) => (list || []).sort((a, b) => b.created - a.created)),
  put: (rec) => tx('readwrite', (s) => s.put(rec)),
  remove: (id) => tx('readwrite', (s) => s.delete(id)),
};
