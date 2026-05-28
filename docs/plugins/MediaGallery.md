---
name: MediaGallery
description: Displays a gallery of media items (stub — full implementation gated on MediaManager Phase 4)
dateModified: '2026-05-28'
category: plugins
code: src/plugins/MediaGallery.ts
---

# MediaGallery

**Stub plugin.** Renders a placeholder; full implementation deferred to MediaManager Phase 4.

## Intended Syntax (Phase 4)

```wiki
[{MediaGallery year=2024 format=grid max=20}]
```

## Intended Parameters (Phase 4)

| Parameter | Default | Description |
|---|---|---|
| `year` | — | Four-digit year to display (required) |
| `format` | `grid` | Display mode: `grid` or `list` |
| `max` | `20` | Maximum items to show |

## Current Behaviour

Returns an HTML stub indicating the plugin is not yet implemented. Safe to leave embedded on pages — will start producing real output once `MediaManager` is enabled.

## See Also

- [MediaPlugin](MediaPlugin.md) — production media count/list plugin
- [MediaItem](MediaItem.md), [MediaSearch](MediaSearch.md) — sibling stubs
