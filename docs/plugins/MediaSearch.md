---
name: MediaSearch
description: Displays media search results (stub — full implementation gated on MediaManager Phase 4)
dateModified: '2026-05-28'
category: plugins
code: src/plugins/MediaSearch.ts
---

# MediaSearch

__Stub plugin.__ Will render search results from the media index. Full implementation deferred to MediaManager Phase 4.

## Intended Syntax (Phase 4)

```wiki
[{MediaSearch keyword="Nassau" format=grid max=20}]
```

## Intended Parameters (Phase 4)

| Parameter | Default | Description |
|---|---|---|
| `keyword` | — | Search query string (required) |
| `format` | `grid` | Display mode: `grid` or `list` |
| `max` | `20` | Maximum results to show |

## Current Behaviour

Returns an HTML placeholder indicating the plugin is not yet available.

## See Also

- [MediaPlugin](MediaPlugin.md), [MediaGallery](MediaGallery.md), [MediaItem](MediaItem.md)
