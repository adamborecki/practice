// Paced slow breathing before performances. Protocol: ~6 breaths per minute, as in
// Wells et al. (2012), PLoS ONE 7(10): e46597 — a single 30-min session of slow breathing
// (with or without biofeedback) improved heart-rate variability during performance
// anticipation; self-reported anxiety dropped mainly in the most anxious musicians.
import { getCtx } from './audio.js';
import { SOUNDS, startSound } from './breathe-sound.js';
import { load, save } from './store.js';
import { $, $$, fmtClock, keepAwake, icon } from './ui.js';

const PATTERNS = {
  six: { name: '6 / min · in 4, out 6', inhale: 4, exhale: 6 },
  five: { name: '5 / min · in 5, out 7', inhale: 5, exhale: 7 },
  easy: { name: '7.5 / min · in 3, out 5 (easier start)', inhale: 3, exhale: 5 },
};
const S = load('breathe', { pattern: 'six', minutes: 5, sound: 'ocean', vol: 0.8 });
if (S.sound === true) S.sound = 'ocean';
if (S.sound === false) S.sound = 'off';
S.vol ??= 0.8;
const SOUND_HINT = {
  ocean: 'A wave rolls in as you breathe in and washes out as you breathe out.',
  chords: 'The chord lifts as you breathe in and settles as you breathe out.',
  both: 'Waves and chords together: both rise as you breathe in and settle as you breathe out.',
  tone: 'A single soft tone: rising = in, falling = out.',
  off: 'Just the circle. Breathe in as it grows, out as it shrinks.',
};
let el, running = false, startAt = 0, raf = 0, lastPhase = '';
let sc = null; // the running soundscape
let cur = { inhaling: true, left: 0 };

export const breathe = {
  id: 'breathe',
  mount(root) {
    el = root;
    root.innerHTML = `
      <header class="view-head"><h1>Breathe</h1><p class="sub">Slow, paced breathing before a jury, audition, lesson or concert.</p></header>
      <div class="card breathe-card">
        <div class="br-stage"><div class="br-ring"></div><div class="br-orb"></div><div class="br-word">Ready</div></div>
        <div class="br-time">${fmtClock(S.minutes * 60)}</div>
        <button class="btn primary big br-go wide">${icon('play')}<span>Begin</span></button>
      </div>
      <div class="card">
        <div>
          <label class="field"><span>Pace</span><select class="br-pat">${Object.entries(PATTERNS).map(([k, p]) => `<option value="${k}" ${k === S.pattern ? 'selected' : ''}>${p.name}</option>`).join('')}</select></label>
          <label class="field"><span>Length</span><select class="br-min">${[2, 3, 5, 10, 15].map((m) => `<option value="${m}" ${m === S.minutes ? 'selected' : ''}>${m} min</option>`).join('')}</select></label>
        </div>
        <p class="q-label">Sound</p>
        <div class="chips br-sounds">${SOUNDS.map(([k, n]) => `<button class="chip ${S.sound === k ? 'on' : ''}" data-snd="${k}">${n}</button>`).join('')}</div>
        <p class="hint br-sndhint">${SOUND_HINT[S.sound]}</p>
        <label class="field br-volf" ${S.sound === 'off' ? 'hidden' : ''}><span>Volume</span><input type="range" class="br-vol" min="0.1" max="1" step="0.05" value="${S.vol}"></label>
        <p class="hint">Breathe low into your belly through your nose; let the out-breath be long and unforced. If you feel light-headed, return to normal breathing.</p>
      </div>
      <div class="card">
        <h2>What the research says</h2>
        <p>In a randomized trial with 46 trained musicians, one 30-minute session of slow breathing at about <b>6 breaths per minute</b> — with or without biofeedback — improved heart-rate variability (a marker of calmer physiological arousal) while they waited to perform, compared with a control group. Self-reported anxiety dropped mainly in the musicians who were most anxious to begin with. <span class="cite">Wells et al. (2012), <i>PLoS ONE</i> 7(10): e46597.</span></p>
        <p>Performance anxiety is common at every level and responds to treatment; if it’s getting in the way, talk with your teacher and with <a href="https://www.chapman.edu/students/health-and-safety/psychological-counseling/" target="_blank" rel="noopener">Student Psychological Counseling Services</a> (714-997-6778). <span class="cite">Kenny (2011).</span></p>
      </div>`;
    $('.br-go', root).addEventListener('click', () => (running ? stop() : start()));
    $('.br-pat', root).addEventListener('change', (e) => { S.pattern = e.target.value; save('breathe', S); });
    $('.br-min', root).addEventListener('change', (e) => { S.minutes = Number(e.target.value); save('breathe', S); if (!running) $('.br-time', el).textContent = fmtClock(S.minutes * 60); });
    $$('[data-snd]', root).forEach((b) => b.addEventListener('click', () => setSound(b.dataset.snd)));
    $('.br-vol', root).addEventListener('input', (e) => { S.vol = Number(e.target.value); save('breathe', S); sc?.setVolume(S.vol); });
  },
  show() {},
  hide() { if (running) stop(); },
};

function setSound(k) {
  S.sound = k;
  save('breathe', S);
  $$('[data-snd]', el).forEach((b) => b.classList.toggle('on', b.dataset.snd === k));
  $('.br-sndhint', el).textContent = SOUND_HINT[k];
  $('.br-volf', el).hidden = k === 'off';
  if (running) {
    // swap sounds mid-session and pick up the current breath where it is
    sc?.stop(0.8);
    sc = startSound(k, S.vol);
    if (cur.left > 0.3) sc?.phase(cur.inhaling, cur.left);
  }
}

function start() {
  getCtx();
  sc = startSound(S.sound, S.vol);
  running = true;
  startAt = performance.now();
  lastPhase = '';
  keepAwake('breathe', true);
  const b = $('.br-go', el);
  b.classList.add('active');
  b.innerHTML = `${icon('stop')}<span>Stop</span>`;
  frame();
}

function stop(done = false) {
  running = false;
  sc?.stop(done ? 3 : 1.2);
  sc = null;
  cancelAnimationFrame(raf);
  keepAwake('breathe', false);
  const b = $('.br-go', el);
  b.classList.remove('active');
  b.innerHTML = `${icon('play')}<span>${done ? 'Again' : 'Begin'}</span>`;
  $('.br-word', el).textContent = done ? 'Nice. Notice how you feel.' : 'Ready';
  $('.br-orb', el).style.transform = 'scale(0.45)';
  $('.br-time', el).textContent = fmtClock(S.minutes * 60);
}

const ease = (x) => 0.5 - 0.5 * Math.cos(Math.PI * x);

function frame() {
  if (!running) return;
  raf = requestAnimationFrame(frame);
  const p = PATTERNS[S.pattern];
  const t = (performance.now() - startAt) / 1000;
  const total = S.minutes * 60;
  if (t >= total) { stop(true); return; }
  const cycle = p.inhale + p.exhale;
  const ph = t % cycle;
  const inhaling = ph < p.inhale;
  const prog = inhaling ? ease(ph / p.inhale) : 1 - ease((ph - p.inhale) / p.exhale);
  $('.br-orb', el).style.transform = `scale(${0.45 + 0.55 * prog})`;
  const phase = inhaling ? 'in' : 'out';
  cur = { inhaling, left: inhaling ? p.inhale - ph : cycle - ph };
  if (phase !== lastPhase) {
    lastPhase = phase;
    $('.br-word', el).textContent = inhaling ? 'Breathe in…' : 'Breathe out…';
    sc?.phase(inhaling, cur.left);
  }
  $('.br-time', el).textContent = fmtClock(total - t);
}
