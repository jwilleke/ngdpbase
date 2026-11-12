[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/pluginFormatters](../README.md) / parseSortParam

# Function: parseSortParam()

> __parseSortParam__(`value`, `validKeys`, `defaultKey`, `defaultOrder?`): [`SortOptions`](../interfaces/SortOptions.md)

Defined in: src/utils/pluginFormatters.ts:265

Parse a `sort=` plugin parameter.
Accepts "name", "name-asc", "name-desc", "count-asc", "count-desc", etc.
validKeys is the list of allowed key names.
Falls back to defaultKey/defaultOrder for any unrecognised value.

## Parameters

### value

`string` \| `undefined`

### validKeys

`string`[]

### defaultKey

`string`

### defaultOrder?

[`SortOrder`](../type-aliases/SortOrder.md) = `'asc'`

## Returns

[`SortOptions`](../interfaces/SortOptions.md)
