// A-weighting filter (IEC 61672-1) as three digital biquads via the bilinear transform.
// Analog prototype: H(s) = K·s⁴ / ((s+ω1)²(s+ω2)(s+ω3)(s+ω4)²)
// Pure math — unit-tested in Node against the standard's table values.

const F1 = 20.598997, F2 = 107.65265, F3 = 737.86223, F4 = 12194.217;

function bilinear(b, a, fs) {
  // b, a: [s², s¹, s⁰] analog coefficients → digital [z⁰, z⁻¹, z⁻²]
  const k = 2 * fs, k2 = k * k;
  const B = [b[0] * k2 + b[1] * k + b[2], 2 * b[2] - 2 * b[0] * k2, b[0] * k2 - b[1] * k + b[2]];
  const A = [a[0] * k2 + a[1] * k + a[2], 2 * a[2] - 2 * a[0] * k2, a[0] * k2 - a[1] * k + a[2]];
  return { b: B.map((x) => x / A[0]), a: A.map((x) => x / A[0]) };
}

/** Pre-warp a corner frequency so the digital filter matches the analog one at that frequency. */
const warp = (f, fs) => 2 * fs * Math.tan((Math.PI * f) / fs);

export function aWeightingSections(fs) {
  const w1 = warp(F1, fs), w2 = warp(F2, fs), w3 = warp(F3, fs), w4 = warp(Math.min(F4, fs * 0.45), fs);
  const sections = [
    bilinear([1, 0, 0], [1, 2 * w1, w1 * w1], fs), // s² / (s+ω1)²
    bilinear([1, 0, 0], [1, w2 + w3, w2 * w3], fs), // s² / ((s+ω2)(s+ω3))
    bilinear([0, 0, 1], [1, 2 * w4, w4 * w4], fs), // 1 / (s+ω4)²
  ];
  // normalise to 0 dB at 1 kHz
  const g = magnitude(sections, 1000, fs);
  sections[2].b = sections[2].b.map((x) => x / g);
  return sections;
}

export function magnitude(sections, f, fs) {
  const w = (2 * Math.PI * f) / fs;
  let mag = 1;
  for (const { b, a } of sections) {
    const num = cabs(b[0] + b[1] * Math.cos(w) + b[2] * Math.cos(2 * w), -(b[1] * Math.sin(w) + b[2] * Math.sin(2 * w)));
    const den = cabs(a[0] + a[1] * Math.cos(w) + a[2] * Math.cos(2 * w), -(a[1] * Math.sin(w) + a[2] * Math.sin(2 * w)));
    mag *= num / den;
  }
  return mag;
}
const cabs = (re, im) => Math.hypot(re, im);

// --- Exposure math (NIOSH 1998 criteria: 85 dBA for 8 h, 3-dB exchange rate) ---
export const NIOSH_REL = 85;
export const EXCHANGE = 3;
/** Recommended maximum exposure time in seconds at a given A-weighted level. */
export function allowedSeconds(dBA) {
  return 8 * 3600 / Math.pow(2, (dBA - NIOSH_REL) / EXCHANGE);
}
/** Dose fraction contributed by `seconds` spent at `dBA` (NIOSH counts levels ≥ 80 dBA). */
export function doseFraction(dBA, seconds) {
  if (dBA < 80) return 0;
  return seconds / allowedSeconds(dBA);
}
