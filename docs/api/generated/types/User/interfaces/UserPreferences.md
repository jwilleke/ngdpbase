[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [types/User](../README.md) / UserPreferences

# Interface: UserPreferences

Defined in: src/types/User.ts:36

User preferences

User-specific settings and preferences.

## Indexable

> \[`key`: `string`\]: `unknown`

Additional custom preferences

## Properties

### display.dateformat?

> `optional` __display.dateformat?__: `string`

Defined in: src/types/User.ts:59

Date format (iso, us, eu, etc.)

***

### display.pagesize?

> `optional` __display.pagesize?__: `string`

Defined in: src/types/User.ts:50

Display page size for lists

***

### display.readermode?

> `optional` __display.readermode?__: `boolean`

Defined in: src/types/User.ts:56

Reader mode enabled

***

### display.tooltips?

> `optional` __display.tooltips?__: `boolean`

Defined in: src/types/User.ts:53

Show tooltips

***

### editor.autoindent?

> `optional` __editor.autoindent?__: `boolean`

Defined in: src/types/User.ts:41

Editor auto-indent

***

### editor.linenumbers?

> `optional` __editor.linenumbers?__: `boolean`

Defined in: src/types/User.ts:44

Show line numbers in editor

***

### editor.plain.smartpairs?

> `optional` __editor.plain.smartpairs?__: `boolean`

Defined in: src/types/User.ts:38

Editor smart pairs (auto-close brackets, quotes)

***

### editor.theme?

> `optional` __editor.theme?__: `string`

Defined in: src/types/User.ts:47

Editor theme (light, dark, etc.)

***

### locale?

> `optional` __locale?__: `string`

Defined in: src/types/User.ts:65

Language/locale

***

### nav.pinnedPages?

> `optional` __nav.pinnedPages?__: [`PinnedItem`](PinnedItem.md)[]

Defined in: src/types/User.ts:68

Items pinned to the My Links sidebar section (wiki pages and app-route URLs)

***

### timezone?

> `optional` __timezone?__: `string`

Defined in: src/types/User.ts:62

Timezone
