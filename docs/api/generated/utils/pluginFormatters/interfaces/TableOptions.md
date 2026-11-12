[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/pluginFormatters](../README.md) / TableOptions

# Interface: TableOptions

Defined in: src/utils/pluginFormatters.ts:285

## Properties

### cellDataSort?

> `optional` __cellDataSort?__: `Record`\<`number`, (`row`, `rowIndex`) => `string`\>

Defined in: src/utils/pluginFormatters.ts:298

Per-column callbacks that return a `data-sort` attribute value for a cell.
Keyed by column index.  Needed when a cell contains HTML (e.g. links) but
tableSort.js should sort on the underlying numeric/text value.
Receives the cell's row data AND the 0-based row index within `rows`.

***

### defaultSortColumn?

> `optional` __defaultSortColumn?__: `number`

Defined in: src/utils/pluginFormatters.ts:289

0-indexed column that is the initial sort column

***

### defaultSortOrder?

> `optional` __defaultSortOrder?__: [`SortOrder`](../type-aliases/SortOrder.md)

Defined in: src/utils/pluginFormatters.ts:291

Initial sort direction (default: 'asc')

***

### emptyMessage?

> `optional` __emptyMessage?__: `string`

Defined in: src/utils/pluginFormatters.ts:300

Shown instead of the table when there are no rows (plain text). Default: "No pages found."

***

### footer?

> `optional` __footer?__: `string`[]

Defined in: src/utils/pluginFormatters.ts:302

A totals row in `<tfoot>`; cells may contain raw HTML, like body cells.

***

### sortable?

> `optional` __sortable?__: `boolean`

Defined in: src/utils/pluginFormatters.ts:287

When true, adds the "sortable" CSS class so tableSort.js activates
