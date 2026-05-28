---
name: MediaPlugin
description: Shows total media item count or a list/album of media items, filterable by year / page / EXIF keyword
dateModified: '2026-05-28'
category: plugins
code: src/plugins/MediaPlugin.ts
relatedModules:
  - MediaManager
---

# MediaPlugin

Renders counts, lists, or thumbnail-grid albums of media items indexed by `MediaManager`. Supports filtering by year, by wiki-page link, or by EXIF keyword.

## Usage

```wiki
[{MediaPlugin}]                                       — count of all indexed items
[{MediaPlugin format='list'}]                          — list of filenames as links
[{MediaPlugin format='list' max='10'}]                 — capped list
[{MediaPlugin format='list' year='2023'}]              — items from a year
[{MediaPlugin format='list' page='MyPage'}]            — items linked to a wiki page
[{MediaPlugin format='list' page='current'}]           — items linked to the current page
[{MediaPlugin format='count' page='current'}]          — count on the current page
[{MediaPlugin format='list' keyword='current'}]        — items whose EXIF keywords include the current page name
[{MediaPlugin format='list' keyword='Molly'}]          — items whose EXIF keywords include 'Molly'
[{MediaPlugin format='album' keyword='current'}]       — thumbnail grid matching the current page name
[{MediaPlugin format='album-link' keyword='current'}]  — button linking to the keyword album page
```

## Parameters

| Parameter | Default | Description |
|---|---|---|
| `format` | `count` | `count` \| `list` \| `album` \| `album-link` |
| `max` | — | Cap visible items (list/album); header shows true total |
| `year` | — | Filter by 4-digit year |
| `page` | — | Filter by wiki page name; `current` resolves to the embedding page |
| `keyword` | — | Filter by EXIF keyword; `current` resolves to the embedding page name |

## See Also

- [MediaGallery](MediaGallery.md), [MediaItem](MediaItem.md), [MediaSearch](MediaSearch.md) — Phase 4 stubs
- [plugin-formatters](plugin-formatters.md) — shared output helpers
