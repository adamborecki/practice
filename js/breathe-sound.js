// Sound for the Breathe screen. Everything follows the breath on the audio clock:
// each phase (in / out) schedules smooth parameter curves for its whole duration.
//
// - Ocean: filtered noise. Breathing in, a wave rolls in (louder, brighter);
//   breathing out, it breaks (a little foam) and washes back out (quieter, darker).
// - Chords: a soft sine pad that rests on one consonant chord and lifts to a second
//   on the in-breath — D major over a D pedal, rising to G/D (a plagal "amen" motion),
//   with slow chorus and a concert-hall reverb.
// - Tone: the original single sine glide.
import { getCtx, getMaster } from './audio.js';
import { hallImpulse } from './replay.js';

export const SOUNDS = [
  ['ocean', '🌊 Ocean waves'],
  ['chords', '🎶 Gentle chords'],
  ['both', 'Ocean + chords'],
  ['tone', 'Simple tone'],
  ['off', 'Silent'],
];

const midiHz = (m) => 440 * Math.pow(2, (m - 69) / 12);
// [rest chord (end of out-breath), lifted chord (top of in-breath)]
const VOICES = [
  [50, 50], // D3 pedal
  [57, 59], // A3 → B3
  [66, 67], // F♯4 → G4
  [69, 71], // A4 → B4
  [76, 74], // E5 → D5 (a soft add9 that resolves)
];

/** Smooth (raised-cosine) move of an AudioParam from its value at t0 to `to` over dur. */
function glide(param, to, t0, dur, from) {
  if (param.cancelAndHoldAtTime) param.cancelAndHoldAtTime(t0);
  else { param.cancelScheduledValues(t0); param.setValueAtTime(param.value, t0); }
  const start = from ?? param.value;
  const n = Math.max(4, Math.round(dur * 8));
  for (let i = 1; i <= n; i++) {
    const x = i / n;
    const k = 0.5 - 0.5 * Math.cos(Math.PI * x);
    param.linearRampToValueAtTime(start + (to - start) * k, t0 + dur * x);
  }
}

let noiseBufs = null;
function noise(c) {
  if (noiseBufs) return noiseBufs;
  noiseBufs = [0, 1].map(() => {
    const b = c.createBuffer(1, c.sampleRate * 3, c.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return b;
  });
  return noiseBufs;
}

function makeOcean(c, out) {
  const nodes = [];
  const add = (n) => { nodes.push(n); return n; };
  const merger = add(c.createChannelMerger(2));
  const srcs = noise(c).map((buf, ch) => {
    const s = add(c.createBufferSource());
    s.buffer = buf;
    s.loop = true;
    s.loopStart = Math.random();
    s.connect(merger, 0, ch);
    s.start();
    return s;
  });
  // body: the rolling water (two low-pass stages for a soft, deep roar)
  const lp1 = add(c.createBiquadFilter()); lp1.type = 'lowpass'; lp1.Q.value = 0.4; lp1.frequency.value = 300;
  const lp2 = add(c.createBiquadFilter()); lp2.type = 'lowpass'; lp2.Q.value = 0.4; lp2.frequency.value = 300;
  const body = add(c.createGain()); body.gain.value = 0;
  merger.connect(lp1).connect(lp2).connect(body).connect(out);
  // a slow drift so the sea never sounds static
  const lfo = add(c.createOscillator()); lfo.frequency.value = 0.07;
  const lfoAmt = add(c.createGain()); lfoAmt.gain.value = 70;
  lfo.connect(lfoAmt); lfoAmt.connect(lp1.frequency); lfoAmt.connect(lp2.frequency);
  lfo.start();
  // foam: the hiss as the wave breaks
  const bp = add(c.createBiquadFilter()); bp.type = 'bandpass'; bp.frequency.value = 3800; bp.Q.value = 0.7;
  const foam = add(c.createGain()); foam.gain.value = 0;
  merger.connect(bp).connect(foam).connect(out);
  return {
    phase(inhaling, dur, t0) {
      if (inhaling) {
        glide(body.gain, 0.4, t0, dur);
        glide(lp1.frequency, 1250, t0, dur);
        glide(lp2.frequency, 1250, t0, dur);
        glide(foam.gain, 0.012, t0, dur);
      } else {
        glide(body.gain, 0.09, t0, dur);
        glide(lp1.frequency, 240, t0, dur);
        glide(lp2.frequency, 240, t0, dur);
        // the wave breaks: a burst of foam that fizzles out
        glide(foam.gain, 0.05, t0, Math.min(0.9, dur * 0.2));
        glide(foam.gain, 0, t0 + Math.min(0.9, dur * 0.2), dur * 0.7, 0.05);
      }
    },
    stop(t) { srcs.forEach((s) => s.stop(t)); lfo.stop(t); },
    nodes,
  };
}

function makeChords(c, out) {
  const nodes = [];
  const add = (n) => { nodes.push(n); return n; };
  const lp = add(c.createBiquadFilter()); lp.type = 'lowpass'; lp.frequency.value = 2200; lp.Q.value = 0.3;
  const sum = add(c.createGain()); sum.gain.value = 0;
  const dry = add(c.createGain()); dry.gain.value = 0.75;
  const wet = add(c.createGain()); wet.gain.value = 0.55;
  const cv = add(c.createConvolver()); cv.buffer = hallImpulse();
  sum.connect(lp);
  lp.connect(dry).connect(out);
  lp.connect(cv).connect(wet).connect(out);
  const LEVELS = [0.5, 0.32, 0.26, 0.2, 0.09];
  const oscs = [];
  VOICES.forEach(([rest], i) => {
    // two slightly detuned sines per note: a slow, gentle shimmer
    for (const cents of [-3, 3]) {
      const o = add(c.createOscillator());
      o.type = 'sine';
      o.frequency.value = midiHz(rest);
      o.detune.value = cents;
      const g = add(c.createGain());
      g.gain.value = LEVELS[i] * 0.5;
      o.connect(g).connect(sum);
      o.start();
      oscs.push({ o, voice: i });
    }
  });
  return {
    phase(inhaling, dur, t0) {
      const g = Math.min(2.2, dur * 0.45); // how long the chord change takes
      for (const { o, voice } of oscs) {
        const [rest, lift] = VOICES[voice];
        glide(o.frequency, midiHz(inhaling ? lift : rest), t0, g);
      }
      // swell on the way in, settle on the way out
      glide(sum.gain, inhaling ? 0.16 : 0.07, t0, dur);
      glide(lp.frequency, inhaling ? 3200 : 1500, t0, dur);
    },
    stop(t) { oscs.forEach(({ o }) => o.stop(t)); },
    nodes,
  };
}

function makeTone(c, out) {
  return {
    phase(inhaling, dur, t0) {
      const o = c.createOscillator();
      const g = c.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(inhaling ? 196 : 293.66, t0);
      o.frequency.linearRampToValueAtTime(inhaling ? 293.66 : 196, t0 + dur);
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.linearRampToValueAtTime(0.06, t0 + 0.6);
      g.gain.setValueAtTime(0.06, t0 + dur - 0.6);
      g.gain.linearRampToValueAtTime(0.0001, t0 + dur);
      o.connect(g).connect(out);
      o.start(t0);
      o.stop(t0 + dur + 0.05);
    },
    stop() {},
    nodes: [],
  };
}

/** Start a soundscape. Returns { phase(inhaling, seconds), setVolume(v), stop() }. */
export function startSound(kind, volume = 0.8) {
  if (kind === 'off') return null;
  const c = getCtx();
  const out = c.createGain();
  out.gain.value = 0;
  out.connect(getMaster());
  const t = c.currentTime;
  glide(out.gain, volume, t, 2, 0); // fade in
  const parts = [];
  if (kind === 'ocean' || kind === 'both') parts.push(makeOcean(c, out));
  if (kind === 'chords' || kind === 'both') parts.push(makeChords(c, out));
  if (kind === 'tone') parts.push(makeTone(c, out));
  return {
    phase(inhaling, dur) {
      const t0 = getCtx().currentTime + 0.02;
      parts.forEach((p) => p.phase(inhaling, dur, t0));
    },
    setVolume(v) { out.gain.setTargetAtTime(v, getCtx().currentTime, 0.1); },
    stop(fade = 1.5) {
      const t0 = getCtx().currentTime;
      glide(out.gain, 0, t0, fade);
      parts.forEach((p) => p.stop(t0 + fade + 0.1));
      setTimeout(() => {
        out.disconnect();
        parts.forEach((p) => p.nodes.forEach((n) => { try { n.disconnect(); } catch {} }));
      }, (fade + 0.3) * 1000);
    },
  };
}
