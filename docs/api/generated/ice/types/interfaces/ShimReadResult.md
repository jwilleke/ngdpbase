[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [ice/types](../README.md) / ShimReadResult

# Interface: ShimReadResult

Defined in: src/ice/types.ts:145

What a shim's read returns.

## Properties

### items

> __items__: [`IceItem`](IceItem.md)[]

Defined in: src/ice/types.ts:146

***

### partial?

> `optional` __partial?__: `string`

Defined in: src/ice/types.ts:151

Set when the shim read only part of its input (phr's `readCcda` returns
records plus a partial note): the file's status is then `partial`, with this.

***

### skip?

> `optional` __skip?__: `string`

Defined in: src/ice/types.ts:158

Set, with no items, when the file is part of its format's layout and
holds nothing to import on its own (#2118): a takeout's file index, read
through the archive by the files it names. The file's status is then
`noise`, with this, and the ledger records nothing for it.
