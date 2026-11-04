import { today } from './session.js';
import { tuner } from './tuner.js';
import { metronome } from './metronome.js';
import { backing } from './backing.js';
import { recorder } from './recorder.js';
import { dbmeter } from './dbmeter.js';
import { health } from './health.js';
import { concerts } from './concerts.js';
import { report } from './report.js';
import { breathe } from './breathe.js';
import { $, $$, esc, icon, toast } from './ui.js';
import { load, save, daysAgoKey } from './store.js';

const more = {
  id: 'more',
  mount(root) {
    root.innerHTML = `
      <header class="view-head"><h1>More</h1></header>
      <nav class="shortcut-grid big">
        <a href="#db">${icon('ear')}<span>Sound level<small>dB meter & hearing dose</small></span></a>
        <a href="#health">${icon('heart')}<span>Health & research<small>Practice science, body, voice, hearing</small></span></a>
        <a href="#concerts">${icon('calendar')}<span>Concerts<small>Upcoming at Chapman</small></span></a>
        <a href="#report">${icon('report')}<span>Teacher report<small>Share your week</small></span></a>
        <a href="#breathe">${icon('heart')}<span>Breathe<small>Calm down before you perform</small></span></a>
      </nav>
      <div class="card about">
        <h2>About</h2>
        <p>Practice Room is a free practice companion for Chapman musicians. Everything — your log, notes and recordings — stays on this device; nothing is uploaded.</p>
        <p><b>Install it:</b> in Safari tap Share → <i>Add to Home Screen</i>; in Chrome tap ⋮ → <i>Install app</i>. It then works offline in practice rooms with bad Wi-Fi.</p>
        <p class="hint">Not an official Chapman University app. Health information is educational, not medical advice.</p>
      </div>
      <div class="card">
        <h2>Demo & data</h2>
        <p class="hint">Fill the log with a made-up week so you can see what the teacher report looks like. Sample entries are marked and can be removed anytime.</p>
        <p class="hint"><b>Back up</b> your log, notes and settings before switching phones or clearing your browser (recordings aren’t included — share the ones you want to keep).</p>
        <div class="chips"><button class="btn small m-export">Export backup</button><label class="btn small m-import">Import backup<input type="file" accept="application/json,.json" hidden></label></div>
        <div class="chips"><button class="btn small m-sample">Add sample week</button><button class="btn small m-unsample">Remove sample week</button><button class="btn small danger m-wipe">Erase all my data</button></div>
      </div>`;
    $('.m-export', root).addEventListener('click', () => {
      const data = {};
      Object.keys(localStorage).filter((k) => k.startsWith('pr.')).forEach((k) => (data[k] = localStorage.getItem(k)));
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([JSON.stringify({ app: 'practice-room', version: 1, exported: new Date().toISOString(), data }, null, 1)], { type: 'application/json' }));
      a.download = `practice-room-backup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    });
    $('.m-import input', root).addEventListener('change', async (e) => {
      const f = e.target.files?.[0];
      if (!f) return;
      try {
        const j = JSON.parse(await f.text());
        if (j.app !== 'practice-room' || typeof j.data !== 'object') throw new Error('not a Practice Room backup');
        if (!confirm('Replace this device’s log, notes and settings with the backup?')) return;
        Object.keys(localStorage).filter((k) => k.startsWith('pr.')).forEach((k) => localStorage.removeItem(k));
        Object.entries(j.data).forEach(([k, v]) => { if (k.startsWith('pr.') && typeof v === 'string') localStorage.setItem(k, v); });
        location.reload();
      } catch (err) { toast(`Couldn’t import: ${err.message}`); }
    });
    $('.m-sample', root).addEventListener('click', () => { addSampleWeek(); toast('Sample week added — open Teacher report'); });
    $('.m-unsample', root).addEventListener('click', () => { save('log', load('log', []).filter((e) => !e.sample)); window.dispatchEvent(new CustomEvent('pr:log')); toast('Sample entries removed'); });
    $('.m-wipe', root).addEventListener('click', async () => {
      if (!confirm('Erase your practice log, notes, settings and all recordings on this device? This cannot be undone.')) return;
      Object.keys(localStorage).filter((k) => k.startsWith('pr.')).forEach((k) => localStorage.removeItem(k));
      try { indexedDB.deleteDatabase('practice-room'); } catch {}
      location.reload();
    });
  },
  show() {}, hide() {},
};

function addSampleWeek() {
  const log = load('log', []);
  const plan = [
    [['Long tones', 'warmup', 8], ['Scales: 3 octaves, B♭ & G minor', 'building', 15], ['Etude No. 4, mm. 9–24 slow', 'building', 12], ['Sonata mvt. I phrasing', 'interpreting', 18]],
    [['Warm-up', 'warmup', 6], ['Shifting exercises', 'building', 14], ['Sonata mvt. I phrasing', 'interpreting', 15], ['Run-through, no stopping', 'performing', 8]],
    null,
    [['Long tones', 'warmup', 10], ['Scales & arpeggios', 'building', 20], ['Hard spots, slow → tempo', 'building', 15], ['Sonata mvt. II', 'interpreting', 20], ['Mock jury run', 'performing', 10]],
    [['Warm-up', 'warmup', 5], ['Etude No. 4 full', 'building', 15], ['Orchestra excerpts', 'interpreting', 15]],
    [['Long tones', 'warmup', 8], ['Scales', 'building', 12], ['Sonata mvt. I + II', 'interpreting', 25], ['Record & listen back', 'other', 10], ['Run-through', 'performing', 9]],
    [['Warm-up', 'warmup', 6], ['Sight-reading', 'other', 10], ['Sonata mvt. I', 'interpreting', 14]],
  ];
  plan.forEach((day, i) => {
    if (!day) return;
    const date = daysAgoKey(6 - i);
    const d = new Date(date + 'T18:00');
    day.forEach(([label, category, min], k) => {
      log.push({ id: `s${i}${k}${Date.now()}`, sample: true, date, at: d.toISOString(), kind: 'segment', label, category, seconds: min * 60 });
    });
    if (i % 2 === 0) log.push({ id: `sb${i}`, sample: true, date, at: d.toISOString(), kind: 'segment', label: 'Break', category: 'break', seconds: 240 });
    if (i === 1 || i === 3 || i === 5) log.push({ id: `sm${i}`, sample: true, date, at: d.toISOString(), kind: 'metronome', label: `Speed trainer @ ${72 + i * 4}→${88 + i * 4} BPM`, seconds: 420 });
    if (i === 3 || i === 5) log.push({ id: `sr${i}`, sample: true, date, at: d.toISOString(), kind: 'recording', label: `Recorded “Sonata mvt. I take ${i}”`, seconds: 300 });
    if (i === 4) log.push({ id: 'sj', sample: true, date, at: d.toISOString(), kind: 'jam', label: 'Backing track: Jazz Swing, 120 BPM', seconds: 600, detail: { text: 'ii7 V7 Imaj7 Imaj7', key: 'B♭' } });
    const refl = {
      0: { goal: 'Etude mm. 9–24 clean at ♩=72', met: 'partly', focus: 4, pain: 'none', areas: [], next: 'Same passage at ♩=72, then 76' },
      3: { goal: 'Shifts in mm. 32–40 in tune, 3× in a row', met: 'yes', focus: 5, pain: 'mild', areas: ['neck'], next: 'Run mvt. II with the drone on D' },
      5: { goal: 'Full run of mvt. I without stopping', met: 'yes', focus: 4, pain: 'none', areas: [], next: 'Listen back for rhythm in the development' },
      6: { goal: 'Memorize first page of mvt. I', met: 'no', focus: 3, pain: 'none', areas: [], next: 'Mental practice away from the violin, then check' },
    }[i];
    if (refl) log.push({ id: `sf${i}`, sample: true, date, at: d.toISOString(), kind: 'reflection', label: 'Reflection', seconds: 0, detail: refl });
    if (i === 4) ['Etude No. 4', 'Excerpt: Don Juan', 'Sonata mm. 32–40'].forEach((label, k) => log.push({ id: `so${k}`, sample: true, date, at: d.toISOString(), kind: 'segment', mode: 'rotate', label, category: 'building', seconds: 360 }));
  });
  save('log', log);
  window.dispatchEvent(new CustomEvent('pr:log'));
}

const VIEWS = { today, tuner, beats: metronome, jam: backing, record: recorder, db: dbmeter, health, concerts, report, breathe, more };
const NAV_OF = { db: 'more', health: 'more', concerts: 'more', report: 'more', breathe: 'more' };
const mounted = new Set();
let current = null;

function route() {
  const id = (location.hash.slice(1) || 'today').split('?')[0];
  const key = VIEWS[id] ? id : 'today';
  if (current === key) return;
  if (current) {
    VIEWS[current].hide?.();
    $(`#v-${current}`).hidden = true;
  }
  let sec = $(`#v-${key}`);
  if (!sec) {
    sec = document.createElement('section');
    sec.id = `v-${key}`;
    sec.className = 'view';
    $('#views').appendChild(sec);
  }
  if (!mounted.has(key)) {
    VIEWS[key].mount(sec);
    mounted.add(key);
  }
  sec.hidden = false;
  VIEWS[key].show?.();
  current = key;
  const navKey = NAV_OF[key] || key;
  $$('.tabbar a').forEach((a) => a.setAttribute('aria-current', a.dataset.nav === navKey ? 'page' : 'false'));
  window.scrollTo(0, 0);
  document.title = key === 'today' ? 'Practice Room' : `${sec.querySelector('h1')?.textContent || ''} · Practice Room`;
}

// "Now playing" pill: metronome / drone / backing track keep going while you switch screens
window.addEventListener('pr:playing', (e) => {
  const pill = $('#now-playing');
  const items = e.detail;
  pill.hidden = !items.length;
  pill.innerHTML = items.map(([id, { label }]) => `<span><i class="eq"></i>${esc(label)}<button data-stop="${id}" aria-label="Stop ${esc(label)}">■</button></span>`).join('');
  $$('[data-stop]', pill).forEach((b) => b.addEventListener('click', () => {
    const it = items.find(([id]) => id === b.dataset.stop);
    it?.[1].stopFn?.();
  }));
});

window.addEventListener('hashchange', route);
route();

// Offline support
if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
