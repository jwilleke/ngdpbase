[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/privateStorePath](../README.md) / parsePrivateStoreRel

# Function: parsePrivateStoreRel()

> __parsePrivateStoreRel__(`relParts`, `layout?`): \{ `creator`: `string`; `store`: `string`; \} \| `null`

Defined in: src/utils/privateStorePath.ts:716

The store that holds a file at any depth — the live page, a version blob,
a trash record or an attachment: `{privateroot}/{user}/{store}/…`. `null`
for a file that is not inside a store, including the user-level catalogues
beside the stores (#1415).

## Parameters

### relParts

`string`[]

### layout?

[`PrivateStoreLayoutOverrides`](../type-aliases/PrivateStoreLayoutOverrides.md)

## Returns

\{ `creator`: `string`; `store`: `string`; \} \| `null`
