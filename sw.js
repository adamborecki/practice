// Offline support: network-first (so updates show up right away), falling back to cache
// when the practice room has no Wi-Fi.
const CACHE = 'practice-room-v3';
const CORE = [
  './', 'index.html', 'css/app.css', 'manifest.webmanifest', 'icons/icon.svg', 'icons/icon-192.png',
  'js/app.js', 'js/audio.js', 'js/ui.js', 'js/store.js', 'js/pitch.js', 'js/tuner.js', 'js/drums.js',
  'js/metronome.js', 'js/synth.js', 'js/chords.js', 'js/backing.js', 'js/recorder.js', 'js/aweight.js',
  'js/dbmeter.js', 'js/breathe.js', 'js/nav.js', 'js/quotes.js', 'js/session.js', 'js/health.js', 'js/concerts.js', 'js/report.js',
  'data/concerts.json',
];
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(CORE)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  e.respondWith(
    fetch(req).then((res) => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
      return res;
    }).catch(() => caches.match(req, { ignoreSearch: true }).then((r) => r || caches.match('index.html')))
  );
});
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: 'window' }).then((cs) => (cs[0] ? cs[0].focus() : self.clients.openWindow('./#today'))));
});
