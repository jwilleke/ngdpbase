---
name: FeedManager
description: "Runtime of the feeds addon (#685) — one record store + CatalogSource per configured external feed; runs the ingest pipeline (adapter fetch → parse → change-detected upsert) on a poll scheduler."
dateModified: '2026-07-16'
category: managers
code: addons/feeds/src/FeedManager.ts
---

# FeedManager

**Module:** `addons/feeds/src/FeedManager.ts` (ships with the `feeds` addon, not core)
**Registered as:** `engine.registerManager('FeedManager', …)` — reachable via `engine.getManager('FeedManager')` and the `fetch='FeedManager.…'` consumer convention
**Filed under:** #685 (data-ingestion framework)

---

## Overview

FeedManager is the runtime of the **feeds addon** — the generic data-ingestion framework. It pulls structured data from external feeds on a schedule, normalizes each record to a schema.org CreativeWork, and exposes the results as CatalogSources and to the `[{DataFeed}]` plugin — **without writing one wiki page per record**.

The addon is **default-disabled**. It is inert until `ngdpbase.addons.feeds.enabled: true` and at least one source is configured.

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

- **`getRecords(sourceId)`** — full normalized records (with `properties`); the data behind the [`[{DataFeed}]` plugin](../plugins/DataFeedPlugin.md).
- **`toMarqueeText(opts)`** — the `BaseManager.toMarqueeText()` convention, so a page can render the latest records with no feed-specific plugin:

  ```text
  [{MarqueePlugin fetch='FeedManager.toMarqueeText(source=usgs-quakes,max=5)'}]
  ```

  `source` (required) · `max` (default 5) · `sep` (default `•`). Returns `''` for unknown/empty sources.
- **`registerSources(catalogManager)`** — registers every configured feed as a CatalogSource; called by the addon's `register()` hook.
- **`getSourceIds()`** — configured source ids (used by addon status details).

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

Per source: `adapter` + `url` + `type` (schema.org `@type`) are required — entries missing any are skipped with a log line. Optional: `schemaType` (default `Article`; must be an implemented type or the source is skipped), `intervalMinutes` | `dailyAt`, `recordIdField`, `itemsPath`, `map` (dotpath field mapping for `rest-json`).

## Related

- [`DataFeedPlugin`](../plugins/DataFeedPlugin.md) — table/list rendering of a source's records
- [`CatalogManager`](CatalogManager.md) — the registry feed sources register into
- `docs/platform/feeds/design.md` — the #685 design gate
- Required page **Using FeedManager** — operator-facing guide seeded on install
