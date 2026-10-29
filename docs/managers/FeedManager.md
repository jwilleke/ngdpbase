---
name: FeedManager
description: "Runtime of the feeds addon (#685) — one record store + CatalogSource per configured external feed; the receiver feeds.items for what the import engine fetches and reads (#2109), scheduled as the background job feeds.poll."
dateModified: '2026-10-29'
category: managers
code: addons/feeds/src/FeedManager.ts
---

# FeedManager

__Module:__ `addons/feeds/src/FeedManager.ts` (ships with the `feeds` addon, not core)
__Registered as:__ `engine.registerManager('FeedManager', …)` — reachable via `engine.getManager('FeedManager')` and the `fetch='FeedManager.…'` consumer convention
__Filed under:__ #685 (data-ingestion framework); on the import engine since [#2109](https://github.com/jwilleke/ngdpbase/issues/2109)

---

## Overview

FeedManager is the runtime of the __feeds addon__ — the generic data-ingestion framework. It pulls structured data from external feeds on a schedule, normalizes each record to a schema.org CreativeWork, and exposes the results as CatalogSources and to the `[{DataFeed}]` plugin — __without writing one wiki page per record__.

Since [#2109](https://github.com/jwilleke/ngdpbase/issues/2109) a feed is "a scheduled URL source, plus shims, into FeedManager" (D10 in [ice-planing.md](../planning/ice-planing.md)): the import engine ([ImportManager](ImportManager.md)) fetches each source and runs its shim; FeedManager keeps the feed settings, receives the records and shows them.

The addon is __default-disabled__. It is inert until `ngdpbase.addons.feeds.enabled: true` and at least one source is configured.

Per configured source, FeedManager holds one `FeedEntry`:

| Piece | Role |
|---|---|
| `FeedSourceConfig` | The validated config slice for the source (adapter, url, schedule, field mapping) |
| `RecordStore` | JSON persistence under `{instanceDataFolder}/feeds/<sourceId>/` (override via `ngdpbase.addons.feeds.dataPath`), with a content hash per record (`recordHash`) for change detection |
| `FeedCatalogSource` | The CatalogManager-facing view — feed records surface as CreativeWorks in the catalog registry |

## The ingest pipeline

`ingest(sourceId, ctx)` runs one pass, as `ctx` (the poll job's context with the fetch's own reason):

```text
ImportManager.runImport({ source: { type: 'url', url, headers, timeoutMs, metadata: { feedSource } },
                          receiver: 'feeds.items', shim: 'feeds.<adapter>', scope: sourceId, options })
  → the engine fetches the URL (guardedFetch, egress policy, User-Agent, the source's headers and timeout)
  → the shim reads it into `record` items, each keyed by its id and content hash
  → feeds.items: receive() says new/changed or duplicate per item; items already seen are skipped
  → feeds.items: fileDone() gets every item, shapes them (dedupeBy / maxAgeHours) and RecordStore.upsertAll()
```

Resolves with the store's counts (`added`, `updated`, `unchanged`, `removed`). Throws, leaving the store as it was, on an unknown source, a refused or failed fetch, a non-2xx answer, a body the shim cannot read, an `adapter` no shim answers to, a shim the site switched off (`ngdpbase.import.shims.feeds.<adapter>.enabled: false`), or a refusal by the receiver's permission.

### Shims

Each format is an import shim registered by the addon (`addons/feeds/src/shims/`, declared in its manifest), named `feeds.<adapter>`. Each produces core's `record` kind (`data: { id, properties }`) with per-item duplicates. Nothing in them is about feeds: a source's parse settings reach the shim as the run's `options`, so another add-on's receiver can take the same records.

| Shim | Shape | Dependency |
|---|---|---|
| `geojson` | GeoJSON FeatureCollection (e.g. USGS earthquake feeds) | none |
| `rest-json` | Generic JSON array/object endpoints, with `itemsPath` + `map` dotpath field mapping | none |
| `xml` | Generic XML documents (e.g. VAAC ash advisories, geohazardwatch#5) — parsed to plain objects so `itemsPath`/`map` dot-paths apply unchanged; attributes prefixed `@`, element text under `#text`; single repeated elements coerced to arrays | `fast-xml-parser` (itself zero-dep) |
| `rss-atom` | RSS 2.0 items and Atom 1.0 entries; id from `guid` / `id` / `link` | `fast-xml-parser` |
| `csv` | CSV/TSV with a header row (`delimiter`, `skipLines`); a row with no id gets a stable hash of its content | none |
| `xml-index` | An index page linking to one XML document per record (`linkPattern`, `maxItems`, default 100). The shim asks the engine to fetch each item document (`tools.fetch`), so each takes the guarded path with the source's headers and timeout; a failed item is skipped and the read is `partial` | `fast-xml-parser` |

### The receiver `feeds.items`

FeedManager's own door for the records the shims produce (D4). It checks an existing permission, `config-manage` (feed sources are site configuration; D5, no new permission), with the run's context: the poll job acts as the system principal, or as `job:feeds.poll` when a policy names it; Run now acts as the administrator who pressed it. On a no nothing is fetched. It takes no uploads (`uploads: false`): the import screen never offers it.

A feed's store is a snapshot of its source. `receive` compares each item's content hash with the stored one (new or changed: `stored`; the same: `duplicate`); `fileDone` gets every item of the fetch, those the engine skipped as already seen included, and stores the whole source at once, so a record the source no longer holds is removed, as an ingest always has.

### Duplicates and carry-over

The engine skips an item whose key its ledger has seen for that source (scope `ice2/feeds.items/<system principal>/<sourceId>`). The key is the record's id with its content hash: the id alone would skip a record revised upstream under the same id. The hash is `recordHash`, the one the record store keeps, so record stores written before [#2109](https://github.com/jwilleke/ngdpbase/issues/2109) carry over unchanged: on the first fetch after the upgrade the ledger is empty, every item is handed to `receive`, which finds the stored hash equal, and `upsertAll` counts them `unchanged`. Nothing is re-added or dropped (`FeedManager.test.ts`, "existing feed records carry over", against stores written by the old adapters).

## Scheduling

`startScheduler(jobs)` registers the routine background job `feeds.poll` with BackgroundJobManager (`registerMaintenance`, every minute; `ngdpbase.jobs.feeds.poll.schedule` changes it, and Admin → Scheduled Jobs lists, pauses and runs it). Each run asks `FeedScheduler` for a pass: the sources due on their own cadence (`intervalMinutes` or `dailyAt`), with back-off on failures and a stale-feed WARN, as before. Each due source is fetched under the job's context with its own reason, `fetch feed '<id>' on its schedule (#2109)`. There is no `setInterval`.

Due sources ingest side by side, at most `ngdpbase.addons.feeds.max-concurrent-ingests` (default 4) at once; the rest wait for a free slot on the same pass ([#1955](https://github.com/jwilleke/ngdpbase/issues/1955)). The job's run starts them and returns without waiting, so a source whose upstream hangs until its timeout holds one slot and delays no other source, in this pass or the next. A source is marked running when it is queued, so it never runs beside itself, and a later pass skips it until it finishes. `stopScheduler()` (addon shutdown) makes the job's later runs do nothing.

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

Per source: `adapter` + `url` + `type` (schema.org `@type`) are required — entries missing any are skipped with a log line. Optional: `schemaType` (default `Article`; must be an implemented type or the source is skipped), `intervalMinutes` | `dailyAt`, `recordIdField`, `itemsPath`, `map` (dotpath field mapping for `rest-json`), `delimiter` + `skipLines` (`csv`), `linkPattern` + `maxItems` (`xml-index`), and the request options `userAgent`, `headers` and `timeoutMs` (below).

`skipLines` (#1102) drops N leading lines before the header row, for feeds that emit a human-readable caption above it — common in government data exports. Without it the caption becomes the sole column name, the real header is consumed as the first record, and every column but the first is discarded. That failure is silent: HTTP 200, a successful parse, records upserted, and a rendered table of empty values. The CSV shim therefore attaches a warning to the read, which FeedManager logs once per poll, when a parse yields a single column whose name reads like prose, naming the source and suggesting `skipLines`. It warns rather than throws — a genuine one-column CSV is legal, just unusual.

### Request options — `headers` / `userAgent` / `timeoutMs` ([#1947](https://github.com/jwilleke/ngdpbase/issues/1947), [#1955](https://github.com/jwilleke/ngdpbase/issues/1955))

The import engine passes these to `guardedFetch` on every fetch of the source, `xml-index`'s item fetches included. They are checked when the config is read; a refused value is dropped with a warning naming the source, and the source still loads, as `maxAgeHours` is.

| Key | Effect |
|---|---|
| `userAgent` | The `User-Agent` for this source. Without it the request carries the site's, `ngdpbase.http.user-agent` (`ngdpbase/<version> (+<base URL>)`). Some providers ask for a contact: api.weather.gov refuses a request without a User-Agent |
| `headers` | A map of extra request headers, name to string value. A `User-Agent` here is replaced by `userAgent` when both are set. Refused: `Host`, `Content-Length`, `Transfer-Encoding`, `Connection`, `Keep-Alive`, `Proxy-Connection`, `TE`, `Trailer`, `Upgrade`, `Expect`, `Cookie`, `Authorization`, `Proxy-Authorization`, `Proxy-Authenticate`, and any name or value that is not a valid HTTP header |
| `timeoutMs` | The request timeout in ms. Absent: 30 s. A whole number from `ngdpbase.addons.feeds.timeout-min-ms` (default 5000) to `timeout-max-ms` (default 300000); anything else is refused and the 30 s default applies |

```jsonc
"ngdpbase.addons.feeds.sources.tsunami-alerts.userAgent": "geohazardwatch.com (ops@example.com)",
"ngdpbase.addons.feeds.sources.tsunami-alerts.headers": { "Accept": "application/geo+json" },
"ngdpbase.addons.feeds.sources.gvp-wfs.timeoutMs": 120000
```

Credentials are refused rather than supported: a literal one would sit in the config file, and an unset `$NAME` reference inside `sources` drops the whole `sources` map, stopping every feed for one missing variable.

The addon-wide keys `max-concurrent-ingests`, `timeout-min-ms` and `timeout-max-ms` ship in `addons/feeds/config/default-config.json`; each must be a whole number > 0, and an inverted range falls back to the shipped one, with a warning.

### Record shaping — `dedupeBy` / `maxAgeHours` (#989)

Some sources publish many timestamped documents per named entity — every ash advisory ever issued for a volcano, every reading from a station — where only the newest per entity is wanted. Two optional keys express that, applied generically after the shim's mapping and before the store:

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

Known limitation: a shim still fetches and parses everything before shaping sees it. For `xml-index` that means up to `maxItems` item fetches per poll to keep a handful of current records — a shim-level efficiency concern tracked separately, not addressed by these keys.

## Known gaps

- The back-off multiplier (up to 6× the interval), the staleness window (3× the interval) and the minute look are code defaults, as before [#2109](https://github.com/jwilleke/ngdpbase/issues/2109); the look can be changed with `ngdpbase.jobs.feeds.poll.schedule`.
- A fetch binds its ledger scope to the system principal's identity, so while the identity store cannot answer, feeds are not fetched and the scheduler backs off ([#2013](https://github.com/jwilleke/ngdpbase/issues/2013)). While the application database is configured but unavailable, BackgroundJobManager holds every job, `feeds.poll` included ([#1892](https://github.com/jwilleke/ngdpbase/issues/1892)).
- The engine's ledger keeps one file entry per distinct response body and one key per record version seen, per source, capped at `ngdpbase.import.engine.ledger-max-entries`; a key that falls off only means the receiver's own hash check decides again.

## Related

- [`DataFeedPlugin`](../plugins/DataFeedPlugin.md) — table/list rendering of a source's records
- [`CatalogManager`](CatalogManager.md) — the registry feed sources register into
- `docs/platform/feeds/design.md` — the #685 design gate
- Required page __Using FeedManager__ — operator-facing guide seeded on install
