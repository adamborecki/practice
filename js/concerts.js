// Upcoming Chapman College of Performing Arts events, from a daily snapshot of the public
// events.chapman.edu feed (see scripts/fetch_concerts.py).
import { load, save } from './store.js';
import { $, $$, esc, icon } from './ui.js';

let dataP = null;
function fetchData() {
  if (!dataP) {
    dataP = fetch('data/concerts.json', { cache: 'no-cache' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(r.status))))
      .catch(() => ({ events: [], fetched: null }))
      .then((d) => {
        d.events = (d.events || []).map((e) => ({ ...e, d: parseLocal(e.start, e.tzOffset), dEnd: e.end ? parseLocal(e.end, e.tzOffset) : null }));
        return d;
      });
  }
  return dataP;
}

/** "2026-11-06T19:30:00" + "-0800" → Date (absolute instant). */
function parseLocal(s, off = '-0800') {
  const o = /^[+-]\d{4}$/.test(off || '') ? `${off.slice(0, 3)}:${off.slice(3)}` : '-08:00';
  return new Date(`${s}${o}`);
}

const upcoming = (events) => {
  const cutoff = Date.now() - 2 * 3600e3;
  return events.filter((e) => !e.canceled && (e.dEnd || e.d).getTime() > cutoff);
};

export async function nextConcerts(n = 2) {
  const d = await fetchData();
  return upcoming(d.events).filter((e) => e.category === 'music').slice(0, n);
}

/**
 * The upcoming weekend, Friday 00:00 → Monday 00:00 (local time).
 * Mon–Thu: the coming weekend. Fri–Sun: the weekend we're in.
 */
export function weekendRange(now = new Date()) {
  const dow = now.getDay(); // 0 Sun … 6 Sat
  const offset = dow === 0 ? -2 : dow === 6 ? -1 : 5 - dow;
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset);
  const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 3);
  return { start, end, current: dow === 0 || dow >= 5 };
}

/** Everything this weekend (all arts), what's next in music after it, and the total count. */
export async function comingUp(nextCount = 3) {
  const d = await fetchData();
  const list = upcoming(d.events);
  const wk = weekendRange();
  const weekend = list.filter((e) => e.d >= wk.start && e.d < wk.end);
  const after = list.filter((e) => e.d >= wk.end || (e.d < wk.start));
  const next = after.filter((e) => e.category === 'music' && e.d >= wk.end).slice(0, nextCount);
  // if there's music before the weekend (e.g. Thursday), lead with it
  const before = list.filter((e) => e.d < wk.start && e.category === 'music');
  return { weekend, wk, next: [...before, ...next].slice(0, nextCount), total: list.length, music: list.filter((e) => e.category === 'music').length };
}

let focusId = null;
/** Open the Concerts screen scrolled to one event. */
export function focusConcert(id) {
  focusId = String(id);
  location.hash = 'concerts';
}

const FILTERS = [['music', '🎵 Music'], ['weekend', '📅 This weekend'], ['all', 'All arts'], ['dance', 'Dance'], ['theatre', 'Theatre']];
let el, filter = load('concertFilter', 'music'), saved = new Set(load('savedConcerts', []));

export const concerts = {
  id: 'concerts',
  mount(root) {
    el = root;
    root.innerHTML = `
      <header class="view-head"><h1>Concerts</h1><p class="sub">Upcoming Chapman College of Performing Arts events. Going to concerts is practice for your ears.</p></header>
      <div class="chips con-filters">${FILTERS.map(([k, n]) => `<button class="chip ${k === filter ? 'on' : ''}" data-f="${k}">${n}</button>`).join('')}<button class="chip ${filter === 'saved' ? 'on' : ''}" data-f="saved">★ Saved</button></div>
      <div class="con-list"><p class="empty">Loading…</p></div>
      <p class="hint con-src"></p>`;
    $$('[data-f]', root).forEach((b) => b.addEventListener('click', () => {
      filter = b.dataset.f;
      save('concertFilter', filter);
      $$('[data-f]', root).forEach((x) => x.classList.toggle('on', x === b));
      render();
    }));
    render();
  },
  show() { if (focusId && el) render(); },
  hide() {},
};

async function render() {
  const fid = focusId;
  focusId = null; // claim it now so a second render doesn't redo the jump
  const d = await fetchData();
  let list = upcoming(d.events);
  if (fid && !list.some((e) => String(e.id) === fid && (filter === 'all' || (filter !== 'weekend' && filter !== 'saved' && e.category === filter)))) {
    // make sure the event we're jumping to is visible
    filter = 'all';
    $$('[data-f]', el).forEach((x) => x.classList.toggle('on', x.dataset.f === 'all'));
  }
  if (filter === 'saved') list = list.filter((e) => saved.has(e.id));
  else if (filter === 'weekend') { const wk = weekendRange(); list = list.filter((e) => e.d >= wk.start && e.d < wk.end); }
  else if (filter !== 'all') list = list.filter((e) => e.category === filter);
  const box = $('.con-list', el);
  if (!list.length) {
    box.innerHTML = `<p class="empty">${filter === 'saved' ? 'Star a concert to save it here.' : filter === 'weekend' ? 'Nothing on the calendar this weekend.' : 'Nothing upcoming in this category right now.'}</p>`;
  } else {
    let month = '';
    box.innerHTML = list.map((e) => {
      const m = e.d.toLocaleDateString([], { month: 'long', year: 'numeric' });
      const head = m !== month ? `<h2 class="list-h">${m}</h2>` : '';
      month = m;
      const free = /free/i.test(e.description) ? '<span class="tag">Free</span>' : '';
      return `${head}
        <article class="card event" data-id="${e.id}">
          <div class="ev-date"><small>${e.d.toLocaleDateString([], { weekday: 'short' })}</small><b>${e.d.getDate()}</b></div>
          <div class="ev-body">
            <h3>${esc(e.title)} ${free}</h3>
            <p class="ev-meta">${e.allDay ? 'All day' : e.d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })} · ${esc(e.venue)} <span class="tag cat-${e.category}">${e.category}</span></p>
            ${e.description ? `<p class="ev-desc">${esc(e.description)}</p>` : ''}
            <div class="ev-actions">
              <a class="btn small" href="${esc(e.url)}" target="_blank" rel="noopener">Details & tickets ↗</a>
              <button class="btn small ev-ics">${icon('calendar')} Add to calendar</button>
              <button class="btn small icon-btn ev-star" aria-label="Save">${saved.has(e.id) ? '★' : '☆'}</button>
            </div>
          </div>
        </article>`;
    }).join('');
    $$('.event', box).forEach((card) => {
      const e = list.find((x) => String(x.id) === card.dataset.id);
      $('.ev-ics', card).addEventListener('click', () => downloadIcs(e));
      $('.ev-star', card).addEventListener('click', (ev) => {
        if (saved.has(e.id)) saved.delete(e.id); else saved.add(e.id);
        save('savedConcerts', [...saved]);
        ev.currentTarget.textContent = saved.has(e.id) ? '★' : '☆';
      });
    });
  }
  if (fid) {
    const card = $(`.event[data-id="${fid}"]`, el);
    if (card) {
      requestAnimationFrame(() => {
        window.scrollTo({ top: card.getBoundingClientRect().top + window.scrollY - 80, behavior: 'smooth' });
        card.classList.add('focus');
        setTimeout(() => card.classList.remove('focus'), 2200);
      });
    }
  }
  $('.con-src', el).innerHTML = `Source: <a href="https://events.chapman.edu/copa/" target="_blank" rel="noopener">events.chapman.edu/copa</a>${d.fetched ? ` · updated ${new Date(d.fetched).toLocaleDateString([], { month: 'short', day: 'numeric' })}` : ''}. Always confirm details on the official page.`;
}

function downloadIcs(e) {
  const fmt = (d) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const end = e.dEnd || new Date(e.d.getTime() + 2 * 3600e3);
  const escTxt = (s) => String(s || '').replace(/([,;\\])/g, '\\$1').replace(/\n/g, '\\n');
  const ics = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//The Chapman Practice App//Chapman Concerts//EN', 'BEGIN:VEVENT',
    `UID:${e.id}@practice-room`, `DTSTAMP:${fmt(new Date())}`, `DTSTART:${fmt(e.d)}`, `DTEND:${fmt(end)}`,
    `SUMMARY:${escTxt(e.title)}`, `LOCATION:${escTxt(e.location)}`, `DESCRIPTION:${escTxt(`${e.description}\n${e.url}`)}`, `URL:${e.url}`,
    'END:VEVENT', 'END:VCALENDAR',
  ].join('\r\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([ics], { type: 'text/calendar' }));
  a.download = `${e.title.replace(/[^\w ]+/g, '').trim().slice(0, 40) || 'concert'}.ics`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
