---
name: DataFeedPlugin
description: "Render a feed source's records as a sortable table or list at view time — the curated-subject-page consumer of the feeds addon (#685 slice 7)."
dateModified: '2026-07-16'
category: plugins
code: addons/feeds/src/DataFeedPlugin.ts
relatedModules:
  - FeedManager
version: 0.1.0
---

# DataFeedPlugin

**Module:** `addons/feeds/src/DataFeedPlugin.ts` (ships with the `feeds` addon, not core)
**Plugin name:** `DataFeed`
**Filed under:** #685 slice 7

Renders a feed source's records as a table (default) or list, **at view time, from the live RecordStore** — no page writes, no version churn (design §5.3). The page stays a normal wiki page; the data underneath refreshes on the feed's poll schedule.

Requires the `feeds` addon enabled with the source configured — see [FeedManager](../managers/FeedManager.md). When the addon is absent or the source has no records, the plugin degrades to a muted placeholder message instead of erroring.

## Usage

```text
[{DataFeed source='usgs-quakes'}]
[{DataFeed source='usgs-quakes' columns='place,magnitude,depth_km' sort='magnitude-desc' max='10'}]
[{DataFeed source='usgs-quakes' format='list' max='5'}]
```

## Parameters

| Param | Required | Default | Meaning |
|---|---|---|---|
| `source` | yes | — | The feed `sourceId` from `ngdpbase.addons.feeds.sources.<id>` |
| `columns` | no | union of property keys across records, capped at 6 | CSV of record property keys to show as table columns |
| `sort` | no | first column, descending | `'key'`, `'key-asc'`, or `'key-desc'` — numeric compare when both sides parse as numbers, else locale string compare |
| `max` | no | 20 | Record cap, applied after sorting |
| `format` | no | `table` | `'table'` (sortable, via `formatAsTable`) or `'list'` (`<ul>` of record names) |

## Behavior notes

- Table rendering reuses the shared `pluginFormatters` helpers (`formatAsTable`, `parseMaxParam`, `parseSortParam`, `escapeHtml`); it does **not** go through NCM — the formatAsTable-vs-NCM unification is tracked on #501.
- All cell values are HTML-escaped; non-scalar property values render as JSON.
- List format shows each record's display name (`recordName`), not its properties.
- Placeholder outputs: `[DataFeed: source is required]`, `[DataFeed: feeds addon not available]`, `[DataFeed: no records for feed '<source>']`.

## Related

- [FeedManager](../managers/FeedManager.md) — configuration, adapters, scheduling
- `[{MarqueePlugin fetch='FeedManager.toMarqueeText(source=…)'}]` — one-line latest-records banner without a feed-specific plugin
- Required page **Using FeedManager** — operator-facing guide
