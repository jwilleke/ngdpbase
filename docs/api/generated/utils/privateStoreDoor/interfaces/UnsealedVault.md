[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/privateStoreDoor](../README.md) / UnsealedVault

# Interface: UnsealedVault

Defined in: src/utils/privateStoreDoor.ts:135

A vault of a sealed kind whose copy is not sealed (#1834).

## Properties

### owner

> __owner__: `string`

Defined in: src/utils/privateStoreDoor.ts:136

***

### state

> __state__: `"unopened"` \| `"mismatch"`

Defined in: src/utils/privateStoreDoor.ts:139

`unopened`: files but no `store.json`; `mismatch`: a `store.json` that is not sealed.

***

### vault

> __vault__: `string`

Defined in: src/utils/privateStoreDoor.ts:137
