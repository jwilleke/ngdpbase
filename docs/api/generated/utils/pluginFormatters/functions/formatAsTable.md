[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/pluginFormatters](../README.md) / formatAsTable

# Function: formatAsTable()

> __formatAsTable__(`headers`, `rows`, `options?`): `string`

Defined in: src/utils/pluginFormatters.ts:314

Format rows of data as an HTML table.
Cell values may contain raw HTML (e.g. anchor tags).
Header values are plain text and will be HTML-escaped.

## Parameters

### headers

`string`[]

Column header strings (plain text)

### rows

`string`[][]

Array of row arrays; each element is a cell value (may be raw HTML)

### options?

[`TableOptions`](../interfaces/TableOptions.md)

Optional table rendering options (sortable, pagination hints, etc.)

## Returns

`string`
