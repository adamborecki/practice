// Time signatures and subdivisions for the click metronome. Pure (no DOM) — Node-testable.

/**
 * A meter is compound when the top number is a multiple of 3 (6, 9, 12…) over an
 * eighth or sixteenth: 6/8 is two dotted-quarter beats, each split into three eighths.
 * 3/8 counts too (felt "in 1"). Students can choose to feel it in the big beat
 * (dotted note) or count every written note.
 */
export function isCompound(top, bottom) {
  return bottom >= 8 && top % 3 === 0 && top >= 3;
}

/**
 * @returns {{ pulses:number, unit:{value:number, dotted:boolean}, compound:boolean, big:boolean, groupSize:number }}
 * pulses   = clicks per bar (what the BPM counts)
 * unit     = the note value of one pulse
 */
export function meterInfo(top, bottom, feel = 'big') {
  const compound = isCompound(top, bottom);
  const big = compound && feel !== 'small';
  return {
    pulses: big ? top / 3 : top,
    unit: big ? { value: bottom / 2, dotted: true } : { value: bottom, dotted: false },
    compound,
    big,
    groupSize: compound && !big ? 3 : 1,
  };
}

// Onsets are fractions of one pulse. 0 = the beat itself.
export const SUBS_SIMPLE = [
  { id: 'none', label: 'Beat only', on: [0] },
  { id: 'e8', label: '2 · Eighths', on: [0, 1 / 2], group: 'Even' },
  { id: 'trip', label: '3 · Triplets', on: [0, 1 / 3, 2 / 3], group: 'Even' },
  { id: 'x16', label: '4 · Sixteenths', on: [0, 1 / 4, 1 / 2, 3 / 4], group: 'Even' },
  { id: 'quint', label: '5 · Quintuplets', on: [0, 1 / 5, 2 / 5, 3 / 5, 4 / 5], group: 'Even' },
  { id: 'sext', label: '6 · Sextuplets', on: [0, 1 / 6, 2 / 6, 3 / 6, 4 / 6, 5 / 6], group: 'Even' },
  { id: 'sept', label: '7 · Septuplets', on: [0, 1 / 7, 2 / 7, 3 / 7, 4 / 7, 5 / 7, 6 / 7], group: 'Even' },
  { id: 'x32', label: '8 · Thirty-seconds', on: [0, 1 / 8, 2 / 8, 3 / 8, 4 / 8, 5 / 8, 6 / 8, 7 / 8], group: 'Even' },
  { id: 'swing', label: 'Swing eighths (long–short)', on: [0, 2 / 3], group: 'Rhythms' },
  { id: 'dotted', label: 'Dotted eighth + sixteenth', on: [0, 3 / 4], group: 'Rhythms' },
  { id: 'snap', label: 'Sixteenth + dotted eighth (snap)', on: [0, 1 / 4], group: 'Rhythms' },
  { id: 'gallop', label: 'Eighth + two sixteenths', on: [0, 1 / 2, 3 / 4], group: 'Rhythms' },
  { id: 'revgallop', label: 'Two sixteenths + eighth', on: [0, 1 / 4, 1 / 2], group: 'Rhythms' },
  { id: 'synco', label: 'Sixteenth–eighth–sixteenth', on: [0, 1 / 4, 3 / 4], group: 'Rhythms' },
  { id: 'tripgap', label: 'Triplet, middle note silent', on: [0, 2 / 3], group: 'Rhythms', hidden: true },
  { id: 'offbeat', label: 'Off-beats only (“&”)', on: [1 / 2], group: 'Rhythms' },
];

// For a dotted (compound) beat: three eighths per beat is the natural division.
export const SUBS_COMPOUND = [
  { id: 'none', label: 'Beat only (♩.)', on: [0] },
  { id: 'c3', label: '3 · Eighths', on: [0, 1 / 3, 2 / 3], group: 'Even' },
  { id: 'c6', label: '6 · Sixteenths', on: [0, 1 / 6, 2 / 6, 3 / 6, 4 / 6, 5 / 6], group: 'Even' },
  { id: 'duplet', label: '2 · Duplet (2 against 3)', on: [0, 1 / 2], group: 'Even' },
  { id: 'quad', label: '4 · Quadruplet', on: [0, 1 / 4, 1 / 2, 3 / 4], group: 'Even' },
  { id: 'qe', label: 'Quarter + eighth (long–short)', on: [0, 2 / 3], group: 'Rhythms' },
  { id: 'eq', label: 'Eighth + quarter (short–long)', on: [0, 1 / 3], group: 'Rhythms' },
  { id: 'sicil', label: 'Siciliano (dotted 8th–16th–8th)', on: [0, 1 / 2, 2 / 3], group: 'Rhythms' },
  { id: 'c3off', label: 'Eighths 2 & 3 only', on: [1 / 3, 2 / 3], group: 'Rhythms' },
];

export function subsFor(info) {
  return (info.big ? SUBS_COMPOUND : SUBS_SIMPLE).filter((s) => !s.hidden);
}

/** Default accent levels (2 accent, 1 normal, 0 silent) for a bar. */
export function defaultAccents(info) {
  return Array.from({ length: info.pulses }, (_, i) => (i === 0 ? 2 : info.groupSize > 1 && i % info.groupSize === 0 ? 2 : 1));
}

/**
 * Every click in one bar: [{ at (seconds from bar start), pulse, beat:boolean, level }]
 * level: 2 accent, 1 beat, 0.4 subdivision. Silent beats (level 0) silence their subdivisions too.
 */
export function barClicks(info, sub, accents, bpm) {
  const pulseDur = 60 / bpm;
  const out = [];
  for (let p = 0; p < info.pulses; p++) {
    const lv = accents[p] ?? 1;
    if (lv === 0) continue;
    for (const f of sub.on) {
      out.push({ at: (p + f) * pulseDur, pulse: p, beat: f === 0, level: f === 0 ? lv : 0.4 });
    }
  }
  return out;
}

/** Small SVG note glyph for a note value (2 half, 4 quarter, 8 eighth, 16 sixteenth), optionally dotted. */
export function noteSvg(value, dotted = false) {
  const hollow = value <= 2;
  const flags = value >= 16 ? 2 : value >= 8 ? 1 : 0;
  let s = `<svg class="note-glyph" viewBox="0 0 ${dotted ? 18 : 14} 26" aria-hidden="true">`;
  s += `<ellipse cx="5.2" cy="20.5" rx="4.4" ry="3.2" transform="rotate(-22 5.2 20.5)" fill="${hollow ? 'none' : 'currentColor'}" stroke="currentColor" stroke-width="1.6"/>`;
  s += '<line x1="9.1" y1="19.5" x2="9.1" y2="2.5" stroke="currentColor" stroke-width="1.6"/>';
  for (let i = 0; i < flags; i++) s += `<path d="M9.1 ${2.5 + i * 5} c0.6 3.2 4.6 4.2 3.8 9" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>`;
  if (dotted) s += '<circle cx="15" cy="20.5" r="1.6" fill="currentColor"/>';
  return s + '</svg>';
}

export const NOTE_NAMES = { 2: 'half note', 4: 'quarter note', 8: 'eighth note', 16: 'sixteenth note' };
export const unitName = (u) => `${u.dotted ? 'dotted ' : ''}${NOTE_NAMES[u.value] || `1/${u.value} note`}`;

export const TS_PRESETS = [[2, 4], [3, 4], [4, 4], [5, 4], [2, 2], [3, 8], [6, 8], [9, 8], [12, 8], [5, 8], [7, 8]];
