// Today screen: quote of the day, practice-session planner/runner with break reminders,
// quick countdown timer, today's stats, next concert.
import { chime, getCtx } from './audio.js';
import { load, save, addLog, getLog, todayKey, daysAgoKey } from './store.js';
import { quoteForDate } from './quotes.js';
import { $, $$, esc, fmtClock, fmtMinutes, keepAwake, toast, icon } from './ui.js';
import { comingUp, focusConcert } from './concerts.js';
import { tipOfTheDay } from './health.js';

export const CATS = {
  warmup: { label: 'Warm-up', color: 'var(--c-warm)', hint: 'Gentle, gradual — get blood flowing before demanding work.' },
  building: { label: 'Technique', color: 'var(--c-build)', hint: '“Building time” — scales, etudes, isolating hard passages. Fix every mistake.' },
  interpreting: { label: 'Musicianship', color: 'var(--c-interp)', hint: '“Interpreting time” — shape phrases and sections. Don’t stop for every small slip.' },
  performing: { label: 'Run-through', color: 'var(--c-perf)', hint: '“Performing time” — play it all without stopping, as if an audience were there.' },
  mental: { label: 'Mental practice', color: 'var(--c-mental)', hint: 'Score study away from the instrument: hear it and feel the motions in your head. Great on rest days.' },
  break: { label: 'Break', color: 'var(--c-break)', hint: 'Stand up, stretch, drink water, rest your ears. Your brain keeps consolidating.' },
  other: { label: 'Other', color: 'var(--c-other)', hint: 'Sight-reading, ear training, listening, theory…' },
};

const TEMPLATES = {
  balanced: { name: 'Balanced hour', blocks: [['Warm-up: long tones / easy scales', 'warmup', 8], ['Technique: scales & etude', 'building', 15], ['Break', 'break', 4], ['Hard passages (slow, accurate)', 'building', 10], ['Phrasing & musical shape', 'interpreting', 13], ['Break', 'break', 3], ['Run-through, no stopping', 'performing', 7]] },
  quick: { name: 'Quick 30', blocks: [['Warm-up', 'warmup', 5], ['Technique', 'building', 10], ['Repertoire', 'interpreting', 10], ['Run-through', 'performing', 5]] },
  voice: { name: 'Singer 45', blocks: [['SOVT warm-up (straw / lip trills)', 'warmup', 8], ['Technique: vowels, range, agility', 'building', 10], ['Vocal rest (silent)', 'break', 5], ['Text & translation, speak in rhythm', 'mental', 5], ['Repertoire: phrasing', 'interpreting', 10], ['Run-through with track', 'performing', 5], ['Cool-down: gentle glides', 'warmup', 3]] },
  jury: { name: 'Jury / audition prep 90', blocks: [['Warm-up', 'warmup', 10], ['Scales for jury', 'building', 12], ['Hard spots, slow → tempo', 'building', 15], ['Break', 'break', 5], ['Piece 1 phrasing', 'interpreting', 12], ['Piece 2 phrasing', 'interpreting', 12], ['Break', 'break', 5], ['Mental run: hear it start to finish', 'mental', 4], ['Mock jury: full run, no stopping', 'performing', 10], ['Record & listen back', 'other', 5]] },
  rest: { name: 'Light / rest day 20', blocks: [['Score study & listening', 'mental', 10], ['Easy long tones', 'warmup', 5], ['Slow run of one section', 'interpreting', 5]] },
};

const S = load('session', {});
S.plan ||= TEMPLATES.balanced.blocks.map(([label, cat, min]) => ({ label, cat, min }));
S.breakEvery ??= 25;
S.autoAdvance ??= true;
S.freeCat ||= 'building';
S.tab ||= 'plan';
S.goal ??= '';
S.rotItems ||= ['Etude mm. 1–16', 'Concerto exposition', 'Scale & arpeggio of the week'];
S.rotSeg ||= 3;
S.rotTotal ||= 24;
S.rotCat ||= 'building';
S.lastNext ??= '';

// run state survives reloads
let R = load('run', null); // { mode:'plan'|'rotate'|'free', idx, blockStart, pausedAt, pausedTotal, lastBreakAt, done:[], goal, rot }
let pending = load('reflect', null); // a finished session awaiting reflection
let advisory = load('advisory', null);
let el, tickTimer = 0, editing = false;
let qt = load('quicktimer', null); // { end, total, label } | paused: { left, total }

export const today = {
  id: 'today',
  mount(root) {
    el = root;
    render();
    tickTimer = setInterval(tick, 500);
    window.addEventListener('pr:log', () => { renderStats(); renderAlerts(); });
  },
  show() { renderStats(); renderAlerts(); renderNextConcert(); },
  hide() {},
};

function persist() { save('session', S); save('run', R); }

function render() {
  const q = quoteForDate();
  const d = new Date();
  el.innerHTML = `
    <header class="view-head today-head">
      <div>
        <p class="eyebrow">${d.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })}</p>
        <h1>${greeting()}</h1>
      </div>
      <div class="streak" title="Days in a row with logged practice"></div>
    </header>

    <figure class="card quote-card">
      <blockquote>${esc(q.q)}</blockquote>
      <figcaption>— ${esc(q.a)}${q.src ? `, <i>${esc(q.src)}</i>` : ''}${q.attributed ? ' <span class="tag">attributed</span>' : ''}</figcaption>
    </figure>

    <section class="card stats-card">
      <div class="stats">
        <div><b class="st-today">0 min</b><span>Today</span></div>
        <div><b class="st-week">0 min</b><span>Last 7 days</span></div>
        <div><b class="st-days">0</b><span>Days this week</span></div>
      </div>
      <div class="cat-bar st-bar" aria-hidden="true"></div>
    </section>

    <div class="alerts"></div>

    <section class="card session-card"></section>

    <section class="card">
      <h2>${icon('timer')} Quick timer</h2>
      <div class="qt-display">${qt ? '' : '0:00'}</div>
      <div class="chips qt-presets">${[1, 2, 5, 10, 15, 20, 30].map((m) => `<button class="chip" data-qt="${m}">${m} min</button>`).join('')}</div>
      <div class="qt-actions">
        <input type="number" class="qt-custom" min="1" max="240" placeholder="min" inputmode="numeric" aria-label="Custom minutes">
        <button class="btn qt-go">Start</button>
        <button class="btn qt-pause" hidden>Pause</button>
        <button class="btn qt-cancel" hidden>Cancel</button>
      </div>
    </section>

    <a class="card calm-card" href="#breathe">
      <span class="calm-dot" aria-hidden="true"></span>
      <span><b>Nervous before a jury or lesson?</b><small>5 minutes of paced slow breathing lowers performance arousal →</small></span>
    </a>

    <section class="card tip-card"></section>
    <section class="card next-concert"></section>

    <nav class="shortcut-grid" aria-label="More tools">
      <a href="#db">${icon('ear')}<span>Sound level</span></a>
      <a href="#health">${icon('heart')}<span>Health & research</span></a>
      <a href="#concerts">${icon('calendar')}<span>Concerts</span></a>
      <a href="#report">${icon('report')}<span>Teacher report</span></a>
    </nav>`;

  $$('[data-qt]', el).forEach((b) => b.addEventListener('click', () => startQuick(Number(b.dataset.qt))));
  $('.qt-go', el).addEventListener('click', () => {
    const m = Number($('.qt-custom', el).value);
    if (qt?.left != null) resumeQuick();
    else if (m > 0) startQuick(m);
    else toast('Pick a preset or type minutes');
  });
  $('.qt-pause', el).addEventListener('click', pauseQuick);
  $('.qt-cancel', el).addEventListener('click', () => { qt = null; save('quicktimer', null); renderQuick(); keepAwake('qt', false); });

  renderSession();
  renderStats();
  renderAlerts();
  renderQuick();
  renderTip();
  renderNextConcert();
}

function greeting() {
  const h = new Date().getHours();
  return h < 5 ? 'Late-night practice?' : h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}

// ---------------- Stats ----------------
const isPractice = (e) => e.kind === 'segment' && e.category !== 'break';

function renderStats() {
  if (!el) return;
  const log = getLog();
  const tk = todayKey();
  const weekAgo = daysAgoKey(6);
  const practice = log.filter(isPractice);
  const todaySec = practice.filter((e) => e.date === tk).reduce((s, e) => s + e.seconds, 0) + liveSeconds();
  const week = practice.filter((e) => e.date >= weekAgo);
  const weekSec = week.reduce((s, e) => s + e.seconds, 0) + liveSeconds();
  const days = new Set(week.map((e) => e.date));
  if (liveSeconds() > 0) days.add(tk);
  $('.st-today', el).textContent = fmtMinutes(todaySec);
  $('.st-week', el).textContent = fmtMinutes(weekSec);
  $('.st-days', el).textContent = `${days.size}/7`;
  const by = {};
  week.forEach((e) => (by[e.category] = (by[e.category] || 0) + e.seconds));
  const total = Object.values(by).reduce((a, b) => a + b, 0);
  $('.st-bar', el).innerHTML = total
    ? Object.entries(by).map(([c, s]) => `<span style="flex:${s};background:${CATS[c]?.color || 'var(--c-other)'}" title="${CATS[c]?.label}: ${fmtMinutes(s)}"></span>`).join('')
    : '';
  const allDays = new Set(practice.map((e) => e.date));
  let streak = 0;
  for (let i = 0; i < 400; i++) {
    const k = daysAgoKey(i);
    if (allDays.has(k) || (i === 0 && liveSeconds() > 0)) streak++;
    else if (i === 0) continue; // today not yet practiced doesn't break the streak
    else break;
  }
  $('.streak', el).innerHTML = streak ? `<span>🔥</span><b>${streak}</b><small>day${streak > 1 ? 's' : ''}</small>` : '';
}

/**
 * Load & body checks. A sudden jump in playing time is a commonly cited trigger for
 * playing-related pain (Chan & Ackermann 2014; NASM–PAMA). We compare the last 7 days with
 * the weekly average of the 3 weeks before. The 1.5× threshold is a heuristic, not a
 * validated cut-off, and the message says so.
 */
export function loadCheck(log = getLog()) {
  const perDay = {};
  log.filter(isPractice).forEach((e) => (perDay[e.date] = (perDay[e.date] || 0) + e.seconds));
  let acute = 0, chronic = 0;
  for (let i = 0; i < 7; i++) acute += perDay[daysAgoKey(i)] || 0;
  for (let i = 7; i < 28; i++) chronic += perDay[daysAgoKey(i)] || 0;
  const chronicWeekly = chronic / 3;
  const ratio = chronicWeekly ? acute / chronicWeekly : 0;
  const ramp = chronicWeekly >= 90 * 60 && ratio >= 1.5 && acute - chronicWeekly >= 2 * 3600;
  // discomfort reported in reflections this week
  const refl = log.filter((e) => e.kind === 'reflection' && e.date >= daysAgoKey(6));
  const painDays = new Set(refl.filter((e) => e.detail?.pain && e.detail.pain !== 'none').map((e) => e.date));
  const ears = refl.some((e) => e.detail?.areas?.includes('ears'));
  return { acute, chronicWeekly, ratio, ramp, painDays: painDays.size, ears };
}

function renderAlerts() {
  const box = el && $('.alerts', el);
  if (!box) return;
  const c = loadCheck();
  const cards = [];
  if (advisory) {
    cards.push(`<div class="card alert-card ${advisory.level}"><p>${advisory.html}</p><button class="btn small adv-x">Got it</button></div>`);
  }
  if (c.ramp) {
    cards.push(`<div class="card alert-card warn"><p><b>Big jump in playing time.</b> ${fmtMinutes(c.acute)} this week vs. your usual ~${fmtMinutes(c.chronicWeekly)} (${Math.round((c.ratio - 1) * 100)}% more). Sudden increases — before juries, auditions, festivals — are a common trigger for playing-related pain. Build up over several days, keep your breaks, and stop if anything hurts. <a href="#health">Why →</a></p><p class="cite">Chan &amp; Ackermann (2014); NASM–PAMA. Threshold is a rule of thumb.</p></div>`);
  }
  if (c.painDays >= 3 && !advisory) {
    cards.push(`<div class="card alert-card warn"><p><b>Discomfort on ${c.painDays} days this week.</b> Recurring pain is worth getting checked early — don’t play through it. Chapman <a href="https://www.chapman.edu/students/health-and-safety/" target="_blank" rel="noopener">Student Health Center</a> · 714-997-6815.</p></div>`);
  }
  box.innerHTML = cards.join('');
  $('.adv-x', box)?.addEventListener('click', () => { advisory = null; save('advisory', null); renderAlerts(); });
}

function liveSeconds() {
  if (!R) return 0;
  const blk = currentBlock();
  if (blk && blk.cat === 'break') return 0;
  return elapsedInBlock() / 1000;
}

// ---------------- Session runner ----------------
const now = () => Date.now();
function currentBlock() {
  if (!R) return null;
  if (R.mode === 'free') return { label: 'Free practice', cat: S.freeCat, min: Infinity };
  if (R.mode === 'rotate') return { label: S.rotItems[R.rot.cur] || 'Practice', cat: S.rotCat, min: S.rotSeg };
  return S.plan[R.idx] || null;
}
function elapsedInBlock() {
  if (!R) return 0;
  const end = R.pausedAt || now();
  return Math.max(0, end - R.blockStart - R.pausedTotal);
}

/** Interleaving: next item = one of the least-practiced items, never the same one twice in a row. */
function pickNext(rot) {
  const n = S.rotItems.length;
  if (n <= 1) return 0;
  const cands = [...Array(n).keys()].filter((i) => i !== rot.cur);
  const min = Math.min(...cands.map((i) => rot.count[i] || 0));
  const pool = cands.filter((i) => (rot.count[i] || 0) === min);
  return pool[Math.floor(Math.random() * pool.length)];
}

function startSession(mode) {
  getCtx(); // unlock audio on this tap so chimes work later
  askNotify();
  if (mode === 'rotate') {
    S.rotItems = S.rotItems.map((x) => x.trim()).filter(Boolean);
    if (S.rotItems.length < 2) { toast('Add at least two passages to rotate between'); return; }
  }
  R = { mode, idx: 0, blockStart: now(), pausedAt: 0, pausedTotal: 0, lastBreakAt: now(), done: [], goal: S.goal.trim(), startedAt: now() };
  if (mode === 'rotate') {
    R.rot = { cur: Math.floor(Math.random() * S.rotItems.length), count: {} };
    R.rot.count[R.rot.cur] = 1;
  }
  persist();
  keepAwake('session', true);
  renderSession();
  chime('soft');
}

function endBlock(reason) {
  const blk = currentBlock();
  let secs = Math.round(elapsedInBlock() / 1000);
  if (reason === 'time' && blk) secs = Math.min(secs, blk.min * 60); // don't count time the phone sat idle
  if (blk && secs >= 30) {
    addLog({ kind: 'segment', label: blk.label, category: blk.cat, seconds: secs, mode: R.mode });
    R.done.push({ label: blk.label, cat: blk.cat, seconds: secs });
  }
  if (reason === 'stop' || R.mode === 'free') return finish();
  const nextStart = reason === 'time' ? R.blockStart + R.pausedTotal + blk.min * 60000 : now();
  if (R.mode === 'rotate') {
    const played = R.done.reduce((s, d) => s + d.seconds, 0);
    if (played >= S.rotTotal * 60 - 20) return finish(true);
    R.rot.cur = pickNext(R.rot);
    R.rot.count[R.rot.cur] = (R.rot.count[R.rot.cur] || 0) + 1;
  } else {
    R.idx++;
    if (R.idx >= S.plan.length) return finish(true);
  }
  // next block starts where the last one should have ended (catch up after the phone slept)
  R.blockStart = Math.min(nextStart, now());
  R.pausedTotal = 0;
  R.pausedAt = 0;
  R.alerted = false;
  const next = currentBlock();
  if (next.cat === 'break') R.lastBreakAt = now();
  persist();
  renderStats();
  if (reason === 'time') {
    chime(next.cat === 'break' ? 'break' : 'soft');
    if (R.mode === 'rotate') notify(`Switch → ${next.label}`, `${S.rotSeg} min`);
    else notify(next.cat === 'break' ? 'Break time 🧘' : `Next: ${next.label}`, next.cat === 'break' ? CATS.break.hint : `${next.min} min · ${CATS[next.cat].label}`);
  }
  renderSession();
}

function finish(complete = false) {
  const total = R.done.filter((d) => d.cat !== 'break').reduce((s, d) => s + d.seconds, 0);
  if (total >= 60) {
    pending = { goal: R.goal, total, mode: R.mode, at: now() };
    save('reflect', pending);
  }
  R = null;
  persist();
  keepAwake('session', false);
  if (complete) { chime('done'); notify('Session complete 🎉', `${fmtMinutes(total)} of focused practice.`); }
  if (total > 0) toast(`Logged ${fmtMinutes(total)} of practice. Nice work!`);
  renderSession();
  renderStats();
}

/** Minutes until the next planned break block (plan mode), or Infinity. */
function minutesToPlannedBreak() {
  if (R?.mode !== 'plan') return Infinity;
  let m = S.plan[R.idx].min - elapsedInBlock() / 60000;
  for (let i = R.idx + 1; i < S.plan.length; i++) {
    if (S.plan[i].cat === 'break') return m;
    m += S.plan[i].min;
  }
  return Infinity;
}

function tick() {
  if (R && !R.pausedAt) {
    const blk = currentBlock();
    if (R.mode !== 'free' && blk && elapsedInBlock() >= blk.min * 60000) {
      if (S.autoAdvance || R.mode === 'rotate') endBlock('time');
      else if (!R.alerted) { R.alerted = true; chime('soft'); notify('Time’s up', `${blk.label} is done`); }
    }
    // break reminder for long stretches without a break (skipped if the plan has one coming up)
    if (R && S.breakEvery && currentBlock()?.cat !== 'break' && now() - R.lastBreakAt > S.breakEvery * 60000 && minutesToPlannedBreak() > 5) {
      R.lastBreakAt = now();
      persist();
      chime('break');
      notify('Time for a short break', `You’ve played ${S.breakEvery} minutes straight. Stand, stretch, hydrate.`);
      showBreakBanner();
    }
    updateRunning();
  }
  if (qt?.end) {
    const left = qt.end - now();
    if (left <= 0) {
      qt = null;
      save('quicktimer', null);
      chime('done');
      notify('Timer done ⏰', '');
      keepAwake('qt', false);
    }
    renderQuick();
  }
}

function showBreakBanner() {
  const b = $('.break-banner', el);
  if (b) { b.hidden = false; setTimeout(() => (b.hidden = true), 60000); }
  toast('🧘 Break reminder: 3–5 minutes off. Stretch & hydrate.', 6000);
}

// ---------------- Session card ----------------
function renderSession() {
  const box = $('.session-card', el);
  if (!box) return;
  if (R) return renderRunning(box);
  if (pending) return renderReflect(box);

  const tabs = [['plan', 'Plan'], ['rotate', 'Rotate'], ['free', 'Free']];
  const total = S.plan.reduce((s, b) => s + b.min, 0);
  let body = '';
  if (S.tab === 'plan') {
    body = `
      <div class="chips tpl">${Object.entries(TEMPLATES).map(([k, t]) => `<button class="chip" data-tpl="${k}">${t.name}</button>`).join('')}</div>
      <div class="sess-sub"><span class="pill">${total} min</span><button class="btn small s-edit">${editing ? 'Done' : 'Edit blocks'}</button></div>
      ${editing ? `<ol class="plan-list">${S.plan.map((b, i) => `
        <li class="plan-item" style="--cat:${CATS[b.cat].color}">
          <input class="pi-label" data-i="${i}" value="${esc(b.label)}" aria-label="Block name">
          <select class="pi-cat" data-i="${i}" aria-label="Type">${Object.entries(CATS).map(([k, c]) => `<option value="${k}" ${k === b.cat ? 'selected' : ''}>${c.label}</option>`).join('')}</select>
          <input class="pi-min" data-i="${i}" type="number" min="1" max="120" value="${b.min}" inputmode="numeric" aria-label="Minutes"><span class="pi-unit">min</span>
          <button class="btn icon-btn pi-del" data-i="${i}" aria-label="Remove block">×</button>
        </li>`).join('')}</ol>
      <button class="btn small add-block">+ Add block</button>`
      : `<ol class="plan-compact">${S.plan.map((b) => `<li style="--cat:${CATS[b.cat].color}"><span>${esc(b.label)}</span><small>${CATS[b.cat].label} · ${b.min}m</small></li>`).join('')}</ol>`}
      <div class="cat-bar plan-bar">${S.plan.map((b) => `<span style="flex:${b.min};background:${CATS[b.cat].color}"></span>`).join('')}</div>
      <label class="switch"><input type="checkbox" class="s-auto" ${S.autoAdvance ? 'checked' : ''}><span>Auto-advance with a chime</span></label>`;
  } else if (S.tab === 'rotate') {
    body = `
      <p class="hint">Interleaved practice: the app switches you between passages every few minutes, in a shuffled order. It feels harder than drilling one thing — and that’s the point. Advanced clarinetists who alternated pieces in 3-minute segments were rated higher by professional judges than when they practiced in one long block (Carter &amp; Grahn, 2016).</p>
      <label class="field"><span>Passages / items (one per line)</span><textarea class="rot-items" rows="4">${esc(S.rotItems.join('\n'))}</textarea></label>
      <div class="row3">
        <label class="field"><span>Switch every</span><select class="rot-seg">${[2, 3, 4, 5, 8].map((m) => `<option value="${m}" ${m === S.rotSeg ? 'selected' : ''}>${m} min</option>`).join('')}</select></label>
        <label class="field"><span>Total</span><select class="rot-total">${[12, 18, 24, 30, 45, 60].map((m) => `<option value="${m}" ${m === S.rotTotal ? 'selected' : ''}>${m} min</option>`).join('')}</select></label>
        <label class="field"><span>Type</span><select class="rot-cat">${Object.entries(CATS).filter(([k]) => !['break'].includes(k)).map(([k, c]) => `<option value="${k}" ${k === S.rotCat ? 'selected' : ''}>${c.label}</option>`).join('')}</select></label>
      </div>`;
  } else {
    body = `<p class="hint">An open-ended stopwatch that logs your time. Pick what you’re working on; you can switch while it runs.</p>
      <label class="field inline"><span>Working on</span><select class="s-freecat">${Object.entries(CATS).filter(([k]) => k !== 'break').map(([k, c]) => `<option value="${k}" ${k === S.freeCat ? 'selected' : ''}>${c.label}</option>`).join('')}</select></label>`;
  }

  box.innerHTML = `
    <div class="sess-head"><h2>${icon('list')} Practice session</h2></div>
    <div class="seg small-seg" role="tablist">${tabs.map(([k, n]) => `<button role="tab" class="seg-btn ${S.tab === k ? 'on' : ''}" data-tab="${k}">${n}</button>`).join('')}</div>
    <label class="field goal-field"><span>🎯 Goal for this session</span>
      <input class="s-goal" value="${esc(S.goal)}" placeholder="e.g. mm. 32–40 in tune at ♩=80, 3× in a row" enterkeyhint="done"></label>
    ${S.lastNext && !S.goal ? `<button class="chip s-usenext">Last time you planned: “${esc(S.lastNext)}” — use it</button>` : ''}
    ${body}
    <label class="field inline"><span>Break reminder every</span>
      <select class="s-break">${[0, 15, 20, 25, 30, 45, 60].map((m) => `<option value="${m}" ${m === S.breakEvery ? 'selected' : ''}>${m ? `${m} min` : 'off'}</option>`).join('')}</select></label>
    <button class="btn primary big s-go wide">${icon('play')}<span>${S.tab === 'plan' ? 'Start plan' : S.tab === 'rotate' ? 'Start rotation' : 'Start stopwatch'}</span></button>
    <details class="why"><summary>Why practice this way?</summary>
      <p><b>Goal → practice → reflect</b> is the self-regulated learning cycle linked to effective practice in musicians (Zimmerman, 2002; McPherson &amp; Zimmerman, 2011). A specific goal (“mm. 32–40 in tune at ♩=80”) beats a vague one (“work on the sonata”).</p>
      <p>Plan categories follow Galamian’s balance of <b>building</b>, <b>interpreting</b> and <b>performing</b> time. <i>How</i> you practice — slowing down, fixing errors right away, getting it right several times in a row — predicts improvement better than how long (Duke, Simmons &amp; Cash, 2009). Regular breaks help manage physical load (Chan &amp; Ackermann, 2014). <a href="#health">Sources →</a></p>
    </details>`;

  $$('[data-tab]', box).forEach((b) => b.addEventListener('click', () => { S.tab = b.dataset.tab; persist(); renderSession(); }));
  $('.s-goal', box).addEventListener('input', (e) => { S.goal = e.target.value; persist(); });
  $('.s-usenext', box)?.addEventListener('click', () => { S.goal = S.lastNext; persist(); renderSession(); });
  $('.s-break', box).addEventListener('change', (e) => { S.breakEvery = Number(e.target.value); persist(); });
  $('.s-go', box).addEventListener('click', () => startSession(S.tab));
  if (S.tab === 'plan') {
    $$('[data-tpl]', box).forEach((b) => b.addEventListener('click', () => {
      S.plan = TEMPLATES[b.dataset.tpl].blocks.map(([label, cat, min]) => ({ label, cat, min }));
      persist(); renderSession();
    }));
    $$('.pi-label', box).forEach((i) => i.addEventListener('change', () => { S.plan[i.dataset.i].label = i.value || 'Practice'; persist(); }));
    $$('.pi-cat', box).forEach((i) => i.addEventListener('change', () => { S.plan[i.dataset.i].cat = i.value; persist(); renderSession(); }));
    $$('.pi-min', box).forEach((i) => i.addEventListener('change', () => { S.plan[i.dataset.i].min = Math.max(1, Math.min(120, Number(i.value) || 1)); persist(); renderSession(); }));
    $$('.pi-del', box).forEach((b) => b.addEventListener('click', () => { if (S.plan.length > 1) { S.plan.splice(Number(b.dataset.i), 1); persist(); renderSession(); } }));
    $('.s-edit', box).addEventListener('click', () => { editing = !editing; renderSession(); });
    $('.add-block', box)?.addEventListener('click', () => { S.plan.push({ label: 'Repertoire', cat: 'interpreting', min: 10 }); persist(); renderSession(); });
    $('.s-auto', box).addEventListener('change', (e) => { S.autoAdvance = e.target.checked; persist(); });
  } else if (S.tab === 'rotate') {
    $('.rot-items', box).addEventListener('input', (e) => { S.rotItems = e.target.value.split('\n'); persist(); });
    $('.rot-seg', box).addEventListener('change', (e) => { S.rotSeg = Number(e.target.value); persist(); });
    $('.rot-total', box).addEventListener('change', (e) => { S.rotTotal = Number(e.target.value); persist(); });
    $('.rot-cat', box).addEventListener('change', (e) => { S.rotCat = e.target.value; persist(); });
  } else {
    $('.s-freecat', box).addEventListener('change', (e) => { S.freeCat = e.target.value; persist(); });
  }
}

// ---------------- Reflection & body check-in ----------------
const AREAS = [['hands', 'Hands / wrists'], ['arms', 'Forearms / elbows'], ['neck', 'Neck / shoulders'], ['back', 'Back'], ['jaw', 'Jaw / face / lips'], ['voice', 'Voice / throat'], ['ears', 'Ringing / muffled ears']];

function renderReflect(box) {
  const r = { met: '', focus: 0, pain: 'none', areas: [], next: '' };
  box.innerHTML = `
    <div class="sess-head"><h2>✍️ Quick reflection</h2><span class="pill">${fmtMinutes(pending.total)}</span></div>
    <p class="hint">30 seconds now makes tomorrow’s practice smarter — and gives your teacher real information.</p>
    ${pending.goal ? `<p class="goal-recap">🎯 ${esc(pending.goal)}</p>
    <div class="q"><span>Did you reach your goal?</span><div class="chips" data-q="met">${[['yes', 'Yes'], ['partly', 'Partly'], ['no', 'Not yet']].map(([k, n]) => `<button class="chip" data-v="${k}">${n}</button>`).join('')}</div></div>` : ''}
    <div class="q"><span>How focused were you?</span><div class="chips" data-q="focus">${[1, 2, 3, 4, 5].map((n) => `<button class="chip" data-v="${n}">${['😵‍💫', '😕', '🙂', '😀', '🔥'][n - 1]} ${n}</button>`).join('')}</div></div>
    <div class="q"><span>Any pain, tension or discomfort?</span><div class="chips" data-q="pain">${[['none', 'None'], ['mild', 'Mild'], ['moderate', 'Moderate'], ['severe', 'Severe']].map(([k, n]) => `<button class="chip ${k === 'none' ? 'on' : ''}" data-v="${k}">${n}</button>`).join('')}</div></div>
    <div class="q areas-q" hidden><span>Where?</span><div class="chips" data-q="areas">${AREAS.map(([k, n]) => `<button class="chip" data-v="${k}">${n}</button>`).join('')}</div></div>
    <label class="field"><span>Next time I’ll…</span><input class="r-next" placeholder="e.g. start mm. 32–40 at ♩=84"></label>
    <div class="sess-start"><button class="btn primary big r-save">Save reflection</button><button class="btn big r-skip">Skip</button></div>`;

  $$('[data-q]', box).forEach((grp) => {
    const q = grp.dataset.q;
    $$('[data-v]', grp).forEach((b) => b.addEventListener('click', () => {
      if (q === 'areas') {
        b.classList.toggle('on');
        r.areas = $$('.on', grp).map((x) => x.dataset.v);
        return;
      }
      $$('[data-v]', grp).forEach((x) => x.classList.toggle('on', x === b));
      r[q] = q === 'focus' ? Number(b.dataset.v) : b.dataset.v;
      if (q === 'pain') $('.areas-q', box).hidden = r.pain === 'none';
    }));
  });
  $('.r-skip', box).addEventListener('click', () => { pending = null; save('reflect', null); renderSession(); });
  $('.r-save', box).addEventListener('click', () => {
    r.next = $('.r-next', box).value.trim();
    if (r.pain === 'none') r.areas = [];
    addLog({ kind: 'reflection', label: 'Reflection', seconds: 0, detail: { goal: pending.goal, ...r, minutes: Math.round(pending.total / 60) } });
    if (r.next) { S.lastNext = r.next; }
    if (pending.goal && r.met === 'yes') S.goal = '';
    persist();
    const serious = r.pain === 'moderate' || r.pain === 'severe';
    if (serious || r.areas.includes('ears') || (r.areas.includes('voice') && r.pain !== 'none')) {
      const bits = [];
      if (serious) bits.push(`<b>Moderate or severe pain is a signal to stop, rest, and get it checked</b> — early care leads to better outcomes than playing through it. Chapman <a href="https://www.chapman.edu/students/health-and-safety/" target="_blank" rel="noopener">Student Health Center</a>: 714-997-6815. Tell your teacher too.`);
      if (r.areas.includes('ears')) bits.push('<b>Ringing or muffled hearing means your ears were over-exposed.</b> Give them quiet time, measure your room on the Sound level screen, and consider musicians’ earplugs. If it lasts beyond a day, see an audiologist.');
      if (r.areas.includes('voice') && !serious) bits.push('<b>Voice discomfort?</b> Try vocal rest, hydration and gentle straw phonation. Hoarseness lasting ~4 weeks (sooner if severe) warrants an ENT exam.');
      advisory = { level: serious ? 'bad' : 'warn', html: bits.join('<br><br>') };
      save('advisory', advisory);
    }
    pending = null;
    save('reflect', null);
    toast('Reflection saved — it’ll show up in your teacher report');
    renderSession();
    renderAlerts();
  });
}

// ---------------- Running ----------------
function renderRunning(box) {
  const head = R.mode === 'free' ? 'Free practice' : R.mode === 'rotate' ? 'Interleaved rotation' : `Block ${R.idx + 1} of ${S.plan.length}`;
  box.innerHTML = `
    <div class="sess-head"><h2>${head}</h2><span class="pill live">● Live</span></div>
    ${R.goal ? `<p class="goal-recap">🎯 ${esc(R.goal)}</p>` : ''}
    <div class="break-banner" hidden>🧘 Break reminder — rest 3–5 min, stretch, sip water.</div>
    <div class="run-now">
      <div class="run-cat"></div>
      <div class="run-label"></div>
      <div class="run-clock">0:00</div>
      <div class="run-hint hint"></div>
      ${R.mode === 'free' ? `<label class="field inline"><span>Working on</span><select class="run-freecat">${Object.entries(CATS).filter(([k]) => k !== 'break').map(([k, c]) => `<option value="${k}" ${k === S.freeCat ? 'selected' : ''}>${c.label}</option>`).join('')}</select></label>` : ''}
    </div>
    ${R.mode !== 'free' ? '<div class="run-progress"><div class="run-fill"></div></div>' : ''}
    ${R.mode === 'plan' ? `<ol class="run-list">${S.plan.map((b, i) => `<li class="${i < R.idx ? 'done' : i === R.idx ? 'cur' : ''}" style="--cat:${CATS[b.cat].color}"><span>${esc(b.label)}</span><small>${b.min}m</small></li>`).join('')}</ol>` : ''}
    ${R.mode === 'rotate' ? `<ol class="run-list">${S.rotItems.map((t, i) => `<li class="${i === R.rot.cur ? 'cur' : ''}" style="--cat:${CATS[S.rotCat].color}"><span>${esc(t)}</span><small>${R.rot.count[i] || 0}×</small></li>`).join('')}</ol>` : ''}
    <div class="run-actions">
      <button class="btn big r-pause">${icon('pause')}<span>Pause</span></button>
      ${R.mode === 'free' ? '<button class="btn big r-break">Take a break</button>' : `<button class="btn big r-skip">${R.mode === 'rotate' ? 'Switch ›' : 'Next ›'}</button>`}
      ${R.mode === 'plan' ? '<button class="btn r-plus">+2 min</button>' : ''}
      <button class="btn danger r-stop">End</button>
    </div>`;
  $('.r-pause', box).addEventListener('click', togglePause);
  $('.r-stop', box).addEventListener('click', () => endBlock('stop'));
  $('.r-skip', box)?.addEventListener('click', () => endBlock('skip'));
  $('.r-plus', box)?.addEventListener('click', () => { S.plan[R.idx].min += 2; persist(); renderSession(); });
  $('.r-break', box)?.addEventListener('click', () => {
    const secs = Math.round(elapsedInBlock() / 1000);
    if (secs >= 30) { addLog({ kind: 'segment', label: 'Free practice', category: S.freeCat, seconds: secs, mode: 'free' }); R.done.push({ cat: S.freeCat, seconds: secs }); }
    R.blockStart = now(); R.pausedTotal = 0; R.pausedAt = now(); R.lastBreakAt = now();
    persist(); toast('Paused for a break — tap Resume when you’re back'); renderSession();
  });
  $('.run-freecat', box)?.addEventListener('change', (e) => {
    const secs = Math.round(elapsedInBlock() / 1000);
    if (secs >= 30) { addLog({ kind: 'segment', label: 'Free practice', category: S.freeCat, seconds: secs, mode: 'free' }); R.done.push({ cat: S.freeCat, seconds: secs }); }
    S.freeCat = e.target.value; R.blockStart = now(); R.pausedTotal = 0; if (R.pausedAt) R.pausedAt = now();
    persist(); updateRunning();
  });
  updateRunning();
}

function togglePause() {
  if (R.pausedAt) { R.pausedTotal += now() - R.pausedAt; R.pausedAt = 0; R.lastBreakAt = now(); }
  else R.pausedAt = now();
  persist();
  renderSession();
}

function updateRunning() {
  const box = $('.session-card', el);
  if (!R || !box || !$('.run-clock', box)) return;
  const blk = currentBlock();
  if (!blk) return;
  const el2 = elapsedInBlock();
  const cat = CATS[blk.cat];
  $('.run-cat', box).textContent = R.mode === 'rotate' ? `${cat.label} · switch every ${S.rotSeg} min` : cat.label;
  $('.run-cat', box).style.background = cat.color;
  $('.run-label', box).textContent = blk.label;
  $('.run-hint', box).textContent = R.mode === 'rotate' ? 'Jump straight in — no warm-up repetitions. Notice what slipped since last time.' : cat.hint;
  if (R.mode === 'free') {
    $('.run-clock', box).textContent = fmtClock(el2 / 1000);
  } else {
    const left = blk.min * 60000 - el2;
    $('.run-clock', box).textContent = left >= 0 ? fmtClock(left / 1000) : `+${fmtClock(-left / 1000)}`;
    const before = R.mode === 'plan' ? S.plan.slice(0, R.idx).reduce((s, b) => s + b.min, 0) * 60000 : R.done.reduce((s, d) => s + d.seconds, 0) * 1000;
    const total = (R.mode === 'plan' ? S.plan.reduce((s, b) => s + b.min, 0) : S.rotTotal) * 60000;
    $('.run-fill', box).style.width = `${Math.min(100, ((before + el2) / total) * 100)}%`;
  }
  box.classList.toggle('paused', !!R.pausedAt);
  const pb = $('.r-pause', box);
  if (pb) pb.innerHTML = R.pausedAt ? `${icon('play')}<span>Resume</span>` : `${icon('pause')}<span>Pause</span>`;
  if (Math.floor(el2 / 1000) % 15 === 0) renderStats();
}

// ---------------- Quick timer ----------------
function startQuick(min) {
  getCtx();
  askNotify();
  qt = { end: now() + min * 60000, total: min * 60000 };
  save('quicktimer', qt);
  keepAwake('qt', true);
  renderQuick();
}
function pauseQuick() {
  if (!qt?.end) return;
  qt = { left: qt.end - now(), total: qt.total };
  save('quicktimer', qt);
  renderQuick();
}
function resumeQuick() {
  qt = { end: now() + qt.left, total: qt.total };
  save('quicktimer', qt);
  renderQuick();
}
function renderQuick() {
  if (!el) return;
  const d = $('.qt-display', el);
  const running = !!qt?.end, paused = qt?.left != null;
  const left = running ? qt.end - now() : paused ? qt.left : 0;
  d.textContent = fmtClock(Math.ceil(left / 1000));
  d.classList.toggle('active', running);
  $('.qt-pause', el).hidden = !running;
  $('.qt-cancel', el).hidden = !(running || paused);
  $('.qt-go', el).textContent = paused ? 'Resume' : 'Start';
  $('.qt-go', el).hidden = running;
}

// ---------------- Notifications ----------------
function askNotify() {
  if ('Notification' in window && Notification.permission === 'default') {
    try { Notification.requestPermission(); } catch {}
  }
}
function notify(title, body) {
  if (document.visibilityState === 'visible') return; // the in-app chime/toast is enough
  try {
    if ('Notification' in window && Notification.permission === 'granted') {
      navigator.serviceWorker?.ready
        .then((reg) => reg.showNotification(title, { body, icon: 'icons/icon-192.png', tag: 'practice' }))
        .catch(() => new Notification(title, { body }));
    }
  } catch {}
}

// ---------------- Cards ----------------
function renderTip() {
  const t = tipOfTheDay();
  $('.tip-card', el).innerHTML = `<h2>${icon('heart')} Health tip</h2><p>${t.text}</p><p class="cite">${t.cite} · <a href="#health">More →</a></p>`;
}

function renderNextConcert() {
  const box = el && $('.next-concert', el);
  if (!box) return;
  comingUp(3).then(({ weekend, wk, next, total }) => {
    const fmtDay = (d) => d.toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' });
    const time = (e) => (e.allDay ? 'All day' : e.d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }));
    const row = (e, showDate) => `
      <a class="mini-event" href="#concerts" data-ev="${e.id}">
        ${showDate ? `<span class="me-date"><b>${e.d.getDate()}</b>${e.d.toLocaleDateString([], { month: 'short' })}</span>` : `<span class="me-time">${time(e)}</span>`}
        <span><b>${esc(e.title)}</b><small>${showDate ? `${e.d.toLocaleDateString([], { weekday: 'short' })} ${time(e)} · ` : ''}${esc(e.venue)}${e.category !== 'music' ? ` <span class="tag">${e.category}</span>` : ''}</small></span>
      </a>`;
    const lastDay = new Date(wk.end.getTime() - 864e5);
    const range = `${wk.start.toLocaleDateString([], { month: 'short', day: 'numeric' })}–${lastDay.toLocaleDateString([], { month: wk.start.getMonth() === lastDay.getMonth() ? undefined : 'short', day: 'numeric' })}`;
    let html = `<h2>${icon('calendar')} Coming up at Chapman</h2>`;
    html += `<h3 class="mini-h">This weekend · ${range}</h3>`;
    if (weekend.length) {
      let day = '';
      for (const e of weekend) {
        const k = e.d.toDateString();
        if (k !== day) { html += `<p class="mini-day">${fmtDay(e.d)}</p>`; day = k; }
        html += row(e, false);
      }
    } else {
      html += '<p class="hint">Nothing on the calendar this weekend.</p>';
    }
    if (next.length) html += `<h3 class="mini-h">Next up in music</h3>${next.map((e) => row(e, true)).join('')}`;
    html += `<a class="btn wide" href="#concerts">See the full calendar${total ? ` (${total} events)` : ''} →</a>`;
    box.innerHTML = html;
    $$('[data-ev]', box).forEach((a) => a.addEventListener('click', (ev) => { ev.preventDefault(); focusConcert(a.dataset.ev); }));
  });
}
