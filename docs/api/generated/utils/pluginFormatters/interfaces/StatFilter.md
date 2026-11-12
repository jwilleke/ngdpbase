[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/pluginFormatters](../README.md) / StatFilter

# Interface: StatFilter

Defined in: src/utils/pluginFormatters.ts:690

One card in a stat filter bar.

## Properties

### active?

> `optional` __active?__: `boolean`

Defined in: src/utils/pluginFormatters.ts:714

Marks the card whose filter is currently in effect (server-side bars).

***

### clears?

> `optional` __clears?__: `boolean`

Defined in: src/utils/pluginFormatters.ts:712

The card that clears the filter — "Total", and whatever a surface calls
its everything card. Clickable, but selects nothing.

***

### href?

> `optional` __href?__: `string`

Defined in: src/utils/pluginFormatters.ts:699

Server-side filter: the card becomes a link to this URL. Use on any
surface whose list is paginated — see the note on `match`.

***

### label

> __label__: `string`

Defined in: src/utils/pluginFormatters.ts:692

Card heading, e.g. "Active Users".

***

### match?

> `optional` __match?__: `string`

Defined in: src/utils/pluginFormatters.ts:707

Client-side filter: `attr=value`, matched against a row's `data-<attr>`.
Only correct when every row is already on the page. On a paginated list it
would filter the current page while implying it filtered the set, which is
the defect #1237 documents in the audit log's DataTables search box — use
`href` there instead.

***

### title?

> `optional` __title?__: `string`

Defined in: src/utils/pluginFormatters.ts:718

Tooltip / accessible description.

***

### tone?

> `optional` __tone?__: `"danger"` \| `"primary"` \| `"success"` \| `"info"` \| `"warning"` \| `"secondary"`

Defined in: src/utils/pluginFormatters.ts:716

Card colour.

***

### value

> __value__: `string` \| `number`

Defined in: src/utils/pluginFormatters.ts:694

The count (or any short value) shown beneath it.
