// Instant replay: the app listens, captures each phrase you play, and when the mic hears
// a short stretch of silence it plays that phrase straight back — the "play it, hear it"
// loop teachers use in lessons. Every phrase is kept so you can compare attempts or save one.
//
// iPhone notes
// - Playback goes through Web Audio (AudioBufferSource), not an <audio> element. iOS only
//   lets <audio> start from a tap, so an automatic replay would be blocked; a Web Audio
//   context that was unlocked by the Start tap can play at any time.
// - The mic stays open for the whole session. Re-opening it between phrases switches the
//   iOS audio session back and forth, which can interrupt playback or re-prompt.
// - While a phrase plays back, mic input is ignored so the speaker doesn't trigger a new
//   phrase. With headphones you can turn that off and keep playing over the replay.
import { getCtx, getMaster, acquireMic, releaseMic, micErrorMessage, sinkSilently } from './audio.js';
import { recordings, addLog, load, save } from './store.js';
import { $, $$, fmtClock, keepAwake, toast, icon } from './ui.js';

const S = load('replay', { silence: 1.5, sens: 'med', speed: 1, repeats: 1, reverb: false, headphones: false });
if (typeof S.reverb !== 'boolean') S.reverb = S.reverb && S.reverb !== 'off';
const persist = () => save('replay', S);

const HALL = { secs: 2.6, decay: 2.6, pre: 0.022 };
// dB above the room's noise floor a sound must reach to count as playing
const MARGIN = { low: 18, med: 12, high: 7 };
const MAX_PHRASES = 20;
const PREROLL = 0.35; // seconds kept from before the trigger so the attack isn't clipped
const BLOCK = 2048;

let el = null;
let onSavedCb = () => {};
let eng = null; // running session
let playing = null; // { ph, srcs, nodes, timers, until }
let phrases = [];
let count = 0;
let raf = 0;

// ---------- audio helpers (also used for take playback) ----------

/** Gain that brings a quiet recording up to a healthy level (capped at +18 dB). */
export function boostFor(peak) {
  if (!(peak > 0)) return 1;
  return Math.min(8, Math.max(1, 0.89 / peak));
}

/** 16-bit mono WAV — what a saved phrase is stored as. */
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

/**
 * Slow down without changing pitch (WSOLA: overlap-add of short windows, each nudged to
 * line up with the waveform of the previous one so the sound stays smooth).
 */
export function timeStretch(x, rate, sr) {
  if (rate === 1) return x;
  let N = 1024;
  while (N < sr * 0.04) N *= 2; // ~40 ms frames
  const Hs = N / 2;
  const Ha = Hs * rate;
  const tol = Math.round(sr * 0.01);
  const win = new Float32Array(N);
  for (let j = 0; j < N; j++) win[j] = 0.5 - 0.5 * Math.cos((2 * Math.PI * j) / N);
  const y = new Float32Array(Math.ceil(x.length / rate) + 2 * N);
  let prev = 0;
  let k = 0;
  for (; ; k++) {
    const nominal = Math.round(k * Ha);
    if (nominal + N >= x.length) break;
    let best = nominal;
    if (k > 0) {
      const target = prev + Hs;
      let bestC = -Infinity;
      const lo = Math.max(0, nominal - tol);
      const hi = Math.min(x.length - N - 1, nominal + tol);
      if (target + Hs < x.length) {
        for (let p = lo; p <= hi; p += 2) {
          let c = 0;
          for (let j = 0; j < Hs; j += 4) c += x[p + j] * x[target + j];
          if (c > bestC) { bestC = c; best = p; }
        }
      }
    }
    const o = k * Hs;
    for (let j = 0; j < N; j++) y[o + j] += x[best + j] * win[j];
    prev = best;
  }
  return y.subarray(0, k * Hs + N);
}

// Synthetic concert-hall reverb: decaying stereo noise that gets darker as it decays.
let hallIR = null;
function impulse() {
  if (hallIR) return hallIR;
  const c = getCtx();
  const len = Math.floor(c.sampleRate * HALL.secs);
  const pre = Math.floor(c.sampleRate * HALL.pre);
  const buf = c.createBuffer(2, len + pre, c.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    let y = 0;
    for (let i = 0; i < len; i++) {
      const t = i / len;
      y += (0.85 - 0.7 * t) * ((Math.random() * 2 - 1) - y);
      d[i + pre] = y * Math.pow(1 - t, HALL.decay);
    }
  }
  hallIR = buf;
  return buf;
}

// ---------- UI ----------

const opt = (v, n, cur) => `<option value="${v}" ${String(cur) === String(v) ? 'selected' : ''}>${n}</option>`;

export function mountReplay(root, onSaved) {
  el = root;
  onSavedCb = onSaved || onSavedCb;
  root.innerHTML = `
    <div class="card rp-card" data-state="idle">
      <div class="rp-orb" aria-hidden="true"><i></i></div>
      <div class="rp-status" aria-live="polite"><b class="rp-big">Ready</b><small class="rp-small"></small></div>
      <button class="btn primary big wide rp-go">${icon('mic')}<span>Start listening</span></button>
      <button class="btn wide rp-unlock" hidden>Tap to turn on playback sound</button>
      <p class="rp-err err" hidden></p>
      <div class="rp-settings">
        <label class="field"><span>Silence before replay</span><select class="rp-silence">${[[1, '1 second'], [1.5, '1.5 seconds'], [2, '2 seconds'], [3, '3 seconds']].map(([v, n]) => opt(v, n, S.silence)).join('')}</select></label>
        <label class="field"><span>Hear it</span><select class="rp-rep">${[[1, 'Once'], [2, 'Twice'], [3, '3 times']].map(([v, n]) => opt(v, n, S.repeats)).join('')}</select></label>
        <label class="field"><span>Speed</span><select class="rp-speed">${[[1, 'Normal'], [0.75, '¾ speed'], [0.5, '½ speed']].map(([v, n]) => opt(v, n, S.speed)).join('')}</select></label>
        <label class="field"><span>Reverb</span><select class="rp-reverb">${opt('0', 'Off', S.reverb ? 1 : 0)}${opt('1', 'Concert hall', S.reverb ? 1 : 0)}</select></label>
        <label class="field"><span>Sensitivity</span><select class="rp-sens">${[['low', 'Low (loud)'], ['med', 'Medium'], ['high', 'High (soft)']].map(([v, n]) => opt(v, n, S.sens)).join('')}</select></label>
        <label class="field"><span>Listening</span><select class="rp-hp">${opt('0', 'Phone speaker', S.headphones ? 1 : 0)}${opt('1', 'Headphones', S.headphones ? 1 : 0)}</select></label>
      </div>
      <p class="hint rp-hint"></p>
    </div>
    <div class="rp-phrases"></div>`;

  $('.rp-go', root).addEventListener('click', () => (eng ? stopSession() : startSession()));
  $('.rp-unlock', root).addEventListener('click', unlockAudio);
  const num = (cls, key) => $(cls, root).addEventListener('change', (e) => { S[key] = Number(e.target.value); persist(); setState(eng ? eng.state : 'idle'); });
  num('.rp-silence', 'silence');
  num('.rp-rep', 'repeats');
  num('.rp-speed', 'speed');
  $('.rp-sens', root).addEventListener('change', (e) => { S.sens = e.target.value; persist(); });
  $('.rp-reverb', root).addEventListener('change', (e) => { S.reverb = e.target.value === '1'; persist(); });
  $('.rp-hp', root).addEventListener('change', (e) => { S.headphones = e.target.value === '1'; persist(); renderHint(); });
  renderPhrases();
  renderHint();
  setState(eng ? eng.state : 'idle');
}

function renderHint() {
  const h = el && $('.rp-hint', el);
  if (!h) return;
  h.innerHTML = S.headphones
    ? '<b>Headphones:</b> the mic keeps listening during playback, so you can play your next phrase over the replay.'
    : 'The mic ignores sound while a phrase plays back, so the speaker doesn’t trigger a new one. Slower speeds keep the same pitch. Use <b>Low</b> sensitivity for brass, drums or loud rooms.';
}

function statusFor(st) {
  const sil = `${S.silence} second${S.silence === 1 ? '' : 's'}`;
  switch (st) {
    case 'starting': return ['Opening the mic…', ''];
    case 'listening': return ['Listening…', `Start playing. When the mic detects ${sil} of silence, it plays back what you just recorded.`];
    case 'capturing': return ['Recording', 'When the mic detects silence, it’ll play back what you just recorded.'];
    case 'playing': return ['Playing back', ''];
    case 'waiting': return ['Listening again…', ''];
    default: return ['Ready', `Tap Start and play a phrase. When the mic detects ${sil} of silence, it plays back what you just recorded.`];
  }
}

function setState(st, small) {
  if (eng) eng.state = st;
  if (!el) return;
  const card = $('.rp-card', el);
  if (!card) return;
  card.dataset.state = st;
  const [big, sm] = statusFor(st);
  $('.rp-big', el).textContent = big;
  $('.rp-small', el).textContent = small ?? sm;
  const running = !!eng;
  const go = $('.rp-go', el);
  go.innerHTML = running ? `${icon('stop')}<span>Stop</span>` : `${icon('mic')}<span>Start listening</span>`;
  go.classList.toggle('primary', !running);
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
  $('.rp-clear', box).addEventListener('click', () => { stopPlay(); phrases = []; renderPhrases(); if (eng) setState('listening'); });
  $$('.phrase', box).forEach((row) => {
    const p = phrases.find((x) => x.id === row.dataset.ph);
    $('.ph-play', row).addEventListener('click', () => {
      unlockAudio();
      if (playing?.ph === p) { stopPlay(); backToListening(); return; }
      if (eng?.state === 'capturing') return;
      play(p, 1);
    });
    $('.ph-keep', row).addEventListener('click', () => keep(p));
  });
}

async function keep(p) {
  const sr = p.sr;
  const rec = {
    id: `r${Date.now()}`,
    created: Date.now(),
    name: `Replay phrase ${p.n}`,
    seconds: p.seconds,
    type: 'audio/wav',
    blob: encodeWav(p.pcm, sr),
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

// ---------- making sure sound can play (iOS) ----------

function unlockAudio() {
  const c = getCtx();
  // a silent buffer started inside a tap is what unlocks iOS Web Audio
  const b = c.createBufferSource();
  b.buffer = c.createBuffer(1, 1, c.sampleRate);
  b.connect(c.destination);
  b.start(0);
  if (c.state !== 'running') c.resume().catch(() => {});
  setTimeout(checkAudio, 250);
}

function checkAudio() {
  const btn = el && $('.rp-unlock', el);
  if (!btn) return;
  btn.hidden = !eng || getCtx().state === 'running';
}

// ---------- the listening engine ----------

async function startSession() {
  $('.rp-err', el).hidden = true;
  unlockAudio(); // must happen synchronously inside the tap
  eng = { state: 'starting', mic: null, started: Date.now(), floor: null, pre: [], cap: null, hot: 0, quiet: 0, level: -100, made: 0, gateUntil: 0 };
  setState('starting');
  keepAwake('replay', true);
  try {
    const stream = await acquireMic();
    if (!eng) { releaseMic(); return; }
    const c = getCtx();
    if (c.state !== 'running') await c.resume().catch(() => {});
    const src = c.createMediaStreamSource(stream);
    const proc = c.createScriptProcessor(BLOCK, 1, 1);
    src.connect(proc);
    const sink = sinkSilently(proc);
    proc.onaudioprocess = onBlock;
    eng.mic = { src, proc, sink };
    eng.gateUntil = c.currentTime + 0.3; // skip the click of the mic opening
    setState('listening');
    setTimeout(checkAudio, 400);
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
  raf = 0;
  if (e.mic) {
    const { src, proc, sink } = e.mic;
    proc.onaudioprocess = null;
    try { src.disconnect(); proc.disconnect(); sink.disconnect(); } catch {}
    releaseMic();
  }
  stopPlay();
  keepAwake('replay', false);
  if (e.made) addLog({ kind: 'recording', label: `Instant replay — ${e.made} phrase${e.made === 1 ? '' : 's'}`, seconds: Math.round((Date.now() - e.started) / 1000) });
  if (el) { setState('idle'); $('.rp-orb', el)?.style.setProperty('--lv', 0); $('.rp-unlock', el).hidden = true; }
}

function onBlock(ev) {
  const e = eng;
  if (!e?.mic) return;
  const c = getCtx();
  const x = new Float32Array(ev.inputBuffer.getChannelData(0));
  const dur = x.length / c.sampleRate;
  let s = 0;
  for (let i = 0; i < x.length; i++) s += x[i] * x[i];
  const db = 20 * Math.log10(Math.sqrt(s / x.length) + 1e-9);
  e.level = db;
  // ignore the speaker while a phrase (and its reverb) plays, plus a short margin
  if (c.currentTime < e.gateUntil) return;
  if (playing && !S.headphones) return;

  if (e.state === 'listening' || e.state === 'waiting' || (e.state === 'playing' && S.headphones)) {
    if (e.state === 'waiting') setState('listening');
    // The noise floor drops quickly to quiet moments and creeps up slowly, so steady room
    // noise (air conditioning, the next practice room) doesn't count as playing.
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
      e.state = 'capturing';
      if (!playing) setState('capturing');
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
  if (!e || e.state !== 'capturing' || !e.cap) return;
  const c = getCtx();
  const sr = c.sampleRate;
  const blockDur = BLOCK / sr;
  const keepN = Math.min(e.cap.length, e.lastLoud + Math.ceil(0.35 / blockDur));
  const blocks = e.cap.slice(0, keepN);
  const active = (e.lastLoud - e.preCount) * blockDur;
  e.cap = null;
  e.pre = [];
  e.hot = 0;
  e.state = 'listening';
  if (active < 0.25) { setState(playing ? 'playing' : 'listening'); return; } // a cough or a bump
  const pcm = new Float32Array(blocks.reduce((n, b) => n + b.length, 0));
  let o = 0;
  for (const b of blocks) { pcm.set(b, o); o += b.length; }
  // short fades so the cut points don't click
  const f = Math.min(256, pcm.length >> 2);
  for (let i = 0; i < f; i++) { pcm[i] *= i / f; pcm[pcm.length - 1 - i] *= i / f; }
  let peak = 0;
  for (let i = 0; i < pcm.length; i++) peak = Math.max(peak, Math.abs(pcm[i]));
  const ph = { id: `p${Date.now()}`, n: ++count, seconds: pcm.length / sr, sr, pcm, peak, peaks: peaksOf(pcm, 48), stretched: {} };
  phrases.unshift(ph);
  if (phrases.length > MAX_PHRASES) phrases.length = MAX_PHRASES;
  e.made++;
  renderPhrases();
  play(ph, S.repeats);
}

function bufferFor(ph) {
  const c = getCtx();
  const rate = S.speed;
  let data = ph.pcm;
  if (rate !== 1) data = ph.stretched[rate] ||= timeStretch(ph.pcm, rate, ph.sr);
  const buf = c.createBuffer(1, data.length, ph.sr);
  buf.copyToChannel(data, 0);
  return buf;
}

function play(ph, times) {
  stopPlay();
  const c = getCtx();
  if (c.state !== 'running') c.resume().catch(() => {});
  const buf = bufferFor(ph);
  const nodes = [];
  const out = c.createGain();
  out.gain.value = boostFor(ph.peak);
  nodes.push(out);
  const input = c.createGain();
  nodes.push(input);
  const dry = c.createGain();
  nodes.push(dry);
  input.connect(dry).connect(out);
  let tail = 0.12;
  if (S.reverb) {
    const cv = c.createConvolver();
    cv.buffer = impulse();
    const wet = c.createGain();
    wet.gain.value = 0.4;
    dry.gain.value = 0.85;
    input.connect(cv).connect(wet).connect(out);
    nodes.push(cv, wet);
    tail = HALL.secs * 0.8;
  }
  const an = c.createAnalyser();
  an.fftSize = 512;
  out.connect(an);
  out.connect(getMaster());
  nodes.push(an);
  const t0 = c.currentTime + 0.05;
  const srcs = [];
  for (let i = 0; i < times; i++) {
    const s = c.createBufferSource();
    s.buffer = buf;
    s.connect(input);
    s.start(t0 + i * buf.duration);
    srcs.push(s);
  }
  const end = t0 + times * buf.duration;
  const label = (i) => `Phrase ${ph.n}${times > 1 ? ` · ${i} of ${times}` : ''}${S.speed !== 1 ? ` · ${S.speed === 0.5 ? '½' : '¾'} speed` : ''}`;
  const timers = [];
  for (let i = 1; i < times; i++) timers.push(setTimeout(() => { if (playing?.ph === ph && eng?.state !== 'capturing') setState('playing', label(i + 1)); }, (t0 + i * buf.duration - c.currentTime) * 1000));
  timers.push(setTimeout(() => {
    if (playing?.ph !== ph) return;
    stopPlay(false);
    backToListening();
  }, (end + tail - c.currentTime) * 1000));
  playing = { ph, srcs, nodes, timers, an, end: end + tail };
  if (eng && !S.headphones) eng.gateUntil = Math.max(eng.gateUntil, end + tail + 0.35);
  if (!eng || eng.state !== 'capturing') setState('playing', label(1));
  renderPhrases();
  if (eng && !raf) loop();
}

function stopPlay(hard = true) {
  if (!playing) return;
  const p = playing;
  playing = null;
  p.timers.forEach(clearTimeout);
  if (hard) p.srcs.forEach((s) => { try { s.stop(); } catch {} });
  p.nodes.forEach((n) => { try { n.disconnect(); } catch {} });
  if (eng) eng.gateUntil = Math.min(eng.gateUntil, getCtx().currentTime + 0.35);
  renderPhrases();
}

function backToListening() {
  if (!eng) { setState('idle'); return; }
  if (eng.state === 'capturing') { setState('capturing'); return; }
  setState(getCtx().currentTime < eng.gateUntil ? 'waiting' : 'listening');
}

function loop() {
  cancelAnimationFrame(raf);
  const buf = new Float32Array(512);
  const tick = () => {
    if (!eng) { raf = 0; return; }
    raf = requestAnimationFrame(tick);
    let lv = 0;
    if (playing && !(eng.state === 'capturing')) {
      playing.an.getFloatTimeDomainData(buf);
      let s = 0;
      for (const v of buf) s += v * v;
      lv = Math.sqrt(s / buf.length) * 4;
    } else if (eng.mic) {
      lv = (eng.level + 60) / 50;
    }
    const orb = el && $('.rp-orb', el);
    if (orb) orb.style.setProperty('--lv', Math.max(0, Math.min(1, lv)).toFixed(3));
    if (eng.state === 'capturing' && eng.cap && el) {
      $('.rp-big', el).textContent = `Recording · ${fmtClock((eng.cap.length * BLOCK) / getCtx().sampleRate)}`;
    }
  };
  tick();
}

/** Leaving the Record screen ends the session and frees the mic. */
export function hideReplay() {
  stopSession();
  stopPlay();
}

/** The concert-hall impulse response, shared with the Breathe soundscape. */
export const hallImpulse = () => impulse();
