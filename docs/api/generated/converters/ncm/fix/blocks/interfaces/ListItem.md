[__ngdpbase API v5.43.0__](../../../../../README.md)

***

[ngdpbase API](../../../../../README.md) / [converters/ncm/fix/blocks](../README.md) / ListItem

# Interface: ListItem

Defined in: src/converters/ncm/fix/blocks.ts:39

## Properties

### blocks

> __blocks__: [`ItemBlock`](ItemBlock.md)[]

Defined in: src/converters/ncm/fix/blocks.ts:51

Direct child blocks, in order.

***

### depth

> __depth__: `number`

Defined in: src/converters/ncm/fix/blocks.ts:47

Nesting depth: 0 for an item of a top-level list.

***

### end

> __end__: `number`

Defined in: src/converters/ncm/fix/blocks.ts:43

Line after the item's last line (0-based, exclusive). May include trailing empty lines.

***

### line

> __line__: `number`

Defined in: src/converters/ncm/fix/blocks.ts:41

Line the item's marker is on (0-based).

***

### list

> __list__: [`ListInfo`](ListInfo.md)

Defined in: src/converters/ncm/fix/blocks.ts:52

***

### markup

> __markup__: `string`

Defined in: src/converters/ncm/fix/blocks.ts:45

The marker character: `-`, `*`, `+`, `.` or `)`.

***

### orderOnLine

> __orderOnLine__: `number`

Defined in: src/converters/ncm/fix/blocks.ts:49

Position among the list items that start on the same line, outermost first (`- * a` has two).
