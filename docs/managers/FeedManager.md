---
name: FeedManager
description: "Runtime of the feeds addon (#685) — one record store + CatalogSource per configured external feed; runs the ingest pipeline (adapter fetch → parse → change-detected upsert) on a poll scheduler."
dateModified: '2026-07-16'
category: managers
code: addons/feeds/src/FeedManager.ts
---

# FeedManager

__Module:__ `addons/feeds/src/FeedManager.ts` (ships with the `feeds` addon, not core)
__Registered as:__ `engine.registerManager('FeedManager', …)` — reachable via `engine.getManager('FeedManager')` and the `fetch='FeedManager.…'` consumer convention
__Filed under:__ #685 (data-ingestion framework)

---

## Overview

FeedManager is the runtime of the __feeds addon__ — the generic data-ingestion framework. It pulls structured data from external feeds on a schedule, normalizes each record to a schema.org CreativeWork, and exposes the results as CatalogSources and to the `[{DataFeed}]` plugin — __without writing one wiki page per record__.

The addon is __default-disabled__. It is inert until `ngdpbase.addons.feeds.enabled: true` and at least one source is configured.

Per configured source, FeedManager holds one `FeedEntry`:

| Piece | Role |
|---|---|
| `FeedSourceConfig` | The validated config slice for the source (adapter, url, schedule, field mapping) |
| `RecordStore` | JSON persistence under `{instanceDataFolder}/feeds/<sourceId>/` (override via `ngdpbase.addons.feeds.dataPath`) with DeltaStorage change detection |
| `FeedCatalogSource` | The CatalogManager-facing view — feed records surface as CreativeWorks in the catalog registry |

## The ingest pipeline

`ingest(sourceId)` runs one pass:

```text
adapter.fetch(config)        — transport; returns raw items
  → adapter.parse(raw, config)  — per-item normalization; null = skip item
  → RecordStore.upsertAll()     — change-detected persist (created/updated/unchanged counts)
```

Throws on an unknown source or unknown adapter; transport errors surface to the caller (the scheduler's back-off handles them in scheduled operation).

### Adapters

Adapters are looked up by name from the static registry in `addons/feeds/src/adapters/` (injectable in tests via the `AdapterResolver` constructor param). Shipped today:

| Adapter | Shape | Dependency |
|---|---|---|
| `geojson` | GeoJSON FeatureCollection (e.g. USGS earthquake feeds) | none |
| `rest-json` | Generic JSON array/object endpoints, with `itemsPath` + `map` dotpath field mapping | none |
| `xml` | Generic XML documents (e.g. VAAC ash advisories, geohazardwatch#5) — parsed to plain objects so `itemsPath`/`map` dot-paths apply unchanged; attributes prefixed `@`, element text under `#text`; single repeated elements coerced to arrays | `fast-xml-parser` (itself zero-dep) |

`rss-atom`, `csv`, and `xls` are planned later slices (design §3.2), each a separate dependency-callout PR. Scraping (HTML index pages) remains out of scope — a source needing it wants a bespoke import or its own adapter.

## Scheduling

`startScheduler()` / `stopScheduler()` wrap `FeedScheduler`, which polls each source on its configured cadence (`intervalMinutes` or `dailyAt`) with back-off on failures and a stale-feed WARN. The addon starts the scheduler when enabled with sources; `stopScheduler()` runs at addon shutdown.

## Consumer surface

- __`getRecords(sourceId)`__ — full normalized records (with `properties`); the data behind the [`[{DataFeed}]` plugin](../plugins/DataFeedPlugin.md).
- __`toMarqueeText(opts)`__ — the `BaseManager.toMarqueeText()` convention, so a page can render the latest records with no feed-specific plugin:

  ```text
  [{MarqueePlugin fetch='FeedManager.toMarqueeText(source=usgs-quakes,max=5)'}]
  ```

  `source` (required) · `max` (default 5) · `sep` (default `•`). Returns `''` for unknown/empty sources.
- __`registerSources(catalogManager)`__ — registers every configured feed as a CatalogSource; called by the addon's `register()` hook.
- __`getSourceIds()`__ — configured source ids (used by addon status details).

## Configuration

All under `ngdpbase.addons.feeds.*` (flat dotted keys in instance config):

```jsonc
{
  "ngdpbase.addons.feeds.enabled": true,
  "ngdpbase.addons.feeds.sources.usgs-quakes.adapter": "geojson",
  "ngdpbase.addons.feeds.sources.usgs-quakes.url": "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_day.geojson",
  "ngdpbase.addons.feeds.sources.usgs-quakes.type": "Event",
  "ngdpbase.addons.feeds.sources.usgs-quakes.intervalMinutes": 30
}
```

Per source: `adapter` + `url` + `type` (schema.org `@type`) are required — entries missing any are skipped with a log line. Optional: `schemaType` (default `Article`; must be an implemented type or the source is skipped), `intervalMinutes` | `dailyAt`, `recordIdField`, `itemsPath`, `map` (dotpath field mapping for `rest-json`), `delimiter` (`csv`), `linkPattern` + `maxItems` (`xml-index`).

### Record shaping — `dedupeBy` / `maxAgeHours` (#989)

Some sources publish many timestamped documents per named entity — every ash advisory ever issued for a volcano, every reading from a station — where only the newest per entity is wanted. Two optional keys express that, applied generically after adapter mapping and before the store:

| Key | Effect |
|---|---|
| `dedupeBy` | Keep only the __newest record per distinct value__ of this normalized property |
| `maxAgeHours` | Discard records older than N hours. Applied *after* grouping, so it reads as "this entity has not been reissued within N hours" |
| `dedupeDateField` | Property holding the record's timestamp. Defaults to the same chain the catalog projection uses: `occurredAt` → `time` → `date` → `pubDate` → `published` |

```jsonc
"ngdpbase.addons.feeds.sources.vaac.dedupeBy": "volcanoName",
"ngdpbase.addons.feeds.sources.vaac.maxAgeHours": 48
```

Both are no-ops when unset, and either can be used without the other — `maxAgeHours` alone is a plain age filter.

__Shaping is destructive.__ `RecordStore.upsertAll()` replaces the store rather than merging, so a record dropped here is removed on the next poll. Every ambiguous case therefore resolves toward keeping the record:

- A record __lacking__ the `dedupeBy` property is never grouped and always survives. A typo in `dedupeBy` is a no-op, not a feed-wiping collapse into one bucket.
- A record with __no resolvable date__ is kept by `maxAgeHours` — unknown age is not evidence of staleness.
- Within a group an undated record never displaces a dated one, and among all-undated records the first wins, so results are stable across polls instead of flapping on upstream ordering.
- `maxAgeHours` must be a number > 0; anything else is rejected at config-parse with a warning rather than coerced.
- If shaping discards *every* record of a non-empty batch, ingest logs a warning — legitimate for a genuinely stale feed, but indistinguishable from a misconfiguration, so it is never silent.

Known limitation: an adapter still fetches and parses everything before shaping sees it. For `xml-index` that means up to `maxItems` item fetches per poll to keep a handful of current records — an adapter-level efficiency concern tracked separately, not addressed by these keys.

## Related

- [`DataFeedPlugin`](../plugins/DataFeedPlugin.md) — table/list rendering of a source's records
- [`CatalogManager`](CatalogManager.md) — the registry feed sources register into
- `docs/platform/feeds/design.md` — the #685 design gate
- Required page __Using FeedManager__ — operator-facing guide seeded on install
