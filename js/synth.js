// Small synthesized instruments for backing tracks. Each play() takes (midi, time, dur, vel, dest).
import { getCtx, getNoise, midiToFreq, getA4 } from './audio.js';

function adsr(param, t, dur, { a = 0.005, d = 0.2, s = 0.5, r = 0.15, peak = 1 }) {
  param.cancelScheduledValues(t);
  param.setValueAtTime(0.0001, t);
  param.linearRampToValueAtTime(peak, t + a);
  param.setTargetAtTime(peak * s, t + a, d / 3);
  const end = t + Math.max(dur, a + 0.01);
  param.setTargetAtTime(0.0001, end, r / 4);
  return end + r * 1.5;
}

const curveCache = {};
function drive(amount) {
  if (!curveCache[amount]) {
    const n = 2048, c = new Float32Array(n);
    for (let i = 0; i < n; i++) { const x = (i / (n - 1)) * 2 - 1; c[i] = Math.tanh(x * amount) / Math.tanh(amount); }
    curveCache[amount] = c;
  }
  return curveCache[amount];
}

function osc(type, freq, t, stop, detune = 0) {
  const o = getCtx().createOscillator();
  o.type = type;
  o.frequency.value = freq;
  o.detune.value = detune;
  o.start(t);
  o.stop(stop);
  return o;
}

export const INSTRUMENTS = {
  piano(m, t, dur, vel, dest) {
    const c = getCtx();
    const f = midiToFreq(m, getA4());
    const g = c.createGain();
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(Math.min(9000, f * 9 + 1200 * vel), t);
    lp.frequency.exponentialRampToValueAtTime(Math.max(300, f * 2), t + 1.2);
    // natural decay; releases when the key lifts
    const decay = 2.2 - Math.min(1.5, (m - 48) / 30);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.32 * vel, t + 0.004);
    g.gain.setTargetAtTime(0.0001, t + 0.004, decay / 3);
    g.gain.setTargetAtTime(0.0001, t + dur, 0.06);
    const stop = t + dur + 0.4;
    const o1 = osc('triangle', f, t, stop);
    const o2 = osc('sine', f * 2, t, stop, 3);
    const o3 = osc('sawtooth', f, t, stop, -4);
    const g2 = c.createGain(); g2.gain.value = 0.35;
    const g3 = c.createGain(); g3.gain.value = 0.12;
    o1.connect(lp); o2.connect(g2).connect(lp); o3.connect(g3).connect(lp);
    lp.connect(g).connect(dest);
  },
  epiano(m, t, dur, vel, dest) {
    const c = getCtx();
    const f = midiToFreq(m, getA4());
    const stop = t + dur + 0.6;
    const car = osc('sine', f, t, stop);
    const mod = osc('sine', f, t, stop);
    const mg = c.createGain();
    mg.gain.setValueAtTime(f * (1.2 + vel), t);
    mg.gain.exponentialRampToValueAtTime(f * 0.15, t + 0.6);
    mod.connect(mg).connect(car.frequency);
    const tine = osc('sine', f * 7.1, t, t + 0.2);
    const tg = c.createGain();
    tg.gain.setValueAtTime(0.06 * vel, t);
    tg.gain.exponentialRampToValueAtTime(0.0001, t + 0.15);
    tine.connect(tg).connect(dest);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.3 * vel, t + 0.005);
    g.gain.setTargetAtTime(0.0001, t + 0.005, 1.1);
    g.gain.setTargetAtTime(0.0001, t + dur, 0.08);
    car.connect(g).connect(dest);
  },
  organ(m, t, dur, vel, dest) {
    const c = getCtx();
    const f = midiToFreq(m, getA4());
    const g = c.createGain();
    const stop = adsr(g.gain, t, dur, { a: 0.01, d: 0.05, s: 0.9, r: 0.06, peak: 0.12 * vel });
    [[1, 1], [2, 0.7], [3, 0.4], [4, 0.3], [0.5, 0.5]].forEach(([k, a]) => {
      const o = osc('sine', f * k, t, stop);
      const og = c.createGain(); og.gain.value = a;
      o.connect(og).connect(g);
    });
    g.connect(dest);
  },
  pad(m, t, dur, vel, dest) {
    const c = getCtx();
    const f = midiToFreq(m, getA4());
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 1400;
    lp.Q.value = 0.5;
    const g = c.createGain();
    const stop = adsr(g.gain, t, dur, { a: 0.35, d: 0.5, s: 0.85, r: 0.7, peak: 0.07 * vel });
    [-8, 8].forEach((d) => osc('sawtooth', f, t, stop, d).connect(lp));
    lp.connect(g).connect(dest);
  },
  stab(m, t, dur, vel, dest) {
    const c = getCtx();
    const f = midiToFreq(m, getA4());
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.Q.value = 4;
    lp.frequency.setValueAtTime(4000, t);
    lp.frequency.exponentialRampToValueAtTime(500, t + 0.18);
    const g = c.createGain();
    const stop = adsr(g.gain, t, Math.min(dur, 0.15), { a: 0.003, d: 0.12, s: 0.2, r: 0.08, peak: 0.12 * vel });
    [-10, 0, 10].forEach((d) => osc('sawtooth', f, t, stop, d).connect(lp));
    lp.connect(g).connect(dest);
  },
  clav(m, t, dur, vel, dest) {
    const c = getCtx();
    const f = midiToFreq(m, getA4());
    const hp = c.createBiquadFilter();
    hp.type = 'bandpass';
    hp.frequency.value = f * 4;
    hp.Q.value = 1.2;
    const g = c.createGain();
    const stop = adsr(g.gain, t, Math.min(dur, 0.12), { a: 0.002, d: 0.1, s: 0.3, r: 0.04, peak: 0.5 * vel });
    osc('square', f, t, stop).connect(hp);
    osc('sawtooth', f * 2, t, stop, 5).connect(hp);
    hp.connect(g).connect(dest);
  },
  pluck(m, t, dur, vel, dest) { // nylon guitar-ish
    const c = getCtx();
    const f = midiToFreq(m, getA4());
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(f * 6, t);
    lp.frequency.exponentialRampToValueAtTime(f * 1.5, t + 0.4);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.28 * vel, t + 0.003);
    g.gain.setTargetAtTime(0.0001, t + 0.003, 0.35);
    g.gain.setTargetAtTime(0.0001, t + dur, 0.05);
    const stop = t + dur + 0.3;
    osc('triangle', f, t, stop).connect(lp);
    const s = osc('sawtooth', f, t, stop, 4);
    const sg = c.createGain(); sg.gain.value = 0.3;
    s.connect(sg).connect(lp);
    lp.connect(g).connect(dest);
  },
  strum(m, t, dur, vel, dest) { // bright steel-string / vihuela
    const c = getCtx();
    const f = midiToFreq(m, getA4());
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(f * 10, t);
    lp.frequency.exponentialRampToValueAtTime(f * 2, t + 0.25);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.18 * vel, t + 0.002);
    g.gain.setTargetAtTime(0.0001, t + 0.002, 0.18);
    g.gain.setTargetAtTime(0.0001, t + dur, 0.04);
    osc('sawtooth', f, t, t + dur + 0.3).connect(lp);
    lp.connect(g).connect(dest);
  },
  power(m, t, dur, vel, dest) { // overdriven guitar
    const c = getCtx();
    const f = midiToFreq(m, getA4());
    const ws = c.createWaveShaper();
    ws.curve = drive(6);
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 2600;
    const g = c.createGain();
    const stop = adsr(g.gain, t, dur, { a: 0.004, d: 0.3, s: 0.6, r: 0.08, peak: 0.06 * vel });
    [-7, 7].forEach((d) => osc('sawtooth', f, t, stop, d).connect(ws));
    ws.connect(lp).connect(g).connect(dest);
  },
  chop(m, t, dur, vel, dest) { // reggae skank
    const c = getCtx();
    const f = midiToFreq(m, getA4());
    const bp = c.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 1800;
    bp.Q.value = 0.9;
    const g = c.createGain();
    const stop = adsr(g.gain, t, 0.07, { a: 0.002, d: 0.06, s: 0.2, r: 0.04, peak: 0.45 * vel });
    osc('sawtooth', f, t, stop).connect(bp);
    bp.connect(g).connect(dest);
  },
  // ----- basses -----
  ebass(m, t, dur, vel, dest) {
    const c = getCtx();
    const f = midiToFreq(m, getA4());
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.Q.value = 2;
    lp.frequency.setValueAtTime(f * 8 + 400, t);
    lp.frequency.exponentialRampToValueAtTime(f * 2.5, t + 0.25);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.55 * vel, t + 0.006);
    g.gain.setTargetAtTime(0.32 * vel, t + 0.006, 0.25);
    g.gain.setTargetAtTime(0.0001, t + dur * 0.95, 0.03);
    const stop = t + dur + 0.2;
    osc('sawtooth', f, t, stop).connect(lp);
    const s = osc('sine', f, t, stop);
    const sg = c.createGain(); sg.gain.value = 0.8;
    s.connect(sg).connect(g);
    lp.connect(g).connect(dest);
  },
  upright(m, t, dur, vel, dest) {
    const c = getCtx();
    const f = midiToFreq(m, getA4());
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(f * 5, t);
    lp.frequency.exponentialRampToValueAtTime(f * 1.8, t + 0.15);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.7 * vel, t + 0.008);
    g.gain.setTargetAtTime(0.0001, t + 0.008, 0.35);
    g.gain.setTargetAtTime(0.0001, t + dur * 0.9, 0.04);
    const stop = t + dur + 0.3;
    osc('triangle', f, t, stop).connect(lp);
    osc('sine', f, t, stop).connect(lp);
    lp.connect(g).connect(dest);
    // finger "thump"
    const n = c.createBufferSource();
    n.buffer = getNoise();
    const nf = c.createBiquadFilter(); nf.type = 'lowpass'; nf.frequency.value = 400;
    const ng = c.createGain();
    ng.gain.setValueAtTime(0.25 * vel, t);
    ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.04);
    n.connect(nf).connect(ng).connect(dest);
    n.start(t, Math.random()); n.stop(t + 0.05);
  },
  synthbass(m, t, dur, vel, dest) {
    const c = getCtx();
    const f = midiToFreq(m, getA4());
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.Q.value = 6;
    lp.frequency.setValueAtTime(f * 12, t);
    lp.frequency.exponentialRampToValueAtTime(f * 2, t + 0.15);
    const g = c.createGain();
    const stop = adsr(g.gain, t, dur, { a: 0.003, d: 0.15, s: 0.6, r: 0.05, peak: 0.4 * vel });
    osc('square', f, t, stop).connect(lp);
    osc('sawtooth', f, t, stop, 7).connect(lp);
    lp.connect(g).connect(dest);
  },
  sub808(m, t, dur, vel, dest) {
    const c = getCtx();
    const f = midiToFreq(m, getA4());
    const o = c.createOscillator();
    o.frequency.setValueAtTime(f * 1.5, t);
    o.frequency.exponentialRampToValueAtTime(f, t + 0.06);
    const ws = c.createWaveShaper(); ws.curve = drive(2);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.7 * vel, t + 0.005);
    g.gain.setTargetAtTime(0.0001, t + Math.max(0.1, dur - 0.05), 0.08);
    o.connect(ws).connect(g).connect(dest);
    o.start(t); o.stop(t + dur + 0.4);
  },
};
