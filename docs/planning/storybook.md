# Trip Storybook — planning & discoveries

Status: __full 24-day set generated and imported to jimstest__ (2026-07-19; first import cycle done, regenerated set with operator layout feedback awaiting re-import). Epic #871; sub-issues #872 (generator), #873 (day media filter), #874 (import conflict policy / registration). Generator: `2026-trip-west/storybook/generate.py` (operator volume); import-ready output in sibling `storybook-import/` (25 slug-named NCM pages + per-day route PNGs in JSPWiki `-att/` layout for `/admin/import`).

## Concept

A __storybook__ is a set of ordinary NCM pages telling the story of a trip: one index page + one page per *travel day* (wake-to-sleep, not calendar day), each with the route, named stops with local times, photos, spend, a map, and an operator-written `## Story` section. Shared with family/friends via a share album link (#842).

Decisions:

- __Ordinary pages, not the Journal addon.__ Journal is addon-gated and personal-diary UX; the storybook is a shared publication and must work on any deployment. Journal remains fine as private input notes.
- __Page-per-day__, wake-to-sleep grouping. Implemented as __overnight-gap segmentation__: a travel day = the run of drives between stationary gaps > 5 h (`SLEEP_GAP_H`); same-wake-date segments merge (a 5 h+ midday park must not split a page). A fixed clock boundary (tried first) misfires on pre-dawn departures.
- __Generator, not a product feature (first).__ A script/skill merges the data sources below and emits NCM pages; ngdpbase itself needs almost nothing new. A first-class "storybook addon" (interactive timeline, inline story editing) is parked until the generated form proves limiting.
- __Slug page names__ (`2026-trip-west-day-05`), matching the operator's page-naming convention; display titles live in the H1.
- __Delivery = `/admin/import` folder import__, not the ingest API: no credential dance, `-att/` sidecar attachments come along (fix e822d66a), one operation for 25 pages. Select format __markdown__ explicitly — auto-detect misreads NCM tables/style-blocks as jspwiki (#874).

## Page layout (operator-reviewed, 2026-07-19)

- __Day page__: H1 (`Day NN — date — from → to`), miles, nav, Map (route PNG only — per-stop `[{Location}]` embed dropped), __Story__, Drives table (local times, named stops), Spent table, Photos, nav again. Nav links wrapped as Bootstrap buttons (`%%btn btn-outline-primary btn-sm`) at top and bottom.
- __Route PNG__: driven `timelinePath` polyline, saturated blue over a white casing (a red line vanishes into OSM's red/orange highways), red white-ringed __markers at every drive stop__.
- __Photos__: `[{Image src='/media/thumb/<id>?size=…' caption='<Title>' link='/media/item/<id>'}]` — Title renders as the caption under the image; when a Description exists the image floats left (`display='float'`) so the Description sits beside it. Max 8 inline + trip-album link for the rest. Videos as ▶ links.
- __Index page__: Story first, then a Trip Statistics table (days, miles, states count, mi/day, supercharging, spend link), full-state-name route line, day table.
- __Link-if-exists__: generator loads all live page titles and wiki-links city/state names (drive tables, route line) only when the page exists — no generated red links.
- __Title vs Description contract__ (media metadata): Title = short headline → card labels, item h1, storybook captions (fixes 88883a2e + e822d66a); Description = long caption → item detail page + beside-photo text.

## Data sources (all validated on real data)

| Source | Provides | Access |
|---|---|---|
| __Dawarich__ (self-hosted location tracker, `maps.nerdsbythehour.com`; mj-infra-flux `apps/production/maps`, `freikin/dawarich` + PostGIS) | Live points/visits by date range via REST API (native API-key auth); PostGIS geo queries for photo↔stop matching; imports Google Timeline history for backfill | Preferred source when configured — no manual export step. Bridge auth shared with the #864 photo-integration plan |
| __Google Maps Timeline export__ (`Timeline.json`, semanticSegments) | Visits (placeId, latLng, arrival/departure) and driven route polylines (`timelinePath`); timestamps carry local time + UTC offset | Fallback when no Dawarich. Operator export file. 54k segments back to 2011; 582 in the 24-day trip window (160 visits) |
| __TeslaMate__ (Postgres on deby k8s) | Drive legs, miles, supercharger stops, odometer, and __OSM reverse-geocoded names__ (named the trip's hotel directly: "Holiday Inn Express & Suites Merrillville") | Read-only psql via kubectl exec; car "Blue Moon" id 3 |
| __Media library index__ | Photos/videos with captureDate, GPS EXIF, titles/captions (#866 editable) | `/media/api/year/:year`, `/media/api/item/:id` |
| __Card statement PDF__ | Spend per merchant/day | pypdf text extraction; see the trip expense page generator |

## Location sources for generic deployments (capability tiers)

Most installs will NOT have Dawarich or TeslaMate. Design rule: __maps degrade, storybook never breaks.__ The generator unions whatever sources exist; each capability (route polyline, named stops, exact stop times) lights up only when a source provides it.

| Tier | Source | Who has it | Provides |
|---|---|---|---|
| 0 (always) | Photo EXIF GPS + timestamps | everyone with phone photos | stop inference by time+place clustering; no route line |
| 0 (always) | Manual stop entry | everyone | operator-typed stops, geocoded to pins via OSM search (LocationPlugin `name=` path) |
| 1 (file import) | Google Timeline export JSON | Android / Google Maps users | visits + route polylines, local times with UTC offsets |
| 1 (file import) | GPX / KML tracks | Garmin, Strava, Komoot, Gaia, AllTrails, car head units, GPS watches — and the practical iOS path (no usable Apple location-history export; a GPS-logger app produces GPX) | route polylines + timestamps; one parser covers the whole ecosystem |
| 2 (live service) | Dawarich API | self-hosters | points/visits by date range, PostGIS matching, Timeline backfill |
| 2 (live service) | Vehicle telemetry (TeslaMate, …) | EV self-hosters | enrichment only: miles, charge stops, OSM stop names — never required |

Map __display__ is a separate axis: generation-time static route PNGs stored as page attachments (one OSM fetch at generate time; page stays self-contained, consistent with NCM's no-render-time-fetch principle and OSM tile usage policy), plus existing LocationPlugin embeds for pins; a self-hosted Leaflet `[{TripMap}]` plugin is the later interactive upgrade.

## Hard-won timezone facts

- __TeslaMate `drives.start_date`/`end_date` are naive-UTC timestamps.__ A single `AT TIME ZONE 'X'` misreads them as X-local and double-shifts. Correct: treat as UTC, then convert to local-at-location (`AT TIME ZONE 'UTC' AT TIME ZONE <tz>`), or subtract the offset downstream.
- __EXIF `DateTimeOriginal` is local time__ (no TZ until EXIF 2.31 `OffsetTime*`). __Pixel `PXL_*` filenames are UTC.__ __EXIF GPS timestamps are UTC.__ QuickTime CreateDate is UTC by spec, frequently violated.
- __Google Timeline segment times are local with explicit UTC offsets__ (`startTimeTimezoneUtcOffsetMinutes`) — the cleanest source; use it as the timezone authority and cross-check the others. In the dry-run, Timeline visit times matched TZ-corrected TeslaMate arrivals to the minute.

## Matching heuristics

- Visit ↔ car stop: latLng proximity (~150 m) + time overlap. TeslaMate's OSM address supplies the display name (Timeline's new export format has placeIds but no names).
- Photo ↔ stop: capture time within the visit window; GPS proximity as tie-breaker. Photo captions (media metadata title/description, editable via #866) flow into the page verbatim.
- Spend ↔ day: statement transaction date (posting lag makes hotel charges land days later — match Expedia bookings to nights manually or by amount).

## Maps

- __Per-stop embeds__: existing `LocationPlugin` (`[{Location coords='…' embed=true}]`, OSM provider) — works today, one pin per embed.
- __Per-day route image__: render `timelinePath` polyline on OSM tiles → PNG (python `staticmap`, ~750 points/day worked fine), attach to the day page. No product code.
- __Interactive trip map__ (Leaflet self-hosted, polyline + photo pins, `[{TripMap}]`): parked; only if static images feel flat.

## Gaps found (issue status as of 2026-07-19)

1. __Day-level media filtering__ (#873, open) — MediaPlugin/media API are year- or keyword-scoped; the generator filters the trip-keyword set by capture time client-side. Real fix: date-range filter on MediaPlugin/media API.
2. __Import ≠ save__ (#874, open; the big one) — folder import writes raw page files, bypassing PageManager save semantics. Consequences seen live: hard duplicate-skip (no overwrite ⇒ regeneration requires delete-first, which loses written Story prose), format auto-detect misreads NCM as jspwiki, imported pages invisible to search until `pages.reindex`, links to them red-link until reindex, and they never appear in Recent Changes. Fix direction: route imports through PageManager save (index + link graph + change journal + versioning) with a skip/overwrite conflict option.
3. ~~`-att/` sidecar attachments lost on markdown import~~ — __fixed__ (e822d66a): attachment import runs for every format and relative refs are rewritten to `/attachments/<id>` at import time.
4. __Ingest auth friction__ (unfiled) — Authentik client-credentials is heavy for local agent use; folder import made it moot for storybook. Static API key (dawarich plan Gap 3) still the candidate if API-path publishing returns.
5. MediaGallery/MediaSearch/MediaItem plugins are still Phase-3 stubs; MediaPlugin is the only real renderer.
6. __Regeneration must preserve `## Story`__ — not yet implemented in the prototype generator; production requirement for #872 (until then: pages become the master the moment prose is written).

## Privacy note

Timeline data is ruthless — the dry-run surfaced a hospital visit on departure morning (operator had it removed, 2026-07-19). Generator output must be operator-reviewed before sharing; consider a deny-list of place types/names the generator redacts by default (medical facilities are the first entry).
