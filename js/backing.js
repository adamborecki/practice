// Backing-track generator: any chord progression × a dozen styles, all synthesized live.
import { getCtx, getMaster, getNoise, createTicker, LOOKAHEAD } from './audio.js';
import { VOICES, GROOVES, stepVel } from './drums.js';
import { INSTRUMENTS } from './synth.js';
import { parseProgression, KEY_NAMES } from './chords.js';
import { load, save, addLog } from './store.js';
import { $, $$, esc, keepAwake, setPlaying, icon, toast } from './ui.js';

// Pattern strings: X/x = hit (accent/normal), '-' = hold previous, '.' = rest.
// Bass symbols: R root, 3 third, 5 fifth (below), 7 seventh, 8 octave, F root/fifth alternating by bar, W walking line.
export const STYLES = {
  pop: { name: 'Pop', emoji: '💿', groove: 'pop', bpm: 100,
    bass: { inst: 'ebass', pat: 'R-.R..R-R-.R5-8-' },
    comp: [{ inst: 'piano', voicing: 'close', pat: 'X--.x--.X--.x-x.' }, { inst: 'pad', voicing: 'close', pat: 'X---------------', vel: 0.6 }] },
  rock: { name: 'Rock', emoji: '🎸', groove: 'rock', bpm: 120,
    bass: { inst: 'ebass', pat: 'R-R-R-R-R-R-R-R-' },
    comp: [{ inst: 'power', voicing: 'power', pat: 'X-x-x-x-X-x-x-x-', strum: 0.006 }] },
  funk: { name: 'Funk', emoji: '🕺', groove: 'funk', bpm: 100,
    bass: { inst: 'ebass', pat: 'R..8..R.5..R7.8.' },
    comp: [{ inst: 'clav', voicing: 'triadHigh', pat: '.x.x..x..x.x..x.' }] },
  swing: { name: 'Jazz Swing', emoji: '🎷', groove: 'swing', bpm: 140,
    bass: { inst: 'upright', pat: 'W' },
    comp: [{ inst: 'piano', voicing: 'shell', pat: 'X-...x......' }] },
  bossa: { name: 'Bossa Nova', emoji: '🏖️', groove: 'bossa', bpm: 130,
    bass: { inst: 'upright', pat: 'R-----5-R-----5-' },
    comp: [{ inst: 'pluck', voicing: 'close', pat: 'X-.X-.X-..X-.X-.', strum: 0.012 }] },
  ballad: { name: 'Piano Ballad', emoji: '🕯️', groove: 'ballad', bpm: 70,
    bass: { inst: 'ebass', pat: 'R-------5-------', vel: 0.8 },
    comp: [{ inst: 'piano', voicing: 'spread', arp: [0, 1, 2, 3, 2, 1, 2, 1], every: 2 }] },
  reggae: { name: 'Reggae', emoji: '🇯🇲', groove: 'reggae', bpm: 76,
    bass: { inst: 'ebass', pat: 'R--.R-5...8-5-3.' },
    comp: [{ inst: 'chop', voicing: 'triadHigh', pat: '....X.......X...' }, { inst: 'organ', voicing: 'close', pat: '..x...x...x...x.', vel: 0.6 }] },
  house: { name: 'House', emoji: '🪩', groove: 'house', bpm: 124,
    bass: { inst: 'synthbass', pat: '..R-..R-..R-..R-' },
    comp: [{ inst: 'stab', voicing: 'close', pat: 'X..X..X...X..X..', vel: 0.8 }, { inst: 'pad', voicing: 'close', pat: 'X---------------', vel: 0.5 }] },
  lofi: { name: 'Lo-fi Hip-Hop', emoji: '☕', groove: 'lofi', bpm: 78, crackle: true,
    bass: { inst: 'upright', pat: 'R-----5.R---..3-' },
    comp: [{ inst: 'epiano', voicing: 'shell9', pat: 'X-------..x-----' }] },
  trap: { name: 'Trap', emoji: '🔥', groove: 'trap', bpm: 140,
    bass: { inst: 'sub808', pat: 'R------R..R-----' },
    comp: [{ inst: 'pad', voicing: 'close', pat: 'X---------------', vel: 0.6 }, { inst: 'pluck', voicing: 'shell9', arp: [0, 2, 1, 3], every: 2, vel: 0.5 }] },
  waltz: { name: 'Waltz (3/4)', emoji: '💃', groove: 'waltz', bpm: 150,
    bass: { inst: 'ebass', pat: 'R---........' },
    comp: [{ inst: 'piano', voicing: 'close', pat: '....x-..x-..' }] },
  ranchera: { name: 'Ranchera (3/4)', emoji: '🎺', groove: 'ranchera', bpm: 180,
    bass: { inst: 'upright', pat: 'F---........' },
    comp: [{ inst: 'strum', voicing: 'triadHigh', pat: '....X-..X-..', strum: 0.012 }] },
};

export const PRESETS = [
  { name: 'Pop I–V–vi–IV', text: 'I V vi IV' },
  { name: '50s doo-wop', text: 'I vi IV V' },
  { name: 'Jazz ii–V–I', text: 'ii7 V7 Imaj7 Imaj7' },
  { name: '12-bar blues', text: 'I7 IV7 I7 I7\nIV7 IV7 I7 I7\nV7 IV7 I7 V7' },
  { name: 'Minor blues', text: 'i7 i7 i7 i7\niv7 iv7 i7 i7\nbVI7 V7 i7 V7' },
  { name: 'Pachelbel', text: 'I V vi iii IV I IV V' },
  { name: 'Andalusian', text: 'i bVII bVI V' },
  { name: 'Rhythm changes (A)', text: '| I vi | ii V | I vi | ii V | I I7 | IV iv | I V | I |' },
  { name: 'Autumn-style ii–Vs', text: 'ii7 V7 Imaj7 IVmaj7 viiø7 III7 vi vi' },
  { name: 'Royal Road', text: 'IVmaj7 V7 iii7 vi' },
  { name: 'Mariachi I–V7', text: 'I I V7 V7 V7 V7 I I' },
  { name: 'Dorian vamp', text: 'ii7 V7' },
];

const S = load('jam', { text: 'I V vi IV', key: 0, transpose: 0, style: 'pop', bpm: 100, countIn: true, mix: { drums: 0.8, bass: 0.85, chords: 0.75 }, mute: {} });

let el, buses = null, playing = false, barIdx = 0, nextBarTime = 0, prog = { bars: [] }, prevVoicing = {}, lastBass = null, startedAt = 0, barCount = 0;
const vis = [];
let raf = 0;
const ticker = createTicker(tick);

export const backing = {
  id: 'jam',
  mount(root) {
    el = root;
    root.innerHTML = `
      <header class="view-head"><h1>Jam</h1><p class="sub">Backing tracks for any chord progression, in any key and style.</p></header>
      <div class="card jam-now">
        <div class="chart" aria-live="off"></div>
        <div class="jam-transport">
          <button class="btn round" data-jbpm="-4" aria-label="Slower">−</button>
          <div class="metro-bpm small"><output class="jb-num">${S.bpm}</output><span class="mb-unit">BPM</span></div>
          <button class="btn round" data-jbpm="4" aria-label="Faster">+</button>
          <button class="btn primary big jam-play">${icon('play')}<span>Play</span></button>
        </div>
        <input type="range" class="jb-slider" min="40" max="240" value="${S.bpm}" aria-label="Tempo">
      </div>

      <div class="card">
        <h2>Chords</h2>
        <textarea class="jam-text" rows="3" spellcheck="false" autocapitalize="off" autocomplete="off" aria-label="Chord progression">${esc(S.text)}</textarea>
        <p class="jam-err err" hidden></p>
        <div class="row2">
          <label class="field"><span>Key (for I–IV–V / 1–4–5)</span>
            <select class="jam-key">${KEY_NAMES.map((k, i) => `<option value="${i}" ${i === S.key ? 'selected' : ''}>${k}</option>`).join('')}</select></label>
          <label class="field"><span>Transpose</span>
            <div class="stepper"><button class="btn icon-btn" data-tr="-1" aria-label="Down a half step">−</button><output class="jam-tr"></output><button class="btn icon-btn" data-tr="1" aria-label="Up a half step">+</button></div></label>
        </div>
        <div class="chips jam-presets">${PRESETS.map((p, i) => `<button class="chip" data-preset="${i}">${p.name}</button>`).join('')}</div>
        <details class="why"><summary>How to type chords</summary>
          <p>Letters: <code>Dm7 G7 Cmaj7</code>, <code>F#m7b5</code>, <code>Bb/D</code>, <code>E7#9</code>. Roman numerals: <code>ii7 V7 I</code>, <code>i bVII bVI V</code>, <code>V7/V</code>. Nashville numbers: <code>1 5 6m 4</code>.</p>
          <p>Each chord is one bar. Use <code>|</code> for bar lines to put two chords in a bar: <code>| C Am | F G |</code>. <code>%</code> repeats the previous bar.</p>
        </details>
      </div>

      <div class="card">
        <h2>Style</h2>
        <div class="groove-grid">${Object.entries(STYLES).map(([k, s]) => `<button class="groove ${k === S.style ? 'on' : ''}" data-style="${k}"><span class="ge">${s.emoji}</span><span>${s.name}</span></button>`).join('')}</div>
      </div>

      <div class="card">
        <h2>Mixer</h2>
        <p class="hint">Mute the part you play — bassists, drop the bass; pianists, drop the chords.</p>
        ${['drums', 'bass', 'chords'].map((p) => `
          <div class="mix-row">
            <button class="chip mute ${S.mute[p] ? '' : 'on'}" data-mute="${p}">${p[0].toUpperCase() + p.slice(1)}</button>
            <input type="range" min="0" max="1" step="0.01" value="${S.mix[p]}" data-mix="${p}" aria-label="${p} volume">
          </div>`).join('')}
        <label class="switch"><input type="checkbox" class="jam-count" ${S.countIn ? 'checked' : ''}><span>One-bar count-in</span></label>
      </div>`;

    $('.jam-play', root).addEventListener('click', () => (playing ? stop() : start()));
    $$('[data-jbpm]', root).forEach((b) => b.addEventListener('click', () => setBpm(S.bpm + Number(b.dataset.jbpm))));
    $('.jb-slider', root).addEventListener('input', (e) => setBpm(Number(e.target.value)));
    $('.jam-text', root).addEventListener('input', (e) => { S.text = e.target.value; persist(); reparse(); });
    $('.jam-key', root).addEventListener('change', (e) => { S.key = Number(e.target.value); persist(); reparse(); });
    $$('[data-tr]', root).forEach((b) => b.addEventListener('click', () => { S.transpose = Math.max(-11, Math.min(11, S.transpose + Number(b.dataset.tr))); persist(); reparse(); }));
    $$('[data-preset]', root).forEach((b) => b.addEventListener('click', () => {
      const p = PRESETS[Number(b.dataset.preset)];
      S.text = p.text;
      $('.jam-text', root).value = p.text;
      persist(); reparse();
    }));
    $$('[data-style]', root).forEach((b) => b.addEventListener('click', () => {
      S.style = b.dataset.style;
      $$('[data-style]', root).forEach((x) => x.classList.toggle('on', x === b));
      setBpm(STYLES[S.style].bpm);
      persist();
      if (playing) updatePlayingLabel();
    }));
    $$('[data-mix]', root).forEach((r) => r.addEventListener('input', () => { S.mix[r.dataset.mix] = Number(r.value); persist(); applyMix(); }));
    $$('[data-mute]', root).forEach((b) => b.addEventListener('click', () => {
      const p = b.dataset.mute;
      S.mute[p] = !S.mute[p];
      b.classList.toggle('on', !S.mute[p]);
      persist(); applyMix();
    }));
    $('.jam-count', root).addEventListener('change', (e) => { S.countIn = e.target.checked; persist(); });
    reparse();
  },
  show() {},
  hide() {},
};

function persist() { save('jam', S); }

function setBpm(b) {
  S.bpm = Math.max(40, Math.min(240, Math.round(b)));
  $('.jb-num', el).textContent = S.bpm;
  $('.jb-slider', el).value = S.bpm;
  persist();
  if (playing) updatePlayingLabel();
}

function reparse() {
  prog = parseProgression(S.text, S.key, S.transpose);
  const err = $('.jam-err', el);
  if (prog.errors.length) {
    err.textContent = `Didn’t understand: ${prog.errors.join(', ')}`;
    err.hidden = false;
  } else err.hidden = true;
  const keyNow = (S.key + S.transpose + 12) % 12;
  $('.jam-tr', el).textContent = S.transpose ? `${S.transpose > 0 ? '+' : ''}${S.transpose} → ${KEY_NAMES[keyNow]}` : '0';
  drawChart();
  if (barIdx >= prog.bars.length) barIdx = 0;
}

function drawChart(cur = -1) {
  const box = $('.chart', el);
  if (!prog.bars.length) { box.innerHTML = '<p class="empty">Type some chords below ↓</p>'; return; }
  box.innerHTML = prog.bars.map((b, i) => `<div class="bar ${i === cur ? 'cur' : ''}" data-bar="${i}">${b.map((c) => `<span>${esc(c.symbol.replace(/b/g, '♭').replace(/#/g, '♯'))}</span>`).join('')}</div>`).join('');
}

function highlight(i) {
  $$('.chart .bar', el).forEach((b) => b.classList.toggle('cur', Number(b.dataset.bar) === i));
  const cur = $(`.chart .bar[data-bar="${i}"]`, el);
  cur?.scrollIntoView?.({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
}

// ---------------- audio graph ----------------
function makeBuses() {
  const c = getCtx();
  const mk = () => { const g = c.createGain(); g.connect(getMaster()); return g; };
  buses = { drums: mk(), bass: mk(), chords: mk() };
  applyMix();
}
function applyMix() {
  if (!buses) return;
  const t = getCtx().currentTime;
  for (const p of ['drums', 'bass', 'chords']) buses[p].gain.setTargetAtTime(S.mute[p] ? 0 : S.mix[p], t, 0.02);
}

function updatePlayingLabel() {
  setPlaying('jam', `${STYLES[S.style].name} · ${S.bpm} BPM`, stop);
}

function start() {
  if (!prog.bars.length) { toast('Type a chord progression first'); return; }
  const c = getCtx();
  makeBuses();
  playing = true;
  barIdx = 0;
  barCount = 0;
  prevVoicing = {};
  lastBass = null;
  nextBarTime = c.currentTime + 0.1;
  startedAt = Date.now();
  if (S.countIn) {
    const style = STYLES[S.style];
    const g = GROOVES[style.groove];
    const beatDur = 60 / S.bpm;
    for (let i = 0; i < g.beats; i++) {
      VOICES.wood(nextBarTime + i * beatDur, buses.drums, 0.9, i === 0);
      vis.push({ t: nextBarTime + i * beatDur, count: g.beats - i });
    }
    nextBarTime += g.beats * beatDur;
  }
  ticker.start();
  raf = requestAnimationFrame(drawVis);
  keepAwake('jam', true);
  const b = $('.jam-play', el);
  b.classList.add('active');
  b.innerHTML = `${icon('stop')}<span>Stop</span>`;
  updatePlayingLabel();
}

function stop() {
  if (!playing) return;
  playing = false;
  ticker.stop();
  cancelAnimationFrame(raf);
  vis.length = 0;
  // fade out and drop everything already scheduled
  const c = getCtx();
  const old = buses;
  for (const g of Object.values(old)) { g.gain.cancelScheduledValues(c.currentTime); g.gain.setTargetAtTime(0, c.currentTime, 0.03); }
  setTimeout(() => Object.values(old).forEach((g) => g.disconnect()), 400);
  buses = null;
  keepAwake('jam', false);
  const b = $('.jam-play', el);
  b.classList.remove('active');
  b.innerHTML = `${icon('play')}<span>Play</span>`;
  drawChart();
  $('.jam-now', el).dataset.count = '';
  setPlaying('jam', null);
  const secs = Math.round((Date.now() - startedAt) / 1000);
  if (secs >= 30) {
    const keyNow = KEY_NAMES[(S.key + S.transpose + 12) % 12];
    addLog({ kind: 'jam', label: `Backing track: ${STYLES[S.style].name}, ${S.bpm} BPM`, seconds: secs, detail: { style: S.style, text: S.text, key: keyNow } });
  }
}

function tick() {
  if (!playing) return;
  const c = getCtx();
  while (nextBarTime < c.currentTime + LOOKAHEAD + 0.05) {
    if (!prog.bars.length) return;
    if (barIdx >= prog.bars.length) barIdx = 0;
    const dur = scheduleBar(barIdx, nextBarTime);
    vis.push({ t: nextBarTime, bar: barIdx });
    nextBarTime += dur;
    barIdx = (barIdx + 1) % prog.bars.length;
    barCount++;
  }
}

function drawVis() {
  if (!playing) return;
  raf = requestAnimationFrame(drawVis);
  const now = getCtx().currentTime;
  let latest = null;
  while (vis.length && vis[0].t <= now) latest = vis.shift();
  if (!latest) return;
  const card = $('.jam-now', el);
  if (latest.count) card.dataset.count = latest.count;
  else { card.dataset.count = ''; highlight(latest.bar); }
}

// ---------------- arranging ----------------
const pcsOf = (ch) => ch.intervals.map((i) => (ch.root + i) % 12);
const has = (ch, iv) => ch.intervals.includes(iv);

function voicingPcs(ch, type) {
  const iv = ch.intervals;
  const third = iv.find((i) => i >= 2 && i <= 5);
  const seventh = iv.find((i) => i === 9 || i === 10 || i === 11) ?? (has(ch, 9) ? 9 : undefined);
  const fifth = iv.find((i) => i >= 6 && i <= 8);
  const exts = iv.filter((i) => i > 11);
  const pick = (list) => list.filter((x) => x !== undefined).map((i) => (ch.root + i) % 12);
  switch (type) {
    case 'power': return pick([0, fifth ?? 7, 12]);
    case 'triadHigh': return pick([0, third, fifth]);
    case 'shell': return pick([third, seventh ?? fifth, exts[0] ?? (seventh != null ? fifth : 0)]);
    case 'shell9': return pick([third, seventh ?? fifth, exts[0] ?? 14, fifth ?? 7]);
    default: {
      let l = [0, third, fifth, seventh, ...exts.slice(0, 1)].filter((x) => x !== undefined);
      if (l.length > 4) l = l.filter((i) => i !== fifth);
      return pick(l);
    }
  }
}

const RANGES = { close: [53, 74], triadHigh: [60, 79], shell: [50, 70], shell9: [52, 72], power: [40, 60], spread: [40, 76] };

function voice(ch, type, key) {
  if (type === 'spread') {
    // open piano voicing for arpeggios: root, fifth, octave(or 7th), tenth
    let r = 36 + ch.root; if (r < 40) r += 12;
    const third = ch.intervals.find((i) => i >= 2 && i <= 5) ?? 4;
    const fifth = ch.intervals.find((i) => i >= 6 && i <= 8) ?? 7;
    const sev = ch.intervals.find((i) => i >= 9 && i <= 11);
    return [r, r + fifth, r + (sev ?? 12), r + 12 + third];
  }
  if (type === 'power') {
    let r = 40 + ((ch.root - 4 + 12) % 12);
    return [r, r + 7, r + 12];
  }
  const pcs = voicingPcs(ch, type);
  const [lo, hi] = RANGES[type] || RANGES.close;
  const prev = prevVoicing[key];
  let best = null, bestScore = Infinity;
  for (let rot = 0; rot < pcs.length; rot++) {
    const order = pcs.slice(rot).concat(pcs.slice(0, rot));
    for (let base = lo - 12; base <= hi; base++) {
      if ((base % 12 + 12) % 12 !== order[0]) continue;
      const notes = [base];
      for (let i = 1; i < order.length; i++) {
        let n = notes[i - 1] + 1;
        while ((n % 12 + 12) % 12 !== order[i]) n++;
        notes.push(n);
      }
      if (notes[0] < lo || notes[notes.length - 1] > hi) continue;
      const center = (lo + hi) / 2;
      let score;
      if (prev) {
        score = notes.reduce((s, n, i) => s + Math.abs(n - (prev[Math.min(i, prev.length - 1)])), 0);
        score += Math.abs(notes[0] - prev[0]) * 0.5;
      } else {
        score = Math.abs(notes.reduce((a, b) => a + b, 0) / notes.length - center);
      }
      if (score < bestScore) { bestScore = score; best = notes; }
    }
  }
  if (!best) best = pcs.map((p) => 60 + p);
  prevVoicing[key] = best;
  return best;
}

function bassNote(ch, sym, barNo) {
  const rootM = 36 + ((ch.bass - 0 + 12) % 12); // C2..B2
  const near = (pc, ref = rootM) => {
    let n = 36 + ((pc + 12) % 12);
    while (n - ref > 6) n -= 12;
    while (ref - n > 6) n += 12;
    return Math.max(31, Math.min(52, n));
  };
  const third = ch.intervals.find((i) => i >= 2 && i <= 5) ?? 4;
  const fifth = ch.intervals.find((i) => i >= 6 && i <= 8) ?? 7;
  const sev = ch.intervals.find((i) => i >= 9 && i <= 11) ?? 10;
  const base = rootM > 43 ? rootM - 12 : rootM;
  switch (sym) {
    case 'R': return base;
    case '3': return base + third;
    case '5': return base + fifth - (base + fifth > 47 ? 12 : 0);
    case '7': return base + sev - (base + sev > 50 ? 12 : 0);
    case '8': return base + 12;
    case 'F': return barNo % 2 === 0 ? base : base + fifth - 12 < 31 ? base + fifth : base + fifth - 12;
    default: return near(ch.root);
  }
}

/** Walking bass: four quarter notes per bar, chord tones leading into the next chord by step. */
function walkingLine(chordsPerBeat, nextRoot) {
  const notes = [];
  let prev = lastBass ?? 40;
  for (let b = 0; b < chordsPerBeat.length; b++) {
    const ch = chordsPerBeat[b];
    const startOfChord = b === 0 || chordsPerBeat[b - 1] !== ch;
    const nextCh = chordsPerBeat[b + 1];
    const lastBeatOfChord = !nextCh || nextCh !== ch;
    const target = nextCh && nextCh !== ch ? nextCh.root : nextRoot;
    let n;
    if (startOfChord) {
      n = closest(ch.bass, prev);
    } else if (lastBeatOfChord && target != null) {
      const t = closest(target, prev);
      if (Math.random() < 0.3) {
        // approach from the current chord tone nearest the target
        const tones = pcsOf(ch).map((p) => closest(p, t)).filter((m) => m !== t && m !== prev);
        n = tones.sort((a, c) => Math.abs(a - t) - Math.abs(c - t))[0] ?? t - 1;
      } else {
        n = t + (Math.random() < 0.7 ? (t > prev ? -1 : 1) : (t > prev ? 1 : -1)); // chromatic approach
        if (n === prev) n = t + (n > t ? -1 : 1);
      }
    } else {
      const tones = pcsOf(ch).filter((p) => p !== ch.root);
      const cands = tones.map((p) => closest(p, prev)).filter((m) => m !== prev);
      n = cands.sort(() => Math.random() - 0.5).sort((a, c) => Math.abs(a - prev) - Math.abs(c - prev))[Math.random() < 0.6 ? 0 : 1] ?? prev + 2;
    }
    n = clampBass(n);
    notes.push(n);
    prev = n;
  }
  lastBass = prev;
  return notes;
}
const closest = (pc, ref) => { let n = ref - (((ref - pc) % 12) + 12) % 12; if (ref - n > 6) n += 12; return clampBass(n); };
const clampBass = (n) => { while (n < 31) n += 12; while (n > 52) n -= 12; return n; };

/** Expand a pattern into note events [{step, len, vel, sym}] honoring holds and chord boundaries. */
function hits(pat, steps, boundaries) {
  const isOnset = (ch) => ch === 'X' || ch === 'x' || /[R3578F]/.test(ch);
  const bounds = [...boundaries].sort((a, b) => a - b);
  const out = [];
  for (let s = 0; s < steps; s++) {
    const ch = pat[s % pat.length];
    let forced = false;
    if (!isOnset(ch) && s !== 0 && boundaries.has(s)) {
      // chord changes here: re-strike if the old chord is still ringing, or if the
      // pattern has no hit at all before the next chord change (so no chord goes unplayed)
      const next = bounds.find((b) => b > s) ?? steps;
      let hasOnset = false;
      for (let k = s; k < next; k++) if (isOnset(pat[k % pat.length])) { hasOnset = true; break; }
      forced = ch === '-' || !hasOnset;
    }
    if (isOnset(ch) || forced) {
      let len = 1;
      while (s + len < steps && pat[(s + len) % pat.length] === '-' && !boundaries.has(s + len)) len++;
      if (forced && ch === '.') {
        while (s + len < steps && !isOnset(pat[(s + len) % pat.length]) && !boundaries.has(s + len) && len < 4) len++;
      }
      out.push({ step: s, len, vel: ch === 'X' ? 1 : ch === 'x' ? 0.75 : forced ? 0.7 : 0.9, sym: /[R3578F]/.test(ch) ? ch : 'R' });
    }
  }
  return out;
}

function scheduleBar(i, t0) {
  const style = STYLES[S.style];
  const groove = GROOVES[style.groove];
  const steps = groove.steps;
  const beats = groove.beats;
  const barDur = beats * 60 / S.bpm;
  const stepDur = barDur / steps;
  const chords = prog.bars[i];
  const per = steps / chords.length;
  const chordAt = (s) => chords[Math.min(chords.length - 1, Math.floor(s / per))];
  const boundaries = new Set(chords.map((_, k) => Math.round(k * per)));
  const timeOf = (s) => t0 + s * stepDur + (groove.swing && s % 2 === 1 ? groove.swing * stepDur : 0);
  const nextBar = prog.bars[(i + 1) % prog.bars.length];

  // drums
  for (const [v, pat] of Object.entries(groove.tracks)) {
    if (v === 'sub') continue;
    for (let s = 0; s < steps; s++) {
      const ch = pat[s];
      const vel = stepVel(ch);
      if (!vel) continue;
      VOICES[v](timeOf(s), buses.drums, vel);
      if (ch === 'r') VOICES[v](timeOf(s) + stepDur / 2, buses.drums, vel * 0.8);
    }
  }
  // fill on the last bar of the loop: a little snare pickup
  if (i === prog.bars.length - 1 && prog.bars.length >= 4 && !['ballad', 'waltz', 'ranchera', 'swing'].includes(S.style)) {
    [steps - 3, steps - 2, steps - 1].forEach((s, k) => VOICES.snare(timeOf(s), buses.drums, 0.4 + k * 0.2));
  }
  if (style.crackle) {
    for (let k = 0; k < 6; k++) crackle(t0 + Math.random() * barDur);
  }

  // bass
  const bi = INSTRUMENTS[style.bass.inst];
  const bvel = style.bass.vel ?? 1;
  if (style.bass.pat === 'W') {
    const perBeat = Array.from({ length: beats }, (_, b) => chordAt(b * (steps / beats)));
    const line = walkingLine(perBeat, nextBar[0].bass);
    line.forEach((m, b) => bi(m, timeOf(b * (steps / beats)), (60 / S.bpm) * 0.92, b === 0 ? 0.95 : 0.8 * bvel, buses.bass));
  } else {
    for (const h of hits(style.bass.pat, steps, boundaries)) {
      const ch = chordAt(h.step);
      bi(bassNote(ch, h.sym, barCount), timeOf(h.step), h.len * stepDur * 0.95, h.vel * bvel, buses.bass);
    }
  }

  // chords
  style.comp.forEach((part, pi) => {
    const inst = INSTRUMENTS[part.inst];
    const pvel = part.vel ?? 1;
    if (part.arp) {
      const every = part.every || 2;
      for (let s = 0, k = 0; s < steps; s += every, k++) {
        const ch = chordAt(s);
        const v = voice(ch, part.voicing, pi);
        const n = v[part.arp[k % part.arp.length] % v.length];
        inst(n, timeOf(s), every * stepDur * 1.6, (k === 0 ? 0.85 : 0.6) * pvel, buses.chords);
      }
      return;
    }
    for (const h of hits(part.pat, steps, boundaries)) {
      const ch = chordAt(h.step);
      const v = voice(ch, part.voicing, pi);
      const t = timeOf(h.step);
      v.forEach((m, k) => inst(m, t + (part.strum ? k * part.strum : 0), h.len * stepDur * 0.92, h.vel * pvel, buses.chords));
    }
  });
  return barDur;
}

function crackle(t) {
  const c = getCtx();
  const s = c.createBufferSource();
  s.buffer = getNoise();
  const f = c.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 2500;
  const g = c.createGain();
  g.gain.setValueAtTime(0.06 * Math.random(), t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.01);
  s.connect(f).connect(g).connect(buses.drums);
  s.start(t, Math.random()); s.stop(t + 0.02);
}

