import { getCtx, acquireMic, releaseMic, micErrorMessage, sinkSilently } from './audio.js';
import { recordings, addLog } from './store.js';
import { $, $$, esc, fmtClock, fitCanvas, cssVar, keepAwake, toast, icon } from './ui.js';

let levelSink = null;
let el, mr = null, chunks = [], recStart = 0, recTimer = 0, levelRaf = 0, analyser = null, srcNode = null;
let list = [];
let current = null; // { id, audio, url }

function pickMime() {
  const opts = ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus'];
  if (!window.MediaRecorder) return null;
  return opts.find((m) => MediaRecorder.isTypeSupported?.(m)) || '';
}
const extFor = (mime) => (mime.includes('mp4') ? 'm4a' : mime.includes('ogg') ? 'ogg' : 'webm');

// Listen back one dimension at a time — focused, objective listening.
export const LISTEN = [['pitch', 'Intonation'], ['rhythm', 'Rhythm / pulse'], ['tone', 'Tone'], ['dynamics', 'Dynamics'], ['phrasing', 'Phrasing'], ['articulation', 'Articulation'], ['diction', 'Diction / text']];

export const recorder = {
  id: 'record',
  mount(root) {
    el = root;
    root.innerHTML = `
      <header class="view-head"><h1>Record</h1><p class="sub">Listen back like your audience would. Takes stay on this phone.</p></header>
      <div class="card rec-card">
        <canvas class="rec-level" aria-hidden="true"></canvas>
        <div class="rec-time">0:00</div>
        <input class="rec-name" placeholder="What are you recording? (optional)" maxlength="80">
        <button class="rec-btn" aria-label="Start recording"><span></span></button>
        <p class="rec-err err" hidden></p>
        <p class="hint rec-tip">Tip: put the phone a few feet away, not right next to your instrument — you'll hear the room the way a listener does.</p>
      </div>
      <div class="card quote-card small">
        <p>Galamian called the ear "the final judge," and warned that most players hear <i>subjectively</i> — what they hope they played. Recordings show what actually happened.</p>
        <p class="cite">Paraphrasing I. Galamian, <i>Principles of Violin Playing &amp; Teaching</i>, “The Critical Ear.”</p>
        <p><b>Try this:</b> listen once for just one thing — intonation, then rhythm, then tone — and mark what needs work on the take.</p>
      </div>
      <div class="rec-list"></div>`;

    $('.rec-btn', root).addEventListener('click', () => (mr ? stopRec() : startRec()));
    refresh();
  },
  show() { refresh(); },
  hide() {},
};

async function startRec() {
  const err = $('.rec-err', el);
  err.hidden = true;
  const mime = pickMime();
  if (mime === null) {
    err.textContent = 'Recording is not supported in this browser. Try Safari (iOS 14.3+) or Chrome.';
    err.hidden = false;
    return;
  }
  try {
    const stream = await acquireMic();
    mr = new MediaRecorder(stream, mime ? { mimeType: mime, audioBitsPerSecond: 128000 } : undefined);
    chunks = [];
    mr.ondataavailable = (e) => e.data && e.data.size && chunks.push(e.data);
    mr.onstop = saveTake;
    mr.start(1000);
    recStart = Date.now();
    recTimer = setInterval(() => ($('.rec-time', el).textContent = fmtClock((Date.now() - recStart) / 1000)), 250);
    const ctx = getCtx();
    srcNode = ctx.createMediaStreamSource(stream);
    analyser = ctx.createAnalyser();
    analyser.fftSize = 1024;
    srcNode.connect(analyser);
    levelSink = sinkSilently(analyser);
    drawLevel();
    keepAwake('rec', true);
    $('.rec-card', el).classList.add('recording');
    $('.rec-btn', el).setAttribute('aria-label', 'Stop recording');
    // pause any playback
    if (current) current.audio.pause();
  } catch (e) {
    mr = null;
    err.textContent = micErrorMessage(e);
    err.hidden = false;
  }
}

function stopRec() {
  if (!mr) return;
  mr.stop();
  clearInterval(recTimer);
  cancelAnimationFrame(levelRaf);
  try { srcNode?.disconnect(); analyser?.disconnect(); levelSink?.disconnect(); } catch {}
  keepAwake('rec', false);
  $('.rec-card', el).classList.remove('recording');
  $('.rec-btn', el).setAttribute('aria-label', 'Start recording');
}

async function saveTake() {
  const type = mr.mimeType || chunks[0]?.type || 'audio/webm';
  mr = null;
  releaseMic();
  const blob = new Blob(chunks, { type });
  chunks = [];
  const seconds = (Date.now() - recStart) / 1000;
  const name = $('.rec-name', el).value.trim();
  const n = list.length + 1;
  const rec = {
    id: `r${Date.now()}`,
    created: Date.now(),
    name: name || `Take ${n}`,
    seconds,
    type,
    blob,
    star: false,
    note: '',
  };
  let peaks = [];
  try { peaks = await computePeaks(blob); } catch {}
  rec.peaks = peaks;
  try {
    await recordings.put(rec);
  } catch (e) {
    toast('Could not save the take (storage full or private mode?)');
    console.error(e);
  }
  addLog({ kind: 'recording', label: `Recorded “${rec.name}”`, seconds: Math.round(seconds) });
  $('.rec-time', el).textContent = '0:00';
  $('.rec-name', el).value = '';
  const lv = $('.rec-level', el);
  lv.getContext('2d').clearRect(0, 0, lv.width, lv.height);
  toast(`Saved “${rec.name}” (${fmtClock(seconds)})`);
  refresh();
}

async function computePeaks(blob, n = 120) {
  const ab = await blob.arrayBuffer();
  const audio = await getCtx().decodeAudioData(ab);
  const d = audio.getChannelData(0);
  const size = Math.floor(d.length / n) || 1;
  const peaks = [];
  for (let i = 0; i < n; i++) {
    let m = 0;
    for (let j = i * size; j < Math.min(d.length, (i + 1) * size); j++) m = Math.max(m, Math.abs(d[j]));
    peaks.push(Math.round(m * 1000) / 1000);
  }
  const max = Math.max(...peaks, 0.01);
  return peaks.map((p) => Math.round((p / max) * 100) / 100);
}

function drawLevel() {
  const cv = $('.rec-level', el);
  const data = new Float32Array(analyser.fftSize);
  const hist = [];
  const draw = () => {
    levelRaf = requestAnimationFrame(draw);
    analyser.getFloatTimeDomainData(data);
    let peak = 0;
    for (const v of data) peak = Math.max(peak, Math.abs(v));
    hist.push(peak);
    const { g, w, h } = fitCanvas(cv);
    const bars = Math.floor(w / 4);
    while (hist.length > bars) hist.shift();
    g.clearRect(0, 0, w, h);
    g.fillStyle = peak > 0.95 ? cssVar('--bad') : cssVar('--accent');
    hist.forEach((p, i) => {
      const bh = Math.max(2, Math.sqrt(p) * h);
      g.fillRect(w - (hist.length - i) * 4, (h - bh) / 2, 3, bh);
    });
  };
  draw();
}

async function refresh() {
  try { list = await recordings.all(); } catch { list = []; }
  const box = $('.rec-list', el);
  if (!list.length) {
    box.innerHTML = '<p class="empty">No takes yet. Hit the red button and play something!</p>';
    return;
  }
  box.innerHTML = `<h2 class="list-h">Your takes <small>${list.length}</small></h2>` + list.map((r) => `
    <article class="card take ${r.star ? 'starred' : ''}" data-id="${r.id}">
      <div class="take-head">
        <button class="btn round take-play" aria-label="Play ${esc(r.name)}">${icon('play')}</button>
        <div class="take-meta">
          <input class="take-name" value="${esc(r.name)}" aria-label="Take name">
          <small>${new Date(r.created).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })} · ${fmtClock(r.seconds)}</small>
        </div>
        <button class="btn icon-btn take-star" aria-label="Favorite" title="Favorite">${r.star ? '★' : '☆'}</button>
      </div>
      <div class="take-wave" role="slider" aria-label="Seek" tabindex="0">${(r.peaks || []).map((p) => `<i style="height:${Math.max(4, p * 100)}%"></i>`).join('')}<b class="take-pos"></b></div>
      <div class="take-tools">
        <label class="speed">Speed <select class="take-rate"><option value="0.5">0.5×</option><option value="0.75">0.75×</option><option value="1" selected>1×</option><option value="1.25">1.25×</option></select></label>
        <button class="btn small take-share">${icon('share')} Share</button>
        <button class="btn small danger take-del">Delete</button>
      </div>
      <div class="listen-for"><span>Needs work:</span>${LISTEN.map(([k, n]) => `<button class="chip tiny ${(r.flags || []).includes(k) ? 'on' : ''}" data-flag="${k}">${n}</button>`).join('')}</div>
      <textarea class="take-note" rows="1" placeholder="What did you hear? What will you change?">${esc(r.note || '')}</textarea>
    </article>`).join('');

  $$('.take', box).forEach((card) => {
    const r = list.find((x) => x.id === card.dataset.id);
    $('.take-play', card).addEventListener('click', () => togglePlay(r, card));
    $('.take-star', card).addEventListener('click', async () => { r.star = !r.star; await recordings.put(r); refresh(); });
    $('.take-name', card).addEventListener('change', async (e) => { r.name = e.target.value.trim() || r.name; await recordings.put(r); });
    $$('[data-flag]', card).forEach((b) => b.addEventListener('click', async () => {
      const f = new Set(r.flags || []);
      if (f.has(b.dataset.flag)) f.delete(b.dataset.flag); else f.add(b.dataset.flag);
      r.flags = [...f];
      b.classList.toggle('on');
      await recordings.put(r);
    }));
    $('.take-note', card).addEventListener('change', async (e) => { r.note = e.target.value; await recordings.put(r); });
    $('.take-rate', card).addEventListener('change', (e) => { if (current?.id === r.id) current.audio.playbackRate = Number(e.target.value); });
    $('.take-del', card).addEventListener('click', async () => {
      if (!confirm(`Delete “${r.name}”? This can't be undone.`)) return;
      if (current?.id === r.id) stopPlayback();
      await recordings.remove(r.id);
      refresh();
    });
    $('.take-share', card).addEventListener('click', () => share(r));
    const wave = $('.take-wave', card);
    wave.addEventListener('click', (e) => {
      const rect = wave.getBoundingClientRect();
      const frac = (e.clientX - rect.left) / rect.width;
      if (current?.id !== r.id) togglePlay(r, card, frac);
      else if (isFinite(current.audio.duration)) current.audio.currentTime = frac * current.audio.duration;
      else current.audio.currentTime = frac * r.seconds;
    });
  });
}

function stopPlayback() {
  if (!current) return;
  current.audio.pause();
  URL.revokeObjectURL(current.url);
  current = null;
  $$('.take', el).forEach((c) => { c.classList.remove('playing'); $('.take-play', c).innerHTML = icon('play'); });
}

function togglePlay(r, card, startFrac = 0) {
  if (current?.id === r.id) {
    if (current.audio.paused) { current.audio.play(); $('.take-play', card).innerHTML = icon('pause'); }
    else { current.audio.pause(); $('.take-play', card).innerHTML = icon('play'); }
    return;
  }
  stopPlayback();
  const url = URL.createObjectURL(r.blob);
  const audio = new Audio(url);
  audio.preservesPitch = true;
  audio.playbackRate = Number($('.take-rate', card).value);
  current = { id: r.id, audio, url };
  card.classList.add('playing');
  $('.take-play', card).innerHTML = icon('pause');
  const pos = $('.take-pos', card);
  audio.addEventListener('timeupdate', () => {
    const dur = isFinite(audio.duration) ? audio.duration : r.seconds;
    pos.style.left = `${(audio.currentTime / dur) * 100}%`;
  });
  audio.addEventListener('ended', () => { $('.take-play', card).innerHTML = icon('play'); pos.style.left = '0'; });
  audio.addEventListener('loadedmetadata', () => { if (startFrac && isFinite(audio.duration)) audio.currentTime = startFrac * audio.duration; }, { once: true });
  audio.play().catch(() => toast('Tap play again to start audio'));
}

async function share(r) {
  const file = new File([r.blob], `${r.name.replace(/[^\w\- ]+/g, '').trim() || 'take'}.${extFor(r.type)}`, { type: r.type });
  if (navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file], title: r.name }); return; } catch (e) { if (e.name === 'AbortError') return; }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(file);
  a.download = file.name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}
