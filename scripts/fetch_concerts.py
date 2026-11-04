#!/usr/bin/env python3
"""Fetch Chapman College of Performing Arts public events into data/concerts.json.

Source: the public Trumba/25Live feed behind events.chapman.edu/copa.
The feed doesn't send CORS headers, so the browser can't read it directly;
this script runs in the GitHub Pages workflow (daily) and snapshots it.
If the fetch fails, the existing file is left untouched.
"""
import html, json, re, sys, urllib.request
from datetime import datetime, timezone
from pathlib import Path

FEED = "https://25livepub.collegenet.com/calendars/copa-event-calendar.json"
OUT = Path(__file__).resolve().parent.parent / "data" / "concerts.json"

MUSIC_WORDS = re.compile(
    r"orchestra|symphon|choir|choral|recital|piano|pianist|guitar|ensemble|jazz|opera|"
    r"mariachi|wassail|concert|band|music|percussion|saxophone|mtac|keyboard|string|"
    r"brass|wind|vocal|sholund|quartet|composition", re.I)
MUSIC_VENUES = re.compile(r"bertea|salmon recital|shanley", re.I)


def clean(text, limit=None):
    text = re.sub(r"<[^>]+>", " ", text or "")
    text = html.unescape(text)
    text = re.sub(r"\s+", " ", text).strip()
    if limit and len(text) > limit:
        text = text[: limit].rsplit(" ", 1)[0] + "…"
    return text


def category(title, location):
    if re.search(r"dance|bodies", title, re.I) or re.search(r"simon", location, re.I):
        return "dance"
    if MUSIC_WORDS.search(title) or MUSIC_VENUES.search(location):
        return "music"
    if re.search(r"roundtable|intensive|lecture|panel|workshop", title, re.I):
        return "other"
    if re.search(r"theatre|theater|moulton|waltmar|halsell|musco", location, re.I):
        return "theatre"
    return "other"


def main():
    try:
        req = urllib.request.Request(FEED, headers={"User-Agent": "practice-room-app/1.0"})
        with urllib.request.urlopen(req, timeout=30) as r:
            raw = json.load(r)
    except Exception as e:  # keep the last good snapshot
        print(f"fetch failed, keeping existing file: {e}", file=sys.stderr)
        return 0

    events = []
    for e in raw:
        title = clean(e.get("title"))
        location = clean(e.get("location"))
        events.append({
            "id": e.get("eventID"),
            "title": title,
            "start": e.get("startDateTime"),
            "end": e.get("endDateTime"),
            "tzOffset": e.get("startTimeZoneOffset"),
            "allDay": bool(e.get("allDay")),
            "venue": location.split(",")[0].strip(),
            "location": location,
            "description": clean(e.get("description"), 320),
            "url": e.get("permaLinkUrl") or "https://events.chapman.edu/copa/",
            "category": category(title, location),
            "canceled": bool(e.get("canceled")),
        })
    events.sort(key=lambda x: x["start"] or "")
    OUT.write_text(json.dumps({
        "source": "https://events.chapman.edu/copa/",
        "fetched": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "events": events,
    }, indent=1, ensure_ascii=False))
    print(f"wrote {len(events)} events to {OUT}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
