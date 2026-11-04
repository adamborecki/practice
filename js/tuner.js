import { getCtx, getMaster, acquireMic, releaseMic, micErrorMessage, freqToMidi, midiToFreq, sinkSilently, setA4 as shareA4 } from './audio.js';
import { detectPitch, median } from './pitch.js';
import { load, save, addLog } from './store.js';
import { $, $$, fitCanvas, cssVar, keepAwake, setPlaying, icon } from './ui.js';

// Mixed spelling the way musicians usually read it.
const NAMES = ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'];
const TRANSPOSE = [
  { id: 'C', label: 'Concert pitch (C)', shift: 0 },
  { id: 'Bb', label: 'B♭ — clarinet, trumpet, tenor sax', shift: 2 },
  { id: 'Eb', label: 'E♭ — alto & bari sax', shift: 9 },
  { id: 'F', label: 'F — horn, English horn', shift: 7 },
  { id: 'A', label: 'A — A clarinet', shift: 3 },
  { id: 'G', label: 'G — alto flute', shift: 5 },
];

const settings = load('tuner', { a4: 440, transpose: 'C', droneNote: 9, droneOct: 3, droneFifth: false, droneTone: 'warm' });

let el, analyser, src, lowpass, buf, sink, raf = 0, running = false;
let hist = []; // recent cents for the needle
let trail = []; // {t, cents, inTune} for the strip chart
let startedAt = 0;

export const tuner = {
  id: 'tuner',
  mount(root) {
    el = root;
    root.innerHTML = `
      <header class="view-head"><h1>Tuner</h1><p class="sub">Play a long tone. Green = within ±5 cents. Hold a note to see how steady it is (try without vibrato).</p></header>
      <div class="card tuner-card">
        <div class="tuner-readout" aria-live="polite">
          <div class="tn-note"><span class="tn-letter">–</span><span class="tn-acc"></span><sub class="tn-oct"></sub></div>
          <div class="tn-cents">Tap start and play</div>
          <div class="tn-hz"></div>
          <div class="tn-steady" aria-live="off"></div>
        </div>
        <svg class="tn-gauge" viewBox="0 0 300 150" aria-hidden="true">
          <path class="tn-arc" d="M20 140 A130 130 0 0 1 280 140" />
          <path class="tn-zone" d="M 133.0 11.1 A130 130 0 0 1 167.0 11.1" />
          ${[-50, -40, -30, -20, -10, 0, 10, 20, 30, 40, 50].map((c) => {
            const a = (c / 50) * (Math.PI / 2.4);
            const x1 = 150 + Math.sin(a) * 118, y1 = 140 - Math.cos(a) * 118;
            const x2 = 150 + Math.sin(a) * (c % 50 === 0 || c === 0 ? 100 : 108), y2 = 140 - Math.cos(a) * (c % 50 === 0 || c === 0 ? 100 : 108);
            return `<line class="tn-tick" x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}"/>`;
          }).join('')}
          <text x="22" y="132" class="tn-lbl">♭</text><text x="270" y="132" class="tn-lbl">♯</text>
          <g class="tn-needle"><line x1="150" y1="140" x2="150" y2="22"/><circle cx="150" cy="140" r="7"/></g>
        </svg>
        <canvas class="tn-trail" aria-label="Pitch history (last 8 seconds)"></canvas>
        <button class="btn primary big tn-toggle">${icon('mic')}<span>Start tuner</span></button>
        <p class="tn-err err" hidden></p>
      </div>

      <div class="card">
        <h2>Settings</h2>
        <div class="row2">
          <label class="field"><span>Reference A4</span>
            <div class="stepper"><button class="btn icon-btn" data-a4="-1" aria-label="Lower A4">−</button><output class="tn-a4">${settings.a4} Hz</output><button class="btn icon-btn" data-a4="1" aria-label="Raise A4">+</button></div>
          </label>
          <label class="field"><span>Show notes for</span>
            <select class="tn-transpose">${TRANSPOSE.map((t) => `<option value="${t.id}" ${t.id === settings.transpose ? 'selected' : ''}>${t.label}</option>`).join('')}</select>
          </label>
        </div>
        <div class="chips tn-presets">${[415, 430, 440, 442, 443].map((v) => `<button class="chip" data-preset="${v}">${v}${v === 415 ? ' (Baroque)' : ''}</button>`).join('')}</div>
      </div>

      <div class="card">
        <h2>Drone</h2>
        <p class="hint">Tune intervals against a sustained pitch — one of the most effective ways to train intonation. The drone uses the A4 above.</p>
        <div class="note-grid tn-drone-notes">${NAMES.map((n, i) => `<button class="chip ${i === settings.droneNote ? 'on' : ''}" data-dn="${i}">${n}</button>`).join('')}</div>
        <div class="row2">
          <label class="field"><span>Octave</span>
            <select class="tn-drone-oct">${[1, 2, 3, 4, 5].map((o) => `<option ${o === settings.droneOct ? 'selected' : ''}>${o}</option>`).join('')}</select>
          </label>
          <label class="field"><span>Sound</span>
            <select class="tn-drone-tone">
              <option value="pure" ${settings.droneTone === 'pure' ? 'selected' : ''}>Pure (sine)</option>
              <option value="warm" ${settings.droneTone === 'warm' ? 'selected' : ''}>Warm (organ)</option>
              <option value="bright" ${settings.droneTone === 'bright' ? 'selected' : ''}>Bright (reed)</option>
            </select>
          </label>
        </div>
        <label class="switch"><input type="checkbox" class="tn-drone-fifth" ${settings.droneFifth ? 'checked' : ''}><span>Add perfect fifth (just, 3:2)</span></label>
        <label class="field"><span>Volume</span><input type="range" class="tn-drone-vol" min="0" max="1" step="0.01" value="0.5"></label>
        <button class="btn big tn-drone-btn">${icon('play')}<span>Play drone</span></button>
      </div>`;

    $('.tn-toggle', root).addEventListener('click', () => (running ? stop() : start()));
    $$('[data-a4]', root).forEach((b) => b.addEventListener('click', () => setA4(settings.a4 + Number(b.dataset.a4))));
    $$('[data-preset]', root).forEach((b) => b.addEventListener('click', () => setA4(Number(b.dataset.preset))));
    $('.tn-transpose', root).addEventListener('change', (e) => { settings.transpose = e.target.value; save('tuner', settings); });

    $$('[data-dn]', root).forEach((b) => b.addEventListener('click', () => {
      settings.droneNote = Number(b.dataset.dn);
      $$('[data-dn]', root).forEach((x) => x.classList.toggle('on', x === b));
      save('tuner', settings);
      if (drone) startDrone();
    }));
    $('.tn-drone-oct', root).addEventListener('change', (e) => { settings.droneOct = Number(e.target.value); save('tuner', settings); if (drone) startDrone(); });
    $('.tn-drone-tone', root).addEventListener('change', (e) => { settings.droneTone = e.target.value; save('tuner', settings); if (drone) startDrone(); });
    $('.tn-drone-fifth', root).addEventListener('change', (e) => { settings.droneFifth = e.target.checked; save('tuner', settings); if (drone) startDrone(); });
    $('.tn-drone-vol', root).addEventListener('input', (e) => { if (drone) drone.out.gain.setTargetAtTime(Number(e.target.value) * 0.5, getCtx().currentTime, 0.05); });
    $('.tn-drone-btn', root).addEventListener('click', () => (drone ? stopDrone() : startDrone()));
  },
  show() {},
  hide() { if (running) stop(); },
};

function setA4(v) {
  settings.a4 = Math.max(400, Math.min(480, v));
  $('.tn-a4', el).textContent = `${settings.a4} Hz`;
  save('tuner', settings);
  shareA4(settings.a4);
  if (drone) startDrone();
}

async function start() {
  const errEl = $('.tn-err', el);
  errEl.hidden = true;
  try {
    const ctx = getCtx();
    const stream = await acquireMic();
    src = ctx.createMediaStreamSource(stream);
    lowpass = ctx.createBiquadFilter();
    lowpass.type = 'lowpass';
    lowpass.frequency.value = 3500;
    analyser = ctx.createAnalyser();
    analyser.fftSize = 4096;
    buf = new Float32Array(analyser.fftSize);
    src.connect(lowpass).connect(analyser);
    sink = sinkSilently(analyser);
    running = true;
    startedAt = Date.now();
    hist = [];
    trail = [];
    $('.tn-toggle span', el).textContent = 'Stop tuner';
    $('.tn-toggle', el).classList.add('active');
    keepAwake('tuner', true);
    loop();
  } catch (e) {
    errEl.textContent = micErrorMessage(e);
    errEl.hidden = false;
  }
}

function stop() {
  running = false;
  cancelAnimationFrame(raf);
  try { src?.disconnect(); lowpass?.disconnect(); analyser?.disconnect(); sink?.disconnect(); } catch {}
  releaseMic();
  keepAwake('tuner', false);
  $('.tn-toggle span', el).textContent = 'Start tuner';
  $('.tn-toggle', el).classList.remove('active');
  const secs = (Date.now() - startedAt) / 1000;
  if (secs > 20) addLog({ kind: 'tuner', label: 'Tuning / intonation', seconds: Math.round(secs) });
}

let lastDetect = 0;
let silentSince = 0;
function loop(now = 0) {
  if (!running) return;
  raf = requestAnimationFrame(loop);
  if (now - lastDetect < 45) { drawTrail(); return; } // ~20 detections / s
  lastDetect = now;
  analyser.getFloatTimeDomainData(buf);
  const r = detectPitch(buf, getCtx().sampleRate);
  const t = performance.now();
  if (r && r.clarity > 0.8) {
    silentSince = 0;
    const midiF = freqToMidi(r.freq, settings.a4);
    const nearest = Math.round(midiF);
    const cents = (midiF - nearest) * 100;
    hist.push({ nearest, cents });
    if (hist.length > 5) hist.shift();
    // only smooth across readings of the same note
    const same = hist.filter((h) => h.nearest === nearest).map((h) => h.cents);
    const c = median(same);
    render(nearest, c, r.freq);
    trail.push({ t, cents: c, raw: cents, note: nearest });
    renderSteady(t, nearest);
  } else {
    if (!silentSince) silentSince = t;
    if (t - silentSince > 600) { hist = []; dim(); }
  }
  while (trail.length && t - trail[0].t > 8000) trail.shift();
  drawTrail();
}

function render(midi, cents, hz) {
  const shift = TRANSPOSE.find((x) => x.id === settings.transpose)?.shift || 0;
  const written = midi + shift;
  const name = NAMES[((written % 12) + 12) % 12];
  const oct = Math.floor(written / 12) - 1;
  $('.tn-letter', el).textContent = name[0];
  $('.tn-acc', el).textContent = name.slice(1);
  $('.tn-oct', el).textContent = oct;
  const inTune = Math.abs(cents) <= 5;
  const close = Math.abs(cents) <= 15;
  $('.tn-cents', el).textContent = `${cents > 0 ? '+' : cents < 0 ? '−' : '±'}${Math.abs(cents).toFixed(0)} cents ${inTune ? '· in tune' : cents < 0 ? '· flat' : '· sharp'}`;
  $('.tn-hz', el).textContent = `${hz.toFixed(1)} Hz${shift ? ` · concert ${NAMES[((midi % 12) + 12) % 12]}` : ''}`;
  const card = $('.tuner-card', el);
  card.dataset.state = inTune ? 'good' : close ? 'close' : 'far';
  const deg = Math.max(-50, Math.min(50, cents)) / 50 * 75;
  $('.tn-needle', el).style.transform = `rotate(${deg}deg)`;
}

/**
 * Long-tone steadiness: over the note you're holding, the average offset tells you where
 * you sit (consistently flat/sharp) and the spread tells you how steady the pitch is.
 */
function renderSteady(t, note) {
  const out = $('.tn-steady', el);
  const held = [];
  for (let i = trail.length - 1; i >= 0; i--) {
    const p = trail[i];
    if (p.note !== note || (held.length && held[held.length - 1].t - p.t > 300)) break;
    held.push(p);
  }
  const dur = held.length ? (t - held[held.length - 1].t) / 1000 : 0;
  if (dur < 1.5) { out.textContent = ''; return; }
  const recent = held.filter((p) => t - p.t < 4000).map((p) => p.raw);
  const mean = recent.reduce((a, b) => a + b, 0) / recent.length;
  const sd = Math.sqrt(recent.reduce((a, b) => a + (b - mean) ** 2, 0) / recent.length);
  const word = sd < 3 ? 'rock steady' : sd < 6 ? 'steady' : sd < 12 ? 'a little wobbly' : 'wobbly (or vibrato)';
  out.innerHTML = `Held ${dur.toFixed(1)} s · average <b>${mean >= 0 ? '+' : '−'}${Math.abs(mean).toFixed(0)}¢</b> · spread ±${sd.toFixed(0)}¢ <span class="tag">${word}</span>`;
}

function dim() {
  const card = $('.tuner-card', el);
  if (card.dataset.state === 'idle') return;
  card.dataset.state = 'idle';
  $('.tn-cents', el).textContent = 'Listening…';
  $('.tn-steady', el).textContent = '';
  $('.tn-needle', el).style.transform = 'rotate(0deg)';
}

function drawTrail() {
  const cv = $('.tn-trail', el);
  const { g, w, h } = fitCanvas(cv);
  g.clearRect(0, 0, w, h);
  const mid = h / 2;
  const y = (c) => mid - (Math.max(-50, Math.min(50, c)) / 50) * (h / 2 - 4);
  g.fillStyle = cssVar('--good-soft');
  g.fillRect(0, y(5), w, y(-5) - y(5));
  g.strokeStyle = cssVar('--line');
  g.lineWidth = 1;
  g.beginPath(); g.moveTo(0, mid); g.lineTo(w, mid); g.stroke();
  if (!trail.length) return;
  const now = performance.now();
  g.lineWidth = 2.5;
  g.lineCap = 'round';
  for (let i = 1; i < trail.length; i++) {
    const a = trail[i - 1], b = trail[i];
    if (b.t - a.t > 250) continue; // gap between notes
    g.strokeStyle = Math.abs(b.cents) <= 5 ? cssVar('--good') : Math.abs(b.cents) <= 15 ? cssVar('--warn') : cssVar('--bad');
    g.beginPath();
    g.moveTo(w - ((now - a.t) / 8000) * w, y(a.cents));
    g.lineTo(w - ((now - b.t) / 8000) * w, y(b.cents));
    g.stroke();
  }
}

// ---------------- Drone ----------------
let drone = null;
function startDrone() {
  stopDrone(true);
  const ctx = getCtx();
  const t = ctx.currentTime;
  const midi = 12 * (settings.droneOct + 1) + settings.droneNote;
  const f0 = midiToFreq(midi, settings.a4);
  const out = ctx.createGain();
  const vol = Number($('.tn-drone-vol', el).value) * 0.5;
  out.gain.setValueAtTime(0, t);
  out.gain.linearRampToValueAtTime(vol, t + 0.4);
  out.connect(getMaster());
  const oscs = [];
  const voice = (freq, level) => {
    const partials = settings.droneTone === 'pure' ? [[1, 1]]
      : settings.droneTone === 'warm' ? [[1, 1], [2, 0.45], [3, 0.2], [4, 0.12], [6, 0.05]]
      : [[1, 1], [2, 0.6], [3, 0.5], [4, 0.35], [5, 0.3], [6, 0.2], [7, 0.15], [8, 0.1]];
    const sum = partials.reduce((s, p) => s + p[1], 0);
    for (const [k, a] of partials) {
      const o = ctx.createOscillator();
      o.frequency.value = freq * k;
      const g = ctx.createGain();
      g.gain.value = (a / sum) * level;
      o.connect(g).connect(out);
      o.start(t);
      oscs.push(o);
    }
  };
  voice(f0, 1);
  if (settings.droneFifth) voice(f0 * 1.5, 0.7);
  drone = { out, oscs };
  const b = $('.tn-drone-btn', el);
  b.classList.add('active');
  b.innerHTML = `${icon('stop')}<span>Stop drone · ${NAMES[settings.droneNote]}${settings.droneOct}</span>`;
  setPlaying('drone', `Drone ${NAMES[settings.droneNote]}${settings.droneOct}`, () => stopDrone());
}
function stopDrone(restarting = false) {
  if (!drone) return;
  const ctx = getCtx();
  const { out, oscs } = drone;
  out.gain.cancelScheduledValues(ctx.currentTime);
  out.gain.setTargetAtTime(0, ctx.currentTime, 0.08);
  oscs.forEach((o) => o.stop(ctx.currentTime + 0.5));
  drone = null;
  if (!restarting) {
    const b = $('.tn-drone-btn', el);
    b.classList.remove('active');
    b.innerHTML = `${icon('play')}<span>Play drone</span>`;
    setPlaying('drone', null);
  }
}
