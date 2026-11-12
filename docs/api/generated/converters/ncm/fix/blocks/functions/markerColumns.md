[__ngdpbase API v5.43.0__](../../../../../README.md)

***

[ngdpbase API](../../../../../README.md) / [converters/ncm/fix/blocks](../README.md) / markerColumns

# Function: markerColumns()

> __markerColumns__(`line`): `number`[]

Defined in: src/converters/ncm/fix/blocks.ts:223

Column of each list marker at the start of a line, outermost first:
`> - * a` gives the columns of `-` and `*`. Block-quote `>` markers are
skipped, not returned. Pair the result with [ListItem.orderOnLine](../interfaces/ListItem.md#orderonline).

## Parameters

### line

`string`

## Returns

`number`[]
