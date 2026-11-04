// Pitch detection (YIN, de Cheveigné & Kawahara 2002, J. Acoust. Soc. Am. 111(4):1917–1930).
// Pure function, no DOM — unit-testable in Node.

/**
 * @param {Float32Array} buf  mono time-domain samples
 * @param {number} sr         sample rate
 * @returns {{freq:number, clarity:number, rms:number}|null}
 */
export function detectPitch(buf, sr, { minFreq = 38, maxFreq = 2100, threshold = 0.12, minRms = 0.008 } = {}) {
  const n = buf.length;
  let rms = 0;
  for (let i = 0; i < n; i++) rms += buf[i] * buf[i];
  rms = Math.sqrt(rms / n);
  if (rms < minRms) return null;

  const tauMin = Math.max(2, Math.floor(sr / maxFreq));
  const tauMax = Math.min(Math.floor(sr / minFreq), Math.floor(n / 2));
  const W = n - tauMax;
  const d = new Float32Array(tauMax + 1);

  // Step 2: difference function
  for (let tau = 1; tau <= tauMax; tau++) {
    let s = 0;
    for (let j = 0; j < W; j++) {
      const delta = buf[j] - buf[j + tau];
      s += delta * delta;
    }
    d[tau] = s;
  }
  // Step 3: cumulative mean normalized difference
  d[0] = 1;
  let running = 0;
  for (let tau = 1; tau <= tauMax; tau++) {
    running += d[tau];
    d[tau] = running === 0 ? 1 : (d[tau] * tau) / running;
  }
  // Step 4: absolute threshold → first dip below threshold, then slide to its local minimum
  let tau = -1;
  for (let t = tauMin; t <= tauMax; t++) {
    if (d[t] < threshold) {
      while (t + 1 <= tauMax && d[t + 1] < d[t]) t++;
      tau = t;
      break;
    }
  }
  if (tau === -1) {
    // no confident dip: take the global minimum if it's still reasonably periodic
    let best = tauMin;
    for (let t = tauMin + 1; t <= tauMax; t++) if (d[t] < d[best]) best = t;
    if (d[best] > 0.35) return null;
    tau = best;
  }
  // Step 5: parabolic interpolation for sub-sample precision
  let betterTau = tau;
  if (tau > 1 && tau < tauMax) {
    const s0 = d[tau - 1], s1 = d[tau], s2 = d[tau + 1];
    const denom = 2 * (2 * s1 - s2 - s0);
    if (denom !== 0) betterTau = tau + (s2 - s0) / denom;
  }
  const freq = sr / betterTau;
  if (freq < minFreq || freq > maxFreq) return null;
  return { freq, clarity: 1 - Math.min(1, d[tau]), rms };
}

/** Median of a small array (used to steady the tuner needle). */
export function median(arr) {
  const a = [...arr].sort((x, y) => x - y);
  const m = a.length >> 1;
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
}
