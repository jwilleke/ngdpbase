---
name: AttachmentsPlugin
description: Shows total attachment count or a list of attachments
dateModified: '2026-05-28'
category: plugins
code: src/plugins/AttachmentsPlugin.ts
---

# AttachmentsPlugin

Renders the total number of attachments on the wiki, or a list of attachment titles as links.

## Usage

```wiki
[{AttachmentsPlugin}]                          — count of all attachments
[{AttachmentsPlugin format='list'}]            — list of attachment names as links
[{AttachmentsPlugin format='list' max='10'}]   — limit list to 10 items
```

## Parameters

| Parameter | Default | Description |
|---|---|---|
| `format` | `count` | Render mode: `count` or `list` |
| `max` | — | (list mode) cap visible items; header still shows true total |

## Implementation

Pulls attachments via the `AttachmentManager`. Shares formatter helpers (`formatAsCount`, `formatAsList`, `parseMaxParam`, `applyMax`) with the other count/list plugins through `src/utils/pluginFormatters.ts`.

## See Also

- [MediaPlugin](MediaPlugin.md) — analogous renderer for media items
- [plugin-formatters](plugin-formatters.md) — shared parameter/output helpers
