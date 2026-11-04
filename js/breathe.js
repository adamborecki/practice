// Paced slow breathing before performances. Protocol: ~6 breaths per minute, as in
// Wells et al. (2012), PLoS ONE 7(10): e46597 — a single 30-min session of slow breathing
// (with or without biofeedback) improved heart-rate variability during performance
// anticipation; self-reported anxiety dropped mainly in the most anxious musicians.
import { getCtx, getMaster } from './audio.js';
import { load, save } from './store.js';
import { $, $$, fmtClock, keepAwake, icon } from './ui.js';

const PATTERNS = {
  six: { name: '6 / min · in 4, out 6', inhale: 4, exhale: 6 },
  five: { name: '5 / min · in 5, out 7', inhale: 5, exhale: 7 },
  easy: { name: '7.5 / min · in 3, out 5 (easier start)', inhale: 3, exhale: 5 },
};
const S = load('breathe', { pattern: 'six', minutes: 5, sound: true });
let el, running = false, startAt = 0, raf = 0, lastPhase = '';

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
        <label class="switch"><input type="checkbox" class="br-snd" ${S.sound ? 'checked' : ''}><span>Soft tone cues (rising = in, falling = out)</span></label>
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
    $('.br-snd', root).addEventListener('change', (e) => { S.sound = e.target.checked; save('breathe', S); });
  },
  show() {},
  hide() { if (running) stop(); },
};

function start() {
  getCtx();
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
  if (phase !== lastPhase) {
    lastPhase = phase;
    $('.br-word', el).textContent = inhaling ? 'Breathe in…' : 'Breathe out…';
    if (S.sound) cue(inhaling, inhaling ? p.inhale : p.exhale);
  }
  $('.br-time', el).textContent = fmtClock(total - t);
}

/** A soft sine glide: rising while inhaling, falling while exhaling. */
function cue(up, dur) {
  const c = getCtx();
  const o = c.createOscillator();
  const g = c.createGain();
  const t = c.currentTime;
  o.type = 'sine';
  o.frequency.setValueAtTime(up ? 196 : 293.66, t);
  o.frequency.linearRampToValueAtTime(up ? 293.66 : 196, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(0.06, t + 0.6);
  g.gain.setValueAtTime(0.06, t + dur - 0.6);
  g.gain.linearRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(getMaster());
  o.start(t);
  o.stop(t + dur + 0.05);
}
