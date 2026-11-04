import { getCtx, acquireMic, releaseMic, micErrorMessage, sinkSilently } from './audio.js';
import { aWeightingSections, allowedSeconds, doseFraction } from './aweight.js';
import { load, save, todayKey, daysAgoKey } from './store.js';
import { $, fitCanvas, cssVar, fmtClock, keepAwake, icon } from './ui.js';

const S = load('db', { offset: 100, response: 'fast' });
S.protect ??= 0;
let el, src, chain = [], analyser, buf, sink, timer = 0, running = false;
let energyFast = 0, energySlow = 0;
let session = null; // { start, energySum, seconds, max, min, dose }
let history = []; // { t, L }

function zone(L) {
  if (L < 70) return { cls: 'z-ok', label: 'Comfortable' };
  if (L < 85) return { cls: 'z-mod', label: 'Moderate' };
  if (L < 100) return { cls: 'z-loud', label: 'Loud — limit your time' };
  return { cls: 'z-danger', label: 'Very loud — protect your ears' };
}

function fmtAllowed(sec) {
  if (sec > 24 * 3600) return 'no daily limit at this level';
  if (sec >= 3600) return `${(sec / 3600).toFixed(sec >= 36000 ? 0 : 1)} h`;
  if (sec >= 60) return `${Math.round(sec / 60)} min`;
  return `${Math.max(1, Math.round(sec))} s`;
}

export const dbmeter = {
  id: 'db',
  mount(root) {
    el = root;
    root.innerHTML = `
      <header class="view-head"><h1>Sound level</h1><p class="sub">Estimate how loud your practice room is — and how long is safe at that level.</p></header>
      <div class="card db-card" data-zone="z-ok">
        <div class="db-big"><output class="db-num">––</output><span class="db-unit">dB(A)<small>estimated</small></span></div>
        <div class="db-zone">Tap start to measure</div>
        <div class="db-bar" aria-hidden="true"><div class="db-fill"></div><div class="db-peak"></div>
          <span style="left:${((70 - 30) / 90) * 100}%">70</span><span style="left:${((85 - 30) / 90) * 100}%">85</span><span style="left:${((100 - 30) / 90) * 100}%">100</span></div>
        <p class="db-allowed"></p>
        <label class="field inline db-protect"><span>Hearing protection</span>
          <select class="db-prot">${[[0, 'None'], [9, 'Musicians’ earplugs −9 dB'], [15, 'Musicians’ earplugs −15 dB'], [25, 'Musicians’ earplugs −25 dB'], [10, 'Foam earplugs (conservative ≈ −10 dB)']].map(([v, n]) => `<option value="${v}" ${v === S.protect ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
        <canvas class="db-hist" aria-label="Sound level over the last two minutes"></canvas>
        <button class="btn primary big db-toggle">${icon('mic')}<span>Start meter</span></button>
        <p class="db-err err" hidden></p>
      </div>

      <div class="card">
        <h2>This session</h2>
        <div class="stats">
          <div><b class="db-leq">–</b><span>Average (L<sub>Aeq</sub>)</span></div>
          <div><b class="db-max">–</b><span>Max</span></div>
          <div><b class="db-time">0:00</b><span>Measured</span></div>
          <div><b class="db-dose">0%</b><span>Today's noise dose</span></div>
        </div>
        <div class="dose-bar"><div class="dose-fill"></div></div>
        <p class="hint">Dose uses the NIOSH recommended limit: 85 dBA for 8 hours, halving the safe time for every +3 dB. 100% = a full day's recommended exposure. It accumulates across today's measurements on this phone and subtracts your hearing protection — real-world earplug protection is often lower than the label, especially if not inserted well, so the foam option is deliberately conservative.</p>
      </div>

      <div class="card">
        <h2>How long is safe?</h2>
        <table class="safe-table">
          <thead><tr><th>Level</th><th>NIOSH recommended daily limit</th></tr></thead>
          <tbody>
            <tr><td>85 dBA</td><td>8 hours</td></tr>
            <tr><td>88 dBA</td><td>4 hours</td></tr>
            <tr><td>91 dBA</td><td>2 hours</td></tr>
            <tr><td>94 dBA</td><td>1 hour</td></tr>
            <tr><td>97 dBA</td><td>30 minutes</td></tr>
            <tr><td>100 dBA</td><td>15 minutes</td></tr>
            <tr><td>103 dBA</td><td>7½ minutes</td></tr>
            <tr><td>106 dBA</td><td>under 4 minutes</td></tr>
          </tbody>
        </table>
        <p class="hint">For comparison, NIDCD lists normal conversation at 60–70 dBA and concerts at roughly 94–110 dBA. Limits: NIOSH (1998), <i>Criteria for a Recommended Standard: Occupational Noise Exposure</i>. See Health → Hearing for sources and protection tips.</p>
      </div>

      <div class="card">
        <h2>Calibration</h2>
        <p class="hint">Phone microphones vary, and browsers don't expose calibration data, so treat readings as estimates (typically within a few dB once calibrated). NIOSH testing found only some phone sound apps were within ±2 dB of a reference meter (Kardous &amp; Shaw, 2014). For best accuracy, set the offset while standing next to a real sound level meter.</p>
        <label class="field"><span>Offset: <output class="db-off">${S.offset}</output> dB</span>
          <input type="range" class="db-offset" min="70" max="130" step="0.5" value="${S.offset}"></label>
        <div class="row2">
          <label class="field"><span>Reference meter reads</span><input type="number" class="db-ref" placeholder="e.g. 72.5" inputmode="decimal"></label>
          <button class="btn db-cal" style="align-self:end">Match it</button>
        </div>
        <label class="field"><span>Response</span>
          <select class="db-resp"><option value="fast" ${S.response === 'fast' ? 'selected' : ''}>Fast (125 ms)</option><option value="slow" ${S.response === 'slow' ? 'selected' : ''}>Slow (1 s)</option></select></label>
      </div>`;

    $('.db-toggle', root).addEventListener('click', () => (running ? stop() : start()));
    $('.db-offset', root).addEventListener('input', (e) => { S.offset = Number(e.target.value); $('.db-off', root).textContent = S.offset; save('db', S); });
    $('.db-prot', root).addEventListener('change', (e) => { S.protect = Number(e.target.value); save('db', S); });
    $('.db-resp', root).addEventListener('change', (e) => { S.response = e.target.value; save('db', S); });
    $('.db-cal', root).addEventListener('click', () => {
      const ref = parseFloat($('.db-ref', root).value);
      if (!running || !isFinite(ref) || !energySlow) return alert('Start the meter, hold the phone next to the reference meter, and type what the reference shows.');
      const raw = 10 * Math.log10(energySlow + 1e-20);
      S.offset = Math.round((ref - raw) * 2) / 2;
      $('.db-offset', root).value = S.offset;
      $('.db-off', root).textContent = S.offset;
      save('db', S);
    });
    renderDose();
  },
  show() { renderDose(); },
  hide() { if (running) stop(); },
};

async function start() {
  const err = $('.db-err', el);
  err.hidden = true;
  try {
    const ctx = getCtx();
    const stream = await acquireMic();
    src = ctx.createMediaStreamSource(stream);
    chain = aWeightingSections(ctx.sampleRate).map(({ b, a }) => ctx.createIIRFilter(b, a));
    analyser = ctx.createAnalyser();
    analyser.fftSize = 4096;
    buf = new Float32Array(analyser.fftSize);
    let node = src;
    for (const f of chain) { node.connect(f); node = f; }
    node.connect(analyser);
    sink = sinkSilently(analyser);
    running = true;
    energyFast = energySlow = 0;
    session = { start: Date.now(), energySum: 0, seconds: 0, max: -Infinity };
    history = [];
    last = performance.now();
    timer = setInterval(tick, 100);
    keepAwake('db', true);
    const b = $('.db-toggle', el);
    b.classList.add('active');
    b.innerHTML = `${icon('stop')}<span>Stop meter</span>`;
  } catch (e) {
    err.textContent = micErrorMessage(e);
    err.hidden = false;
  }
}

function stop() {
  running = false;
  clearInterval(timer);
  flushDose();
  try { src?.disconnect(); chain.forEach((f) => f.disconnect()); analyser?.disconnect(); sink?.disconnect(); } catch {}
  releaseMic();
  keepAwake('db', false);
  const b = $('.db-toggle', el);
  b.classList.remove('active');
  b.innerHTML = `${icon('mic')}<span>Start meter</span>`;
}

let last = 0, ticks = 0, pendingDose = 0;
function flushDose() {
  if (!pendingDose) return;
  const doses = load('dose', {});
  const k = todayKey();
  doses[k] = (doses[k] || 0) + pendingDose;
  pendingDose = 0;
  const cutoff = daysAgoKey(30);
  for (const d of Object.keys(doses)) if (d < cutoff) delete doses[d];
  save('dose', doses);
}
function tick() {
  const now = performance.now();
  const dt = Math.min(0.5, (now - last) / 1000);
  last = now;
  analyser.getFloatTimeDomainData(buf);
  let e = 0;
  for (let i = 0; i < buf.length; i++) e += buf[i] * buf[i];
  e /= buf.length;
  const af = 1 - Math.exp(-dt / 0.125);
  const as = 1 - Math.exp(-dt / 1.0);
  energyFast = energyFast ? energyFast + af * (e - energyFast) : e;
  energySlow = energySlow ? energySlow + as * (e - energySlow) : e;
  const level = (en) => 10 * Math.log10(en + 1e-20) + S.offset;
  const L = level(S.response === 'fast' ? energyFast : energySlow);
  const Lblock = level(e);

  session.seconds += dt;
  session.energySum += Math.pow(10, Lblock / 10) * dt;
  session.max = Math.max(session.max, L);
  pendingDose += doseFraction(Lblock - S.protect, dt); // dose counts what reaches your ear
  if (++ticks % 10 === 0) flushDose();

  history.push({ t: now, L });
  while (history.length && now - history[0].t > 120000) history.shift();
  render(L);
}

function render(L) {
  const z = zone(L);
  const card = $('.db-card', el);
  card.dataset.zone = z.cls;
  $('.db-num', el).textContent = Math.max(0, L).toFixed(0);
  $('.db-zone', el).textContent = z.label;
  const pct = (v) => Math.max(0, Math.min(100, ((v - 30) / 90) * 100));
  $('.db-fill', el).style.clipPath = `inset(0 ${100 - pct(L)}% 0 0 round 99px)`;
  $('.db-peak', el).style.left = `${pct(session.max)}%`;
  const ear = L - S.protect;
  const earNote = S.protect ? ` At your ear with protection ≈ <b>${ear.toFixed(0)} dBA</b>.` : '';
  $('.db-allowed', el).innerHTML = ear >= 80
    ? `Recommended max at ${S.protect ? 'your ear' : 'this level'}: <b>${fmtAllowed(allowedSeconds(ear))}</b> per day.${earNote}`
    : `${S.protect ? `At your ear ≈ <b>${ear.toFixed(0)} dBA</b>. ` : ''}Below 80 dBA: not counted toward your daily noise dose.`;
  const leq = 10 * Math.log10(session.energySum / Math.max(0.001, session.seconds));
  $('.db-leq', el).textContent = `${leq.toFixed(0)} dBA`;
  $('.db-max', el).textContent = `${session.max.toFixed(0)} dBA`;
  $('.db-time', el).textContent = fmtClock(session.seconds);
  renderDose();
  drawHistory();
}

function renderDose() {
  if (!el) return;
  const dose = ((load('dose', {})[todayKey()] || 0) + pendingDose) * 100;
  $('.db-dose', el).textContent = `${dose < 10 ? dose.toFixed(1) : dose.toFixed(0)}%`;
  const fill = $('.dose-fill', el);
  fill.style.width = `${Math.min(100, dose)}%`;
  fill.dataset.level = dose >= 100 ? 'over' : dose >= 50 ? 'half' : 'ok';
}

function drawHistory() {
  const { g, w, h } = fitCanvas($('.db-hist', el));
  g.clearRect(0, 0, w, h);
  const y = (L) => h - ((Math.max(30, Math.min(120, L)) - 30) / 90) * h;
  g.strokeStyle = cssVar('--line');
  g.setLineDash([3, 4]);
  g.lineWidth = 1;
  for (const lv of [70, 85, 100]) { g.beginPath(); g.moveTo(0, y(lv)); g.lineTo(w, y(lv)); g.stroke(); }
  g.setLineDash([]);
  g.fillStyle = cssVar('--muted');
  g.font = '10px system-ui';
  g.fillText('85', 2, y(85) - 2);
  if (history.length < 2) return;
  const now = performance.now();
  g.lineWidth = 2;
  g.strokeStyle = cssVar('--accent');
  g.beginPath();
  history.forEach((p, i) => {
    const x = w - ((now - p.t) / 120000) * w;
    if (i) g.lineTo(x, y(p.L)); else g.moveTo(x, y(p.L));
  });
  g.stroke();
}
