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
| D5 | **Two consumption modes**: an inline value/text widget and a curated-subject-page block. No "one page per record" mode. *(Refined in §5: the inline mode reuses the existing `fetch='Manager.method()'` convention rather than a bespoke `[Marquee source=…]`; only `[DataFeed]` is a new plugin.)* | comment 2026-05-22 |
| D6 | Change-detection **hashes the normalized record, not rendered Markdown**; any serializer used for body materialization must be deterministic. | comment 2026-05-17 |
| D7 | Body materialization (only when an operator curates a subject page) goes through the **#501 JSON→NCM serializer**; #685 must **not** call #501's render-time fetch path. | comments 2026-05-17 / 2026-05-23 |

## 3. Reuse map — build NOTHING that already exists

**Governing constraint (operator):** do not duplicate functionality already implemented. The framework is mostly *assembly of existing parts*; the only genuinely net-new code is the wire-format adapters and the poll-loop orchestration (§3.2). Every other capability maps to an existing owner:

### 3.1 Reuse — existing implementations

| Capability #685 needs | Existing owner — reuse, do not rebuild |
|---|---|
| **Change-detection hash** (D6) | `DeltaStorage.calculateHash(content)` — sha256, `src/utils/DeltaStorage.ts:186` (already used for page `contentHash`). Hash the canonicalized normalized record with this. |
| **Scheduler** | `BackupManager`'s `setInterval` 60s tick + check-due (`src/managers/BackupManager.ts:627`). No cron parser, **no new dependency**. The issue body's `"0 */1 * * *"` cron strings are dropped for `intervalMinutes`/`dailyAt` (§7). |
| **Outbound HTTP** | Native `fetch()` (as `geohazardwatch/import-earthquakes.js:141` already does). No axios/got. |
| **Manager-fetch convention** (`fetch='Manager.method()'`) | ✅ Extracted to `pluginFormatters.resolveManagerFetch()` (slice 2) — one shared impl, reuse everywhere. Do **not** write a second copy for any feed plugin. (Allow-list hardening = slice 2b, deferred for security review.) |
| **List / count / sort / escape rendering** | `src/utils/pluginFormatters.ts` — `formatAsList`, `formatAsCount`, `parseSortParam`, `parseMaxParam`, `escapeHtml`. `[DataFeed]` renders through these. |
| **Record → NCM page body** (D4, slice 6) | ImportManager converter registry + `normalizeToNcm` (`src/converters/ncm/`) and the #501 serializer. No bespoke Markdown. |
| **Storage / query / JSON-LD / dereferenceable `@id`** | `CatalogManager` + `CatalogSource` (`src/types/Schema.ts:438`, `registerSource` at `CatalogManager.ts:273`). |
| **Stale-feed / error admin warnings** | `NotificationManager` (same path MediaManager uses, `src/managers/MediaManager.ts`). |
| **Addon lifecycle / `register()` / disable toggle** | `AddonsManager` (as `calendar`/`elasticsearch`/`journal` do). |

### 3.2 Genuinely net-new (the only code worth writing)

- **SourceAdapter wire parsers** — `geojson` + `rest-json` are native `JSON.parse` (**zero dependency**); `csv` is trivial or a small dep; `rss-atom` needs **XML parsing (a dependency)**; `xls` needs a **spreadsheet lib (a dependency)**.
- **FeedManager poll orchestration** — the loop that wires the reused pieces (fetch → adapter.parse → hash-compare via `DeltaStorage` → upsert catalog records → NotificationManager on staleness).

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

MVP adapter order is now **by dependency cost first**, then demand: `geojson` → `rest-json` (both native `JSON.parse`, **zero dep**) → `rss-atom` (**+XML parser dep**) → `csv` (trivial or small dep) → `xls` (**+spreadsheet lib dep**). Each dependency-introducing adapter is a separate PR that calls out its dependency for sign-off. Additional adapters can be contributed without forking the framework.

### 4.2 FeedManager as CatalogSource

`FeedManager` implements the existing `CatalogSource` interface (`src/types/Schema.ts:438`) — one registration **per feed `sourceId`** so cross-source queries can scope:

```ts
// implemented per configured source (FeedCatalogSource), registered with CatalogManager
sourceId:              'usgs-quakes'         // from config
types:                 ['Article']           // from config.schemaType (default 'Article')
currentSchemaVersion:  1
list(query):   Promise<CatalogPage>          // reads the source's record store
get(identifier): Promise<CreativeWork|null>
rebuild(opts): Promise<void>                 // reload the store (re-fetch is FeedManager.ingest)
```

**`types` is declared from config at registration** and may be **any member of the CreativeWork union** (`Article | ImageObject | VideoObject | AudioObject | DigitalDocument`) — an image/thermal feed registers as `ImageObject`, a podcast as `AudioObject`, etc. (2026-06-02 decision). `CatalogManager` routes `query.types` to a source only when its declared `types` intersect (`CatalogManager.ts:309–318`), so this is load-bearing.

**Slice 4 implements the `Article` projection** (the only MVP driver); other union types are added per media-feed driver — a configured-but-unimplemented `schemaType` is rejected at parse with a clear log, never silently mis-typed. The domain label (`'Event'`, `'Earthquake'`) is the separate `type` config field, carried as a `keyword` + `ngdp:category`, not the schema `@type`. Types **outside** the union (`Event`/`NewsArticle`) remain the deferred "extend the union" decision.

This buys JSON-LD render, cross-source `CatalogManager.list()`, and dereferenceable `@id` URLs for free (same plumbing as pages/media/attachments).

### 4.3 Record store

Per-source on-disk record store under `FAST_STORAGE` (operational data, like the media index), e.g. `feeds/<sourceId>/records.json` + a `meta.json` (last-success timestamp, consecutive-failure count, content hashes for change-detection). **Not** under SLOW_STORAGE; **never** a page per record.

### 4.4 Scheduler (BackupManager pattern)

- One `setInterval(tick, 60_000)` owned by FeedManager, started in addon `register()`, cleared on addon teardown.
- Each tick: for every source, compute "is it due?" from `lastSuccessAt + intervalMinutes` (or a daily `time` like BackupManager). If due and not already running, `poll()`.
- **Back-off**: on consecutive failures, multiply the effective interval (cap at e.g. 6×) so a flapping endpoint isn't hammered; reset on success.
- **Stale-feed warning**: when `now - lastSuccessAt > stalenessThreshold`, emit a WARN admin notification (same `NotificationManager` path MediaManager uses).

### 4.5 Change detection (D6)

`poll()` computes a stable hash of each **normalized record** (canonicalized with sorted keys) using the existing **`DeltaStorage.calculateHash()`** (`src/utils/DeltaStorage.ts:186`) — the same sha256 helper that backs page `contentHash`. Compare against the stored hash; upsert only changed/new records, tombstone removed ones. The rendered Markdown is never hashed — guarantees unchanged upstream data does not churn a curated subject page's git history.

## 5. Consumer surface (D5) — composition, no new plugin paradigm

Two real consumption modes, both built from existing primitives — **no bespoke `source=` handle, no `BasePlugin`** (plugins here are `SimplePlugin` object literals; shared behaviour lives in `pluginFormatters.ts` by composition).

**Data flow — one store, many read-only presenters.** The record store is the single source of truth; **only the scheduler writes to it**. Everything that surfaces feed data *reads*:

```
scheduler → fetch → normalize → RECORD STORE ──read──► presenters output content
                                (source of truth)        (never write back)
```

- **`[{DataFeed source='X'}]`** — the principal presenter: queries the store at view time, formats records via `pluginFormatters`, returns inline markup that replaces the token. Read-only, recomputed per view.
- **`fetch='FeedManager.toMarqueeText(source=…,max=…)'`** — the generic convention; any plugin inlines a ticker/value.
- **`CatalogManager.list()/get()`** — cross-source queries, search, JSON-LD, dereferenceable `@id` — surface the same records with no plugin at all (because FeedManager registered as a `CatalogSource`).

No presenter writes to the store; the page file is never touched (§5.3).

### 5.1 Inline a value/text — the generic manager-fetch convention (any plugin)

FeedManager is just a registered manager exposing a render-ready helper (`FeedManager.toMarqueeText({source, max})`, the `BaseManager.toMarqueeText` convention). Any plugin inlines feed data through the **existing** `fetch='Manager.method()'` convention — *extracted from `MarqueePlugin` into `pluginFormatters.ts` as `resolveManagerFetch()` with an allow-list*, so it's one shared, guarded impl:

```
[{MarqueePlugin fetch='FeedManager.toMarqueeText(source=usgs-quakes,max=5)'}]
```

This covers the ticker/badge/last-updated cases for *any* plugin — **no feed-specific plugin code**. The old "`[Marquee source=…]`" idea is dropped: it was a second copy of a convention that already exists.

### 5.2 Render structured records as a filterable block — `[DataFeed]`

`[DataFeed source='usgs-quakes' since=… filter=…]` is the one genuinely-new consumer, because it does what the string-fetch convention cannot: a **structured query** over `CreativeWork` records + **formatted rendering** through the existing `formatAsList`/`parseSortParam`/`parseMaxParam`/`escapeHtml` in `pluginFormatters.ts`.

- Embedded in an operator-curated subject page; re-renders from the live store on each view.
- Page versions only when the operator edits the prose (the dynamic block does not bump version history).
- **Only consumer that materializes record→page body**, via the #501 serializer (D7) — built last (slice 6).

### 5.3 Three layers — what refreshes vs what is never rewritten

A `[DataFeed]` renders an **inline section/fragment** where its token sits in a host page — never a free-standing, engine-owned page. A "feed page" is simply a host page whose body is one (or more) `[{DataFeed}]` tokens. There is no engine-written page.

How content stays current splits across three layers; **only the middle one is periodically overwritten**:

| Layer | Where | Periodically overwritten? | By what |
|---|---|---|---|
| **Page file** (versioned, on disk) — operator prose + the `[{DataFeed}]` token | SLOW_STORAGE, git-versioned | **Never** by the feed | operator edits only — this is the D6 guarantee that feeds don't churn page history |
| **Record store** | FeedManager, FAST_STORAGE | **Yes** — its whole job | the scheduler, on its interval; not versioned, not git |
| **Rendered output** (what the viewer sees) | transient | **Recomputed, not stored** | recomputed at view time from the store on each request → always current |

So a `[DataFeed]` page *displays* fresh data on a periodic basis via **view-time recompute**, not by overwriting any stored content — there is no "last content" being overwritten, because the rendered block is never persisted into the page.

**Explicit rule — FeedManager never owns or rewrites a feed page.** Automatically rewriting a stored page body on a timer is the rejected path: it reintroduces version churn (D6) and, per-record, the page-index explosion (D3). FeedManager's product is **catalog records**, not pages.

Two safe exceptions, both bounded:

- **Write-once stub scaffold (optional, off by default):** when a source is configured, FeedManager (or a one-shot admin action) may create a stub host page once — title + a single `[{DataFeed source='X'}]` — then never touch it again. All later "updates" are the plugin's view-time recompute. One write, no churn.
- **Render cache (optional perf):** caching a source's rendered HTML with a TTL is a *cache* overwrite, not a page version — no git churn. An optimization for hot pages, separate from the page file.

If feed content needs to be searchable/exportable, that is already solved without materializing it into a page body: the records are a `CatalogSource`, hence queryable/searchable directly. Materializing a stored snapshot is only ever a deliberate, operator-triggered action — never an automatic timer.

## 6. Prior-art extraction map (geohazardwatch → feeds)

| geohazardwatch (bespoke) | feeds (framework) |
|---|---|
| `import/import-earthquakes.js` (native `fetch`, USGS GeoJSON) | `geojson` adapter + a `usgs-quakes` source config |
| `import/import-hans.js`, `import-volcanoes.js` | `rest-json` adapter + source configs |
| `managers/EarthquakeDataManager.js` etc. (per-source store) | FeedManager record store (one code path) |
| `_intervals` ad-hoc `setInterval`s in `index.js` | FeedManager single-tick scheduler |
| `EarthquakeList`/`EarthquakeMap` plugins | generic `[DataFeed]` + the `fetch=` convention |

Migration of the satellite is explicitly **post-framework** (separate satellite-repo effort).

## 7. Configuration

Per-instance via `app-custom-config.json`, under the **established addon namespace `ngdpbase.addons.feeds.*`** (confirmed convention — AddonsManager flattens this slice into the object passed to `register()`; `config.sources` is the per-feed map). The addon is **enabled** via `ngdpbase.addons.feeds.enabled` (default `false`). Defaults live **inline in `register()`** (like the `elasticsearch` addon) — so **`config/app-default-config.json` is not modified**; the addon is inert until enabled and a source is declared. Cron strings from the original issue body are **replaced** with interval/time fields matching the scheduler (§4.4):

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

**No JSONPath/mapping-DSL engine is introduced** — none exists in the repo, and adding one would duplicate normalization that ImportManager/NCM already own. `map` uses a trivial **dot-path** lookup (a few lines, the `properties.mag` / `geometry.coordinates.2` form). Where a source needs richer shaping than dot-paths express, that's the adapter's job (it returns an already-shaped record) — not a config DSL. The `map` block is itself optional: an adapter may return records already in normalized shape.

`config/app-default-config.json` is **not modified** — addon defaults live inline in `register()` (the `elasticsearch`-addon pattern), and the addon is enabled via `ngdpbase.addons.feeds.enabled` (default `false`). The framework is inert until enabled and a source is declared, so there is no default-catalog change to sign off.

## 8. Implementation order (slices)

Each slice is an independently shippable PR.

1. **This design doc** ← you are here (Step 1, the review gate).
2. ✅ **DONE — Platform cleanup (feeds-independent):** extracted the `fetch='Manager.method()'` convention out of `MarqueePlugin` into `pluginFormatters.ts` as `resolveManagerFetch()` (behaviour-preserving; MarqueePlugin delegates to it; +7 unit tests). Any plugin can now reuse the one shared impl.
   - **2b (deferred — security review):** an allow-list / read-only restriction on which `Manager.method`s page content may invoke. Split out of slice 2 because it is a *security-policy change* (AGENTS human-review gate) and a behaviour change — current behaviour is wide-open (any method), and all real usage already follows the `BaseManager.toMarqueeText()` convention, so a restriction is feasible but needs operator sign-off on the policy. `resolveManagerFetch` is the single chokepoint where it would be enforced.
3. ✅ **DONE — Addon skeleton:** `addons/feeds/` (package.json, tsconfig, `index.ts` `register()`, `FeedManager` + per-source `FeedCatalogSource` returning empty until slice 4, `config.ts` parser for the `ngdpbase.addons.feeds.sources` slice). `register()` registers FeedManager with the engine (reachable for slice 5) and a `FeedCatalogSource` per configured feed with CatalogManager. Added to `build:addons`. +11 unit tests; addon discovered cleanly (default-disabled), 6148 unit + 80 E2E green. No adapters, no scheduler.
4. ✅ **DONE — `geojson` adapter (zero-dep) + record store + change-detection.** `SourceAdapter` contract + `geojson` adapter (native fetch/JSON.parse; FeatureCollection/array/single; dot-path `map`), `RecordStore` (per-source JSON under FAST_STORAGE; change-detection via `DeltaStorage.calculateHash` over content excluding `fetchedAt` — D6), `recordToCreativeWork` dispatcher (Article projection; `schemaType` config-driven + validated), `FeedManager.ingest()` pipeline, `FeedCatalogSource.list()/get()` reading the store. +29 unit tests. (Scheduler is slice 6 — ingest is manual/triggered for now.)
5. ✅ **DONE — Inline consumer:** `FeedManager.toMarqueeText({source, max, sep})` (the `BaseManager.toMarqueeText` convention) + the slice-2 `resolveManagerFetch` helper. `[{MarqueePlugin fetch='FeedManager.toMarqueeText(source=usgs-quakes,max=5)'}]` renders latest-first record names with **no new plugin**. +4 tests incl. an end-to-end MarqueePlugin render. 6170 unit + 80 E2E green.
6. **Scheduler + back-off + stale-feed WARN** — recurring runtime (BackupManager pattern; NotificationManager for warnings).
7. **`[DataFeed source=…]`** + record→body materialization via the #501 serializer (pick up #501 here, per its defer note) — reuses `pluginFormatters` for list/sort/escape.
8. **Remaining adapters by dependency cost** — `rest-json` (zero-dep) next; then `rss-atom` (+XML parser, separate PR), `csv`, `xls` (+spreadsheet lib) by demand, each calling out its dependency for sign-off.
9. **(satellite)** geohazardwatch bespoke importers → feeds migration.

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
