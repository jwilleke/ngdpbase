---
name: DataFeedPlugin
description: "Render a feed source's records as a sortable table or list at view time — the curated-subject-page consumer of the feeds addon (#685 slice 7)."
dateModified: '2026-07-28'
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

Requires the `feeds` addon enabled with the source configured — see [FeedManager](../managers/FeedManager.md). It never throws: a feed with no records renders visitor-facing copy, and a misconfigured plugin call renders a diagnostic instead. See [Empty states vs broken configuration](#empty-states-vs-broken-configuration-963).

## Usage

```text
[{DataFeed source='usgs-quakes'}]
[{DataFeed source='usgs-quakes' columns='place,magnitude,depth_km' sort='magnitude-desc' max='10'}]
[{DataFeed source='usgs-quakes' format='list' max='5'}]
[{DataFeed source='volcano-news' exclude='summary~VAAC:|VA ADVISORY|DTG:'}]
[{DataFeed source='firms-viirs' format='map' lat='latitude' lon='longitude' columns='frp,confidence,acq_date' sizeBy='frp'}]
```

## Parameters

| Param | Required | Default | Meaning |
|---|---|---|---|
| `source` | yes | — | The feed `sourceId` from `ngdpbase.addons.feeds.sources.<id>` |
| `columns` | no | union of property keys across records, capped at 6 | CSV of record property keys to show as table columns |
| `sort` | no | first column, descending | `'key'`, `'key-asc'`, or `'key-desc'` — numeric compare when both sides parse as numbers, else locale string compare |
| `max` | no | 20 (**500** when `format='map'`) | Record cap, applied after sorting |
| `format` | no | `table` | `'table'` (sortable, via `formatAsTable`), `'list'` (`<ul>` of record names), or `'map'` (Leaflet, see below) |
| `exclude` | no | — | One `column~pattern` rule; a record is dropped when that column's string value matches the case-insensitive regex `pattern`, e.g. `exclude='summary~VAAC:\|VA ADVISORY\|DTG:'`. **One rule per plugin call.** A missing `~`, an empty side, or an invalid regex yields *no filtering* rather than an error — a silently ineffective rule looks identical to a rule that matched nothing |
| `lat` / `lon` | no | `latitude` / `longitude` | `format='map'` only — property keys holding coordinates. Records with a missing or non-numeric value in either are skipped, not an error |
| `sizeBy` | no | — | `format='map'` only — a numeric column scaled linearly to marker radius 4–20px across the plotted records; omitted gives a fixed 6px radius. The scale is computed over *mappable* records only, so a record dropped for bad coordinates cannot skew it |
| `height` | no | 450 | `format='map'` only — map container height in px |
| `lat0` / `lon0` / `zoom` | no | 20 / 0 / 2 | `format='map'` only — initial view; the defaults are a full-world view |
| `badge` | no | — | CSV of columns rendered as value-classed pills: `<span class="feed-badge feed-badge--<slugged-value>">` — core CSS ships variants for the aviation color codes `green`/`yellow`/`orange`/`red`; unknown values get the neutral base style |
| `link` | no | — | Whitespace-separated `column=urlTemplate` entries; **express-style `:prop`** placeholders resolve from the record's properties (URI-encoded), e.g. `link='volcano=https://volcano.si.edu/volcano.cfm?vn=:gvp'`. A cell whose template has an unresolvable placeholder stays plain text. Composes with `badge` (linked pill). Braces are NOT usable — the `[{…}]` plugin-token grammar cannot contain a literal `}`, so a `{prop}` placeholder would truncate the token and break the page render |
| `empty` | no | *"No records are currently available for this feed."* | Copy shown when the feed has nothing to render (#963). Applies to the two **legitimate** empty states only — no records, and no mappable records under `format='map'`. HTML-escaped like any cell value; a blank or whitespace-only value falls back to the default |

## Behavior notes

- Table rendering reuses the shared `pluginFormatters` helpers (`formatAsTable`, `parseMaxParam`, `parseSortParam`, `escapeHtml`); it does **not** go through NCM — the formatAsTable-vs-NCM unification is tracked on #501.
- All cell values are HTML-escaped; non-scalar property values render as JSON.
- List format shows each record's display name (`recordName`), not its properties.

### Empty states vs broken configuration (#963)

The plugin distinguishes two kinds of "nothing rendered", and they read differently on purpose.

**Legitimate empty states** — visitor-facing prose, overridable with `empty=`, and carrying no internal source id:

| Condition | Default output |
|---|---|
| Feed has no records (or `exclude=` removed them all) | *No records are currently available for this feed.* |
| `format='map'` and no record has usable coordinates | *No mappable records are currently available for this feed.* |

A feed with zero records is expected, not an error — an alerts feed is empty precisely when nothing is wrong.

**Broken configuration** — diagnostic, addressed to whoever maintains the page, and **deliberately not overridable by `empty=`**:

| Condition | Output |
|---|---|
| No `source` param | *DataFeed: a source parameter is required.* |
| `feeds` addon not enabled | *DataFeed: the feeds addon is not enabled on this site.* |

> **Why `empty=` stops at the boundary.** If it covered these, a page could render *"No tsunami messages are currently active"* while the feeds addon was switched off entirely — a confirmed all-clear for a check that never ran. On a hazard-alert page that is worse than an ugly diagnostic. Two tests pin this behaviour.

For `format='map'` with nothing plottable, the actionable detail — how many records lacked finite coordinates and which `lat`/`lon` column names were tried — goes to `logger.warn`, not onto the page. A visitor cannot act on a column-name mismatch; the maintainer can.

## Related

- [FeedManager](../managers/FeedManager.md) — configuration, adapters, scheduling
- `[{MarqueePlugin fetch='FeedManager.toMarqueeText(source=…)'}]` — one-line latest-records banner without a feed-specific plugin
- Required page **Using FeedManager** — operator-facing guide
