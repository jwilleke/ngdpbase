#!/usr/bin/env python3
"""2026 Trip West storybook generator — dry-run seed for ngdpbase #872.

Sources: TeslaMate drives (naive-UTC PSV export), Google Timeline export
(local times + UTC offsets), ngdpbase media index (keyword 2026-trip-west),
cleaned expense page (daily detail rows). Emits import-ready pages for
/admin/import: slug-named .md files + route PNGs in JSPWiki -att/ layout.

Wake-to-sleep rule: a travel day is the run of drives between overnight
stationary gaps (> SLEEP_GAP_H hours). Same-wake-date segments merge.

Layout (operator 2026-07-19): day pages = nav, Map (route PNG with stop
markers, no Location embed), Story, Drives, Spent, Photos (caption under
image, Description floated beside), nav again as buttons. Index = Story top,
Trip Statistics, full-state-name route. City/state names link to existing
wiki pages only (no red links).
"""
import json, re, sys, glob, datetime, pathlib, shutil, urllib.request

TRIP = pathlib.Path("/Volumes/mjs/travel/2026-travel/2026-trip-west")
OUT = TRIP / "storybook-import"
SCRATCH = pathlib.Path(sys.argv[1]) if len(sys.argv) > 1 else pathlib.Path(".")
DRIVES_PSV = SCRATCH / "drives-full.psv"
TIMELINE = "/Volumes/jims/data/archive/timeline/2026-07-17-Timeline.json"
EXPENSE_PAGE = "/Volumes/hd2A/jimstest-wiki/data/pages/2cf576a0-6471-45c2-910d-afb8dfa92c69.md"
LIVE_PAGES_DIR = "/Volumes/hd2A/jimstest-wiki/data/pages"
MEDIA_API = "http://jminim4:3000/media/api/year/2026"
D0, D1 = "2026-06-22", "2026-07-15"
MAX_INLINE_IMAGES = 8
SLEEP_GAP_H = 5

STATES_IN_ORDER = ["Ohio", "Indiana", "Illinois", "Wisconsin", "Minnesota",
                   "South Dakota", "Wyoming", "Idaho", "Utah", "Oregon",
                   "Washington", "Montana", "North Dakota"]

W = ["%%table-fit", "%%table-bordered", "%%table-striped", "%%table-hover", "%%sortable"]

def table(header, rows):
    return "\n".join(W + ["||" + "||".join(header) + "||"] +
                     ["|" + "|".join(str(c) for c in r) + "|" for r in rows] + ["/%"] * 5)

# --- Existing wiki page titles (for link-if-exists) --------------------------
existing_titles = {}
for f in glob.glob(f"{LIVE_PAGES_DIR}/*.md"):
    m = re.search(r"^title: (.+)$", open(f).read(400), re.M)
    if m:
        t = m.group(1).strip().strip("'\"")
        existing_titles[t.lower()] = t

def linkify(name):
    """Wiki-link a name only when a page with that title exists."""
    t = existing_titles.get(name.strip().lower())
    return f"[{name}|{t}]" if t else name

def linkify_place(place):
    """Link the city component of 'Venue, City' when a page exists."""
    if not place:
        return place
    parts = place.rsplit(", ", 1)
    if len(parts) == 2:
        return f"{parts[0]}, {linkify(parts[1])}"
    return linkify(place)

# --- Timeline: offset lookup + per-day paths ---------------------------------
tl = json.load(open(TIMELINE))
offsets, paths = [], {}
for s in tl["semanticSegments"]:
    st = s.get("startTime", "")
    if not (D0 <= st[:10] <= D1 + "z"):
        continue
    off = s.get("startTimeTimezoneUtcOffsetMinutes")
    if off is not None:
        offsets.append((st[:16].replace("T", " "), off))
    for p in s.get("timelinePath", []):
        ll = p.get("point", "").replace("°", "").split(",")
        try:
            paths.setdefault(st[:10], []).append((float(ll[1]), float(ll[0])))
        except (ValueError, IndexError):
            pass
offsets.sort()

def utc_offset_min(utc_str):
    if not offsets:
        return -240
    best = min(offsets, key=lambda o: abs(
        datetime.datetime.fromisoformat(o[0]) + datetime.timedelta(minutes=-o[1])
        - datetime.datetime.fromisoformat(utc_str)))
    return best[1]

def to_local(utc_str):
    return datetime.datetime.fromisoformat(utc_str) + datetime.timedelta(minutes=utc_offset_min(utc_str))

# --- Drives ------------------------------------------------------------------
drives = []
for line in open(DRIVES_PSV):
    f = line.rstrip("\n").split("|")
    if len(f) < 9:
        continue
    drives.append(dict(start=to_local(f[0]), end=to_local(f[1]), mi=float(f[2]),
                       frm=", ".join(x for x in (f[3], f[4]) if x),
                       to=", ".join(x for x in (f[5], f[6]) if x),
                       lat=float(f[7]) if f[7] else None, lon=float(f[8]) if f[8] else None))
drives.sort(key=lambda d: d["start"])

travel_days = []
for d in drives:
    if travel_days and (d["start"] - travel_days[-1]["drives"][-1]["end"]).total_seconds() < SLEEP_GAP_H * 3600:
        travel_days[-1]["drives"].append(d)
    else:
        travel_days.append(dict(date=d["start"].date().isoformat(), drives=[d]))
for i, td in enumerate(travel_days):
    td["t0"] = td["drives"][0]["start"]
    nxt = travel_days[i + 1]["drives"][0]["start"] if i + 1 < len(travel_days) else None
    cap = td["drives"][-1]["end"] + datetime.timedelta(hours=12)
    td["t1"] = min(nxt, cap) if nxt else cap

def travel_day_for(dt):
    for td in travel_days:
        if td["t0"] <= dt < td["t1"]:
            return td["date"]
    return dt.date().isoformat()

# --- Spend -------------------------------------------------------------------
spend = {}
body = open(EXPENSE_PAGE).read().split("## Daily detail")[1].split("## Daily totals")[0]
for m in re.finditer(r"\|(\d{4}-\d\d-\d\d)\|([^|]+)\|([^|]+)\|\$([\d,]+\.\d\d)\|", body):
    spend.setdefault(m.group(1), []).append((m.group(2), m.group(3), m.group(4)))

# --- Media -------------------------------------------------------------------
items = json.load(urllib.request.urlopen(MEDIA_API))
if isinstance(items, dict):
    items = items.get("items", items.get("results", []))
media = {}
for it in items:
    md = it.get("metadata") or {}
    if "2026-trip-west" not in (md.get("keywords") or []):
        continue
    dto = md.get("dateTimeOriginal") or ""
    if not (D0 <= dto[:10] <= D1):
        continue
    try:
        day = travel_day_for(datetime.datetime.fromisoformat(dto.replace(" ", "T")))
    except ValueError:
        day = dto[:10]
    media.setdefault(day, []).append(dict(id=it["id"], fn=it["filename"],
                                          title=md.get("title"), t=dto[11:16],
                                          desc=md.get("description") or md.get("caption"),
                                          video=it.get("mimeType", "").startswith("video")))

# --- Route PNGs with stop markers -------------------------------------------
# ngdpbase#898: content-keyed cache. Rendering fetches live OSM tiles, so two
# runs over IDENTICAL route data still produce byte-different PNGs (tile
# updates) — and each /admin/import of a byte-different PNG mints a NEW
# content-hash attachment in the wiki, orphaning the previous map. Caching by
# a hash of the route inputs means an unchanged day reuses the exact prior
# bytes → same sha256 → the wiki's content-dedup makes re-import a no-op.
# Delete route-cache/ to force fresh tiles (e.g. after an OSM data fix).
ROUTE_CACHE = pathlib.Path(__file__).resolve().parent / "route-cache"

def _route_key(pts, stops):
    import hashlib
    payload = json.dumps({
        "pts": [[round(lon, 6), round(lat, 6)] for lon, lat in pts],
        "stops": [[round(lon, 6), round(lat, 6)] for lon, lat in stops],
        "style": "900x600/osm/white9-blue5/stops-red9-white14"  # bump on style changes
    }, separators=(",", ":"))
    return hashlib.sha256(payload.encode()).hexdigest()

def render_route(pts, stops, out_png):
    try:
        from staticmap import StaticMap, Line, CircleMarker
    except ImportError:
        return False
    if len(pts) < 2:
        return False
    ROUTE_CACHE.mkdir(exist_ok=True)
    cached = ROUTE_CACHE / f"{_route_key(pts, stops)}.png"
    if cached.exists() and cached.stat().st_size > 0:
        shutil.copyfile(cached, out_png)
        return True
    m = StaticMap(900, 600, url_template="https://tile.openstreetmap.org/{z}/{x}/{y}.png",
                  headers={"User-Agent": "ngdpbase-storybook/0.1 (jim@willeke.com)"})
    # White casing under saturated blue — OSM highways are red/orange.
    m.add_line(Line(pts, "#ffffff", 9))
    m.add_line(Line(pts, "#0033cc", 5))
    for lon, lat in stops:
        m.add_marker(CircleMarker((lon, lat), "#ffffff", 14))
        m.add_marker(CircleMarker((lon, lat), "#cc0000", 9))
    m.render().save(str(out_png))
    shutil.copyfile(out_png, cached)
    return True

def nav_buttons(prev_slug, prev_label, next_slug, next_label):
    # One line: the links themselves carry the button classes (LinkParser
    # allows a class attribute), so they render as a single row of buttons.
    b = "class='btn btn-outline-primary btn-sm'"
    b2 = "class='btn btn-outline-secondary btn-sm'"
    return (f"[← {prev_label}|{prev_slug}|{b}] "
            f"[Trip index|2026-trip-west|{b2}] "
            f"[{next_label} →|{next_slug}|{b}]")

def photo_block(imgs):
    # One bordered card per photo: image floated left/right (alternating down
    # the page), caption under the image, Description flowing beside it.
    # Each card is its own clearfix so long descriptions never bleed into the
    # next photo.
    lines = []
    side = "left"
    for m_ in imgs[:MAX_INLINE_IMAGES]:
        title = (m_["title"] or "").replace("'", "’")
        desc = (m_["desc"] or "").replace("'", "’")
        label = title or f"{m_['t']} — {m_['fn']}"
        if m_["video"]:
            lines.append(f"- [▶ {label}|/media/item/{m_['id']}]")
            continue
        cap = f" caption='{title}'" if title else ""
        lines.append("%%card clearfix p-3 mb-3")
        lines.append(f"[{{Image src='/media/thumb/{m_['id']}?size=480x480'{cap} "
                     f"link='/media/item/{m_['id']}' align='{side}' display='float'}}]")
        if desc:
            lines.append(desc)
        lines.append("/%")
        side = "right" if side == "left" else "left"
    more = len(imgs) - MAX_INLINE_IMAGES
    if more > 0:
        lines.append(f"*…plus {more} more — see the [trip album|/media/keyword/2026-trip-west].*")
    return "\n".join(lines) if lines else "*No tagged photos this day.*"

# --- Emit --------------------------------------------------------------------
OUT.mkdir(exist_ok=True)
days = [(datetime.date(2026, 6, 22) + datetime.timedelta(days=i)).isoformat() for i in range(24)]
drives_by_date = {}
for td in travel_days:
    drives_by_date.setdefault(td["date"], []).extend(td["drives"])
index_rows, total_mi = [], 0.0

for n, day in enumerate(days, 1):
    slug = f"2026-trip-west-day-{n:02d}"
    dd = drives_by_date.get(day, [])
    mi = round(sum(d["mi"] for d in dd), 1)
    total_mi += mi
    frm, to = (dd[0]["frm"], dd[-1]["to"]) if dd else ("", "")
    head = f"{frm} → {to}" if dd else "Layover"
    prev_slug = f"2026-trip-west-day-{n-1:02d}" if n > 1 else "2026-trip-west"
    prev_label = "Previous" if n > 1 else "Trip index"
    next_slug = f"2026-trip-west-day-{n+1:02d}" if n < 24 else "2026-trip-west"
    next_label = "Next" if n < 24 else "Trip index"
    nav = nav_buttons(prev_slug, prev_label, next_slug, next_label)

    drive_rows = [[d["start"].strftime("%H:%M"), d["end"].strftime("%H:%M"),
                   f"{d['mi']:.1f}", linkify_place(d["frm"]), linkify_place(d["to"])] for d in dd]
    spend_rows = [[merch.strip(), cat.strip(), f"${amt}"] for merch, cat, amt in spend.get(day, [])]

    map_md = ""
    pts = paths.get(day, [])
    stops = [(d["lon"], d["lat"]) for d in dd if d["lat"] is not None]
    png_name = "route.png"
    att_dir = OUT / f"{slug}-att" / f"{png_name}-dir"
    if pts and render_route(pts, stops, OUT / f"route-{day}.png"):
        att_dir.mkdir(parents=True, exist_ok=True)
        (OUT / f"route-{day}.png").rename(att_dir / "1.png")
        map_md = f"## Map\n\n![Day {n} route]({png_name})\n\n"

    drives_md = f"## Drives (local times)\n\n{table(['Depart','Arrive','Miles','From','To'], drive_rows)}\n\n" if drive_rows else ""
    spend_md = f"## Spent\n\n{table(['Merchant','Category','Amount'], spend_rows)}\n\n" if spend_rows else ""

    body_md = f"""---
title: {slug}
user-keywords:
  - travel
  - 2026-trip-west
---
# Day {n:02d} — {day} — {head}

**{mi} miles.**

{nav}

{map_md}## Story

*(Write what happened this day…)*

{drives_md}{spend_md}## Photos

{photo_block(media.get(day, []))}

{nav}
"""
    (OUT / f"{slug}.md").write_text(body_md)
    index_rows.append([f"[Day {n:02d}|{slug}]", day, head, f"{mi:.0f}"])
    print(f"day {n:02d} {day}: {len(dd)} drives, {mi:.0f} mi, {len(spend_rows)} spends, {len(media.get(day, []))} photos")

route_pretty = " → ".join(linkify(s) for s in STATES_IN_ORDER) + " → " + linkify("Ohio")
idx = f"""---
title: 2026-trip-west
user-keywords:
  - travel
  - 2026-trip-west
---
# 2026 Trip West

## Story

*(Trip overview prose…)*

## Trip Statistics

%%table-fit
%%table-bordered
||Statistic||Value||
|Days|24 (2026-06-22 → 2026-07-15)|
|Miles|6,534 (10,515 km)|
|States|{len(STATES_IN_ORDER)}|
|Average per day|≈272 mi|
|Supercharging|47 sessions, $748.28 (≈11.5¢/mi)|
|Trip spend|[$6,129.37|2026-trip-west-expenses]|
/%
/%

**Route:** {route_pretty}

[Expenses|2026-trip-west-expenses] · [Trip photo album|/media/keyword/2026-trip-west]

## Days

{table(['Day','Date','Route','Miles'], index_rows)}
"""
(OUT / "2026-trip-west.md").write_text(idx)
print("index written →", OUT, f"(total {total_mi:.0f} mi)")
