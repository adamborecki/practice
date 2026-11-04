// Shared Web Audio context + microphone access.
// One AudioContext for the whole app (iOS only allows a handful), resumed on a user gesture.

let ctx = null;
let master = null;

// Shared concert-pitch reference (set on the Tuner screen) so drones and backing tracks
// match a 442 orchestra or a 415 Baroque ensemble.
let a4Ref = 440;
try { a4Ref = JSON.parse(localStorage.getItem('pr.tuner'))?.a4 || 440; } catch {}
export const getA4 = () => a4Ref;
export const setA4 = (v) => { a4Ref = v; };

/**
 * iOS Safari mutes Web Audio when the ring/silent switch is on — a classic "the metronome
 * makes no sound" bug in practice rooms. The Audio Session API (Safari 16.4+) fixes it:
 * 'playback' ignores the silent switch; 'play-and-record' is needed while the mic is open.
 */
function setSession(type) {
  try { if (navigator.audioSession && navigator.audioSession.type !== type) navigator.audioSession.type = type; } catch {}
}

export function getCtx() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    ctx = new AC({ latencyHint: 'interactive' });
    master = ctx.createDynamicsCompressor();
    master.threshold.value = -10;
    master.knee.value = 6;
    master.ratio.value = 4;
    master.attack.value = 0.003;
    master.release.value = 0.15;
    master.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') ctx.resume();
  if (!micStream && !micPending) setSession('playback');
  return ctx;
}

/**
 * Keep an analysis-only node "pulled" by the audio graph. Older WebKit only runs nodes
 * that eventually reach the destination, so route through a silent gain.
 */
export function sinkSilently(node) {
  const c = getCtx();
  const z = c.createGain();
  z.gain.value = 0;
  node.connect(z).connect(c.destination);
  return z;
}

/** Final output bus (gentle limiter so stacked drums + chords don't clip). */
export function getMaster() {
  getCtx();
  return master;
}

// iOS Safari: unlock audio on the first touch anywhere.
const unlock = () => {
  const c = getCtx();
  const b = c.createBuffer(1, 1, c.sampleRate);
  const s = c.createBufferSource();
  s.buffer = b;
  s.connect(c.destination);
  s.start(0);
  window.removeEventListener('touchend', unlock, true);
  window.removeEventListener('click', unlock, true);
};
window.addEventListener('touchend', unlock, true);
window.addEventListener('click', unlock, true);

// --- Microphone (ref-counted so the tuner, dB meter and recorder can share one stream) ---
let micStream = null;
let micUsers = 0;
let micPending = null;

/**
 * Request the mic with all voice processing OFF: echo cancellation, noise suppression and
 * automatic gain control would wreck pitch detection and make dB readings meaningless.
 */
export async function acquireMic() {
  micUsers++;
  if (micStream) return micStream;
  if (!micPending) {
    setSession('play-and-record');
    if (!navigator.mediaDevices?.getUserMedia) {
      micUsers--;
      throw new Error('This browser does not allow microphone access. Open the app over https in Safari or Chrome.');
    }
    micPending = navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
        channelCount: 1,
      },
    }).then((s) => { micStream = s; return s; })
      .finally(() => { micPending = null; });
  }
  try {
    return await micPending;
  } catch (e) {
    micUsers = Math.max(0, micUsers - 1);
    throw e;
  }
}

export function releaseMic() {
  micUsers = Math.max(0, micUsers - 1);
  if (micUsers === 0 && micStream) {
    // Fully stopping the tracks matters on iOS: while the mic is open, playback is ducked.
    micStream.getTracks().forEach((t) => t.stop());
    micStream = null;
    setSession('playback');
  }
}

export function micErrorMessage(e) {
  if (!e) return 'Microphone unavailable.';
  if (e.name === 'NotAllowedError') return 'Microphone permission was denied. Allow it in your browser settings and try again.';
  if (e.name === 'NotFoundError') return 'No microphone was found on this device.';
  return e.message || String(e);
}

// --- Pitch helpers shared by tuner, drones and the backing-track engine ---
export const NOTE_NAMES_SHARP = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];
export const NOTE_NAMES_FLAT = ['C', 'D♭', 'D', 'E♭', 'E', 'F', 'G♭', 'G', 'A♭', 'A', 'B♭', 'B'];

export function midiToFreq(m, a4 = 440) {
  return a4 * Math.pow(2, (m - 69) / 12);
}
export function freqToMidi(f, a4 = 440) {
  return 69 + 12 * Math.log2(f / a4);
}

/** Shared white-noise buffer for drums / effects. */
let noiseBuf = null;
export function getNoise() {
  const c = getCtx();
  if (!noiseBuf) {
    noiseBuf = c.createBuffer(1, c.sampleRate * 2, c.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  return noiseBuf;
}

/**
 * Lookahead scheduler (the "tale of two clocks" pattern): a worker ticks every 25 ms and we
 * schedule any notes falling within the next 120 ms on the precise audio clock.
 * A worker keeps ticking even when the main thread's timers get throttled.
 */
const workerSrc = `let id=null;onmessage=e=>{if(e.data==='start'){clearInterval(id);id=setInterval(()=>postMessage('tick'),25)}else{clearInterval(id);id=null}}`;
export function createTicker(onTick) {
  let worker = null;
  try {
    worker = new Worker(URL.createObjectURL(new Blob([workerSrc], { type: 'text/javascript' })));
    worker.onmessage = onTick;
  } catch {
    worker = null;
  }
  let fallback = null;
  return {
    start() {
      if (worker) worker.postMessage('start');
      else { clearInterval(fallback); fallback = setInterval(onTick, 25); }
    },
    stop() {
      if (worker) worker.postMessage('stop');
      clearInterval(fallback);
    },
  };
}
export const LOOKAHEAD = 0.12;

/** Gentle "ding" for timers and reminders. */
export function chime(kind = 'soft') {
  const c = getCtx();
  const t = c.currentTime + 0.02;
  const notes = kind === 'done' ? [72, 76, 79, 84] : kind === 'break' ? [79, 74] : [76, 83];
  notes.forEach((m, i) => {
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = 'sine';
    o.frequency.value = midiToFreq(m);
    const st = t + i * 0.16;
    g.gain.setValueAtTime(0, st);
    g.gain.linearRampToValueAtTime(0.25, st + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, st + 1.2);
    o.connect(g).connect(getMaster());
    o.start(st);
    o.stop(st + 1.3);
  });
  if (navigator.vibrate && navigator.userActivation?.hasBeenActive !== false) {
    try { navigator.vibrate([120, 80, 120]); } catch {}
  }
}
