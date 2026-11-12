[__ngdpbase API v5.43.0__](../../../../../README.md)

***

[ngdpbase API](../../../../../README.md) / [converters/ncm/fix/blocks](../README.md) / ListInfo

# Interface: ListInfo

Defined in: src/converters/ncm/fix/blocks.ts:55

## Properties

### depth

> __depth__: `number`

Defined in: src/converters/ncm/fix/blocks.ts:63

***

### end

> __end__: `number`

Defined in: src/converters/ncm/fix/blocks.ts:60

Line after the last (0-based, exclusive).

***

### items

> __items__: [`ListItem`](ListItem.md)[]

Defined in: src/converters/ncm/fix/blocks.ts:64

***

### ordered

> __ordered__: `boolean`

Defined in: src/converters/ncm/fix/blocks.ts:56

***

### outer

> __outer__: `ListInfo`

Defined in: src/converters/ncm/fix/blocks.ts:66

The outermost list this one sits in (itself when top-level).

***

### start

> __start__: `number`

Defined in: src/converters/ncm/fix/blocks.ts:58

First line (0-based).

***

### tight

> __tight__: `boolean`

Defined in: src/converters/ncm/fix/blocks.ts:62

CommonMark tight list: no empty line between its items or their blocks.
