// Navigation chrome: breadcrumbs + back button for sub-screens, first-run welcome screen,
// and a guided tour.
import { load, save } from './store.js';
import { $, $$, esc, icon } from './ui.js';

export const NAMES = {
  today: 'Today', tuner: 'Tuner', beats: 'Beats', jam: 'Jam', record: 'Record', more: 'More',
  db: 'Sound level', health: 'Health & research', concerts: 'Concerts', report: 'Teacher report', breathe: 'Breathe',
};
export const TABS = ['today', 'tuner', 'beats', 'jam', 'record', 'more'];
export const isTab = (k) => TABS.includes(k);

// ---------- history stack (so "Back" returns to where you actually came from) ----------
const stack = [];
const scrolls = {};
let goingBack = false;

// Following a "#view" link resets the page to the top before hashchange fires, so remember
// the position at the moment of the tap instead.
if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
let tapY = null;
document.addEventListener('click', (e) => {
  if (e.target.closest?.('a[href^="#"], .crumb-back, [data-ev]')) tapY = window.scrollY;
}, true);

/** Call on every route change. Returns { parent, isBack } for the new screen. */
export function track(prev, key) {
  if (prev) scrolls[prev] = tapY ?? window.scrollY;
  tapY = null;
  let isBack = false;
  if (stack.length >= 2 && stack[stack.length - 2] === key) {
    stack.pop();
    isBack = true;
  } else if (isTab(key)) {
    stack.length = 0;
    stack.push(key);
  } else {
    stack.push(key);
  }
  if (goingBack) { isBack = true; goingBack = false; }
  const parent = isTab(key) ? null : stack.length >= 2 ? stack[stack.length - 2] : 'more';
  return { parent, isBack, scroll: isBack ? scrolls[key] || 0 : 0 };
}

/** The tab to highlight: a sub-screen keeps the tab you came from lit. */
export function tabFor(key) {
  if (isTab(key)) return key;
  for (let i = stack.length - 1; i >= 0; i--) if (isTab(stack[i])) return stack[i];
  return 'more';
}

export function renderCrumbs(key, parent) {
  const bar = $('#crumbs');
  if (!parent) { bar.hidden = true; bar.innerHTML = ''; return; }
  // trail: the tab you started from → intermediate screens → this one
  const trail = [];
  let started = false;
  for (const k of stack) {
    if (isTab(k)) { trail.length = 0; started = true; }
    if (started && k !== key) trail.push(k);
  }
  if (!trail.length) trail.push(parent);
  bar.innerHTML = `
    <button class="crumb-back" aria-label="Back to ${esc(NAMES[parent])}">${icon('back')}<span>Back</span></button>
    <nav class="crumb-trail" aria-label="Breadcrumb">${trail.map((k) => `<a href="#${k}">${esc(NAMES[k])}</a><span aria-hidden="true">›</span>`).join('')}<b aria-current="page">${esc(NAMES[key])}</b></nav>`;
  bar.hidden = false;
  $('.crumb-back', bar).addEventListener('click', () => {
    if (stack.length >= 2) { goingBack = true; history.back(); }
    else location.hash = parent;
  });
}

// ---------- Welcome ----------
export function maybeWelcome(startTour) {
  if (load('welcomed', false)) return;
  const w = document.createElement('div');
  w.id = 'welcome';
  w.setAttribute('role', 'dialog');
  w.setAttribute('aria-modal', 'true');
  w.setAttribute('aria-labelledby', 'welcome-title');
  w.innerHTML = `
    <div class="welcome-card">
      <img src="icons/icon.svg" alt="" class="welcome-logo">
      <h1 id="welcome-title">Welcome to<br>The Chapman Practice App</h1>
      <p class="welcome-sub">Tuner, a metronome that grooves, backing tracks, a recorder and a practice planner — with research-based tips for keeping your body, voice and ears healthy.</p>
      <p class="welcome-credit">Created with Claude Code, with input from Chapman faculty.</p>
      <div class="welcome-ctas">
        <button class="btn primary big w-tour">Show me around</button>
        <button class="btn big w-go">Jump right in</button>
      </div>
      <p class="welcome-privacy">🔒 Your practice log and recordings stay on this phone.</p>
    </div>`;
  document.body.appendChild(w);
  document.body.classList.add('modal-open');
  const close = () => { save('welcomed', true); w.remove(); document.body.classList.remove('modal-open'); };
  $('.w-go', w).addEventListener('click', () => { close(); location.hash = 'today'; });
  $('.w-tour', w).addEventListener('click', () => { close(); startTour(); });
  setTimeout(() => $('.w-tour', w).focus(), 50);
}

// ---------- Guided tour ----------
const STEPS = [
  { view: 'today', target: '.session-card', title: 'Plan your practice', text: 'Set a goal, choose a plan — or <b>Rotate</b> between passages — and the app times each block, chimes when it’s time to switch, reminds you to take breaks, and asks a 30-second reflection at the end.' },
  { view: 'today', target: '.stats-card', title: 'See your week', text: 'Minutes, days practiced, your streak and the mix of technique, musicianship and run-throughs. It warns you if your playing time jumps suddenly — a common cause of injury.' },
  { view: 'tuner', target: '.tuner-card', title: 'Tuner & drones', text: 'Play a long tone: green means within 5 cents. Set A=442 or 415, show notes for B♭/E♭/F instruments, and practice intervals against a drone.' },
  { view: 'beats', target: '.groove-grid', title: 'A metronome that grooves', text: 'Classic click, or house, trap, reggaetón, swing and more. Further down: the <b>accuracy ladder</b> raises the tempo only after several clean repetitions.' },
  { view: 'jam', target: '.jam-now', title: 'Backing tracks for any chords', text: 'Type <code>Dm7 G7 Cmaj7</code>, <code>ii V I</code> or <code>1 5 6m 4</code>, pick a style and key, and mute the part you play.' },
  { view: 'record', target: '.rec-card', title: 'Record & listen back', text: 'Recordings reveal what you actually played. Mark what needs work — intonation, rhythm, tone — and slow playback down.' },
  { view: 'more', target: '.shortcut-grid', title: 'More tools', text: '<b>Sound level</b> (protect your hearing), <b>Breathe</b> (calm nerves before a jury), <b>Health & research</b>, <b>Concerts</b>, and a <b>Teacher report</b> to share at your lesson.' },
  { view: 'today', target: '.next-concert', title: 'Concerts at Chapman', text: 'Everything happening this weekend, what’s next in music, and the full calendar. You’re all set — you can replay this tour from <b>More</b>.' },
];
let step = -1;

export function startTour() {
  step = 0;
  document.body.classList.add('touring');
  showStep();
}

function endTour() {
  step = -1;
  $('#tour')?.remove();
  $$('.tour-hl').forEach((x) => x.classList.remove('tour-hl'));
  $$('.tabbar a').forEach((a) => a.classList.remove('tour-tab'));
  document.body.classList.remove('touring');
  save('welcomed', true);
  location.hash = 'today';
}

function showStep() {
  const s = STEPS[step];
  if (location.hash !== `#${s.view}`) location.hash = s.view;
  let card = $('#tour');
  if (!card) {
    card = document.createElement('div');
    card.id = 'tour';
    card.setAttribute('role', 'dialog');
    card.setAttribute('aria-live', 'polite');
    document.body.appendChild(card);
  }
  card.innerHTML = `
    <div class="tour-top"><span class="tour-count">${step + 1} of ${STEPS.length}</span><button class="tour-x" aria-label="End tour">✕</button></div>
    <h2>${s.title}</h2>
    <p>${s.text}</p>
    <div class="tour-dots">${STEPS.map((_, i) => `<i class="${i === step ? 'on' : ''}"></i>`).join('')}</div>
    <div class="tour-actions">
      <button class="btn t-prev" ${step === 0 ? 'disabled' : ''}>Back</button>
      <button class="btn primary t-next">${step === STEPS.length - 1 ? 'Start practicing' : 'Next'}</button>
    </div>`;
  $('.tour-x', card).addEventListener('click', endTour);
  $('.t-prev', card).addEventListener('click', () => { if (step > 0) { step--; showStep(); } });
  $('.t-next', card).addEventListener('click', () => { if (step < STEPS.length - 1) { step++; showStep(); } else endTour(); });
  // highlight after the screen has rendered
  setTimeout(() => {
    $$('.tour-hl').forEach((x) => x.classList.remove('tour-hl'));
    $$('.tabbar a').forEach((a) => a.classList.toggle('tour-tab', a.dataset.nav === s.view));
    const t = $(`#v-${s.view} ${s.target}`);
    if (t) {
      t.classList.add('tour-hl');
      const top = t.getBoundingClientRect().top + window.scrollY - 16;
      window.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
    }
  }, 120);
}
