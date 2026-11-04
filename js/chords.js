// Chord-symbol + Roman-numeral + Nashville-number parser. Pure, Node-testable.

const LETTER = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const SHARP_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const FLAT_NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
const MAJOR_SCALE = [0, 2, 4, 5, 7, 9, 11];
const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'];

const norm = (s) => s.replace(/♯/g, '#').replace(/♭/g, 'b').replace(/Δ/g, 'maj').replace(/−/g, '-');

/** Parse a quality suffix ("m7b5", "maj9", "7#9", "sus4", "°7"…) into intervals above the root. */
export function parseQuality(q) {
  q = norm(q || '').trim();
  let third = 4, fifth = 7, seventh = null;
  const ext = new Set();
  let rest = q;

  const take = (re) => { const m = rest.match(re); if (m) { rest = rest.slice(m[0].length); return m; } return null; };

  if (take(/^(m7b5|ø7?|-7b5|min7b5)/)) { third = 3; fifth = 6; seventh = 10; }
  else if (take(/^(dim7|°7|o7)/)) { third = 3; fifth = 6; seventh = 9; }
  else if (take(/^(dim|°|o(?![a-z]))/)) { third = 3; fifth = 6; }
  else if (take(/^(aug|\+)/)) { fifth = 8; }
  else if (take(/^(mmaj|m\(maj|minmaj|-maj|mM)/)) { third = 3; seventh = 11; take(/^7?\)?/); }
  else if (take(/^(maj|M(?!a)|ma(?!j))/)) {
    // "maj" alone = major triad; "maj7/maj9/maj13" = major 7th family
    const n = take(/^(7|9|11|13)/);
    if (n) { seventh = 11; addExt(ext, Number(n[1])); }
  }
  else if (take(/^(min|mi|m|-)/)) { third = 3; }

  if (take(/^5(?!\d)/) && seventh == null && !/[#b]/.test(q[0] || '')) { third = null; }
  const num = take(/^(6\/9|69|6|7|9|11|13)/);
  if (num) {
    const n = num[1];
    if (n === '6') ext.add(9);
    else if (n === '6/9' || n === '69') { ext.add(9); ext.add(14); }
    else {
      if (seventh == null) seventh = third === 3 && fifth === 6 && !/dim|°|o/.test(q) ? 10 : 10;
      addExt(ext, Number(n));
    }
  }
  // sus / add / alterations, in any order
  let guard = 0;
  while (rest.length && guard++ < 10) {
    if (take(/^\(|^\)|^,|^ /)) continue;
    if (take(/^sus2/)) { third = 2; continue; }
    if (take(/^sus4?/)) { third = 5; continue; }
    const add = take(/^add(b9|#9|9|11|#11|13|2|4)/);
    if (add) { const map = { 9: 14, 2: 14, b9: 13, '#9': 15, 11: 17, 4: 17, '#11': 18, 13: 21 }; ext.add(map[add[1]]); continue; }
    const alt = take(/^(b5|#5|b9|#9|#11|b13|\+5|-5|alt)/);
    if (alt) {
      const a = alt[1];
      if (a === 'b5' || a === '-5') fifth = 6;
      else if (a === '#5' || a === '+5') fifth = 8;
      else if (a === 'b9') ext.add(13);
      else if (a === '#9') ext.add(15);
      else if (a === '#11') ext.add(18);
      else if (a === 'b13') ext.add(20);
      else if (a === 'alt') { ext.add(13); ext.add(15); fifth = 8; }
      if (seventh == null && a !== 'b5' && a !== '#5') seventh = 10;
      continue;
    }
    if (take(/^(maj7|M7)/)) { seventh = 11; continue; }
    break;
  }
  if (rest.length) return null; // unrecognised suffix

  const iv = [0];
  if (third != null) iv.push(third);
  iv.push(fifth);
  if (seventh != null) iv.push(seventh);
  for (const e of [...ext].sort((a, b) => a - b)) iv.push(e);
  // 9 with altered 9 present: drop natural 9
  const out = [...new Set(iv)];
  if (out.includes(13) || out.includes(15)) { const i = out.indexOf(14); if (i > -1) out.splice(i, 1); }
  return out;
}
function addExt(ext, n) {
  if (n >= 9) ext.add(14);
  if (n >= 11) ext.add(17);
  if (n >= 13) { ext.add(21); ext.delete(17); } // 13th chords conventionally omit the 11
}

/** "F#m7b5/E" → { root, intervals, bass, symbol } (root/bass are pitch classes 0–11). */
export function parseChord(tok) {
  const t = norm(tok.trim());
  const m = t.match(/^([A-Ga-g])([#b]?)(.*?)(?:\/([A-Ga-g][#b]?))?$/);
  if (!m) return null;
  const root = (LETTER[m[1].toUpperCase()] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0) + 12) % 12;
  const intervals = parseQuality(m[3]);
  if (!intervals) return null;
  let bass = root;
  if (m[4]) {
    const b = m[4];
    bass = (LETTER[b[0].toUpperCase()] + (b[1] === '#' ? 1 : b[1] === 'b' ? -1 : 0) + 12) % 12;
  }
  return { root, intervals, bass, quality: m[3], symbol: tok.trim() };
}

/** Roman numeral (I, ii7, bVII, viiø7, V7/V…) or Nashville number (1, 6m, 4maj7) relative to a key. */
export function parseDegree(tok, keyPc) {
  const t = norm(tok.trim());
  // secondary function: V7/V, vii°7/ii
  if (t.includes('/')) {
    const [a, b] = t.split('/');
    const target = parseDegree(b, keyPc);
    if (target && /^[#b]?[ivIV]+|^[#b]?[1-7]/.test(a)) {
      return parseDegree(a, target.root);
    }
  }
  let m = t.match(/^([#b]?)(VII|VI|V|IV|III|II|I|vii|vi|v|iv|iii|ii|i)(.*)$/);
  let degree, minor, acc, suffix;
  if (m) {
    acc = m[1];
    degree = ROMAN.indexOf(m[2].toUpperCase());
    minor = m[2] === m[2].toLowerCase();
    suffix = m[3];
  } else {
    m = t.match(/^([#b]?)([1-7])(.*)$/);
    if (!m) return null;
    acc = m[1];
    degree = Number(m[2]) - 1;
    minor = false;
    suffix = m[3];
  }
  const root = (keyPc + MAJOR_SCALE[degree] + (acc === '#' ? 1 : acc === 'b' ? -1 : 0) + 120) % 12;
  // lowercase numeral → minor unless the suffix already says dim/half-dim
  let q = suffix;
  if (minor && !/^(ø|°|o|dim|m7b5)/.test(q)) q = 'm' + q;
  const intervals = parseQuality(q);
  if (!intervals) return null;
  return { root, intervals, bass: root, quality: q, symbol: null };
}

export function chordName(c, preferFlats = true) {
  const names = preferFlats ? FLAT_NAMES : SHARP_NAMES;
  const q = c.quality
    .replace(/^m(?=[^a])/, 'm').replace(/^maj$/, '');
  let s = names[c.root] + q;
  if (c.bass !== c.root) s += '/' + names[c.bass];
  return s;
}

const looksRoman = (tok) => /^[#b♯♭]?(VII|VI|V|IV|III|II|I|vii|vi|v|iv|iii|ii|i)(?![a-ln-zA-Z]{2})/.test(tok) || /^[#b♯♭]?[1-7](?!\d)/.test(tok);
const looksLetter = (tok) => /^[A-G][#b♯♭]?/.test(tok);

/**
 * Parse a progression. Bars are separated by "|" (or each chord is a bar if there are no bars).
 * Several chords in a bar split it evenly. "%" repeats the previous bar.
 * Returns { bars: [[chord,...],...], errors: [tokens] }.
 */
export function parseProgression(text, keyPc = 0, transpose = 0) {
  const raw = (text || '').trim();
  const hasBars = raw.includes('|');
  // line breaks act as bar lines only when the student is already using | notation
  const src = hasBars ? raw.replace(/\n+/g, ' | ') : raw;
  const rawBars = hasBars
    ? src.split('|').map((b) => b.trim()).filter(Boolean)
    : src.split(/[\s,]+/).filter(Boolean);
  const bars = [];
  const errors = [];
  for (const rb of rawBars) {
    if (rb === '%' && bars.length) { bars.push(bars[bars.length - 1]); continue; }
    const toks = rb.split(/[\s,]+/).filter(Boolean);
    const chords = [];
    for (const tok of toks) {
      if (tok === '%' && bars.length) { chords.push(...bars[bars.length - 1]); continue; }
      let c = null;
      let asTyped = false;
      // "Bb" etc. are letters; "bVII", "IV", "6m" are degrees. Letters A–G uppercase win.
      if (looksLetter(tok)) { c = parseChord(tok); asTyped = !!c && transpose === 0; }
      if (!c && looksRoman(tok)) {
        c = parseDegree(tok, keyPc);
      }
      if (!c) { errors.push(tok); continue; }
      c = { ...c, root: (c.root + transpose + 12) % 12, bass: (c.bass + transpose + 12) % 12 };
      // keep the student's own spelling (F#m7b5 stays F#m7b5) unless we transposed it
      c.symbol = asTyped ? tok : chordName(c, preferFlatsFor((keyPc + transpose + 12) % 12));
      chords.push(c);
    }
    if (chords.length) bars.push(chords);
  }
  return { bars, errors };
}

export function preferFlatsFor(keyPc) {
  return ![7, 2, 9, 4, 11, 6].includes(keyPc); // G D A E B F# use sharps
}

export const KEY_NAMES = ['C', 'D♭', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'];
