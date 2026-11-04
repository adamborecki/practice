// Synthesized drum kit (no samples to download) + a library of groove patterns.
import { getCtx, getNoise } from './audio.js';

function env(g, t, peak, attack, decay) {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
}

function noise(t, dur) {
  const c = getCtx();
  const s = c.createBufferSource();
  s.buffer = getNoise();
  s.start(t, Math.random() * 1.5);
  s.stop(t + dur + 0.05);
  return s;
}

function filt(type, freq, q = 0.7) {
  const f = getCtx().createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  f.Q.value = q;
  return f;
}

/** Metallic tone from a bank of detuned squares (classic analog hi-hat/ride recipe). */
function metallic(t, dest, vel, decay, hp, base = 40) {
  const c = getCtx();
  const g = c.createGain();
  const bp = filt('bandpass', 10000, 0.5);
  const h = filt('highpass', hp, 0.7);
  [2, 3, 4.16, 5.43, 6.79, 8.21].forEach((r) => {
    const o = c.createOscillator();
    o.type = 'square';
    o.frequency.value = base * r * 2.1;
    o.connect(bp);
    o.start(t);
    o.stop(t + decay + 0.05);
  });
  bp.connect(h).connect(g).connect(dest);
  env(g, t, 0.28 * vel, 0.002, decay);
}

export const VOICES = {
  kick(t, dest, vel = 1) {
    const c = getCtx();
    const o = c.createOscillator();
    const g = c.createGain();
    o.frequency.setValueAtTime(160, t);
    o.frequency.exponentialRampToValueAtTime(48, t + 0.11);
    o.connect(g).connect(dest);
    env(g, t, 1.0 * vel, 0.003, 0.38);
    o.start(t);
    o.stop(t + 0.45);
    const n = noise(t, 0.02);
    const ng = c.createGain();
    n.connect(filt('highpass', 3000)).connect(ng).connect(dest);
    env(ng, t, 0.25 * vel, 0.001, 0.015);
  },
  snare(t, dest, vel = 1) {
    const c = getCtx();
    const n = noise(t, 0.22);
    const g = c.createGain();
    n.connect(filt('highpass', 1200)).connect(g).connect(dest);
    env(g, t, 0.55 * vel, 0.002, 0.18);
    const o = c.createOscillator();
    o.type = 'triangle';
    o.frequency.setValueAtTime(220, t);
    o.frequency.exponentialRampToValueAtTime(160, t + 0.08);
    const og = c.createGain();
    o.connect(og).connect(dest);
    env(og, t, 0.5 * vel, 0.002, 0.09);
    o.start(t);
    o.stop(t + 0.15);
  },
  clap(t, dest, vel = 1) {
    const c = getCtx();
    const n = noise(t, 0.3);
    const g = c.createGain();
    n.connect(filt('bandpass', 1400, 0.9)).connect(g).connect(dest);
    g.gain.setValueAtTime(0.0001, t);
    [0, 0.011, 0.022].forEach((d) => {
      g.gain.setValueAtTime(0.0001, t + d);
      g.gain.exponentialRampToValueAtTime(0.7 * vel, t + d + 0.002);
      g.gain.exponentialRampToValueAtTime(0.05, t + d + 0.01);
    });
    g.gain.exponentialRampToValueAtTime(0.6 * vel, t + 0.034);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
  },
  chh(t, dest, vel = 1) { metallic(t, dest, vel, 0.045, 7000); },
  ohh(t, dest, vel = 1) { metallic(t, dest, vel * 0.9, 0.32, 6500); },
  ride(t, dest, vel = 1) {
    metallic(t, dest, vel * 0.55, 0.9, 4500, 52);
    const c = getCtx();
    const o = c.createOscillator();
    o.frequency.value = 3200;
    const g = c.createGain();
    o.connect(g).connect(dest);
    env(g, t, 0.05 * vel, 0.001, 0.25);
    o.start(t);
    o.stop(t + 0.3);
  },
  rim(t, dest, vel = 1) {
    const c = getCtx();
    const o = c.createOscillator();
    o.type = 'triangle';
    o.frequency.value = 1750;
    const g = c.createGain();
    o.connect(filt('highpass', 600)).connect(g).connect(dest);
    env(g, t, 0.5 * vel, 0.001, 0.03);
    o.start(t);
    o.stop(t + 0.06);
    const n = noise(t, 0.03);
    const ng = c.createGain();
    n.connect(filt('bandpass', 2600, 2)).connect(ng).connect(dest);
    env(ng, t, 0.35 * vel, 0.001, 0.025);
  },
  shaker(t, dest, vel = 1) {
    const c = getCtx();
    const n = noise(t, 0.09);
    const g = c.createGain();
    n.connect(filt('bandpass', 6500, 1.2)).connect(g).connect(dest);
    env(g, t, 0.22 * vel, 0.012, 0.06);
  },
  cowbell(t, dest, vel = 1) {
    const c = getCtx();
    const g = c.createGain();
    const bp = filt('bandpass', 800, 2.5);
    [562, 845].forEach((f) => {
      const o = c.createOscillator();
      o.type = 'square';
      o.frequency.value = f;
      o.connect(bp);
      o.start(t);
      o.stop(t + 0.4);
    });
    bp.connect(g).connect(dest);
    env(g, t, 0.35 * vel, 0.001, 0.3);
  },
  tom(t, dest, vel = 1) {
    const c = getCtx();
    const o = c.createOscillator();
    o.frequency.setValueAtTime(140, t);
    o.frequency.exponentialRampToValueAtTime(90, t + 0.25);
    const g = c.createGain();
    o.connect(g).connect(dest);
    env(g, t, 0.7 * vel, 0.002, 0.3);
    o.start(t);
    o.stop(t + 0.4);
  },
  /** Long 808-style sub bass hit. */
  sub(t, dest, vel = 1, freq = 49) {
    const c = getCtx();
    const o = c.createOscillator();
    o.frequency.setValueAtTime(freq * 1.6, t);
    o.frequency.exponentialRampToValueAtTime(freq, t + 0.05);
    const ws = c.createWaveShaper();
    ws.curve = softClip;
    const g = c.createGain();
    o.connect(ws).connect(g).connect(dest);
    env(g, t, 0.8 * vel, 0.004, 0.9);
    o.start(t);
    o.stop(t + 1.0);
  },
  // ---- metronome click sounds ----
  click(t, dest, vel = 1, accent = false) {
    const c = getCtx();
    const o = c.createOscillator();
    o.frequency.value = accent ? 2000 : 1400;
    const g = c.createGain();
    o.connect(g).connect(dest);
    env(g, t, (accent ? 0.9 : 0.6) * vel, 0.001, 0.035);
    o.start(t);
    o.stop(t + 0.06);
  },
  wood(t, dest, vel = 1, accent = false) {
    const c = getCtx();
    const o = c.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(accent ? 1250 : 950, t);
    const g = c.createGain();
    o.connect(g).connect(dest);
    env(g, t, (accent ? 1 : 0.75) * vel, 0.001, 0.06);
    o.start(t);
    o.stop(t + 0.1);
    const n = noise(t, 0.02);
    const ng = c.createGain();
    n.connect(filt('bandpass', accent ? 2400 : 1900, 4)).connect(ng).connect(dest);
    env(ng, t, 0.6 * vel, 0.001, 0.012);
  },
  beep(t, dest, vel = 1, accent = false) {
    const c = getCtx();
    const o = c.createOscillator();
    o.type = 'square';
    o.frequency.value = accent ? 1320 : 880;
    const g = c.createGain();
    o.connect(filt('lowpass', 3000)).connect(g).connect(dest);
    env(g, t, 0.25 * vel, 0.002, 0.07);
    o.start(t);
    o.stop(t + 0.1);
  },
};

const softClip = (() => {
  const n = 1024, curve = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    curve[i] = Math.tanh(x * 2.2);
  }
  return curve;
})();

/** Parse a step string: '.' rest, 'o' ghost, 'x' normal, 'X' accent, 'r' 32nd-note roll. */
export function stepVel(ch) {
  switch (ch) {
    case 'X': return 1;
    case 'x': return 0.75;
    case 'o': return 0.4;
    case 'r': return 0.7;
    default: return 0;
  }
}

// Grooves. 16 steps = one 4/4 bar of 16ths; 12 steps = triplet-8th grid (4/4 swing) or 3/4 in 16ths.
// `swing` delays every other step by that fraction of a step.
export const GROOVES = {
  house: {
    name: 'House', emoji: '🪩', bpm: 124, steps: 16, beats: 4, swing: 0,
    tracks: {
      kick: 'X...X...X...X...',
      clap: '....X.......X...',
      ohh: '..x...x...x...x.',
      chh: 'o.o.o.o.o.o.o.o.',
    },
  },
  disco: {
    name: 'Disco', emoji: '✨', bpm: 118, steps: 16, beats: 4, swing: 0,
    tracks: {
      kick: 'X...X...X...X...',
      snare: '....X.......X...',
      ohh: '..X...X...X...X.',
      chh: 'xoxoxoxoxoxoxoxo',
    },
  },
  hiphop: {
    name: 'Boom Bap', emoji: '🎤', bpm: 90, steps: 16, beats: 4, swing: 0.18,
    tracks: {
      kick: 'X......x.xX.....',
      snare: '....X.......X...',
      chh: 'x.x.x.x.x.x.x.xo',
    },
  },
  trap: {
    name: 'Trap', emoji: '🔥', bpm: 140, steps: 16, beats: 4, swing: 0, halfTime: true,
    tracks: {
      kick: 'X......X..X.....',
      sub: 'X......X..X.....',
      snare: '........X.......',
      clap: '........X.......',
      chh: 'x.x.x.xrx.x.rrrr',
    },
  },
  reggaeton: {
    name: 'Reggaetón', emoji: '🌴', bpm: 95, steps: 16, beats: 4, swing: 0,
    tracks: {
      kick: 'X...X...X...X...',
      snare: '...x..x....x..x.',
      chh: '..x...x...x...x.',
      shaker: 'o.o.o.o.o.o.o.o.',
    },
  },
  funk: {
    name: 'Funk', emoji: '🕺', bpm: 104, steps: 16, beats: 4, swing: 0.06,
    tracks: {
      kick: 'X.x....x..X..x..',
      snare: '....X..o.o..X..o',
      chh: 'XxxxXxxxXxxxXxxx',
    },
  },
  afrobeats: {
    name: 'Afrobeats', emoji: '🌍', bpm: 105, steps: 16, beats: 4, swing: 0.1,
    tracks: {
      kick: 'X.....x.X.....x.',
      rim: '...x..x....x..x.',
      shaker: 'xoxoxoxoxoxoxoxo',
      chh: '..x...x...x...x.',
    },
  },
  dnb: {
    name: 'Drum & Bass', emoji: '⚡', bpm: 170, steps: 16, beats: 4, swing: 0,
    tracks: {
      kick: 'X.........X.....',
      snare: '....X.......X...',
      chh: 'x.x.x.x.x.x.x.x.',
    },
  },
  rock: {
    name: 'Rock', emoji: '🎸', bpm: 116, steps: 16, beats: 4, swing: 0,
    tracks: {
      kick: 'X.....x.X.......',
      snare: '....X.......X...',
      chh: 'X.x.X.x.X.x.X.x.',
    },
  },
  pop: {
    name: 'Pop', emoji: '💿', bpm: 108, steps: 16, beats: 4, swing: 0,
    tracks: {
      kick: 'X.......X.x.....',
      snare: '....X.......X...',
      chh: 'x.x.x.x.x.x.x.x.',
      shaker: '..o...o...o...o.',
    },
  },
  swing: {
    name: 'Jazz Swing', emoji: '🎷', bpm: 132, steps: 12, beats: 4, swing: 0,
    tracks: {
      ride: 'X..x.xX..x.x',
      chh: '...x.....x..',
      kick: 'o..o..o..o..',
    },
  },
  bossa: {
    name: 'Bossa Nova', emoji: '🏖️', bpm: 128, steps: 16, beats: 4, swing: 0,
    tracks: {
      kick: 'X..xX..xX..xX..x',
      rim: 'x..x..x...x..x..',
      chh: 'xxxxxxxxxxxxxxxx',
    },
  },
  reggae: {
    name: 'One Drop', emoji: '🇯🇲', bpm: 76, steps: 16, beats: 4, swing: 0.12,
    tracks: {
      kick: '........X.......',
      rim: '........X.......',
      chh: 'x.x.x.x.x.x.x.x.',
    },
  },
  ballad: {
    name: 'Ballad', emoji: '🕯️', bpm: 72, steps: 16, beats: 4, swing: 0,
    tracks: {
      kick: 'X.......X.x.....',
      rim: '....x.......x...',
      shaker: 'o.o.o.o.o.o.o.o.',
    },
  },
  lofi: {
    name: 'Lo-fi', emoji: '☕', bpm: 78, steps: 16, beats: 4, swing: 0.22,
    tracks: {
      kick: 'X.....x...X.....',
      snare: '....X.......X..o',
      chh: 'x.xox.x.x.xox.x.',
    },
  },
  waltz: {
    name: 'Waltz', emoji: '💃', bpm: 150, steps: 12, beats: 3, swing: 0,
    tracks: {
      kick: 'X...........',
      rim: '....x...x...',
      chh: 'x.o.x.o.x.o.',
    },
  },
  ranchera: {
    name: 'Ranchera (vals)', emoji: '🎺', bpm: 180, steps: 12, beats: 3, swing: 0,
    tracks: {
      kick: 'X...........',
      snare: '....x...x...',
    },
  },
};

/** Groove choices offered on the metronome screen (all the dance-y ones). */
export const DANCE_GROOVES = ['house', 'disco', 'hiphop', 'trap', 'reggaeton', 'funk', 'afrobeats', 'dnb', 'rock', 'pop', 'swing', 'bossa', 'reggae', 'lofi', 'waltz'];
