// Instant replay: the app listens, captures each phrase you play, and as soon as you stop
// (a short stretch of silence) it plays that phrase straight back — the "play it, hear it"
// loop teachers use in lessons. Every phrase is kept for the session so you can compare
// attempts or save one as a take. Optional reverb/delay on playback.
//
// The mic is closed while a phrase plays back. That stops the playback from re-triggering
// a new phrase, and on iPhone it lets audio come out at full speaker volume (iOS turns
// playback down while the microphone is open).
import { getCtx, getMaster, acquireMic, releaseMic, micErrorMessage, sinkSilently } from './audio.js';
import { recordings, addLog, load, save } from './store.js';
import { $, $$, esc, fmtClock, keepAwake, toast, icon } from './ui.js';

const S = load('replay', { silence: 1.5, sens: 'med', speed: 1, repeats: 1, reverb: 'off', reverbMix: 0.35, delay: 'off', delayMix: 0.3 });
const persist = () => save('replay', S);

export const REVERBS = {
  off: { name: 'Off' },
  room: { name: 'Practice room', secs: 0.9, decay: 3.4, pre: 0.006 },
  hall: { name: 'Concert hall', secs: 2.6, decay: 2.6, pre: 0.022 },
  cathedral: { name: 'Cathedral', secs: 5.5, decay: 2.1, pre: 0.04 },
};
export const DELAYS = {
  off: { name: 'Off' },
  slap: { name: 'Slapback', time: 0.11, fb: 0.12 },
  echo: { name: 'Echo', time: 0.34, fb: 0.38 },
  canyon: { name: 'Canyon', time: 0.62, fb: 0.5 },
};
// dB above the room's noise floor a sound must reach to count as playing
const MARGIN = { low: 18, med: 12, high: 7 };
const MAX_PHRASES = 20;
const PREROLL = 0.35; // seconds kept from before the trigger so the attack isn't clipped

let el = null;
let onSavedCb = () => {};
let eng = null; // running session
let playing = null; // { a, url, ch, an, done }
let phrases = [];
let count = 0;
let raf = 0;

// ---------- small audio helpers (also used for take playback) ----------

/** Gain that brings a quiet recording up to a healthy level (capped at +18 dB). */
export function boostFor(peak) {
  if (!(peak > 0)) return 1;
  return Math.min(8, Math.max(1, 0.89 / peak));
}

/** 16-bit mono WAV — plays everywhere and is what a saved phrase is stored as. */
export function encodeWav(pcm, sr) {
  const buf = new ArrayBuffer(44 + pcm.length * 2);
  const v = new DataView(buf);
  const str = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  str(0, 'RIFF'); v.setUint32(4, 36 + pcm.length * 2, true); str(8, 'WAVE');
  str(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, sr, true); v.setUint32(28, sr * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  str(36, 'data'); v.setUint32(40, pcm.length * 2, true);
  for (let i = 0; i < pcm.length; i++) {
    const s = Math.max(-1, Math.min(1, pcm[i]));
    v.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return new Blob([buf], { type: 'audio/wav' });
}

function peaksOf(pcm, n) {
  const size = Math.max(1, Math.floor(pcm.length / n));
  const out = [];
  for (let i = 0; i < n; i++) {
    let m = 0;
    for (let j = i * size; j < Math.min(pcm.length, (i + 1) * size); j++) m = Math.max(m, Math.abs(pcm[j]));
    out.push(m);
  }
  const max = Math.max(...out, 0.001);
  return out.map((p) => Math.round((p / max) * 100) / 100);
}

// Synthetic reverb: decaying stereo noise that also gets darker as it decays.
const irCache = {};
function impulse(kind) {
  if (irCache[kind]) return irCache[kind];
  const c = getCtx();
  const p = REVERBS[kind];
  const len = Math.floor(c.sampleRate * p.secs);
  const pre = Math.floor(c.sampleRate * p.pre);
  const buf = c.createBuffer(2, len + pre, c.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    let y = 0;
    for (let i = 0; i < len; i++) {
      const t = i / len;
      const a = 0.85 - 0.7 * t; // one-pole low-pass, closing over time
      y += a * ((Math.random() * 2 - 1) - y);
      d[i + pre] = y * Math.pow(1 - t, p.decay);
    }
  }
  irCache[kind] = buf;
  return buf;
}

/** source → dry + reverb + delay → boost → master. Returns the nodes and how long the tail rings. */
function fxChain(src, gain) {
  const c = getCtx();
  const nodes = [];
  const mk = (n) => { nodes.push(n); return n; };
  const out = mk(c.createGain());
  out.gain.value = gain;
  const dry = mk(c.createGain());
  src.connect(dry).connect(out);
  let tail = 0.15;
  const rv = REVERBS[S.reverb];
  if (rv.secs) {
    const cv = mk(c.createConvolver());
    cv.buffer = impulse(S.reverb);
    const w = mk(c.createGain());
    w.gain.value = S.reverbMix * 1.1;
    dry.gain.value = 1 - S.reverbMix * 0.35;
    src.connect(cv).connect(w).connect(out);
    tail = Math.max(tail, rv.secs * 0.8);
  }
  const dl = DELAYS[S.delay];
  if (dl.time) {
    const d = mk(c.createDelay(2));
    d.delayTime.value = dl.time;
    const fb = mk(c.createGain());
    fb.gain.value = dl.fb;
    const lp = mk(c.createBiquadFilter());
    lp.type = 'lowpass';
    lp.frequency.value = 3800;
    const w = mk(c.createGain());
    w.gain.value = S.delayMix;
    src.connect(d);
    d.connect(lp).connect(fb).connect(d);
    d.connect(w).connect(out);
    tail = Math.max(tail, Math.min(4, dl.time * (Math.log(0.02) / Math.log(dl.fb))));
  }
  const an = mk(c.createAnalyser());
  an.fftSize = 512;
  out.connect(an);
  out.connect(getMaster());
  return { nodes, tail, an, dispose() { nodes.forEach((n) => { try { n.disconnect(); } catch {} }); try { src.disconnect(); } catch {} } };
}

// ---------- UI ----------

export function mountReplay(root, onSaved) {
  el = root;
  onSavedCb = onSaved || onSavedCb;
  const opt = (v, n, cur) => `<option value="${v}" ${String(cur) === String(v) ? 'selected' : ''}>${n}</option>`;
  root.innerHTML = `
    <div class="card rp-card" data-state="idle">
      <div class="rp-orb" aria-hidden="true"><i></i></div>
      <div class="rp-status" aria-live="polite"><b class="rp-big">Ready</b><small class="rp-small">Play a phrase, then stop — you’ll hear it right back.</small></div>
      <button class="btn primary big wide rp-go">${icon('mic')}<span>Start listening</span></button>
      <p class="rp-err err" hidden></p>
      <div class="rp-settings">
        <label class="field"><span>Silence before replay</span><select class="rp-silence">${[[1, '1 second'], [1.5, '1.5 seconds'], [2, '2 seconds'], [3, '3 seconds']].map(([v, n]) => opt(v, n, S.silence)).join('')}</select></label>
        <label class="field"><span>Hear it</span><select class="rp-rep">${[[1, 'Once'], [2, 'Twice'], [3, '3 times']].map(([v, n]) => opt(v, n, S.repeats)).join('')}</select></label>
        <label class="field"><span>Playback speed</span><select class="rp-speed">${[[1, 'Normal'], [0.75, '¾ speed'], [0.5, '½ speed']].map(([v, n]) => opt(v, n, S.speed)).join('')}</select></label>
        <label class="field"><span>Sensitivity</span><select class="rp-sens">${[['low', 'Low (loud)'], ['med', 'Medium'], ['high', 'High (soft)']].map(([v, n]) => opt(v, n, S.sens)).join('')}</select></label>
      </div>
      <p class="hint">Slower speeds keep the same pitch. No headphones needed: the mic pauses while it plays back, then starts listening again. Use <b>Low</b> sensitivity for brass, drums or loud rooms, <b>High</b> for soft playing.</p>
    </div>

    <div class="card rp-fx">
      <h2>Effects <small class="hint">on playback only</small></h2>
      <p class="fx-label">Reverb</p>
      <div class="chips rp-rv">${Object.entries(REVERBS).map(([k, r]) => `<button class="chip ${S.reverb === k ? 'on' : ''}" data-rv="${k}">${r.name}</button>`).join('')}</div>
      <label class="fx-mix" ${S.reverb === 'off' ? 'hidden' : ''}><span>Amount</span><input type="range" class="rp-rmix" min="0.05" max="0.9" step="0.05" value="${S.reverbMix}"></label>
      <p class="fx-label">Delay</p>
      <div class="chips rp-dl">${Object.entries(DELAYS).map(([k, r]) => `<button class="chip ${S.delay === k ? 'on' : ''}" data-dl="${k}">${r.name}</button>`).join('')}</div>
      <label class="fx-mix" ${S.delay === 'off' ? 'hidden' : ''}><span>Amount</span><input type="range" class="rp-dmix" min="0.05" max="0.8" step="0.05" value="${S.delayMix}"></label>
      <p class="hint">Keep it dry for honest listening. A little hall helps you hear long lines and phrasing. Saved takes are always stored dry.</p>
    </div>

    <div class="rp-phrases"></div>`;

  $('.rp-go', root).addEventListener('click', () => (eng ? stopSession() : startSession()));
  const num = (cls, key) => $(cls, root).addEventListener('change', (e) => { S[key] = Number(e.target.value); persist(); });
  num('.rp-silence', 'silence');
  num('.rp-rep', 'repeats');
  num('.rp-speed', 'speed');
  $('.rp-sens', root).addEventListener('change', (e) => { S.sens = e.target.value; persist(); });
  $$('[data-rv]', root).forEach((b) => b.addEventListener('click', () => {
    S.reverb = b.dataset.rv; persist();
    $$('[data-rv]', root).forEach((x) => x.classList.toggle('on', x === b));
    $('.rp-rmix', root).parentElement.hidden = S.reverb === 'off';
  }));
  $$('[data-dl]', root).forEach((b) => b.addEventListener('click', () => {
    S.delay = b.dataset.dl; persist();
    $$('[data-dl]', root).forEach((x) => x.classList.toggle('on', x === b));
    $('.rp-dmix', root).parentElement.hidden = S.delay === 'off';
  }));
  $('.rp-rmix', root).addEventListener('input', (e) => { S.reverbMix = Number(e.target.value); persist(); });
  $('.rp-dmix', root).addEventListener('input', (e) => { S.delayMix = Number(e.target.value); persist(); });
  renderPhrases();
  setState(eng ? eng.state : 'idle');
}

const STATUS = {
  idle: ['Ready', 'Play a phrase, then stop — you’ll hear it right back.'],
  starting: ['Opening the mic…', ''],
  listening: ['Listening…', 'Play whenever you’re ready.'],
  capturing: ['Recording', 'Stop playing to hear it back.'],
  playing: ['Playing back', ''],
  waiting: ['Get ready…', 'Listening again in a moment.'],
};

function setState(st, small) {
  if (eng) eng.state = st;
  if (!el) return;
  const card = $('.rp-card', el);
  if (!card) return;
  card.dataset.state = st;
  const [big, sm] = STATUS[st] || STATUS.idle;
  $('.rp-big', el).textContent = big;
  $('.rp-small', el).textContent = small ?? sm;
  const running = !!eng;
  $('.rp-go', el).innerHTML = running ? `${icon('stop')}<span>Stop</span>` : `${icon('mic')}<span>Start listening</span>`;
  $('.rp-go', el).classList.toggle('primary', !running);
}

function renderPhrases() {
  const box = el && $('.rp-phrases', el);
  if (!box) return;
  if (!phrases.length) { box.innerHTML = ''; return; }
  box.innerHTML = `
    <div class="card">
      <div class="rp-ph-head"><h2>This session <small class="hint">${phrases.length} phrase${phrases.length === 1 ? '' : 's'}</small></h2><button class="btn small rp-clear">Clear</button></div>
      ${phrases.map((p) => `
        <div class="phrase ${playing?.ph === p ? 'playing' : ''}" data-ph="${p.id}">
          <button class="btn round ph-play" aria-label="Play phrase ${p.n}">${icon(playing?.ph === p ? 'stop' : 'play')}</button>
          <div class="ph-mid"><b>Phrase ${p.n}</b> <small>${fmtClock(p.seconds)}${p.saved ? ' · saved' : ''}</small>
            <div class="ph-wave">${p.peaks.map((v) => `<i style="height:${Math.max(6, v * 100)}%"></i>`).join('')}</div></div>
          <button class="btn small ph-keep" ${p.saved ? 'disabled' : ''}>${p.saved ? 'Saved' : 'Save'}</button>
        </div>`).join('')}
      <p class="hint">Phrases are kept until you close the app. Tap <b>Save</b> to keep one with your takes.</p>
    </div>`;
  $('.rp-clear', box).addEventListener('click', () => { stopPlay(); phrases = []; renderPhrases(); });
  $$('.phrase', box).forEach((row) => {
    const p = phrases.find((x) => x.id === row.dataset.ph);
    $('.ph-play', row).addEventListener('click', () => {
      if (playing?.ph === p) { stopPlay(); afterPlayback(0); return; }
      manualPlay(p);
    });
    $('.ph-keep', row).addEventListener('click', () => keep(p));
  });
}

async function keep(p) {
  const rec = {
    id: `r${Date.now()}`,
    created: Date.now(),
    name: `Replay phrase ${p.n}`,
    seconds: p.seconds,
    type: 'audio/wav',
    blob: p.blob,
    peaks: peaksOf(p.pcm, 120),
    peakLevel: p.peak,
    star: false,
    note: '',
  };
  try {
    await recordings.put(rec);
    p.saved = true;
    toast(`Saved “${rec.name}” to your takes`);
    renderPhrases();
    onSavedCb();
  } catch {
    toast('Could not save (storage full or private mode?)');
  }
}

// ---------- the listening engine ----------

async function startSession() {
  $('.rp-err', el).hidden = true;
  eng = { state: 'starting', mic: null, started: Date.now(), floor: null, pre: [], cap: null, hot: 0, quiet: 0, level: -100, made: 0 };
  setState('starting');
  keepAwake('replay', true);
  try {
    await openMic();
    setState('listening');
    loop();
  } catch (e) {
    const err = $('.rp-err', el);
    err.textContent = micErrorMessage(e);
    err.hidden = false;
    eng = null;
    keepAwake('replay', false);
    setState('idle');
  }
}

export function stopSession() {
  if (!eng) return;
  const e = eng;
  eng = null;
  cancelAnimationFrame(raf);
  closeMic(e);
  stopPlay();
  keepAwake('replay', false);
  if (e.made) addLog({ kind: 'recording', label: `Instant replay — ${e.made} phrase${e.made === 1 ? '' : 's'}`, seconds: Math.round((Date.now() - e.started) / 1000) });
  if (el) { setState('idle'); $('.rp-orb', el)?.style.setProperty('--lv', 0); }
}

async function openMic() {
  const stream = await acquireMic();
  if (!eng) { releaseMic(); return; }
  const c = getCtx();
  const src = c.createMediaStreamSource(stream);
  const proc = c.createScriptProcessor(2048, 1, 1);
  src.connect(proc);
  const sink = sinkSilently(proc);
  proc.onaudioprocess = onBlock;
  eng.mic = { src, proc, sink };
  eng.settleUntil = c.currentTime + 0.3; // skip the click of the mic opening
  eng.pre = [];
  eng.hot = 0;
}

function closeMic(e = eng) {
  if (!e?.mic) return;
  const { src, proc, sink } = e.mic;
  proc.onaudioprocess = null;
  try { src.disconnect(); proc.disconnect(); sink.disconnect(); } catch {}
  e.mic = null;
  releaseMic();
}

function onBlock(ev) {
  const e = eng;
  if (!e?.mic) return;
  const x = new Float32Array(ev.inputBuffer.getChannelData(0));
  const c = getCtx();
  const dur = x.length / c.sampleRate;
  let s = 0;
  for (let i = 0; i < x.length; i++) s += x[i] * x[i];
  const db = 20 * Math.log10(Math.sqrt(s / x.length) + 1e-9);
  e.level = db;
  if (c.currentTime < e.settleUntil) return;

  if (e.state === 'listening') {
    // The noise floor drops quickly to quiet moments and creeps up slowly, so steady room
    // noise (HVAC, the next practice room) doesn't count as playing.
    e.floor = e.floor == null ? db : db < e.floor ? e.floor * 0.6 + db * 0.4 : e.floor * 0.995 + db * 0.005;
    const on = Math.max(e.floor + MARGIN[S.sens], -55);
    e.pre.push(x);
    while (e.pre.length * dur > PREROLL) e.pre.shift();
    e.hot = db > on ? e.hot + 1 : 0;
    if (e.hot >= 2) {
      e.cap = e.pre.slice();
      e.preCount = Math.max(0, e.cap.length - 2);
      e.lastLoud = e.cap.length;
      e.off = on - 6;
      e.quiet = 0;
      e.pre = [];
      setState('capturing');
    }
  } else if (e.state === 'capturing') {
    e.cap.push(x);
    if (db < e.off) e.quiet += dur;
    else { e.quiet = 0; e.lastLoud = e.cap.length; }
    if (e.quiet >= S.silence || e.cap.length * dur > 90) setTimeout(endPhrase, 0);
  }
}

function endPhrase() {
  const e = eng;
  if (!e || e.state !== 'capturing') return;
  const c = getCtx();
  const sr = c.sampleRate;
  const blockDur = 2048 / sr;
  const keepN = Math.min(e.cap.length, e.lastLoud + Math.ceil(0.35 / blockDur));
  const blocks = e.cap.slice(0, keepN);
  const active = (e.lastLoud - e.preCount) * blockDur;
  e.cap = null;
  if (active < 0.25) { e.pre = []; e.hot = 0; setState('listening'); return; } // a cough or a bump
  const pcm = new Float32Array(blocks.reduce((n, b) => n + b.length, 0));
  let o = 0;
  for (const b of blocks) { pcm.set(b, o); o += b.length; }
  // short fades so the cut points don't click
  const f = Math.min(256, pcm.length >> 2);
  for (let i = 0; i < f; i++) { pcm[i] *= i / f; pcm[pcm.length - 1 - i] *= i / f; }
  let peak = 0;
  for (let i = 0; i < pcm.length; i++) peak = Math.max(peak, Math.abs(pcm[i]));
  const ph = { id: `p${Date.now()}`, n: ++count, seconds: pcm.length / sr, pcm, peak, peaks: peaksOf(pcm, 48), blob: encodeWav(pcm, sr) };
  phrases.unshift(ph);
  if (phrases.length > MAX_PHRASES) phrases.length = MAX_PHRASES;
  e.made++;
  closeMic(e);
  renderPhrases();
  play(ph, S.repeats);
}

function manualPlay(ph) {
  if (eng) {
    if (eng.state === 'capturing') return; // don't interrupt a phrase in progress
    closeMic();
  }
  play(ph, 1);
}

function play(ph, times) {
  stopPlay();
  const c = getCtx();
  const url = URL.createObjectURL(ph.blob);
  const a = new Audio(url);
  a.preservesPitch = true;
  a.webkitPreservesPitch = true;
  const src = c.createMediaElementSource(a);
  const ch = fxChain(src, boostFor(ph.peak));
  let left = times;
  playing = { a, url, ch, ph };
  const label = () => `Phrase ${ph.n}${times > 1 ? ` · ${times - left + 1} of ${times}` : ''}${S.speed !== 1 ? ` · ${S.speed}×` : ''}`;
  setState('playing', label());
  renderPhrases();
  a.addEventListener('loadedmetadata', () => { a.playbackRate = S.speed; });
  a.addEventListener('ended', () => {
    if (playing?.a !== a) return;
    if (--left > 0) {
      setState('playing', label());
      a.currentTime = 0;
      a.play();
    } else {
      const tail = ch.tail;
      setTimeout(() => { if (playing?.a === a) { stopPlay(); afterPlayback(0); } }, tail * 1000);
      if (eng) setState('waiting');
    }
  });
  a.playbackRate = S.speed;
  a.play().catch(() => { toast('Tap the phrase to play it'); stopPlay(); afterPlayback(0); });
  if (!raf && eng) loop();
}

function stopPlay() {
  if (!playing) return;
  const p = playing;
  playing = null;
  p.a.pause();
  p.ch.dispose();
  URL.revokeObjectURL(p.url);
  renderPhrases();
}

async function afterPlayback(gap = 0.25) {
  if (!eng) { renderPhrases(); return; }
  setState('waiting');
  await new Promise((r) => setTimeout(r, gap * 1000));
  if (!eng || playing) return;
  try {
    if (!eng.mic) await openMic();
    if (eng) setState('listening');
  } catch (e) {
    const err = $('.rp-err', el);
    if (err) { err.textContent = micErrorMessage(e); err.hidden = false; }
    stopSession();
  }
}

function loop() {
  cancelAnimationFrame(raf);
  const buf = new Float32Array(512);
  const tick = () => {
    if (!eng) { raf = 0; return; }
    raf = requestAnimationFrame(tick);
    let lv = 0;
    if (playing) {
      playing.ch.an.getFloatTimeDomainData(buf);
      let s = 0;
      for (const v of buf) s += v * v;
      lv = Math.sqrt(s / buf.length) * 4;
    } else if (eng.mic) {
      lv = (eng.level + 60) / 50;
    }
    const orb = el && $('.rp-orb', el);
    if (orb) orb.style.setProperty('--lv', Math.max(0, Math.min(1, lv)).toFixed(3));
    if (eng.state === 'capturing' && eng.cap && el) {
      $('.rp-small', el).textContent = `${fmtClock(eng.cap.length * 2048 / getCtx().sampleRate)} · stop playing to hear it back`;
    }
  };
  tick();
}

/** Leaving the Record screen ends the session and frees the mic. */
export function hideReplay() {
  stopSession();
  stopPlay();
}
