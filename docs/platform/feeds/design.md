---
title: FeedManager — Data-Ingestion Framework Design
category: System
status: draft
issue: 685
lastModified: '2026-06-02T00:00:00.000Z'
---

# FeedManager — Data-Ingestion Framework (Design)

> **Status: DRAFT — Step 1 of #685.** This is the design gate; no framework code ships until this doc is reviewed. Tracks issue [#685](https://github.com/jwilleke/ngdpbase/issues/685). Pairs with [#501](https://github.com/jwilleke/ngdpbase/issues/501) (the JSON→NCM serializer used only at the body-materialization step) and builds on [#728](./../../NGDP-Compatible-Markdown.md) (NCM) + the CatalogManager/CatalogSource surface ([`docs/schemas.md`](../../schemas.md)).

## 1. Purpose & scope

A platform-level **addon** named `feeds` that lets any instance pull structured data from external feeds (REST/JSON, RSS/Atom, CSV, GeoJSON/WFS, XLS) on a schedule, normalize each record to a schema.org `CreativeWork`, and expose it as a **CatalogSource** consumed by plugins — **without** writing one page per record.

This is platform infrastructure: it must not depend on geohazardwatch or any satellite, even though geohazardwatch's `geohazardwatch` addon (the former `ve-geology`) is the prior art being extracted.

**Out of scope:** ve-geology's bespoke importer migration (separate effort in the satellite repo, after the framework is stable); render-time fetching (explicitly rejected — see §10).

## 2. Locked decisions (from the #685 thread)

| # | Decision | Source |
|---|---|---|
| D1 | **Addon, not plugin** — needs state, scheduling, outbound HTTP, long-running runtime. Plugins are the *consumer* surface. | issue body |
| D2 | Addon working name **`feeds`** (sibling to `calendar`/`forms`/`elasticsearch`/`journal`); contains a `FeedManager` class. | comment 2026-05-22 |
| D3 | **Storage = CatalogSource records, NOT pages.** `FeedManager` calls `catalogManager.registerSource()` at addon `register()` time — no per-record page, no page-index explosion. | comment 2026-05-22 |
| D4 | **Reuse #728 NCM + ImportManager** normalization/`kind` machinery; do not re-implement. | comment 2026-05-22 |
| D5 | **Two consumer plugins**: `[Marquee source=…]` (simpler, first) and `[DataFeed source=…]` (curated subject page, later). No "one page per record" mode. | comment 2026-05-22 |
| D6 | Change-detection **hashes the normalized record, not rendered Markdown**; any serializer used for body materialization must be deterministic. | comment 2026-05-17 |
| D7 | Body materialization (only when an operator curates a subject page) goes through the **#501 JSON→NCM serializer**; #685 must **not** call #501's render-time fetch path. | comments 2026-05-17 / 2026-05-23 |

## 3. Resolved this session (was open)

| Topic | Resolution | Rationale |
|---|---|---|
| **Scheduler mechanism** | Reuse the existing **`setInterval` "tick + check-due"** pattern from `BackupManager` (`src/managers/BackupManager.ts:627` — 60s tick, runs when a source is due). **No new dependency, no cron parser.** | Operator: "we already have something on this." `BackupManager` (in-engine) and the geohazardwatch addon (`_intervals`) both schedule this way. The issue body's `"0 */1 * * *"` cron strings are dropped in favour of interval/time config (see §7). Cron-expression support can be added later if a real need appears. |
| **Outbound HTTP client** | Native `fetch()` (Node 18+). No axios/got. | The geohazardwatch importers (`import-earthquakes.js:141`) already use native `fetch`. No new dependency. |

## 4. Architecture

```
                         feeds addon  (register(engine, config))
   ┌───────────────────────────────────────────────────────────────┐
   │  FeedManager                                                    │
   │   • holds Map<sourceId, FeedSourceConfig>                       │
   │   • setInterval(60s) tick → for each due source: poll()         │
   │   • poll(): adapter.fetch → adapter.parse → normalize →         │
   │             change-detect (hash) → upsert catalog records       │
   │   • implements CatalogSource per sourceId (or per adapter)      │
   │   • registers itself: catalogManager.registerSource(this)       │
   │                                                                 │
   │  SourceAdapter registry: rss-atom | rest-json | geojson |       │
   │                          csv | xls   (5 MVP shapes)             │
   └───────────────────────────────────────────────────────────────┘
        │ registerSource()                  ▲ list()/get()
        ▼                                    │
   CatalogManager  ──────────────────────────┘
        ▲
        │ (consumer plugins read via CatalogManager / FeedManager)
   [Marquee source='…']     [DataFeed source='…']
```

### 4.1 SourceAdapter contract

Translates one wire format into a normalized record stream. Stateless; the scheduler and change-detection live in FeedManager, not the adapter.

```ts
interface SourceAdapter {
  readonly name: string;                       // 'rss-atom' | 'rest-json' | 'geojson' | 'csv' | 'xls'
  fetch(cfg: FeedSourceConfig): Promise<RawRecord[]>;   // native fetch(); throws on transport error
  parse(raw: RawRecord, cfg: FeedSourceConfig): NormalizedRecord;  // wire → flat record
}
```

`NormalizedRecord` carries `{ sourceRecordId, fetchedAt, properties: Record<string, unknown> }`. The `@type` mapping (schema.org) and `identifier` are assigned by FeedManager from `cfg`, not the adapter (keeps adapters domain-agnostic).

MVP adapter order (by demand from the open geohazardwatch issues): `rss-atom` → `rest-json` → `geojson/wfs` → `csv` → `xls`. Additional adapters can be contributed without forking the framework.

### 4.2 FeedManager as CatalogSource

`FeedManager` implements the existing `CatalogSource` interface (`src/types/Schema.ts:438`) — one registration **per feed `sourceId`** so cross-source queries can scope:

```ts
// implemented by FeedManager, registered once per configured source
sourceId:              'usgs-quakes'         // from config
types:                 ['Event']             // schema.org @type per source (config)
currentSchemaVersion:  1
list(query):   Promise<CatalogPage>          // reads the source's record store
get(identifier): Promise<CreativeWork|null>
rebuild(opts): Promise<void>                 // force a full re-fetch + re-index
```

This buys JSON-LD render, cross-source `CatalogManager.list()`, and dereferenceable `@id` URLs for free (same plumbing as pages/media/attachments).

### 4.3 Record store

Per-source on-disk record store under `FAST_STORAGE` (operational data, like the media index), e.g. `feeds/<sourceId>/records.json` + a `meta.json` (last-success timestamp, consecutive-failure count, content hashes for change-detection). **Not** under SLOW_STORAGE; **never** a page per record.

### 4.4 Scheduler (BackupManager pattern)

- One `setInterval(tick, 60_000)` owned by FeedManager, started in addon `register()`, cleared on addon teardown.
- Each tick: for every source, compute "is it due?" from `lastSuccessAt + intervalMinutes` (or a daily `time` like BackupManager). If due and not already running, `poll()`.
- **Back-off**: on consecutive failures, multiply the effective interval (cap at e.g. 6×) so a flapping endpoint isn't hammered; reset on success.
- **Stale-feed warning**: when `now - lastSuccessAt > stalenessThreshold`, emit a WARN admin notification (same `NotificationManager` path MediaManager uses).

### 4.5 Change detection (D6)

`poll()` computes a stable hash of each **normalized record** (sorted keys). Compare against the stored hash; upsert only changed/new records, tombstone removed ones. The rendered Markdown is never hashed — guarantees unchanged upstream data does not churn a curated subject page's git history.

## 5. Consumer plugins (D5)

- **`[Marquee source='usgs-quakes' max=5]`** — `MarqueePlugin` (exists) gains a `source` handle reading the latest N records from a FeedManager source. First consumer; proves end-to-end. Renders inline; no page version churn.
- **`[DataFeed source='usgs-quakes' since=… filter=…]`** — embedded in an operator-curated subject page; re-renders from the live store on each view. Page versions only when the operator edits the prose. **This is the only consumer that materializes record→body, and it does so via the #501 serializer (D7) — built last.**

## 6. Prior-art extraction map (geohazardwatch → feeds)

| geohazardwatch (bespoke) | feeds (framework) |
|---|---|
| `import/import-earthquakes.js` (native `fetch`, USGS GeoJSON) | `geojson` adapter + a `usgs-quakes` source config |
| `import/import-hans.js`, `import-volcanoes.js` | `rest-json` adapter + source configs |
| `managers/EarthquakeDataManager.js` etc. (per-source store) | FeedManager record store (one code path) |
| `_intervals` ad-hoc `setInterval`s in `index.js` | FeedManager single-tick scheduler |
| `EarthquakeList`/`EarthquakeMap` plugins | `[DataFeed]` / `[Marquee]` (generic) |

Migration of the satellite is explicitly **post-framework** (separate satellite-repo effort).

## 7. Configuration

Per-instance via `app-custom-config.json`. Cron strings from the original issue body are **replaced** with interval/time fields matching the scheduler (§4.4):

```jsonc
"ngdpbase.feeds.sources": {
  "usgs-quakes": {
    "adapter": "geojson",
    "url": "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_week.geojson",
    "intervalMinutes": 60,                 // OR  "dailyAt": "03:00"
    "type": "Event",                       // schema.org @type for this source
    "recordId": "$.id",                    // JSONPath to the per-record stable id
    "map": {                               // JSONPath → normalized properties
      "magnitude": "$.properties.mag",
      "depth_km": "$.geometry.coordinates[2]",
      "occurredAt": "$.properties.time"
    }
  }
}
```

`config/app-default-config.json` ships **no** sources (empty) — the framework is inert until an operator declares one. (Per the config-catalog-change rule, the default catalog is not modified beyond adding the empty `ngdpbase.feeds.*` namespace, which needs operator sign-off at PR time.)

## 8. Implementation order (slices)

Each slice is an independently shippable PR.

1. **This design doc** ← you are here (Step 1, the review gate).
2. **Addon skeleton** — `addons/feeds/` (package.json, `index.ts` `register()`, FeedManager class implementing an empty CatalogSource, config namespace). Registers with CatalogManager; no adapters.
3. **`rss-atom` adapter + record store + change-detection** — first vertical slice; validate against geohazardwatch [#7](https://github.com/jwilleke/geohazardwatch/issues/7) (VolcanoDiscovery RSS) as a fixture.
4. **`[Marquee source=…]`** — simplest consumer; proves end-to-end render from the store.
5. **Scheduler + back-off + stale-feed WARN** — the recurring runtime (BackupManager pattern).
6. **`[DataFeed source=…]`** + body materialization via #501 serializer (pick up #501 here, per its defer note).
7. **Remaining adapters** — `rest-json`, `geojson/wfs`, `csv`, `xls` by demand.
8. **(satellite)** ve-geology → feeds migration.

## 9. Testing strategy

- Per-adapter unit tests: `parse()` + hash stability (recorded fixture, no network in CI).
- Integration: a recorded fixture per upstream source drives `fetch()` (stubbed) → store → `list()`/`get()`.
- Change-detection: re-ingesting an identical fixture produces **zero** upserts (page-churn audit).
- Scheduler: due/not-due math, back-off escalation, stale-feed WARN — all on injected clock + stubbed `fetch` (no real timers in CI).

## 10. Open / deferred decisions (need answers before the slice that hits them)

| Q | Blocks slice | Note |
|---|---|---|
| The four #501 questions — template DSL, fetch policy, template storage, ImportManager integration shape | Slice 6 (`[DataFeed]` body materialization) | Not needed for slices 2–5. Resolve when #501 is picked up alongside slice 6. |
| Per-adapter **auth** (API keys / headers) for sources like NASA FIRMS | the adapter that first needs it | MVP sources (USGS, VolcanoDiscovery) are unauthenticated. Design `fetch` config to carry optional `headers`; defer secret-handling design until a keyed source is real. |
| Final `app-default-config.json` namespace shape | Slice 2 | Needs operator sign-off (config-catalog change rule). |
| Adapter packaging once #673 (packaged addon distribution) lands | post-MVP | Framework would itself become distributable to satellites. |

## 11. Rejected alternatives

- **Stay bespoke per satellite** — drift, re-invented wheel.
- **Plugin-only / render-time fetch** — plugins can't schedule or persist; fetching on render burns latency and hammers upstream. (Issue alternative (b).)
- **External cron writing via API** — kept as a *possible* per-source option ("fetched externally, framework just consumes"), not the default; the in-addon scheduler stays primary.
