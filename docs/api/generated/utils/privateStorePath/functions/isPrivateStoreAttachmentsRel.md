[__ngdpbase API v5.43.0__](../../../README.md)

***

[ngdpbase API](../../../README.md) / [utils/privateStorePath](../README.md) / isPrivateStoreAttachmentsRel

# Function: isPrivateStoreAttachmentsRel()

> __isPrivateStoreAttachmentsRel__(`relParts`, `layout?`): `boolean`

Defined in: src/utils/privateStorePath.ts:523

True when `relParts` (path relative to the pages directory, split) names a
store's attachments folder: `{privateroot}/{user}/{store}/{attachmentsdir}`.
Depth-checked so a user or store that happens to be called `attachments` is not skipped.

## Parameters

### relParts

`string`[]

### layout?

[`PrivateStoreLayoutOverrides`](../type-aliases/PrivateStoreLayoutOverrides.md)

## Returns

`boolean`
