---
name: TablePlugin
description: JSPWiki-compatible Table plugin — enables # auto-numbering in table rows
dateModified: '2026-05-28'
category: plugins
code: src/plugins/TablePlugin.ts
---

# TablePlugin

JSPWiki-compatibility marker. Place before a table to opt into `#`-auto-numbering of cells.

## Usage

```wiki
[{Table}]
|| # || Column ||
| # | Row 1   |
| # | Row 2   |
```

Renders as a table where the leading `#` cells are auto-numbered 1, 2, 3, …

## Behaviour

The plugin itself outputs nothing. The actual auto-numbering of cells containing only `#` is handled by the table renderer in `MarkupParser`. TablePlugin is the JSPWiki-compatible __opt-in marker__ that signals the renderer to treat `#` cells specially.

## See Also

- `src/parsers/MarkupParser.ts` — the table renderer
