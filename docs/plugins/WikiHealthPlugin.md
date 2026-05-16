---
name: WikiHealthPlugin
description: "Deterministic wiki-health audit — lists orphan pages, broken/undefined links, and stale pages"
dateModified: '2026-05-16'
category: plugins
code: src/plugins/WikiHealthPlugin.ts
---

# WikiHealthPlugin

`WikiHealthPlugin` renders a deterministic **wiki-health audit** on any page. It surfaces data-quality issues that accumulate silently on a large wiki, using only data the platform already has — no LLM, no new index.

## Overview

Three pure graph/text checks, composed from existing sources (`PageManager.getAllPages()`, the page link graph, and `PageManager.getRecentChanges()`):

- **Orphan pages** — existing pages with no inbound page-link from any other page.
- **Broken / undefined links** — page titles that are linked to but do not exist (red-links / missing-entity). Same computation as `UndefinedPagesPlugin`; rendered as create-links.
- **Stale pages** — existing pages not modified within `staleDays`.

Section headers always show the **true total**; the per-section list is capped at `max` with an "… and N more" line so a large result set never hides the count.

## Usage

### Basic

```wiki
[{WikiHealthPlugin}]
```

All three checks (orphans, broken, stale at 365 days), `sections` format.

### One-line summary

```wiki
[{WikiHealthPlugin format='count'}]
```

Renders e.g. `Orphans: 1405 · Broken links: 18806 · Stale: 0`.

### Specific checks / tuned threshold

```wiki
[{WikiHealthPlugin checks='orphans,broken'}]
[{WikiHealthPlugin checks='stale' staleDays='30'}]
```

### Filtering and caps

```wiki
[{WikiHealthPlugin exclude='^(Main|LeftMenu)$' max='100'}]
```

## Parameters

| Parameter | Default | Description |
|---|---|---|
| `checks` | `orphans,broken,stale` | CSV subset of the three checks to run |
| `staleDays` | `365` | Age threshold (days) for the stale check; `0` disables it |
| `max` | `50` | Per-section render cap (`0` = unlimited); the header still shows the true total |
| `include` | — | Regex; only report page names matching it |
| `exclude` | — | Regex; drop page names matching it |
| `format` | `sections` | `sections` (grouped lists) or `count` (one-line summary) |

## Notes

- **`staleDays` is threshold-sensitive.** On instances whose corpus was recently re-stamped by a migration, every page's `lastModified` may be within the last year, so the default `staleDays=365` legitimately reports `0`. Lower the threshold (e.g. `staleDays=30`) for a meaningful stale view on such instances.
- The stale check requests an explicit large limit from `getRecentChanges` — its default limit is 50 and `includeAll` only widens the privacy filter, not the count, so without the explicit limit the check would only ever see the 50 freshest pages.
- All checks are scan-on-demand. No sidecar index is written or maintained, so there is no consistency state to drift.

## Related

- `UndefinedPagesPlugin` — the broken/undefined-link list as a standalone plugin.
- `ReferringPagesPlugin` — inbound links for a single page (the inverse of the orphan check).
- Issue #730 — the feature this plugin implements.
