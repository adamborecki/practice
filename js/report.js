// Weekly practice report a student can print, PDF, email or share with their teacher.
import { load, save, getLog, addLog, removeLog, getNotes, setNote, todayKey, daysAgoKey, recordings } from './store.js';
import { $, $$, esc, fmtMinutes, toast, icon } from './ui.js';
import { CATS, loadCheck } from './session.js';
import { LISTEN } from './recorder.js';

const P = load('profile', { name: '', instrument: '', teacher: '', teacherEmail: '', range: 7, goals: '', questions: '' });
let el;

export const report = {
  id: 'report',
  mount(root) {
    el = root;
    root.innerHTML = `
      <header class="view-head no-print"><h1>Teacher report</h1><p class="sub">A summary of what you’ve practiced, ready to share at your lesson.</p></header>
      <div class="card no-print">
        <h2>About you</h2>
        <div class="row2">
          <label class="field"><span>Your name</span><input class="p-name" value="${esc(P.name)}" autocomplete="name"></label>
          <label class="field"><span>Instrument / voice</span><input class="p-inst" value="${esc(P.instrument)}" placeholder="e.g. Violin, Soprano"></label>
        </div>
        <div class="row2">
          <label class="field"><span>Teacher</span><input class="p-teacher" value="${esc(P.teacher)}"></label>
          <label class="field"><span>Teacher email (optional)</span><input class="p-email" type="email" value="${esc(P.teacherEmail)}" inputmode="email"></label>
        </div>
        <label class="field"><span>Report covers</span>
          <select class="p-range">${[[7, 'Last 7 days'], [14, 'Last 2 weeks'], [30, 'Last 30 days']].map(([v, n]) => `<option value="${v}" ${v === P.range ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
        <label class="field"><span>My goals this week</span><textarea class="p-goals" rows="2" placeholder="e.g. Clean up the shifts in mm. 32–40; memorize the exposition">${esc(P.goals)}</textarea></label>
        <label class="field"><span>Questions for my teacher</span><textarea class="p-q" rows="2" placeholder="e.g. Is my bow arm too tense in the spiccato section?">${esc(P.questions)}</textarea></label>
      </div>

      <div class="card no-print">
        <h2>Today’s practice note</h2>
        <textarea class="p-note" rows="2" placeholder="What went well? What will you try tomorrow?">${esc(getNotes()[todayKey()] || '')}</textarea>
        <details class="why"><summary>+ Log practice done without the app</summary>
          <div class="row2">
            <label class="field"><span>Date</span><input type="date" class="m-date" value="${todayKey()}"></label>
            <label class="field"><span>Minutes</span><input type="number" class="m-min" min="1" max="600" value="30" inputmode="numeric"></label>
          </div>
          <div class="row2">
            <label class="field"><span>Type</span><select class="m-cat">${Object.entries(CATS).filter(([k]) => k !== 'break').map(([k, c]) => `<option value="${k}">${c.label}</option>`).join('')}</select></label>
            <label class="field"><span>What</span><input class="m-label" placeholder="e.g. Ensemble rehearsal"></label>
          </div>
          <button class="btn m-add">Add to log</button>
        </details>
      </div>

      <div class="report-actions no-print">
        <button class="btn primary r-share">${icon('share')} Share</button>
        <button class="btn r-print">Print / PDF</button>
        <button class="btn r-email">Email</button>
        <button class="btn r-copy">Copy text</button>
      </div>

      <article class="card report-doc"></article>`;

    const bind = (cls, key) => $(cls, root).addEventListener('input', (e) => { P[key] = e.target.value; save('profile', P); renderDoc(); });
    bind('.p-name', 'name'); bind('.p-inst', 'instrument'); bind('.p-teacher', 'teacher'); bind('.p-email', 'teacherEmail');
    bind('.p-goals', 'goals'); bind('.p-q', 'questions');
    $('.p-range', root).addEventListener('change', (e) => { P.range = Number(e.target.value); save('profile', P); renderDoc(); });
    $('.p-note', root).addEventListener('input', (e) => { setNote(todayKey(), e.target.value); renderDoc(); });
    $('.m-add', root).addEventListener('click', () => {
      const min = Number($('.m-min', root).value);
      const date = $('.m-date', root).value || todayKey();
      if (!(min > 0)) return toast('Enter minutes');
      const cat = $('.m-cat', root).value;
      addLog({ kind: 'segment', manual: true, date, label: $('.m-label', root).value.trim() || CATS[cat].label, category: cat, seconds: min * 60 });
      toast(`Added ${min} min on ${date}`);
      renderDoc();
    });
    $('.r-print', root).addEventListener('click', () => window.print());
    $('.r-copy', root).addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(asText()); toast('Report copied'); } catch { toast('Copy failed — try Share'); }
    });
    $('.r-share', root).addEventListener('click', async () => {
      const text = asText();
      if (navigator.share) { try { await navigator.share({ title: 'Practice report', text }); return; } catch (e) { if (e.name === 'AbortError') return; } }
      try { await navigator.clipboard.writeText(text); toast('Sharing not available — report copied instead'); } catch { window.print(); }
    });
    $('.r-email', root).addEventListener('click', () => {
      const subj = `Practice report — ${P.name || 'student'} (${rangeLabel()})`;
      location.href = `mailto:${encodeURIComponent(P.teacherEmail)}?subject=${encodeURIComponent(subj)}&body=${encodeURIComponent(asText())}`;
    });
    window.addEventListener('pr:log', () => el && renderDoc());
    renderDoc();
  },
  show() { renderDoc(); },
  hide() {},
};

function rangeDates() {
  const end = new Date();
  const start = new Date(end.getFullYear(), end.getMonth(), end.getDate() - (P.range - 1), 12);
  return { start: todayKey(start), end: todayKey(end), s: start, e: end };
}
function rangeLabel() {
  const { s, e } = rangeDates();
  const f = (d) => d.toLocaleDateString([], { month: 'short', day: 'numeric' });
  return `${f(s)} – ${f(e)}`;
}

function compute() {
  const { start, end } = rangeDates();
  const log = getLog().filter((x) => x.date >= start && x.date <= end);
  const segs = log.filter((x) => x.kind === 'segment' && x.category !== 'break');
  const total = segs.reduce((s, x) => s + x.seconds, 0);
  const byDay = {};
  segs.forEach((x) => { (byDay[x.date] ||= []).push(x); });
  const byCat = {};
  segs.forEach((x) => (byCat[x.category] = (byCat[x.category] || 0) + x.seconds));
  const breaks = log.filter((x) => x.kind === 'segment' && x.category === 'break').length;
  const metro = log.filter((x) => x.kind === 'metronome');
  const recs = log.filter((x) => x.kind === 'recording');
  const jams = log.filter((x) => x.kind === 'jam');
  const tuner = log.filter((x) => x.kind === 'tuner').reduce((s, x) => s + x.seconds, 0);
  const notes = getNotes();
  const days = [];
  for (let i = P.range - 1; i >= 0; i--) {
    const k = daysAgoKey(i);
    days.push({ k, segs: byDay[k] || [], note: notes[k] });
  }
  const dose = load('dose', {});
  const doseDays = days.map((d) => dose[d.k] || 0);
  const refl = log.filter((x) => x.kind === 'reflection');
  const goals = refl.filter((x) => x.detail?.goal);
  const met = { yes: 0, partly: 0, no: 0 };
  goals.forEach((x) => { if (met[x.detail.met] != null) met[x.detail.met]++; });
  const focus = refl.map((x) => x.detail?.focus).filter(Boolean);
  const pain = refl.filter((x) => x.detail?.pain && x.detail.pain !== 'none');
  const painAreas = {};
  pain.forEach((x) => (x.detail.areas || []).forEach((a) => (painAreas[a] = (painAreas[a] || 0) + 1)));
  const rotated = segs.filter((x) => x.mode === 'rotate').reduce((s, x) => s + x.seconds, 0);
  return {
    total, byCat, days, breaks, metro, recs, jams, tuner, practiced: Object.keys(byDay).length, maxDose: Math.max(0, ...doseDays),
    refl, goals, met, focusAvg: focus.length ? focus.reduce((a, b) => a + b, 0) / focus.length : 0, pain, painAreas, rotated, load: loadCheck(),
  };
}

function summarizeSegs(segs) {
  const m = {};
  segs.forEach((s) => (m[s.label] = (m[s.label] || 0) + s.seconds));
  return Object.entries(m).map(([l, s]) => `${l} (${Math.round(s / 60)}m)`).join(', ');
}

function renderDoc() {
  if (!el) return;
  const r = compute();
  const avg = r.practiced ? r.total / r.practiced : 0;
  const catTotal = Object.values(r.byCat).reduce((a, b) => a + b, 0);
  const balance = () => {
    const b = r.byCat.building || 0, i = r.byCat.interpreting || 0, p = r.byCat.performing || 0;
    if (!catTotal) return '';
    if (p === 0 && catTotal > 3600) return 'No run-throughs logged yet — consider adding “performing time.”';
    if (b / catTotal > 0.75) return 'Mostly technique this period — remember to put pieces back together musically.';
    if (i + p > 0 && b / catTotal < 0.15) return 'Mostly playing through — make sure hard passages get focused “building time.”';
    return 'Good balance of technique, musicianship and run-throughs.';
  };
  const mx = maxBy(r.days, (d) => d.segs.reduce((s, x) => s + x.seconds, 0));
  $('.report-doc', el).innerHTML = `
    <header class="rd-head">
      <div><h2>Practice report</h2><p>${esc(P.name || 'Student')}${P.instrument ? ` · ${esc(P.instrument)}` : ''}${P.teacher ? ` · for ${esc(P.teacher)}` : ''}</p></div>
      <p class="rd-range">${rangeLabel()}</p>
    </header>
    <div class="stats">
      <div><b>${fmtMinutes(r.total)}</b><span>Total practice</span></div>
      <div><b>${r.practiced}/${P.range}</b><span>Days practiced</span></div>
      <div><b>${fmtMinutes(avg)}</b><span>Avg per practice day</span></div>
      <div><b>${r.recs.length}</b><span>Recordings</span></div>
    </div>

    <h3>Daily practice</h3>
    <div class="rd-days">${r.days.map((d) => {
      const s = d.segs.reduce((a, x) => a + x.seconds, 0);
      const h = mx ? (s / mx) * 100 : 0;
      return `<div class="rd-day" title="${d.k}: ${fmtMinutes(s)}"><div class="rd-col">${d.segs.length ? catStack(d.segs, h) : ''}</div><small>${new Date(d.k + 'T12:00').toLocaleDateString([], { weekday: 'narrow' })}</small></div>`;
    }).join('')}</div>

    <h3>How the time was spent</h3>
    ${catTotal ? `<div class="cat-bar">${Object.entries(r.byCat).map(([c, s]) => `<span style="flex:${s};background:${CATS[c]?.color}"></span>`).join('')}</div>
    <ul class="legend">${Object.entries(r.byCat).sort((a, b) => b[1] - a[1]).map(([c, s]) => `<li><i style="background:${CATS[c]?.color}"></i>${CATS[c]?.label || c}: <b>${fmtMinutes(s)}</b> (${Math.round((s / catTotal) * 100)}%)</li>`).join('')}</ul>
    <p class="rd-note">${balance()}${r.breaks ? ` ${r.breaks} planned break${r.breaks > 1 ? 's' : ''} taken.` : ''}</p>` : '<p class="empty">No practice logged in this period yet. Use the Today timer, or add practice manually above.</p>'}

    ${r.refl.length ? `<h3>Goals & reflections</h3>
    <p class="rd-note">${r.goals.length ? `Goals set in ${r.goals.length} session${r.goals.length > 1 ? 's' : ''}: <b>${r.met.yes}</b> reached, ${r.met.partly} partly, ${r.met.no} not yet.` : ''}${r.focusAvg ? ` Average focus ${r.focusAvg.toFixed(1)}/5.` : ''}</p>
    <ul class="rd-list">${r.refl.slice(-8).reverse().map((x) => `<li><small>${shortDate(x.date)}:</small> ${x.detail.goal ? `🎯 ${esc(x.detail.goal)} — <i>${{ yes: 'reached', partly: 'partly', no: 'not yet' }[x.detail.met] || '—'}</i>` : 'Session'}${x.detail.focus ? ` <small>· focus ${x.detail.focus}/5</small>` : ''}${x.detail.next ? `<br><small>Next: ${esc(x.detail.next)}</small>` : ''}</li>`).join('')}</ul>` : ''}
    ${r.pain.length ? `<h3>Body check-ins</h3><p class="rd-note">Discomfort reported after ${r.pain.length} session${r.pain.length > 1 ? 's' : ''}${Object.keys(r.painAreas).length ? ` — ${Object.entries(r.painAreas).map(([a, n]) => `${AREA_NAMES[a] || a} (${n})`).join(', ')}` : ''}. Worst: ${worstPain(r.pain)}.</p>` : ''}
    ${r.load.ramp ? `<p class="rd-note">⚠️ Playing time this week is ${Math.round((r.load.ratio - 1) * 100)}% above the previous 3-week average — a sudden increase.</p>` : ''}
    ${r.rotated ? `<p class="rd-note">Interleaved (rotation) practice: ${fmtMinutes(r.rotated)}.</p>` : ''}
    <div class="rd-listen"></div>
    ${r.metro.length ? `<h3>Metronome work</h3><ul class="rd-list">${r.metro.slice(-8).map((m) => `<li>${esc(m.label)} — ${fmtMinutes(m.seconds)} <small>${shortDate(m.date)}</small></li>`).join('')}</ul>` : ''}
    ${r.recs.length ? `<h3>Recordings made</h3><ul class="rd-list">${r.recs.slice(-8).map((m) => `<li>${esc(m.label.replace(/^Recorded /, ''))} <small>${shortDate(m.date)}</small></li>`).join('')}</ul>` : ''}
    ${r.jams.length ? `<h3>Played with backing tracks</h3><ul class="rd-list">${r.jams.slice(-6).map((m) => `<li>${esc(m.detail?.text || '')} — ${esc(m.label.replace('Backing track: ', ''))}${m.detail?.key ? ` in ${esc(m.detail.key)}` : ''} <small>${shortDate(m.date)}</small></li>`).join('')}</ul>` : ''}
    ${r.tuner ? `<p class="rd-note">Tuner / intonation work: ${fmtMinutes(r.tuner)}.</p>` : ''}
    ${r.maxDose >= 0.5 ? `<p class="rd-note">⚠️ Sound exposure: peak daily noise dose ${Math.round(r.maxDose * 100)}% of the NIOSH recommended limit (estimated).</p>` : ''}

    <h3>Session log</h3>
    <table class="rd-table"><tbody>${r.days.filter((d) => d.segs.length || d.note).reverse().map((d) => `
      <tr><th>${shortDate(d.k)}</th><td><b>${fmtMinutes(d.segs.reduce((a, x) => a + x.seconds, 0))}</b> ${esc(summarizeSegs(d.segs))}${d.note ? `<div class="rd-daynote">“${esc(d.note)}”</div>` : ''}
      ${d.segs.some((x) => x.manual) ? '' : ''}</td></tr>`).join('') || '<tr><td>—</td></tr>'}</tbody></table>

    ${P.goals ? `<h3>Goals</h3><p class="rd-text">${esc(P.goals)}</p>` : ''}
    ${P.questions ? `<h3>Questions for my teacher</h3><p class="rd-text">${esc(P.questions)}</p>` : ''}
    <details class="no-print rd-edit"><summary>Edit log entries</summary>
      <ul class="rd-list">${getLog().slice(-30).reverse().map((x) => `<li>${shortDate(x.date)} · ${esc(x.label)} · ${fmtMinutes(x.seconds || 0)} <button class="btn small danger" data-del="${x.id}">Remove</button></li>`).join('')}</ul>
    </details>
    <p class="rd-foot">Generated by Practice Room · ${new Date().toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}</p>`;
  $$('[data-del]', el).forEach((b) => b.addEventListener('click', () => { removeLog(b.dataset.del); renderDoc(); }));
  renderListening();
}

const AREA_NAMES = { hands: 'hands/wrists', arms: 'forearms/elbows', neck: 'neck/shoulders', back: 'back', jaw: 'jaw/face', voice: 'voice/throat', ears: 'ringing ears' };
const worstPain = (list) => ['severe', 'moderate', 'mild'].find((lv) => list.some((x) => x.detail.pain === lv)) || 'mild';

/** What the student flagged while listening back to recordings in this period. */
let listenCache = '';
async function renderListening() {
  const box = $('.rd-listen', el);
  if (!box) return;
  box.innerHTML = listenCache;
  let recs = [];
  try { recs = await recordings.all(); } catch {}
  const { s } = rangeDates();
  const from = new Date(s.getFullYear(), s.getMonth(), s.getDate()).getTime();
  const inRange = recs.filter((r) => r.created >= from);
  const counts = {};
  inRange.forEach((r) => (r.flags || []).forEach((f) => (counts[f] = (counts[f] || 0) + 1)));
  const notes = inRange.filter((r) => r.note?.trim()).slice(0, 4);
  listenCache = Object.keys(counts).length || notes.length
    ? `<h3>Listening back</h3>${Object.keys(counts).length ? `<p class="rd-note">Marked “needs work” on recordings: ${Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${(LISTEN.find(([id]) => id === k) || [k, k])[1]} (${n})`).join(', ')}.</p>` : ''}${notes.length ? `<ul class="rd-list">${notes.map((r) => `<li>“${esc(r.note)}” <small>${esc(r.name)}</small></li>`).join('')}</ul>` : ''}`
    : '';
  box.innerHTML = listenCache;
}

function catStack(segs, h) {
  const by = {};
  segs.forEach((s) => (by[s.category] = (by[s.category] || 0) + s.seconds));
  return `<div class="rd-stack" style="height:${Math.max(4, h)}%">${Object.entries(by).map(([c, s]) => `<span style="flex:${s};background:${CATS[c]?.color}"></span>`).join('')}</div>`;
}
const shortDate = (k) => new Date(k + 'T12:00').toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
const maxBy = (arr, f) => Math.max(0, ...arr.map(f));

function asText() {
  const r = compute();
  const lines = [];
  lines.push(`PRACTICE REPORT — ${P.name || 'Student'}${P.instrument ? ` (${P.instrument})` : ''}`);
  if (P.teacher) lines.push(`For: ${P.teacher}`);
  lines.push(`Period: ${rangeLabel()}`, '');
  lines.push(`Total practice: ${fmtMinutes(r.total)} over ${r.practiced} of ${P.range} days`);
  const catTotal = Object.values(r.byCat).reduce((a, b) => a + b, 0);
  if (catTotal) {
    lines.push('Breakdown: ' + Object.entries(r.byCat).sort((a, b) => b[1] - a[1]).map(([c, s]) => `${CATS[c]?.label || c} ${fmtMinutes(s)} (${Math.round((s / catTotal) * 100)}%)`).join(', '));
  }
  lines.push('');
  r.days.filter((d) => d.segs.length || d.note).forEach((d) => {
    lines.push(`• ${shortDate(d.k)}: ${fmtMinutes(d.segs.reduce((a, x) => a + x.seconds, 0))}${d.segs.length ? ` — ${summarizeSegs(d.segs)}` : ''}`);
    if (d.note) lines.push(`   Note: ${d.note}`);
  });
  if (r.metro.length) { lines.push('', 'Metronome: ' + r.metro.slice(-6).map((m) => m.label).join('; ')); }
  if (r.recs.length) { lines.push(`Recordings: ${r.recs.length} (${r.recs.slice(-5).map((m) => m.label.replace(/^Recorded /, '')).join(', ')})`); }
  if (r.jams.length) { lines.push('Backing tracks: ' + r.jams.slice(-4).map((m) => `${m.detail?.text} (${m.label.replace('Backing track: ', '')})`).join('; ')); }
  if (r.goals.length) lines.push('', `Session goals: ${r.met.yes} reached, ${r.met.partly} partly, ${r.met.no} not yet${r.focusAvg ? ` · avg focus ${r.focusAvg.toFixed(1)}/5` : ''}`);
  r.refl.slice(-5).forEach((x) => { if (x.detail.goal || x.detail.next) lines.push(`  ${shortDate(x.date)}: ${x.detail.goal ? `goal “${x.detail.goal}” (${x.detail.met || '—'})` : ''}${x.detail.next ? ` · next: ${x.detail.next}` : ''}`); });
  if (r.pain.length) lines.push(`Body check-ins: discomfort after ${r.pain.length} session(s)${Object.keys(r.painAreas).length ? ` — ${Object.keys(r.painAreas).map((a) => AREA_NAMES[a] || a).join(', ')}` : ''}`);
  if (P.goals) lines.push('', `Goals: ${P.goals}`);
  if (P.questions) lines.push('', `Questions: ${P.questions}`);
  return lines.join('\n');
}
