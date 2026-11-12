[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/pluginFormatters](../README.md) / PageLink

# Interface: PageLink

Defined in: src/utils/pluginFormatters.ts:14

A renderable page link with href, display text, and optional styling

## Properties

### badge?

> `optional` __badge?__: `string`

Defined in: src/utils/pluginFormatters.ts:29

A value shown at the end of the row — a count, a status (#1306). Escaped:
it is data, not markup.

***

### cssClass?

> `optional` __cssClass?__: `string`

Defined in: src/utils/pluginFormatters.ts:17

***

### href

> __href__: `string`

Defined in: src/utils/pluginFormatters.ts:15

***

### icon?

> `optional` __icon?__: `string`

Defined in: src/utils/pluginFormatters.ts:24

Font Awesome (or any) class for an icon rendered before the text (#1306).
A class name, not markup — escaped into the attribute.

***

### style?

> `optional` __style?__: `string`

Defined in: src/utils/pluginFormatters.ts:18

***

### text

> __text__: `string`

Defined in: src/utils/pluginFormatters.ts:16

***

### title?

> `optional` __title?__: `string`

Defined in: src/utils/pluginFormatters.ts:19

***

### trailingHtml?

> `optional` __trailingHtml?__: `string`

Defined in: src/utils/pluginFormatters.ts:37

Markup appended after the link — a per-item action button, typically.
Inserted verbatim, so the CALLER owns escaping anything interpolated into
it. This exists because MyLinksPlugin hand-rolled its whole list for one
remove button, which is the vocabulary being too small rather than the
plugin being wrong.
