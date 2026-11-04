import { getCtx, getMaster, createTicker, LOOKAHEAD } from './audio.js';
import { VOICES, GROOVES, DANCE_GROOVES, stepVel } from './drums.js';
import { load, save, addLog } from './store.js';
import { $, $$, keepAwake, setPlaying, icon, toast } from './ui.js';

const S = load('metro', {
  bpm: 96, beats: 4, sub: 1, sound: 'wood', mode: 'click', accent: true, vol: 0.8,
  clickOnGroove: false, trainer: false, trainerTo: 132, trainerStep: 4, trainerBars: 4,
  gap: false, gapPlay: 2, gapMute: 2,
});

// Per-beat accent levels (2 = accent, 1 = normal, 0 = silent). Tap a dot to cycle.
function accents() {
  if (!Array.isArray(S.accents)) S.accents = [];
  S.accents.length = Math.min(S.accents.length, S.beats);
  while (S.accents.length < S.beats) S.accents.push(S.accents.length === 0 && S.accent !== false ? 2 : 1);
  return S.accents;
}
// Accuracy ladder state (not persisted: per sitting)
const L = { streak: 0, best: 0, misses: 0, climbs: 0 };
Object.assign(S, { ladderN: S.ladderN || 3, ladderStep: S.ladderStep || 4, ladderDrop: S.ladderDrop ?? true });

const MARKINGS = [[40, 'Grave'], [60, 'Largo'], [66, 'Larghetto'], [76, 'Adagio'], [108, 'Andante'], [120, 'Moderato'], [156, 'Allegro'], [176, 'Vivace'], [200, 'Presto'], [999, 'Prestissimo']];
const marking = (b) => MARKINGS.find(([max]) => b < max)[1];

let el, out, running = false, nextTime = 0, step = 0, bar = 0, startedAt = 0, startBpm = 0;
const visQueue = [];
let raf = 0;
const ticker = createTicker(schedule);

export const metronome = {
  id: 'metronome',
  mount(root) {
    el = root;
    root.innerHTML = `
      <header class="view-head"><h1>Beats</h1><p class="sub">A metronome that grooves. Pick a classic click or a dance beat.</p></header>
      <div class="card metro-card">
        <div class="metro-dots" aria-hidden="true"></div>
        <div class="metro-bpm-row">
          <button class="btn round" data-bpm="-1" aria-label="Slower">−</button>
          <div class="metro-bpm"><output class="mb-num">${S.bpm}</output><span class="mb-unit">BPM</span><span class="mb-mark">${marking(S.bpm)}</span></div>
          <button class="btn round" data-bpm="1" aria-label="Faster">+</button>
        </div>
        <input type="range" class="mb-slider" min="30" max="260" value="${S.bpm}" aria-label="Tempo">
        <div class="metro-actions">
          <button class="btn tap">Tap</button>
          <button class="btn primary big metro-play">${icon('play')}<span>Start</span></button>
          <button class="btn" data-bpm="-5">−5</button>
          <button class="btn" data-bpm="5">+5</button>
        </div>
        <p class="metro-status hint" aria-live="polite"></p>
      </div>

      <div class="card">
        <h2>Groove</h2>
        <div class="groove-grid">
          <button class="groove ${S.mode === 'click' ? 'on' : ''}" data-mode="click"><span class="ge">🕰️</span><span>Classic click</span></button>
          ${DANCE_GROOVES.map((g) => `<button class="groove ${S.mode === g ? 'on' : ''}" data-mode="${g}"><span class="ge">${GROOVES[g].emoji}</span><span>${GROOVES[g].name}</span><small>~${GROOVES[g].bpm}</small></button>`).join('')}
        </div>
        <label class="switch groove-only"><input type="checkbox" class="m-clickover" ${S.clickOnGroove ? 'checked' : ''}><span>Keep a click on every beat over the groove</span></label>
        <button class="btn small m-usebpm groove-only">Use this groove's typical tempo</button>
      </div>

      <div class="card click-only">
        <h2>Meter & sound</h2>
        <div class="row2">
          <label class="field"><span>Beats per bar</span>
            <select class="m-beats">${[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((n) => `<option ${n === S.beats ? 'selected' : ''}>${n}</option>`).join('')}</select>
          </label>
          <label class="field"><span>Subdivision</span>
            <select class="m-sub">
              <option value="1" ${S.sub === 1 ? 'selected' : ''}>♩ Quarter</option>
              <option value="2" ${S.sub === 2 ? 'selected' : ''}>♫ Eighths</option>
              <option value="3" ${S.sub === 3 ? 'selected' : ''}>Triplets</option>
              <option value="4" ${S.sub === 4 ? 'selected' : ''}>16ths</option>
            </select>
          </label>
        </div>
        <div class="chips m-sounds">${[['wood', 'Woodblock'], ['click', 'Click'], ['beep', 'Beep'], ['cowbell', 'Cowbell 🐄']].map(([k, n]) => `<button class="chip ${S.sound === k ? 'on' : ''}" data-sound="${k}">${n}</button>`).join('')}</div>
        <p class="hint">Tap the beat dots at the top to cycle <b>accent → normal → silent</b> — e.g. 7 beats as 2+2+3, or silence beats 1 &amp; 3 to hear only the backbeat.</p>
        <div class="chips m-groupings"></div>
      </div>

      <div class="card ladder-card">
        <h2>🪜 Accuracy ladder</h2>
        <p class="hint">Play the passage, then tap ✓ if it was clean or ✗ if not. After <b class="lad-nlabel">${S.ladderN}</b> clean in a row the tempo goes up; a miss resets the count. Accuracy first, then speed — what set the most effective practicers apart (Duke, Simmons &amp; Cash, 2009).</p>
        <div class="ladder-row">
          <button class="btn big lad-miss" aria-label="Not clean">✗</button>
          <div class="lad-pips" aria-live="polite"></div>
          <button class="btn big primary lad-hit" aria-label="Clean">✓</button>
        </div>
        <p class="lad-status hint"></p>
        <div class="row3">
          <label class="field"><span>Clean in a row</span><select class="lad-n">${[2, 3, 4, 5, 7, 10].map((n) => `<option ${n === S.ladderN ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
          <label class="field"><span>Then +BPM</span><select class="lad-step">${[2, 3, 4, 5, 8, 10].map((n) => `<option value="${n}" ${n === S.ladderStep ? 'selected' : ''}>+${n}</option>`).join('')}</select></label>
          <label class="field"><span>After a miss</span><select class="lad-drop"><option value="1" ${S.ladderDrop ? 'selected' : ''}>Slower</option><option value="0" ${S.ladderDrop ? '' : 'selected'}>Same</option></select></label>
        </div>
      </div>

      <div class="card">
        <h2>Practice tools</h2>
        <label class="switch"><input type="checkbox" class="m-trainer" ${S.trainer ? 'checked' : ''}><span><b>Speed trainer</b> — start slow, creep up automatically</span></label>
        <div class="trainer-opts sub-opts" ${S.trainer ? '' : 'hidden'}>
          <label class="field"><span>Up to</span><input type="number" class="m-tto" min="30" max="260" value="${S.trainerTo}"></label>
          <label class="field"><span>+BPM</span><input type="number" class="m-tstep" min="1" max="20" value="${S.trainerStep}"></label>
          <label class="field"><span>every … bars</span><input type="number" class="m-tbars" min="1" max="32" value="${S.trainerBars}"></label>
        </div>
        <label class="switch"><input type="checkbox" class="m-gap" ${S.gap ? 'checked' : ''}><span><b>Gap trainer</b> — beat drops out; keep time on your own</span></label>
        <div class="gap-opts sub-opts" ${S.gap ? '' : 'hidden'}>
          <label class="field"><span>Play bars</span><input type="number" class="m-gplay" min="1" max="16" value="${S.gapPlay}"></label>
          <label class="field"><span>Silent bars</span><input type="number" class="m-gmute" min="1" max="16" value="${S.gapMute}"></label>
        </div>
        <label class="field"><span>Volume</span><input type="range" class="m-vol" min="0" max="1" step="0.01" value="${S.vol}"></label>
      </div>`;

    $$('[data-bpm]', root).forEach((b) => b.addEventListener('click', () => setBpm(S.bpm + Number(b.dataset.bpm))));
    $('.mb-slider', root).addEventListener('input', (e) => setBpm(Number(e.target.value)));
    $('.metro-play', root).addEventListener('click', () => (running ? stop() : start()));
    $('.tap', root).addEventListener('click', tap);
    $$('[data-mode]', root).forEach((b) => b.addEventListener('click', () => setMode(b.dataset.mode)));
    $('.m-usebpm', root).addEventListener('click', () => S.mode !== 'click' && setBpm(GROOVES[S.mode].bpm));
    $('.m-clickover', root).addEventListener('change', (e) => { S.clickOnGroove = e.target.checked; persist(); });
    $('.m-beats', root).addEventListener('change', (e) => { S.beats = Number(e.target.value); S.accents = null; persist(); drawDots(); renderGroupings(); });
    $('.m-sub', root).addEventListener('change', (e) => { S.sub = Number(e.target.value); persist(); });
    $$('[data-sound]', root).forEach((b) => b.addEventListener('click', () => {
      S.sound = b.dataset.sound;
      $$('[data-sound]', root).forEach((x) => x.classList.toggle('on', x === b));
      persist();
      if (!running) VOICES[S.sound === 'cowbell' ? 'cowbell' : S.sound](getCtx().currentTime + 0.02, bus(), 0.9, true);
    }));
    $('.metro-dots', root).addEventListener('click', (e) => {
      const d = e.target.closest('.dot');
      if (!d || S.mode !== 'click') return;
      const i = Number(d.dataset.i);
      const a = accents();
      a[i] = (a[i] + 2) % 3; // 2 → 1 → 0 → 2
      persist(); drawDots();
    });
    $('.m-trainer', root).addEventListener('change', (e) => { S.trainer = e.target.checked; $('.trainer-opts', root).hidden = !S.trainer; persist(); });
    $('.m-gap', root).addEventListener('change', (e) => { S.gap = e.target.checked; $('.gap-opts', root).hidden = !S.gap; persist(); });
    const num = (cls, key, lo, hi) => $(cls, root).addEventListener('change', (e) => { S[key] = Math.max(lo, Math.min(hi, Number(e.target.value) || lo)); e.target.value = S[key]; persist(); });
    num('.m-tto', 'trainerTo', 30, 260); num('.m-tstep', 'trainerStep', 1, 20); num('.m-tbars', 'trainerBars', 1, 32);
    num('.m-gplay', 'gapPlay', 1, 16); num('.m-gmute', 'gapMute', 1, 16);
    $('.m-vol', root).addEventListener('input', (e) => { S.vol = Number(e.target.value); if (out) out.gain.value = S.vol; persist(); });

    // keyboard: space toggles, arrows nudge (handy on a laptop in the practice room)
    root.addEventListener('keydown', (e) => {
      if (e.target.matches('input, select, textarea')) return;
      if (e.code === 'Space') { e.preventDefault(); running ? stop() : start(); }
    });
    $('.lad-hit', root).addEventListener('click', () => ladder(true));
    $('.lad-miss', root).addEventListener('click', () => ladder(false));
    $('.lad-n', root).addEventListener('change', (e) => { S.ladderN = Number(e.target.value); L.streak = 0; $('.lad-nlabel', el).textContent = S.ladderN; persist(); renderLadder(); });
    $('.lad-step', root).addEventListener('change', (e) => { S.ladderStep = Number(e.target.value); persist(); });
    $('.lad-drop', root).addEventListener('change', (e) => { S.ladderDrop = e.target.value === '1'; persist(); });
    reflectMode();
    drawDots();
    renderGroupings();
    renderLadder();
  },
  show() {},
  hide() {},
  setBpm: (b) => setBpm(b),
  get bpm() { return S.bpm; },
};

function persist() { save('metro', S); }

function bus() {
  const c = getCtx();
  if (!out) {
    out = c.createGain();
    out.gain.value = S.vol;
    out.connect(getMaster());
  }
  return out;
}

function setBpm(b) {
  S.bpm = Math.max(30, Math.min(260, Math.round(b)));
  $('.mb-num', el).textContent = S.bpm;
  $('.mb-mark', el).textContent = marking(S.bpm);
  $('.mb-slider', el).value = S.bpm;
  persist();
  if (running) setPlaying('metronome', `${S.bpm} BPM · ${S.mode === 'click' ? 'click' : GROOVES[S.mode].name}`, stop);
}

function setMode(m) {
  S.mode = m;
  $$('[data-mode]', el).forEach((x) => x.classList.toggle('on', x.dataset.mode === m));
  persist();
  reflectMode();
  drawDots();
  if (running) {
    step = 0; bar = 0; nextTime = getCtx().currentTime + 0.05;
    setPlaying('metronome', `${S.bpm} BPM · ${S.mode === 'click' ? 'click' : GROOVES[S.mode].name}`, stop);
  }
}

function reflectMode() {
  const groove = S.mode !== 'click';
  $$('.groove-only', el).forEach((x) => (x.hidden = !groove));
  $$('.click-only', el).forEach((x) => (x.hidden = groove));
}

const beatsPerBar = () => (S.mode === 'click' ? S.beats : GROOVES[S.mode].beats);

function drawDots() {
  const n = beatsPerBar();
  const a = S.mode === 'click' ? accents() : [];
  $('.metro-dots', el).innerHTML = Array.from({ length: n }, (_, i) => {
    const lv = S.mode === 'click' ? a[i] : i === 0 ? 2 : 1;
    return `<span class="dot ${lv === 2 ? 'acc' : lv === 0 ? 'off' : ''}" data-i="${i}" role="button" aria-label="Beat ${i + 1}: ${['silent', 'normal', 'accent'][lv]}"></span>`;
  }).join('');
}

const GROUPINGS = { 5: [[3, 2], [2, 3]], 6: [[3, 3], [2, 2, 2]], 7: [[2, 2, 3], [3, 2, 2], [2, 3, 2]], 8: [[3, 3, 2], [4, 4]], 9: [[3, 3, 3], [2, 2, 2, 3]], 10: [[3, 3, 2, 2]], 11: [[3, 3, 3, 2], [2, 2, 3, 2, 2]], 12: [[3, 3, 3, 3]] };
function renderGroupings() {
  const box = $('.m-groupings', el);
  const g = GROUPINGS[S.beats] || [];
  box.innerHTML = g.length ? 'Groupings: ' + g.map((parts, i) => `<button class="chip" data-g="${i}">${parts.join('+')}</button>`).join('') : '';
  $$('[data-g]', box).forEach((b) => b.addEventListener('click', () => {
    const parts = g[Number(b.dataset.g)];
    S.accents = parts.flatMap((p) => Array.from({ length: p }, (_, j) => (j === 0 ? 2 : 1)));
    persist(); drawDots();
  }));
}

// ---------- accuracy ladder ----------
function ladder(clean) {
  if (clean) {
    L.streak++;
    if (L.streak >= S.ladderN) {
      L.streak = 0;
      L.climbs++;
      setBpm(S.bpm + S.ladderStep);
      L.best = Math.max(L.best, S.bpm);
      toast(`${S.ladderN} clean in a row → ${S.bpm} BPM`);
    }
  } else {
    L.misses++;
    L.streak = 0;
    if (S.ladderDrop) setBpm(S.bpm - Math.max(2, Math.round(S.ladderStep / 2)));
  }
  try { if (navigator.vibrate && navigator.userActivation?.hasBeenActive) navigator.vibrate(clean ? 15 : [30, 40, 30]); } catch {}
  renderLadder();
}
function renderLadder() {
  $('.lad-pips', el).innerHTML = Array.from({ length: S.ladderN }, (_, i) => `<span class="${i < L.streak ? 'on' : ''}"></span>`).join('');
  $('.lad-status', el).textContent = L.climbs || L.misses
    ? `Streak ${L.streak}/${S.ladderN} · climbed ${L.climbs}× · ${L.misses} miss${L.misses === 1 ? '' : 'es'} · top ${Math.max(L.best, S.bpm)} BPM`
    : 'Start at a tempo where you can play it cleanly.';
}

// ---------- tap tempo ----------
let taps = [];
function tap() {
  const now = performance.now();
  taps = taps.filter((t) => now - t < 2500);
  taps.push(now);
  if (taps.length >= 2) {
    const intervals = taps.slice(1).map((t, i) => t - taps[i]);
    const avg = intervals.reduce((a, b) => a + b, 0) / intervals.length;
    setBpm(60000 / avg);
  }
  const b = $('.tap', el);
  b.classList.add('flash');
  setTimeout(() => b.classList.remove('flash'), 90);
}

// ---------- scheduling ----------
function start() {
  const c = getCtx();
  bus();
  running = true;
  step = 0;
  bar = 0;
  nextTime = c.currentTime + 0.08;
  startedAt = Date.now();
  startBpm = S.bpm;
  ticker.start();
  raf = requestAnimationFrame(drawVis);
  keepAwake('metronome', true);
  const b = $('.metro-play', el);
  b.classList.add('active');
  b.innerHTML = `${icon('stop')}<span>Stop</span>`;
  setPlaying('metronome', `${S.bpm} BPM · ${S.mode === 'click' ? 'click' : GROOVES[S.mode].name}`, stop);
}

function stop() {
  if (!running) return;
  running = false;
  ticker.stop();
  cancelAnimationFrame(raf);
  visQueue.length = 0;
  // cut notes already scheduled ahead: fade this bus out and start a fresh one next time
  const c = getCtx();
  const old = out;
  old.gain.setTargetAtTime(0, c.currentTime, 0.02);
  setTimeout(() => old.disconnect(), 300);
  out = null;
  keepAwake('metronome', false);
  $$('.metro-dots .dot', el).forEach((d) => d.classList.remove('on', 'muted'));
  const b = $('.metro-play', el);
  b.classList.remove('active');
  b.innerHTML = `${icon('play')}<span>Start</span>`;
  $('.metro-status', el).textContent = '';
  setPlaying('metronome', null);
  const secs = Math.round((Date.now() - startedAt) / 1000);
  if (secs >= 30) {
    const label = S.mode === 'click' ? 'Metronome' : `${GROOVES[S.mode].name} groove`;
    const range = startBpm !== S.bpm ? `${startBpm}→${S.bpm}` : `${S.bpm}`;
    addLog({ kind: 'metronome', label: `${label} @ ${range} BPM${L.climbs ? ` · ladder climbed ${L.climbs}×` : ''}`, seconds: secs, detail: { bpm: S.bpm, from: startBpm, ladderTop: L.best || null } });
  }
}

function schedule() {
  if (!running) return;
  const c = getCtx();
  const groove = S.mode === 'click' ? null : GROOVES[S.mode];
  const beats = beatsPerBar();
  const stepsPerBeat = groove ? groove.steps / groove.beats : S.sub;
  const stepsPerBar = beats * stepsPerBeat;
  while (nextTime < c.currentTime + LOOKAHEAD) {
    const stepDur = 60 / S.bpm / stepsPerBeat;
    const inBar = step % stepsPerBar;
    const beat = Math.floor(inBar / stepsPerBeat);
    const onBeat = inBar % stepsPerBeat === 0;
    const muted = S.gap && (bar % (S.gapPlay + S.gapMute)) >= S.gapPlay;
    let t = nextTime;
    if (groove?.swing && inBar % 2 === 1) t += groove.swing * stepDur;
    if (!muted) {
      const dest = bus();
      if (groove) {
        for (const [voice, pattern] of Object.entries(groove.tracks)) {
          const ch = pattern[inBar];
          const v = stepVel(ch);
          if (!v) continue;
          VOICES[voice](t, dest, v);
          if (ch === 'r') VOICES[voice](t + stepDur / 2, dest, v * 0.8);
        }
        if (S.clickOnGroove && onBeat) VOICES.wood(t, dest, 0.7, beat === 0);
      } else {
        const lv = accents()[beat] ?? 1;
        const accent = lv === 2 && onBeat;
        const snd = S.sound;
        if (onBeat && lv === 0) {
          // silent beat
        } else if (onBeat) {
          if (snd === 'cowbell') VOICES.cowbell(t, dest, accent ? 1 : 0.65);
          else VOICES[snd](t, dest, accent ? 1 : 0.85, accent);
        } else {
          VOICES[snd === 'cowbell' ? 'click' : snd](t, dest, 0.35, false);
        }
      }
    }
    if (onBeat) visQueue.push({ t, beat, muted });
    nextTime += stepDur;
    step++;
    if (step % stepsPerBar === 0) {
      bar++;
      // speed trainer bumps tempo on bar lines
      if (S.trainer && bar % S.trainerBars === 0 && S.bpm < S.trainerTo) {
        setBpm(Math.min(S.trainerTo, S.bpm + S.trainerStep));
        if (S.bpm >= S.trainerTo) toast(`Speed trainer reached ${S.bpm} BPM 🎉`);
      }
    }
  }
}

function drawVis() {
  if (!running) return;
  raf = requestAnimationFrame(drawVis);
  const now = getCtx().currentTime;
  let latest = null;
  while (visQueue.length && visQueue[0].t <= now) latest = visQueue.shift();
  if (!latest) return;
  const dots = $$('.metro-dots .dot', el);
  dots.forEach((d, i) => {
    d.classList.toggle('on', i === latest.beat);
    d.classList.toggle('muted', latest.muted);
  });
  const st = $('.metro-status', el);
  const parts = [];
  if (S.gap) parts.push(latest.muted ? '🤫 Silent bar — keep the pulse!' : 'Playing');
  if (S.trainer) parts.push(S.bpm < S.trainerTo ? `Speed trainer: ${S.bpm} → ${S.trainerTo}` : `At target ${S.trainerTo} BPM`);
  st.textContent = parts.join(' · ');
}
