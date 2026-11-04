// Musician health & practice research, with citations. Plain-language summaries;
// the evidence strength is stated honestly where it's limited.
import { $, $$ } from './ui.js';

const scholar = (q) => `https://scholar.google.com/scholar?q=${encodeURIComponent(q)}`;

export const REFS = {
  duke2009: { text: 'Duke, R. A., Simmons, A. L., & Cash, C. D. (2009). It’s not how much; it’s how: Characteristics of practice behavior and retention of performance skills. <i>Journal of Research in Music Education, 56</i>(4), 310–321.', url: 'https://doi.org/10.1177/0022429408328851' },
  ericsson1993: { text: 'Ericsson, K. A., Krampe, R. T., & Tesch-Römer, C. (1993). The role of deliberate practice in the acquisition of expert performance. <i>Psychological Review, 100</i>(3), 363–406.', url: 'https://doi.org/10.1037/0033-295X.100.3.363' },
  zimmerman2002: { text: 'Zimmerman, B. J. (2002). Becoming a self-regulated learner: An overview. <i>Theory Into Practice, 41</i>(2), 64–70.', url: 'https://doi.org/10.1207/s15430421tip4102_2' },
  mcpherson2011: { text: 'McPherson, G. E., & Zimmerman, B. J. (2011). Self-regulation of musical learning: A social cognitive perspective on developing performance skills. In R. Colwell & P. Webster (Eds.), <i>MENC Handbook of Research on Music Learning</i> (Vol. 2, pp. 130–175). Oxford University Press.', url: 'https://doi.org/10.1093/acprof:osobl/9780199754397.003.0004' },
  carter2016: { text: 'Carter, C. E., & Grahn, J. A. (2016). Optimizing music learning: Exploring how blocked and interleaved practice schedules affect advanced performance. <i>Frontiers in Psychology, 7</i>, 1251.', url: 'https://doi.org/10.3389/fpsyg.2016.01251' },
  stambaugh2011: { text: 'Stambaugh, L. A. (2011). When repetition isn’t the best practice strategy: Effects of blocked and random practice schedules. <i>Journal of Research in Music Education, 58</i>(4), 368–383.', url: scholar('Stambaugh 2011 When repetition isn\'t the best practice strategy blocked random practice') },
  simmons2006: { text: 'Simmons, A. L., & Duke, R. A. (2006). Effects of sleep on performance of a keyboard melody. <i>Journal of Research in Music Education, 54</i>(3), 257–269.', url: scholar('Simmons Duke 2006 Effects of sleep on performance of a keyboard melody') },
  simmons2012: { text: 'Simmons, A. L. (2012). Distributed practice and procedural memory consolidation in musicians’ skill learning. <i>Journal of Research in Music Education, 59</i>(4), 357–368.', url: 'https://doi.org/10.1177/0022429411424798' },
  walker2002: { text: 'Walker, M. P., Brakefield, T., Morgan, A., Hobson, J. A., & Stickgold, R. (2002). Practice with sleep makes perfect: Sleep-dependent motor skill learning. <i>Neuron, 35</i>(1), 205–211.', url: 'https://doi.org/10.1016/S0896-6273(02)00746-8' },
  bernardi2013: { text: 'Bernardi, N. F., De Buglio, M., Trimarchi, P. D., Chielli, A., & Bricolo, E. (2013). Mental practice promotes motor anticipation: Evidence from skilled music performance. <i>Frontiers in Human Neuroscience, 7</i>, 451.', url: 'https://doi.org/10.3389/fnhum.2013.00451' },
  galamian: { text: 'Galamian, I. (1962). <i>Principles of Violin Playing and Teaching</i>. Prentice-Hall (later eds. Shar, Dover). Ch. 4, “On Practicing.”', url: scholar('Galamian Principles of Violin Playing and Teaching') },
  kenny2015: { text: 'Kenny, D., & Ackermann, B. (2015). Performance-related musculoskeletal pain, depression and music performance anxiety in professional orchestral musicians: A population study. <i>Psychology of Music, 43</i>(1), 43–60.', url: scholar('Kenny Ackermann 2015 Performance-related musculoskeletal pain depression music performance anxiety orchestral') },
  zaza1998: { text: 'Zaza, C. (1998). Playing-related musculoskeletal disorders in musicians: A systematic review of incidence and prevalence. <i>CMAJ, 158</i>(8), 1019–1025.', url: scholar('Zaza 1998 Playing-related musculoskeletal disorders in musicians systematic review CMAJ') },
  chan2014: { text: 'Chan, C., & Ackermann, B. (2014). Evidence-informed physical therapy management of performance-related musculoskeletal disorders in musicians. <i>Frontiers in Psychology, 5</i>, 706.', url: 'https://doi.org/10.3389/fpsyg.2014.00706' },
  nasm: { text: 'National Association of Schools of Music & Performing Arts Medicine Association. <i>NASM–PAMA Advisories on Hearing Health and on Neuromusculoskeletal and Vocal Health</i> (information sheets for students).', url: 'https://nasm.arts-accredit.org/' },
  titze2006: { text: 'Titze, I. R. (2006). Voice training and therapy with a semi-occluded vocal tract: Rationale and scientific underpinnings. <i>Journal of Speech, Language, and Hearing Research, 49</i>(2), 448–459.', url: 'https://doi.org/10.1044/1092-4388(2006/035)' },
  leydon2009: { text: 'Leydon, C., Sivasankar, M., Falciglia, D. L., Atkins, C., & Fisher, K. V. (2009). Vocal fold surface hydration: A review. <i>Journal of Voice, 23</i>(6), 658–665.', url: scholar('Leydon Sivasankar 2009 Vocal fold surface hydration a review') },
  titze2003: { text: 'Titze, I. R., Švec, J. G., & Popolo, P. S. (2003). Vocal dose measures: Quantifying accumulated vibration exposure in vocal fold tissues. <i>Journal of Speech, Language, and Hearing Research, 46</i>(4), 919–932.', url: scholar('Titze Svec Popolo 2003 Vocal dose measures') },
  stachler2018: { text: 'Stachler, R. J., et al. (2018). Clinical practice guideline: Hoarseness (dysphonia) (update). <i>Otolaryngology–Head and Neck Surgery, 158</i>(1 suppl), S1–S42.', url: scholar('Stachler 2018 Clinical practice guideline hoarseness dysphonia update') },
  nidcdvoice: { text: 'National Institute on Deafness and Other Communication Disorders (NIDCD). <i>Taking Care of Your Voice</i>.', url: 'https://www.nidcd.nih.gov/health/taking-care-your-voice' },
  niosh1998: { text: 'NIOSH (1998). <i>Criteria for a Recommended Standard: Occupational Noise Exposure</i> (DHHS/NIOSH Pub. No. 98-126).', url: 'https://www.cdc.gov/niosh/docs/98-126/' },
  schink2014: { text: 'Schink, T., Kreutz, G., Busch, V., Pigeot, I., & Ahrens, W. (2014). Incidence and relative risk of hearing disorders in professional musicians. <i>Occupational and Environmental Medicine, 71</i>(7), 472–476.', url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC4078669/' },
  kardous2014: { text: 'Kardous, C. A., & Shaw, P. B. (2014). Evaluation of smartphone sound measurement applications. <i>Journal of the Acoustical Society of America, 135</i>(4), EL186–EL192.', url: 'https://stacks.cdc.gov/view/cdc/199862' },
  who2022: { text: 'World Health Organization (2022). <i>WHO Global Standard for Safe Listening Venues and Events</i>.', url: scholar('WHO global standard for safe listening venues and events 2022') },
  nidcdnoise: { text: 'NIDCD. <i>Noise-Induced Hearing Loss</i>.', url: 'https://www.nidcd.nih.gov/health/noise-induced-hearing-loss' },
  wells2012: { text: 'Wells, R., Outhred, T., Heathers, J. A. J., Quintana, D. S., & Kemp, A. H. (2012). Matter over mind: A randomised-controlled trial of single-session biofeedback training on performance anxiety and heart rate variability in musicians. <i>PLoS ONE, 7</i>(10), e46597.', url: 'https://doi.org/10.1371/journal.pone.0046597' },
  kenny2011: { text: 'Kenny, D. T. (2011). <i>The Psychology of Music Performance Anxiety</i>. Oxford University Press.', url: scholar('Kenny 2011 The Psychology of Music Performance Anxiety') },
  iec61672: { text: 'IEC 61672-1:2013. <i>Electroacoustics — Sound level meters — Part 1: Specifications</i> (A-weighting curve used by this app’s meter).', url: 'https://webstore.iec.ch/publication/5708' },
};

const ORDER = Object.keys(REFS);
const cite = (...ids) => ids.map((id) => `<a class="cite-ref" href="#ref-${id}" data-ref="${id}">${ORDER.indexOf(id) + 1}</a>`).join('');

const SECTIONS = [
  {
    id: 'practice', title: 'Practice smarter', emoji: '🧠',
    items: [
      { h: 'How you practice beats how long', b: `In a study of advanced piano students learning a hard passage, neither total practice time nor number of repetitions predicted how well they played it the next day. The best performers <b>stopped at errors and fixed them right away</b>, pinpointed exactly where and why mistakes happened, <b>varied tempo (often slower)</b>, and played the passage correctly several times before moving on.${cite('duke2009')} The <b>Beats → Accuracy ladder</b> builds that habit: only speed up after several clean repetitions.` },
      { h: 'Set a goal → practice → reflect', b: `Skilled learners work in a cycle: <b>plan</b> (a specific goal and strategy), <b>monitor</b> while practicing, then <b>reflect</b> on what worked and what to change next time. This self-regulation cycle is closely tied to how effectively musicians practice.${cite('zimmerman2002', 'mcpherson2011')} “Measures 32–40 in tune at ♩=80, three times in a row” is a goal; “work on the sonata” isn’t. The Today session asks for a goal up front and a 30-second reflection at the end, and carries your “next time” note forward.` },
      { h: 'Make it deliberate', b: `Expert performance grows from <i>deliberate practice</i>: focused, effortful work on specific weaknesses with feedback. In the classic study of conservatory violinists, the top students did their most demanding practice in limited sessions with rest in between, and total daily deliberate practice rarely exceeded about four hours — it’s mentally exhausting.${cite('ericsson1993')} Galamian makes the same point: practice requires “complete and constant mental alertness”; mindless repetition can bake mistakes in.${cite('galamian')}` },
      { h: 'Balance building, interpreting & performing', b: `Galamian divides practice into <b>building time</b> (technique — never let a mistake go uncorrected), <b>interpreting time</b> (shaping phrases; don’t stop for every small slip) and <b>performing time</b> (play straight through as if for listeners, ideally with accompaniment). Too much of one creates either the “concertizer” whose hard passages never get fixed, or the over-analyzer who never puts the piece back together. Once a problem is solved, move on rather than drilling it endlessly.${cite('galamian')} The Today planner uses these categories.` },
      { h: 'Mix it up (interleave)', b: `Rotating among passages feels less smooth than drilling one thing — but it tends to stick better. Advanced clarinetists who alternated two pieces in <b>3-minute segments</b> were rated higher by professional judges than when they practiced each in one 12-minute block, and they said it helped them set goals, stay focused and spot mistakes.${cite('carter2016')} Random practice schedules also improved retention in young wind players.${cite('stambaugh2011')} Galamian likewise advises mixing material to keep the mind fresh.${cite('galamian')} Try <b>Today → Rotate</b>.` },
      { h: 'Space it out — and sleep on it', b: `Motor skills keep consolidating after you stop. Keyboard performance improved after a night’s sleep but not after an equal stretch of waking time,${cite('simmons2006')} and spacing practice sessions hours apart — especially with sleep in between — produced bigger gains than cramming the same practice minutes apart.${cite('simmons2012')} Finger-sequence speed improved roughly 20% after sleep in a lab study.${cite('walker2002')} Two shorter sessions usually beat one marathon, and daily practice beats occasional binges.${cite('galamian')}` },
      { h: 'Mental practice counts', b: `Skilled pianists who studied a piece away from the keyboard (score study + imagining the movements and sound) learned it measurably — though combining mental and physical practice worked best.${cite('bernardi2013')} Great for travel days or when your body needs rest.` },
      { h: 'Use the critical ear', b: `Players tend to hear what they <i>hoped</i> to play. Recording yourself and listening back is one of the fastest ways to hear objectively.${cite('galamian')} Use the Record tab.` },
    ],
  },
  {
    id: 'body', title: 'Body & injury', emoji: '💪',
    items: [
      { h: 'It’s common — so plan for it', b: `In a national survey of 377 professional orchestral musicians, <b>84%</b> had experienced pain that interfered with playing, and half had it at the time of the survey.${cite('kenny2015')} Reviews find playing-related musculoskeletal disorders across all instrument groups, at rates comparable to other high-risk occupations.${cite('zaza1998')}` },
      { h: 'Ramp up gradually', b: `Sudden jumps in playing load — before juries, auditions, festivals, or when starting new repertoire or a new instrument — are a common trigger. Increase daily playing time in steps over several days to weeks rather than all at once.${cite('chan2014', 'nasm')} The Today screen warns you if this week’s playing time is far above your recent average (a rule-of-thumb check, not a diagnosis).` },
      { h: 'Take regular breaks', b: `Short breaks during practice (stand, shake out, stretch gently, change posture) help manage physical load.${cite('chan2014', 'nasm')} A common guideline is ~5 minutes per 25–30 minutes of playing; the exact numbers haven’t been tested in trials, so treat them as a starting point. The Today timer can remind you.` },
      { h: 'Warm up & stay fit', b: `Begin with easy playing that gradually expands range, speed and dynamics. Research on specific warm-up routines for instrumentalists is limited, but general fitness, strength and endurance training are part of evidence-informed management of playing injuries.${cite('chan2014')}` },
      { h: 'Know the warning signs', b: `Stop and get checked if you notice pain that lingers after playing or returns quickly, numbness or tingling, weakness, or loss of fine control. Don’t “play through it” — early care leads to better outcomes.${cite('chan2014', 'nasm')} The after-session check-in tracks discomfort over time so patterns are easier to spot and share with your teacher. At Chapman, start with the <a href="https://www.chapman.edu/students/health-and-safety/" target="_blank" rel="noopener">Student Health Center</a> (714-997-6815).` },
    ],
  },
  {
    id: 'voice', title: 'Voice', emoji: '🎙️',
    items: [
      { h: 'Warm up with SOVT exercises', b: `Semi-occluded vocal tract exercises — singing through a straw, lip trills, humming, “v”/“z” sounds — create back-pressure that helps the vocal folds vibrate efficiently with less effort. They’re well-suited to warm-ups, cool-downs, and recovering after heavy use.${cite('titze2006')}` },
      { h: 'Hydrate inside & out', b: `Vocal folds need both systemic hydration (drinking water through the day — it isn’t instant) and surface hydration (humid air, steam). Dry air increases the effort needed to phonate.${cite('leydon2009')}` },
      { h: 'Mind your vocal dose', b: `Vocal fold tissue accumulates “dose” from time spent vibrating, how loud, and how high. Long rehearsals plus loud talking add up; plan recovery and short <i>vocal naps</i> (silence) on heavy days.${cite('titze2003')} The “Singer 45” plan builds in vocal rest.` },
      { h: 'Talking counts too', b: `Avoid yelling, talking over loud noise (restaurants, parties), habitual throat clearing, smoking/vaping; rest your voice when you’re sick.${cite('nidcdvoice', 'nasm')}` },
      { h: 'Hoarseness that won’t quit', b: `Hoarseness that doesn’t improve within about 4 weeks — or sooner if it’s severe or your career depends on your voice — warrants a laryngeal exam by an ENT.${cite('stachler2018')}` },
    ],
  },
  {
    id: 'hearing', title: 'Hearing', emoji: '👂',
    items: [
      { h: 'Musicians are at higher risk', b: `In German health-insurance data covering millions of people, professional musicians had about <b>3.6×</b> the risk of noise-induced hearing loss compared with the general population.${cite('schink2014')} Noise-induced hearing loss is permanent — and preventable.${cite('nidcdnoise')}` },
      { h: 'Know the 85 / 3 rule', b: `NIOSH recommends limiting exposure to an average of <b>85 dBA over 8 hours</b>; every +3 dB halves the safe time (88 dBA → 4 h, 91 → 2 h, 94 → 1 h, 100 → 15 min).${cite('niosh1998')} The Sound level tab estimates your room’s level and your daily dose using this rule.` },
      { h: 'Practice rooms are loud', b: `Small, reflective rooms can make your own instrument surprisingly loud — especially brass, percussion, piano and amplified instruments. Measure, then adjust: practice some material at softer dynamics, add absorption (rugs, curtains), keep distance from other players, and take quiet breaks.${cite('nasm')}` },
      { h: 'Use musicians’ earplugs', b: `“Flat” (high-fidelity) earplugs lower volume fairly evenly across frequencies so music still sounds balanced; custom-molded versions are available through audiologists. Foam plugs work too but muffle highs.${cite('nasm', 'nidcdnoise')}` },
      { h: 'Warning signs', b: `Ringing (tinnitus) or muffled hearing after a rehearsal means you’ve been over-exposed. Get a baseline hearing test and recheck if you notice changes.${cite('nidcdnoise', 'nasm')} For live venues, WHO now recommends limits of 100 dB L<sub>Aeq</sub> averaged over 15 minutes.${cite('who2022')}` },
      { h: 'About this app’s meter', b: `Phone mics aren’t calibrated lab instruments. NIOSH testing found only some smartphone sound apps were within ±2 dB of a reference meter; external calibrated mics help.${cite('kardous2014')} This app applies standard A-weighting${cite('iec61672')} and lets you calibrate against a real meter. Use it as a guide, not a guarantee.` },
    ],
  },
  {
    id: 'mind', title: 'Mind', emoji: '🌿',
    items: [
      { h: 'Performance anxiety is normal — and treatable', b: `Music performance anxiety affects musicians at every level, from students to professionals, and responds to psychological treatment.${cite('kenny2011')} Among orchestral musicians, performance anxiety, depression and pain were linked, so it’s worth addressing them together.${cite('kenny2015')}` },
      { h: 'Slow your breathing', b: `In a randomized trial with 46 trained musicians, one session of slow breathing at about 6 breaths a minute (with or without biofeedback) improved heart-rate variability while they waited to perform; self-reported anxiety dropped mainly in the most anxious players.${cite('wells2012')} Try it in the green room: <a href="#breathe">Breathe →</a>` },
      { h: 'Practice performing', b: `Rehearse the performance itself: full run-throughs without stopping, recorded, ideally with a few listeners. Learning to keep going after a slip is a trainable skill.${cite('galamian')}` },
      { h: 'Get support', b: `Chapman <a href="https://www.chapman.edu/students/health-and-safety/psychological-counseling/" target="_blank" rel="noopener">Student Psychological Counseling Services</a> — 714-997-6778. If you’re in crisis, call or text <b>988</b> (Suicide &amp; Crisis Lifeline, U.S.).` },
    ],
  },
];

const TIPS = [
  { text: 'Interleave: switch between two or three passages every ~3 minutes instead of drilling one for 15. It feels harder — and sticks better.', cite: 'Carter & Grahn (2016)' },
  { text: 'Before you play, write one specific goal. After, take 30 seconds to reflect: what worked, what’s next?', cite: 'Zimmerman (2002); McPherson & Zimmerman (2011)' },
  { text: 'Nervous before a jury? Five minutes of breathing at ~6 breaths per minute calms your body’s arousal.', cite: 'Wells et al. (2012)' },
  { text: 'Two shorter sessions with rest (or sleep) in between beat one long cram session.', cite: 'Simmons (2012)' },
  { text: 'How you practice predicts tomorrow’s playing better than how long: fix errors the moment they happen and play it right several times before moving on.', cite: 'Duke, Simmons & Cash (2009)' },
  { text: 'Every +3 dB halves the safe listening time. 85 dBA is OK for 8 hours; 100 dBA for only about 15 minutes.', cite: 'NIOSH (1998)' },
  { text: 'Singers: start with straw phonation or lip trills — semi-occluded exercises let your folds vibrate with less effort.', cite: 'Titze (2006)' },
  { text: 'Sleep on it. Motor learning keeps consolidating overnight — a good night’s sleep is part of practice.', cite: 'Simmons & Duke (2006)' },
  { text: 'Ramping up for juries? Increase your daily playing time gradually instead of jumping from 1 to 4 hours.', cite: 'Chan & Ackermann (2014)' },
  { text: 'Rotate between passages instead of drilling one on repeat — it feels harder but tends to stick better.', cite: 'Stambaugh (2011)' },
  { text: 'Record a run-through and listen back. Your ear in the moment hears what you hoped; the recording hears what happened.', cite: 'Galamian (1962)' },
  { text: 'Drink water throughout the day — vocal fold hydration isn’t instant. Humid air helps too.', cite: 'Leydon et al. (2009)' },
  { text: 'Once a problem is solved, move on. Repeating what no longer needs practice wastes time.', cite: 'Galamian (1962)' },
  { text: 'Pain that lingers after playing, numbness, or tingling? Stop and get it checked — early care works best.', cite: 'NASM–PAMA; Chan & Ackermann (2014)' },
  { text: 'Musicians have ~3.6× the risk of noise-induced hearing loss. Musicians’ earplugs keep the music balanced.', cite: 'Schink et al. (2014)' },
  { text: 'Imagining the movements and sound while reading the score is real practice — especially on rest days.', cite: 'Bernardi et al. (2013)' },
];

export function tipOfTheDay(d = new Date()) {
  const day = Math.floor((d - new Date(d.getFullYear(), 0, 0)) / 864e5);
  return TIPS[day % TIPS.length];
}

let el;
export const health = {
  id: 'health',
  mount(root) {
    el = root;
    root.innerHTML = `
      <header class="view-head"><h1>Health & research</h1><p class="sub">What the research says about practicing well and staying healthy as a musician. Tap the little numbers for sources.</p></header>
      <nav class="seg" role="tablist">${SECTIONS.map((s, i) => `<button role="tab" class="seg-btn ${i === 0 ? 'on' : ''}" data-sec="${s.id}">${s.emoji} ${s.title}</button>`).join('')}<button role="tab" class="seg-btn" data-sec="refs">📚 Sources</button></nav>
      ${SECTIONS.map((s, i) => `
        <section class="health-sec" data-sec="${s.id}" ${i ? 'hidden' : ''}>
          ${s.items.map((it) => `<article class="card"><h2>${it.h}</h2><p>${it.b}</p></article>`).join('')}
        </section>`).join('')}
      <section class="health-sec" data-sec="refs" hidden>
        <div class="card"><h2>Sources</h2><ol class="refs">${ORDER.map((id) => `<li id="ref-${id}">${REFS[id].text} <a href="${REFS[id].url}" target="_blank" rel="noopener">Link ↗</a></li>`).join('')}</ol>
        <p class="hint">Summaries are written for students and simplify the findings; follow the links for full details. This app is educational and not medical advice — see a health professional for symptoms.</p></div>
      </section>`;

    const showSec = (id) => {
      $$('.seg-btn', root).forEach((b) => b.classList.toggle('on', b.dataset.sec === id));
      $$('.health-sec', root).forEach((s) => (s.hidden = s.dataset.sec !== id));
    };
    $$('.seg-btn', root).forEach((b) => b.addEventListener('click', () => showSec(b.dataset.sec)));
    root.addEventListener('click', (e) => {
      const a = e.target.closest('.cite-ref');
      if (!a) return;
      e.preventDefault();
      showSec('refs');
      const li = $(`#ref-${a.dataset.ref}`, root);
      li?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      li?.classList.add('flash');
      setTimeout(() => li?.classList.remove('flash'), 1600);
    });
  },
  show() {},
  hide() {},
};
