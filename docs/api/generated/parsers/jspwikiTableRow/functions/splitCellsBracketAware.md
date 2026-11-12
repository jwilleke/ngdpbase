[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [parsers/jspwikiTableRow](../README.md) / splitCellsBracketAware

# Function: splitCellsBracketAware()

> __splitCellsBracketAware__(`text`, `delimiter`): `string`[]

Defined in: src/parsers/jspwikiTableRow.ts:38

Split text on a delimiter, except inside `[...]` bracket groups: the pipe
in `[wiki link|PageName]` is not a cell boundary.

## Parameters

### text

`string`

### delimiter

`string`

## Returns

`string`[]
