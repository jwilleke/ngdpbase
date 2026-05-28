---
name: TabPlugin
description: Defines a single tab within a [{Tabs}] body block; rendering is handled by TabsPlugin
dateModified: '2026-05-28'
category: plugins
code: src/plugins/TabPlugin.ts
---

# TabPlugin

Marker plugin that defines a single tab within a `[{Tabs}]…[{/Tabs}]` body block.

## Usage

```wiki
[{Tabs}]
[{Tab name='First'}]
First tab content.
[{/Tab}]
[{Tab name='Second'}]
Second tab content.
[{/Tab}]
[{/Tabs}]
```

## Behaviour

- **Inside `[{Tabs}]`** — TabsPlugin parses these blocks directly from its body content. TabPlugin itself returns empty string to avoid double-rendering.
- **Standalone (outside Tabs)** — also returns empty string intentionally. The plugin is a body-block marker, not a renderer.

## See Also

- [TabsPlugin](TabsPlugin.md) — the renderer that consumes `[{Tab}]` blocks
