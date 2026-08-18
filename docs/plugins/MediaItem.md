---
name: MediaItem
description: Embeds a single media item inline (stub — full implementation gated on MediaManager Phase 4)
dateModified: '2026-05-28'
category: plugins
code: src/plugins/MediaItem.ts
---

# MediaItem

__Stub plugin.__ Will embed a single media item (image, video) inline on a page. Full implementation deferred to MediaManager Phase 4.

## Intended Syntax (Phase 4)

```wiki
[{MediaItem id="uuid" caption="text"}]
```

## Intended Parameters (Phase 4)

| Parameter | Default | Description |
|---|---|---|
| `id` | — | Media item identifier (required) |
| `caption` | — | Optional caption text shown beneath the item |

## Current Behaviour

Returns an HTML placeholder indicating the plugin is not yet available.

## See Also

- [MediaPlugin](MediaPlugin.md), [MediaGallery](MediaGallery.md), [MediaSearch](MediaSearch.md)
