---
title: FeedManager — Data-Ingestion Framework Design
category: System
status: shipped (MVP, v3.48.0)
issue: 685
lastModified: '2026-07-16T00:00:00.000Z'
---

# FeedManager — Data-Ingestion Framework (Design)

> __Status: SHIPPED — MVP released in v3.48.0; [#685](https://github.com/jwilleke/ngdpbase/issues/685) closed.__ Slices 1–8 landed (see §8 — `rss-atom`/`csv`/`xls` adapters within slice 8 remain driver-gated, as does slice 9, the geohazardwatch importer migration). This doc remains the architectural source of truth; runtime docs live at [`docs/managers/FeedManager.md`](../../managers/FeedManager.md) and [`docs/plugins/DataFeedPlugin.md`](../../plugins/DataFeedPlugin.md), operator guide in the seeded __Using FeedManager__ page. Pairs with [#501](https://github.com/jwilleke/ngdpbase/issues/501) (the JSON→NCM serializer used only at the body-materialization step) and builds on [#728](./../../NGDP-Compatible-Markdown.md) (NCM) + the CatalogManager/CatalogSource surface ([`docs/schemas.md`](../../schemas.md)).

## 1. Purpose & scope

A platform-level __addon__ named `feeds` that lets any instance pull structured data from external feeds (REST/JSON, RSS/Atom, CSV, GeoJSON/WFS, XLS) on a schedule, normalize each record to a schema.org `CreativeWork`, and expose it as a __CatalogSource__ consumed by plugins — __without__ writing one page per record.

This is platform infrastructure: it must not depend on geohazardwatch or any satellite, even though geohazardwatch's `geohazardwatch` addon (the former `ve-geology`) is the prior art being extracted.

__Out of scope:__ ve-geology's bespoke importer migration (separate effort in the satellite repo, after the framework is stable); render-time fetching (explicitly rejected — see §10).

## 2. Locked decisions (from the #685 thread)

| # | Decision | Source |
|---|---|---|
| D1 | __Addon, not plugin__ — needs state, scheduling, outbound HTTP, long-running runtime. Plugins are the *consumer* surface. | issue body |
| D2 | Addon working name __`feeds`__ (sibling to `calendar`/`forms`/`elasticsearch`/`journal`); contains a `FeedManager` class. | comment 2026-05-22 |
| D3 | __Storage = CatalogSource records, NOT pages.__ `FeedManager` calls `catalogManager.registerSource()` at addon `register()` time — no per-record page, no page-index explosion. | comment 2026-05-22 |
| D4 | __Reuse #728 NCM + ImportManager__ normalization/`kind` machinery; do not re-implement. | comment 2026-05-22 |
| D5 | __Two consumption modes__: an inline value/text widget and a curated-subject-page block. No "one page per record" mode. *(Refined in §5: the inline mode reuses the existing `fetch='Manager.method()'` convention rather than a bespoke `[Marquee source=…]`; only `[DataFeed]` is a new plugin.)* | comment 2026-05-22 |
| D6 | Change-detection __hashes the normalized record, not rendered Markdown__; any serializer used for body materialization must be deterministic. | comment 2026-05-17 |
| D7 | Body materialization (only when an operator curates a subject page) goes through the __#501 JSON→NCM serializer__; #685 must __not__ call #501's render-time fetch path. | comments 2026-05-17 / 2026-05-23 |

## 3. Reuse map — build NOTHING that already exists

__Governing constraint (operator):__ do not duplicate functionality already implemented. The framework is mostly *assembly of existing parts*; the only genuinely net-new code is the wire-format adapters and the poll-loop orchestration (§3.2). Every other capability maps to an existing owner:

### 3.1 Reuse — existing implementations

| Capability #685 needs | Existing owner — reuse, do not rebuild |
|---|---|
| __Change-detection hash__ (D6) | `DeltaStorage.calculateHash(content)` — sha256, `src/utils/DeltaStorage.ts:186` (already used for page `contentHash`). Hash the canonicalized normalized record with this. |
| __Scheduler__ | `BackupManager`'s `setInterval` 60s tick + check-due (`src/managers/BackupManager.ts:627`). No cron parser, __no new dependency__. The issue body's `"0 */1 * * *"` cron strings are dropped for `intervalMinutes`/`dailyAt` (§7). |
| __Outbound HTTP__ | Native `fetch()` (as `geohazardwatch/import-earthquakes.js:141` already does). No axios/got. |
| __Manager-fetch convention__ (`fetch='Manager.method()'`) | ✅ Extracted to `pluginFormatters.resolveManagerFetch()` (slice 2) — one shared impl, reuse everywhere. Do __not__ write a second copy for any feed plugin. (Allow-list hardening = slice 2b, deferred for security review.) |
| __List / count / sort / escape rendering__ | `src/utils/pluginFormatters.ts` — `formatAsList`, `formatAsCount`, `parseSortParam`, `parseMaxParam`, `escapeHtml`. `[DataFeed]` renders through these. |
| __Record → NCM page body__ (D4, slice 6) | ImportManager converter registry + `normalizeToNcm` (`src/converters/ncm/`) and the #501 serializer. No bespoke Markdown. |
| __Storage / query / JSON-LD / dereferenceable `@id`__ | `CatalogManager` + `CatalogSource` (`src/types/Schema.ts:438`, `registerSource` at `CatalogManager.ts:273`). |
| __Stale-feed / error admin warnings__ | `NotificationManager` (same path MediaManager uses, `src/managers/MediaManager.ts`). |
| __Addon lifecycle / `register()` / disable toggle__ | `AddonsManager` (as `calendar`/`elasticsearch`/`journal` do). |

### 3.2 Genuinely net-new (the only code worth writing)

- __SourceAdapter wire parsers__ — `geojson` + `rest-json` are native `JSON.parse` (__zero dependency__); `csv` is trivial or a small dep; `rss-atom` needs __XML parsing (a dependency)__; `xls` needs a __spreadsheet lib (a dependency)__.
- __FeedManager poll orchestration__ — the loop that wires the reused pieces (fetch → adapter.parse → hash-compare via `DeltaStorage` → upsert catalog records → NotificationManager on staleness).

No JSONPath/mapping DSL is introduced — none exists in the repo, and adding one would duplicate normalization that ImportManager/NCM already own (see §7).

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
   any plugin via fetch='FeedManager.toMarqueeText(…)'   |   [DataFeed source='…']
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

MVP adapter order is now __by dependency cost first__, then demand: `geojson` → `rest-json` (both native `JSON.parse`, __zero dep__) → `rss-atom` (__+XML parser dep__) → `csv` (trivial or small dep) → `xls` (__+spreadsheet lib dep__). Each dependency-introducing adapter is a separate PR that calls out its dependency for sign-off. Additional adapters can be contributed without forking the framework.

### 4.2 FeedManager as CatalogSource

`FeedManager` implements the existing `CatalogSource` interface (`src/types/Schema.ts:438`) — one registration __per feed `sourceId`__ so cross-source queries can scope:

```ts
// implemented per configured source (FeedCatalogSource), registered with CatalogManager
sourceId:              'usgs-quakes'         // from config
types:                 ['Article']           // from config.schemaType (default 'Article')
currentSchemaVersion:  1
list(query):   Promise<CatalogPage>          // reads the source's record store
get(identifier): Promise<CreativeWork|null>
rebuild(opts): Promise<void>                 // reload the store (re-fetch is FeedManager.ingest)
```

__`types` is declared from config at registration__ and may be __any member of the CreativeWork union__ (`Article | ImageObject | VideoObject | AudioObject | DigitalDocument`) — an image/thermal feed registers as `ImageObject`, a podcast as `AudioObject`, etc. (2026-06-02 decision). `CatalogManager` routes `query.types` to a source only when its declared `types` intersect (`CatalogManager.ts:309–318`), so this is load-bearing.

__Slice 4 implements the `Article` projection__ (the only MVP driver); other union types are added per media-feed driver — a configured-but-unimplemented `schemaType` is rejected at parse with a clear log, never silently mis-typed. The domain label (`'Event'`, `'Earthquake'`) is the separate `type` config field, carried as a `keyword` + `ngdp:category`, not the schema `@type`. Types __outside__ the union (`Event`/`NewsArticle`) remain the deferred "extend the union" decision.

This buys JSON-LD render, cross-source `CatalogManager.list()`, and dereferenceable `@id` URLs for free (same plumbing as pages/media/attachments).

### 4.3 Record store

Per-source on-disk record store under `FAST_STORAGE` (operational data, like the media index), e.g. `feeds/<sourceId>/records.json` + a `meta.json` (last-success timestamp, consecutive-failure count, content hashes for change-detection). __Not__ under SLOW_STORAGE; __never__ a page per record.

### 4.4 Scheduler (BackupManager pattern)

- One `setInterval(tick, 60_000)` owned by FeedManager, started in addon `register()`, cleared on addon teardown.
- Each tick: for every source, compute "is it due?" from `lastSuccessAt + intervalMinutes` (or a daily `time` like BackupManager). If due and not already running, `poll()`.
- __Back-off__: on consecutive failures, multiply the effective interval (cap at e.g. 6×) so a flapping endpoint isn't hammered; reset on success.
- __Stale-feed warning__: when `now - lastSuccessAt > stalenessThreshold`, emit a WARN admin notification (same `NotificationManager` path MediaManager uses).

### 4.5 Change detection (D6)

`poll()` computes a stable hash of each __normalized record__ (canonicalized with sorted keys) using the existing __`DeltaStorage.calculateHash()`__ (`src/utils/DeltaStorage.ts:186`) — the same sha256 helper that backs page `contentHash`. Compare against the stored hash; upsert only changed/new records, tombstone removed ones. The rendered Markdown is never hashed — guarantees unchanged upstream data does not churn a curated subject page's git history.

## 5. Consumer surface (D5) — composition, no new plugin paradigm

Two real consumption modes, both built from existing primitives — __no bespoke `source=` handle, no `BasePlugin`__ (plugins here are `SimplePlugin` object literals; shared behaviour lives in `pluginFormatters.ts` by composition).

__Data flow — one store, many read-only presenters.__ The record store is the single source of truth; __only the scheduler writes to it__. Everything that surfaces feed data *reads*:

```
scheduler → fetch → normalize → RECORD STORE ──read──► presenters output content
                                (source of truth)        (never write back)
```

- __`[{DataFeed source='X'}]`__ — the principal presenter: queries the store at view time, formats records via `pluginFormatters`, returns inline markup that replaces the token. Read-only, recomputed per view.
- __`fetch='FeedManager.toMarqueeText(source=…,max=…)'`__ — the generic convention; any plugin inlines a ticker/value.
- __`CatalogManager.list()/get()`__ — cross-source queries, search, JSON-LD, dereferenceable `@id` — surface the same records with no plugin at all (because FeedManager registered as a `CatalogSource`).

No presenter writes to the store; the page file is never touched (§5.3).

### 5.1 Inline a value/text — the generic manager-fetch convention (any plugin)

FeedManager is just a registered manager exposing a render-ready helper (`FeedManager.toMarqueeText({source, max})`, the `BaseManager.toMarqueeText` convention). Any plugin inlines feed data through the __existing__ `fetch='Manager.method()'` convention — *extracted from `MarqueePlugin` into `pluginFormatters.ts` as `resolveManagerFetch()` with an allow-list*, so it's one shared, guarded impl:

```
[{MarqueePlugin fetch='FeedManager.toMarqueeText(source=usgs-quakes,max=5)'}]
```

This covers the ticker/badge/last-updated cases for *any* plugin — __no feed-specific plugin code__. The old "`[Marquee source=…]`" idea is dropped: it was a second copy of a convention that already exists.

### 5.2 Render structured records as a filterable block — `[DataFeed]`

`[DataFeed source='usgs-quakes' since=… filter=…]` is the one genuinely-new consumer, because it does what the string-fetch convention cannot: a __structured query__ over `CreativeWork` records + __formatted rendering__ through the existing `formatAsList`/`parseSortParam`/`parseMaxParam`/`escapeHtml` in `pluginFormatters.ts`.

- Embedded in an operator-curated subject page; re-renders from the live store on each view.
- Page versions only when the operator edits the prose (the dynamic block does not bump version history).
- __Renders at view time via `pluginFormatters`__ (`formatAsTable`/`parseSortParam`/`parseMaxParam`/`escapeHtml`) — table (default) or list, with `source`/`columns`/`sort`/`max`/`format` params. Cells are escaped plain text; the output is HTML, not NCM. #501 / NCM materialization is __deferred__ (the `formatAsTable`-vs-NCM-table unification is tracked on #501) — needed only if feed cells must carry resolving page-links or records are written to a stored page body, neither of which has a driver (design §5.3).

### 5.3 Three layers — what refreshes vs what is never rewritten

A `[DataFeed]` renders an __inline section/fragment__ where its token sits in a host page — never a free-standing, engine-owned page. A "feed page" is simply a host page whose body is one (or more) `[{DataFeed}]` tokens. There is no engine-written page.

How content stays current splits across three layers; __only the middle one is periodically overwritten__:

| Layer | Where | Periodically overwritten? | By what |
|---|---|---|---|
| __Page file__ (versioned, on disk) — operator prose + the `[{DataFeed}]` token | SLOW_STORAGE, git-versioned | __Never__ by the feed | operator edits only — this is the D6 guarantee that feeds don't churn page history |
| __Record store__ | FeedManager, FAST_STORAGE | __Yes__ — its whole job | the scheduler, on its interval; not versioned, not git |
| __Rendered output__ (what the viewer sees) | transient | __Recomputed, not stored__ | recomputed at view time from the store on each request → always current |

So a `[DataFeed]` page *displays* fresh data on a periodic basis via __view-time recompute__, not by overwriting any stored content — there is no "last content" being overwritten, because the rendered block is never persisted into the page.

__Explicit rule — FeedManager never owns or rewrites a feed page.__ Automatically rewriting a stored page body on a timer is the rejected path: it reintroduces version churn (D6) and, per-record, the page-index explosion (D3). FeedManager's product is __catalog records__, not pages.

Two safe exceptions, both bounded:

- __Write-once stub scaffold (optional, off by default):__ when a source is configured, FeedManager (or a one-shot admin action) may create a stub host page once — title + a single `[{DataFeed source='X'}]` — then never touch it again. All later "updates" are the plugin's view-time recompute. One write, no churn.
- __Render cache (optional perf):__ caching a source's rendered HTML with a TTL is a *cache* overwrite, not a page version — no git churn. An optimization for hot pages, separate from the page file.

If feed content needs to be searchable/exportable, that is already solved without materializing it into a page body: the records are a `CatalogSource`, hence queryable/searchable directly. Materializing a stored snapshot is only ever a deliberate, operator-triggered action — never an automatic timer.

## 6. Prior-art extraction map (geohazardwatch → feeds)

| geohazardwatch (bespoke) | feeds (framework) |
|---|---|
| `import/import-earthquakes.js` (native `fetch`, USGS GeoJSON) | `geojson` adapter + a `usgs-quakes` source config |
| `import/import-hans.js`, `import-volcanoes.js` | `rest-json` adapter + source configs |
| `managers/EarthquakeDataManager.js` etc. (per-source store) | FeedManager record store (one code path) |
| `_intervals` ad-hoc `setInterval`s in `index.js` | FeedManager single-tick scheduler |
| `EarthquakeList`/`EarthquakeMap` plugins | generic `[DataFeed]` + the `fetch=` convention |

Migration of the satellite is explicitly __post-framework__ (separate satellite-repo effort).

## 7. Configuration

Per-instance via `app-custom-config.json`, under the __established addon namespace `ngdpbase.addons.feeds.*`__ (confirmed convention — AddonsManager flattens this slice into the object passed to `register()`; `config.sources` is the per-feed map). The addon is __enabled__ via `ngdpbase.addons.feeds.enabled` (default `false`). Defaults live __inline in `register()`__ (like the `elasticsearch` addon) — so __`config/app-default-config.json` is not modified__; the addon is inert until enabled and a source is declared. Cron strings from the original issue body are __replaced__ with interval/time fields matching the scheduler (§4.4):

```jsonc
"ngdpbase.addons.feeds.enabled": true,
"ngdpbase.addons.feeds.sources": {
  "usgs-quakes": {
    "adapter": "geojson",
    "url": "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_week.geojson",
    "intervalMinutes": 60,                 // OR  "dailyAt": "03:00"
    "schemaType": "Article",               // CreativeWork union member to register/project as (default 'Article')
    "type": "Event",                       // domain genre → keyword + ngdp:category (NOT the schema @type)
    "recordIdField": "id",                  // dot-path to the per-record stable id
    "map": {                                // dot-path → normalized property
      "magnitude": "properties.mag",
      "depth_km": "geometry.coordinates.2",
      "occurredAt": "properties.time"
    }
  }
}
```

__No JSONPath/mapping-DSL engine is introduced__ — none exists in the repo, and adding one would duplicate normalization that ImportManager/NCM already own. `map` uses a trivial __dot-path__ lookup (a few lines, the `properties.mag` / `geometry.coordinates.2` form). Where a source needs richer shaping than dot-paths express, that's the adapter's job (it returns an already-shaped record) — not a config DSL. The `map` block is itself optional: an adapter may return records already in normalized shape.

`config/app-default-config.json` is __not modified__ — addon defaults live inline in `register()` (the `elasticsearch`-addon pattern), and the addon is enabled via `ngdpbase.addons.feeds.enabled` (default `false`). The framework is inert until enabled and a source is declared, so there is no default-catalog change to sign off.

## 8. Implementation order (slices)

Each slice is an independently shippable PR.

1. __This design doc__ ← you are here (Step 1, the review gate).
2. ✅ __DONE — Platform cleanup (feeds-independent):__ extracted the `fetch='Manager.method()'` convention out of `MarqueePlugin` into `pluginFormatters.ts` as `resolveManagerFetch()` (behaviour-preserving; MarqueePlugin delegates to it; +7 unit tests). Any plugin can now reuse the one shared impl.
   - __2b (deferred — security review):__ an allow-list / read-only restriction on which `Manager.method`s page content may invoke. Split out of slice 2 because it is a *security-policy change* (AGENTS human-review gate) and a behaviour change — current behaviour is wide-open (any method), and all real usage already follows the `BaseManager.toMarqueeText()` convention, so a restriction is feasible but needs operator sign-off on the policy. `resolveManagerFetch` is the single chokepoint where it would be enforced.
3. ✅ __DONE — Addon skeleton:__ `addons/feeds/` (package.json, tsconfig, `index.ts` `register()`, `FeedManager` + per-source `FeedCatalogSource` returning empty until slice 4, `config.ts` parser for the `ngdpbase.addons.feeds.sources` slice). `register()` registers FeedManager with the engine (reachable for slice 5) and a `FeedCatalogSource` per configured feed with CatalogManager. Added to `build:addons`. +11 unit tests; addon discovered cleanly (default-disabled), 6148 unit + 80 E2E green. No adapters, no scheduler.
4. ✅ __DONE — `geojson` adapter (zero-dep) + record store + change-detection.__ `SourceAdapter` contract + `geojson` adapter (native fetch/JSON.parse; FeatureCollection/array/single; dot-path `map`), `RecordStore` (per-source JSON under FAST_STORAGE; change-detection via `DeltaStorage.calculateHash` over content excluding `fetchedAt` — D6), `recordToCreativeWork` dispatcher (Article projection; `schemaType` config-driven + validated), `FeedManager.ingest()` pipeline, `FeedCatalogSource.list()/get()` reading the store. +29 unit tests. (Scheduler is slice 6 — ingest is manual/triggered for now.)
5. ✅ __DONE — Inline consumer:__ `FeedManager.toMarqueeText({source, max, sep})` (the `BaseManager.toMarqueeText` convention) + the slice-2 `resolveManagerFetch` helper. `[{MarqueePlugin fetch='FeedManager.toMarqueeText(source=usgs-quakes,max=5)'}]` renders latest-first record names with __no new plugin__. +4 tests incl. an end-to-end MarqueePlugin render. 6170 unit + 80 E2E green.
6. ✅ __DONE — Scheduler + back-off + stale-feed WARN.__ `FeedScheduler` mirrors BackupManager's `setInterval` 60s tick (`.unref()`'d); per-source cadence via `intervalMinutes` (default 60) or `dailyAt`; consecutive failures multiply the effective interval (capped 6×), reset on success; a single WARN routes to `/admin/notifications` (NotificationManager) when a source goes stale, cleared on recovery. Injected clock/notify/ingest → fully unit-tested (+6). `FeedManager.startScheduler()/stopScheduler()` wired into addon register/shutdown. 6176 unit + 80 E2E green.
7. ✅ __DONE — `[DataFeed source=…]` plugin.__ Renders a source's records as a table (default) or list at view time via `pluginFormatters` (`source`/`columns`/`sort`/`max`/`format`; cells escaped). Registered with PluginManager at addon register. __#501 deferred__ (operator decision 2026-06-02) — the view-time block needs no NCM; the `formatAsTable`-vs-NCM unification is filed on #501. +9 tests; 6185 unit + 80 E2E green.
8. ⏳ __Adapters by dependency cost__ — ✅ `rest-json` (zero-dep) DONE (generic REST GET → JSON; `itemsPath` dot-path or envelope auto-detect; shares `buildRecord` with geojson). ✅ `xml` DONE (2026-07-16, __dependency: `fast-xml-parser`__ — itself zero-dep; driver = VAAC ash advisories, geohazardwatch#5): XML parsed to plain objects so `itemsPath`/`map`/`recordIdField` dot-paths apply unchanged; attributes prefixed `@`, text under `#text`, single repeated elements coerced to arrays; shares `buildRecord`/`pickItemsArray`. Remaining, __driver + dependency sign-off gated__: `rss-atom` (may now reuse fast-xml-parser), `csv` (trivial or small dep), `xls` (+spreadsheet lib) — each a separate PR calling out its dependency.
9. __(satellite)__ geohazardwatch bespoke importers → feeds migration.

## 9. Testing strategy

- Per-adapter unit tests: `parse()` + hash stability (recorded fixture, no network in CI).
- Integration: a recorded fixture per upstream source drives `fetch()` (stubbed) → store → `list()`/`get()`.
- Change-detection: re-ingesting an identical fixture produces __zero__ upserts (page-churn audit).
- Scheduler: due/not-due math, back-off escalation, stale-feed WARN — all on injected clock + stubbed `fetch` (no real timers in CI).

## 10. Open / deferred decisions (need answers before the slice that hits them)

| Q | Blocks slice | Note |
|---|---|---|
| The four #501 questions — template DSL, fetch policy, template storage, ImportManager integration shape | Slice 6 (`[DataFeed]` body materialization) | Not needed for slices 2–5. Resolve when #501 is picked up alongside slice 6. |
| Per-adapter __auth__ (API keys / headers) for sources like NASA FIRMS | the adapter that first needs it | MVP sources (USGS, VolcanoDiscovery) are unauthenticated. Design `fetch` config to carry optional `headers`; defer secret-handling design until a keyed source is real. |
| Final `app-default-config.json` namespace shape | Slice 2 | Needs operator sign-off (config-catalog change rule). |
| Adapter packaging once #673 (packaged addon distribution) lands | post-MVP | Framework would itself become distributable to satellites. |

## 11. Rejected alternatives

- __Stay bespoke per satellite__ — drift, re-invented wheel.
- __Plugin-only / render-time fetch__ — plugins can't schedule or persist; fetching on render burns latency and hammers upstream. (Issue alternative (b).)
- __External cron writing via API__ — kept as a *possible* per-source option ("fetched externally, framework just consumes"), not the default; the in-addon scheduler stays primary.
