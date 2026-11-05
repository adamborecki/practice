# The Chapman Practice App

A phone-first practice companion for Chapman musicians, created with Claude Code with input from Chapman faculty. Plain HTML/CSS/JS (ES modules), no build step, hosted on GitHub Pages at https://adamborecki.github.io/practice/. It works offline once installed to the home screen.

On first launch a welcome screen offers a guided tour (**Show me around**) or **Jump right in**; the tour can be replayed from More. More also links to the bug report / feature request form. Sub-screens show a breadcrumb trail and a Back button that returns to where you were, scroll position included.

| Screen | What it does |
|---|---|
| **Today** | Quote of the day; practice session in three modes: **Plan** (Galamian's building / interpreting / performing time, plus mental practice), **Rotate** (interleaved practice that switches passages every few minutes), **Free** (stopwatch). Each session starts with a goal and ends with a 30-second reflection and body check-in. Break reminders, a warning when weekly playing time jumps, quick timer, streak, health tip, next Chapman concerts |
| **Tuner** | YIN pitch detection, cents needle and 8-second intonation trail, long-tone steadiness readout (average offset and spread), adjustable A4 (415–466, shared with drones and backing tracks), transposing-instrument display (B♭, E♭, F, A, G), drones with an optional just fifth |
| **Beats** | Metronome with click sounds or 15 dance grooves; real time signatures (top and bottom number, e.g. 6/8, 7/8, 2/2) with compound meters felt in the dotted beat or in eighths; 14 subdivisions (2–8 per beat, swing, dotted, snap, gallop, syncopation, off-beats; duplets/quadruplets and siciliano in compound time); tap-to-set accents and groupings; count-in of 1, 2 or 4 bars; accuracy ladder, tap tempo, speed trainer, gap trainer; polyrhythms (3:2, 4:3, 5:4…, hear both or just one); tempo wiggle (the tempo drifts ±3–15% so you practice listening and following) |
| **Jam** | Backing tracks for any progression (letter chords, Roman numerals, Nashville numbers, slash chords, secondary dominants) in 12 styles, with transpose and a per-part mixer; count-in of 1, 2 or 4 bars, or a jazz-style "1 – 2 – | 1 2 3 4" |
| **Record** | Takes saved on the device (IndexedDB), waveform, 0.5×–1.25× playback, a “needs work” listening checklist (intonation, rhythm, tone…), notes, favorites, share/download, auto-boost for quiet takes. **Instant replay**: listens, detects when you stop, plays the phrase straight back (½–1× speed, 1–3 times, optional concert-hall reverb; plays through Web Audio so it works on iPhone; headphones mode keeps listening during playback), keeps each phrase to compare or save |
| **Sound level** | A-weighted dB estimate (IEC 61672 filter), calibration, hearing-protection setting, NIOSH 85 dBA / 3 dB daily dose measured at the ear |
| **Health** | Research summaries on practice, body, voice, hearing and mind, each with a numbered citation |
| **Concerts** | Upcoming Chapman College of Performing Arts events. Today shows everything this weekend (grouped by day) plus what's next in music; the full calendar has Music / This weekend / All arts / Dance / Theatre / Saved filters and .ics export |
| **Breathe** | Paced slow breathing (about 6 breaths a minute) before performances, with optional tone cues |
| **Teacher report** | Weekly summary: time and practice mix, goals reached, focus, body check-ins, listening notes, metronome/ladder work, load warning, plus the student's goals and questions. It can be shared, printed to PDF, emailed or copied |

## How the data works
- All student data (log, notes, recordings) stays in the browser (`localStorage` + IndexedDB). Nothing is uploaded. More → Export/Import backup moves the log and settings to another device.
- `data/concerts.json` is a snapshot of the public feed behind events.chapman.edu/copa. The feed doesn't allow cross-origin browser requests, so `scripts/fetch_concerts.py` refreshes the snapshot in the Pages workflow on every push and once a day.

## Run locally
```bash
python3 -m http.server 8765
```
Then open http://localhost:8765. The microphone needs `localhost` or https.

## iOS notes
- The app uses Safari's Audio Session API so the metronome and backing tracks still play when the ring/silent switch is on (iOS 16.4+).
- The microphone screens release the mic when you leave them, so playback goes back to the speaker.

## Tests run during development
- Pitch detection on synthetic tones from 41 Hz to 2.1 kHz: within ~1 cent for clean tones.
- A-weighting filter against IEC 61672 table values: within 0.3 dB from 31.5 Hz to 4 kHz.
- Chord parser: 40+ chord qualities, Roman/Nashville numbers, slash chords and `%` repeats.
- Meter math: pulses, note values, accents and click timing for simple, compound and odd meters.
