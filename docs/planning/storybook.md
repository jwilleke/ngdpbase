# Trip Storybook — planning & discoveries

Status: dry-run validated (2026-07-18, days 1–3 of the 2026 trip west). Epic: see GitHub epic "Trip Storybook". Prototype output: `/Volumes/mjs/travel/2026-travel/2026-trip-west/storybook/` (operator volume, not in repo).

## Concept

A **storybook** is a set of ordinary NCM pages telling the story of a trip: one index page + one page per *travel day* (wake-to-sleep, not calendar day), each with the route, named stops with local times, photos, spend, a map, and an operator-written `## Story` section. Shared with family/friends via a share album link (#842).

Decisions:

- **Ordinary pages, not the Journal addon.** Journal is addon-gated and personal-diary UX; the storybook is a shared publication and must work on any deployment. Journal remains fine as private input notes.
- **Page-per-day**, wake-to-sleep grouping. Day boundary = overnight-stay visit, not midnight (road-trip legs cross midnight constantly).
- **Generator, not a product feature (first).** A script/skill merges the data sources below and emits NCM pages; ngdpbase itself needs almost nothing new. A first-class "storybook addon" (interactive timeline, inline story editing) is parked until the generated form proves limiting.

## Data sources (all validated on real data)

| Source | Provides | Access |
|---|---|---|
| **Dawarich** (self-hosted location tracker, `maps.nerdsbythehour.com`; mj-infra-flux `apps/production/maps`, `freikin/dawarich` + PostGIS) | Live points/visits by date range via REST API (native API-key auth); PostGIS geo queries for photo↔stop matching; imports Google Timeline history for backfill | Preferred source when configured — no manual export step. Bridge auth shared with the #864 photo-integration plan |
| **Google Maps Timeline export** (`Timeline.json`, semanticSegments) | Visits (placeId, latLng, arrival/departure) and driven route polylines (`timelinePath`); timestamps carry local time + UTC offset | Fallback when no Dawarich. Operator export file. 54k segments back to 2011; 582 in the 24-day trip window (160 visits) |
| **TeslaMate** (Postgres on deby k8s) | Drive legs, miles, supercharger stops, odometer, and **OSM reverse-geocoded names** (named the trip's hotel directly: "Holiday Inn Express & Suites Merrillville") | Read-only psql via kubectl exec; car "Blue Moon" id 3 |
| **Media library index** | Photos/videos with captureDate, GPS EXIF, titles/captions (#866 editable) | `/media/api/year/:year`, `/media/api/item/:id` |
| **Card statement PDF** | Spend per merchant/day | pypdf text extraction; see the trip expense page generator |

## Hard-won timezone facts

- **TeslaMate `drives.start_date`/`end_date` are naive-UTC timestamps.** A single `AT TIME ZONE 'X'` misreads them as X-local and double-shifts. Correct: treat as UTC, then convert to local-at-location (`AT TIME ZONE 'UTC' AT TIME ZONE <tz>`), or subtract the offset downstream.
- **EXIF `DateTimeOriginal` is local time** (no TZ until EXIF 2.31 `OffsetTime*`). **Pixel `PXL_*` filenames are UTC.** **EXIF GPS timestamps are UTC.** QuickTime CreateDate is UTC by spec, frequently violated.
- **Google Timeline segment times are local with explicit UTC offsets** (`startTimeTimezoneUtcOffsetMinutes`) — the cleanest source; use it as the timezone authority and cross-check the others. In the dry-run, Timeline visit times matched TZ-corrected TeslaMate arrivals to the minute.

## Matching heuristics

- Visit ↔ car stop: latLng proximity (~150 m) + time overlap. TeslaMate's OSM address supplies the display name (Timeline's new export format has placeIds but no names).
- Photo ↔ stop: capture time within the visit window; GPS proximity as tie-breaker. Photo captions (media metadata title/description, editable via #866) flow into the page verbatim.
- Spend ↔ day: statement transaction date (posting lag makes hotel charges land days later — match Expedia bookings to nights manually or by amount).

## Maps

- **Per-stop embeds**: existing `LocationPlugin` (`[{Location coords='…' embed=true}]`, OSM provider) — works today, one pin per embed.
- **Per-day route image**: render `timelinePath` polyline on OSM tiles → PNG (python `staticmap`, ~750 points/day worked fine), attach to the day page. No product code.
- **Interactive trip map** (Leaflet self-hosted, polyline + photo pins, `[{TripMap}]`): parked; only if static images feel flat.

## Gaps found (candidate sub-issues)

1. **Day-level media filtering** — MediaPlugin/media API are year- or keyword-scoped; a day page wants "photos for 2026-06-24". Interim: per-day trip keywords (`2026-trip-west-<date>`) tagged in digiKam. Real fix: date-range filter on MediaPlugin/media API.
2. **Ingest with attachments** — the route PNGs must become page attachments at ingest; verify `/api/page/ingest` + NCM image rule cover a local-file flow (NCM fetches remote images; local sidecar files need an upload path).
3. **Ingest auth friction** — Authentik client-credentials works but is heavy for local agent use; the planned-but-unbuilt static API key (Gap 3, dawarich plan) would simplify. MCP stdio `create_page` is the current low-friction alternative.
4. MediaGallery/MediaSearch/MediaItem plugins are still Phase-3 stubs; MediaPlugin is the only real renderer.

## Privacy note

Timeline data is ruthless — the dry-run surfaced a hospital visit on departure morning (operator had it removed, 2026-07-19). Generator output must be operator-reviewed before sharing; consider a deny-list of place types/names the generator redacts by default (medical facilities are the first entry).
